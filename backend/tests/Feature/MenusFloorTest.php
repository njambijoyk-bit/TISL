<?php

namespace Tests\Feature;

use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Menus\Area;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\Table;
use App\Models\Menus\Ticket;
use App\Services\Books\BooksException;
use App\Services\Menus\CounterService;
use App\Services\Menus\FloorService;
use App\Services\Menus\KitchenService;
use App\Services\Menus\MenuOrderNotices;
use App\Services\Menus\MenuOrderService;
use App\Services\Menus\MenuService;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\TableGuest;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus step 6: the floor. Tables and their states, tabs at tables, moving, joining and splitting, and what a guest can do from the table's QR code. */
class MenusFloorTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private Area $area;
    private array $billed = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        $this->area = app(FloorService::class)->saveArea(['name' => 'Indoor', 'location_id' => self::BRANCH]);
        $this->app->forgetInstance(MenuOrderNotices::class);
        $n = $this->createMock(MenuOrderNotices::class);
        $n->method('billAsked')->willReturnCallback(function (Table $t) { $this->billed[] = $t->name; });
        $this->app->instance(MenuOrderNotices::class, $n);
        $this->app->forgetInstance(FloorService::class);
        $this->app->forgetInstance(CounterService::class);
        $this->app->forgetInstance(TableGuest::class);
    }

    private function floor(): FloorService
    {
        return app(FloorService::class);
    }

    private function counter(): CounterService
    {
        return app(CounterService::class);
    }

    private function table(string $name = 'T1', array $o = []): Table
    {
        return $this->floor()->saveTable($o + ['name' => $name, 'area_id' => $this->area->id, 'seats' => 4]);
    }

    private function dish(string $name = 'Burger', float $price = 500, int $stock = 50)
    {
        $d = $this->make($name, $price);
        $this->stock((int) $d->variant_id, $stock);
        $m = \App\Models\Menus\Menu::first() ?? app(MenuService::class)->save(['name' => 'All day']);
        $s = $m->sections()->first() ?? $m->sections()->create(['name' => 'Mains']);
        DB::table('menus_section_dishes')->insert(['section_id' => $s->id, 'dish_id' => $d->id]);

        return $d;
    }

    private function items($d, int $n = 2): array
    {
        return [['dish_id' => $d->id, 'quantity' => $n]];
    }

    private function state(Table $t): string
    {
        return $this->floor()->card($t->fresh(), $this->now)['state'];
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected: {$part}");
    }

    private function cash(float $n): array
    {
        return ['tenders' => [['payment_method_id' => 1, 'amount' => $n]]];
    }

    // ------------------------------------------------------------ laying out

    public function test_areas_and_tables_keep_to_their_limits(): void
    {
        $f = $this->floor();
        $this->fails(fn () => $f->saveArea(['name' => ' ', 'location_id' => self::BRANCH]), 'name');
        $this->fails(fn () => $f->saveArea(['name' => 'Indoor', 'location_id' => self::BRANCH]), 'already an area');
        $this->fails(fn () => $f->saveArea(['name' => 'X', 'location_id' => 999]), 'branch');
        $this->table('T1');
        $this->fails(fn () => $this->table('T1'), 'already a table called T1');
        $this->fails(fn () => $this->table('T2', ['seats' => 0]), 'between 1 and 60');
        $this->fails(fn () => $this->table('T2', ['shape' => 'triangle']), 'square or round');
        $this->fails(fn () => $this->table('T2', ['x' => 99]), 'off the plan');
        $this->fails(fn () => $this->table('T2', ['w' => 20]), '1 to 12');
        $this->fails(fn () => $this->table('T2', ['resource_id' => 5]), 'not a bookable table');
        $this->fails(fn () => $this->table('T2', ['area_id' => 999]), 'Choose the area');
        $this->fails(fn () => $f->deleteArea($this->area), 'Move or remove the tables');
    }

    public function test_a_table_with_a_tab_or_joined_tables_can_not_be_removed(): void
    {
        $d = $this->dish();
        [$a, $b, $c] = [$this->table('T1'), $this->table('T2'), $this->table('T3')];
        $this->counter()->openTab(['table_id' => $a->id, 'items' => $this->items($d)], null, $this->now);
        $this->fails(fn () => $this->floor()->deleteTable($a->fresh()), 'has a tab');
        $this->floor()->merge($c, [$b->id]);
        $this->fails(fn () => $this->floor()->deleteTable($c->fresh()), 'joined to it');
        $this->floor()->unmerge($c);
        $this->floor()->deleteTable($c->fresh());
        $this->assertNull(Table::find($c->id));
    }

    public function test_every_table_has_its_own_qr_code_that_can_be_renewed(): void
    {
        $a = $this->table('T1');
        $b = $this->table('T2');
        $this->assertSame([24, 24], [strlen($a->qr_token), strlen($b->qr_token)]);
        $this->assertNotSame($a->qr_token, $b->qr_token);
        $this->assertNotSame($a->qr_token, $this->floor()->renewQr($a)->qr_token);
    }

    public function test_the_qr_code_opens_the_tables_page(): void
    {
        config(['app.frontend_url' => 'https://shop.example/']);
        $t = $this->table('T1');
        $this->assertSame('https://shop.example/menu/table/'.$t->qr_token, $this->floor()->qrUrl($t));
        $this->assertStringStartsWith('<svg', ltrim($this->floor()->qrSvg($t)));
    }

    public function test_tables_are_placed_on_the_plan_in_one_save(): void
    {
        $a = $this->table('T1');
        $b = $this->table('T2');
        $this->floor()->saveLayout([['id' => $a->id, 'x' => 3, 'y' => 4], ['id' => $b->id, 'x' => 8, 'y' => 1, 'w' => 4, 'h' => 3]]);
        $this->assertSame([[3, 4, 2, 2], [8, 1, 4, 3]], [[$a->fresh()->x, $a->fresh()->y, $a->fresh()->w, $a->fresh()->h], [$b->fresh()->x, $b->fresh()->y, $b->fresh()->w, $b->fresh()->h]]);
        $this->fails(fn () => $this->floor()->saveLayout([['id' => $a->id, 'x' => 1, 'y' => 1], ['id' => $b->id, 'x' => 99, 'y' => 1]]), 'off the plan');
        $this->assertSame(3, $a->fresh()->x, 'a bad place leaves the whole plan as it was');
    }

    // ------------------------------------------------------------ states

    public function test_a_table_goes_free_seated_ordered_eating_bill_cleaning_free(): void
    {
        $d = $this->dish();
        $t = $this->table('T1');
        $this->assertSame('free', $this->state($t));
        $this->floor()->seat($t, 3);
        $this->assertSame(['seated', 3], [$this->state($t), $t->fresh()->guests]);
        $tab = $this->counter()->openTab(['table_id' => $t->id, 'items' => $this->items($d)], null, $this->now);
        $this->assertSame(['ordered', 'T1', 'dine_in', $t->id, 3, self::BRANCH], [$this->state($t), $tab->label, $tab->service, $tab->table_id, $tab->guests, $tab->location_id]);
        app(KitchenService::class)->ready(Ticket::first());
        $this->assertSame('eating', $this->state($t), 'everything was served');
        $this->floor()->askBill($t);
        $this->floor()->askBill($t);
        $this->assertSame(['bill', ['T1']], [$this->state($t), $this->billed], 'the staff are told once');
        $this->counter()->settleTab($tab, $this->cash(2000), null);
        $this->assertSame(['cleaning', null], [$this->state($t), $t->fresh()->bill_asked_at]);
        $this->floor()->clear($t);
        $this->assertSame(['free', null], [$this->state($t), $t->fresh()->guests]);
    }

    public function test_a_table_with_a_tab_can_not_be_seated_or_cleared_or_given_a_second_tab(): void
    {
        $d = $this->dish();
        $t = $this->table('T1');
        $this->counter()->openTab(['table_id' => $t->id, 'items' => $this->items($d)], null, $this->now);
        $this->fails(fn () => $this->floor()->seat($t, 2), 'already has a tab');
        $this->fails(fn () => $this->floor()->clear($t), 'still has a tab');
        $this->fails(fn () => $this->counter()->openTab(['table_id' => $t->id, 'items' => $this->items($d)], null, $this->now), 'already has a tab');
        $this->fails(fn () => $this->floor()->askBill($this->table('T9')), 'no tab');
        $this->fails(fn () => $this->floor()->seat($this->table('T8'), 0), 'How many guests');
    }

    public function test_opening_a_tab_on_a_free_table_seats_it_and_cancelling_frees_it(): void
    {
        $d = $this->dish();
        $t = $this->table('T1');
        $tab = $this->counter()->openTab(['table_id' => $t->id, 'items' => $this->items($d), 'guests' => 5], null, $this->now);
        $this->assertSame(['seated', 5], [$t->fresh()->state, $t->fresh()->guests]);
        $this->counter()->cancelTab($tab, 'Left');
        $this->assertSame(['free', null], [$this->state($t), $t->fresh()->guests]);
    }

    public function test_a_reservation_in_the_calendar_shows_until_someone_sits(): void
    {
        Schema::create('bookings', function ($t) { $t->id(); $t->unsignedBigInteger('resource_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('confirmed'); $t->integer('people')->default(2); $t->dateTime('starts_at'); $t->dateTime('ends_at'); });
        Schema::create('customers', function ($t) { $t->id(); $t->string('name'); });
        Schema::create('bookable_resources', function ($t) { $t->id(); $t->string('type'); $t->string('name'); $t->boolean('is_active')->default(true); });
        DB::table('bookable_resources')->insert(['id' => 5, 'type' => 'table', 'name' => 'T1']);
        DB::table('customers')->insert(['id' => 1, 'name' => 'Mrs Njeri']);
        $t = $this->table('T1', ['resource_id' => 5]);
        DB::table('bookings')->insert(['resource_id' => 5, 'customer_id' => 1, 'people' => 4, 'starts_at' => $this->now->copy()->addMinutes(30), 'ends_at' => $this->now->copy()->addMinutes(120)]);
        $c = $this->floor()->card($t, $this->now);
        $this->assertSame(['reserved', 'Mrs Njeri', 4], [$c['state'], $c['reservation']['name'], $c['reservation']['people']]);
        $this->floor()->seat($t, 2);
        $this->assertNull($this->floor()->card($t->fresh(), $this->now)['reservation'], 'once seated the reservation is not shown');
        $this->floor()->clear($t->fresh());
        DB::table('bookings')->update(['starts_at' => $this->now->copy()->addMinutes(90), 'ends_at' => $this->now->copy()->addMinutes(150)]);
        $this->assertSame('free', $this->state($t), 'more than an hour away: not shown yet');
        DB::table('bookings')->update(['starts_at' => $this->now->copy()->addMinutes(30), 'status' => 'cancelled']);
        $this->assertSame('free', $this->state($t), 'a cancelled reservation does not hold the table');
        DB::table('bookings')->update(['status' => 'confirmed']);
        $this->floor()->seat($t->fresh(), 2);
        $this->assertSame('seated', $this->state($t), 'once they sit it is theirs');
    }

    // ------------------------------------------------------------ merge, move, split

    public function test_tables_are_joined_for_a_big_party_and_the_tab_sits_on_the_main_one(): void
    {
        $d = $this->dish();
        [$a, $b, $c] = [$this->table('T1'), $this->table('T2'), $this->table('T3')];
        $this->counter()->openTab(['table_id' => $c->id, 'items' => $this->items($d)], null, $this->now);
        $this->fails(fn () => $this->floor()->merge($a, [$c->id]), 'has a tab');
        $this->fails(fn () => $this->floor()->merge($a, []), 'Choose the tables');
        DB::table('locations')->insert(['id' => 7, 'name' => 'Other']);
        $other = $this->floor()->saveTable(['name' => 'Far', 'area_id' => $this->floor()->saveArea(['name' => 'Patio', 'location_id' => 7])->id]);
        $this->fails(fn () => $this->floor()->merge($a, [$other->id]), 'another branch');
        $this->floor()->merge($a, [$b->id]);
        $card = $this->floor()->card($a->fresh(), $this->now);
        $this->assertSame([8, ['T2'], 'merged'], [$card['seats'], $card['joined'], $this->state($b)]);
        $this->fails(fn () => $this->counter()->openTab(['table_id' => $b->id, 'items' => $this->items($d)], null, $this->now), 'joined to another table');
        $tab = $this->counter()->openTab(['table_id' => $a->id, 'items' => $this->items($d)], null, $this->now);
        $this->assertSame($tab->id, $this->floor()->tabOf($b->fresh())->id, 'the joined table sees the same tab');
        $this->fails(fn () => $this->floor()->unmerge($a), 'before separating');
        $this->counter()->settleTab($tab, $this->cash(2000), null);
        $this->floor()->unmerge($a);
        $this->assertNull($b->fresh()->merged_into);
    }

    public function test_a_tab_moves_to_an_empty_table(): void
    {
        $d = $this->dish();
        [$a, $b, $c] = [$this->table('T1'), $this->table('T2'), $this->table('T3')];
        $tab = $this->counter()->openTab(['table_id' => $a->id, 'items' => $this->items($d), 'guests' => 4], null, $this->now);
        $this->counter()->openTab(['table_id' => $c->id, 'items' => $this->items($d)], null, $this->now);
        $this->fails(fn () => $this->counter()->moveTab($tab, $c->id), 'already has a tab');
        $this->fails(fn () => $this->counter()->moveTab($tab, 9999), 'does not exist');
        $moved = $this->counter()->moveTab($tab, $b->id);
        $this->assertSame([$b->id, 'T2', 'T2'], [$moved->table_id, $moved->label, $moved->name], 'a tab named after its table follows it');
        $this->assertSame(['free', 'ordered', 4], [$this->state($a), $this->state($b), $b->fresh()->guests]);
        $named = $this->counter()->openTab(['table_id' => $this->table('T5')->id, 'label' => 'Birthday', 'items' => $this->items($d)], null, $this->now);
        $this->assertSame('Birthday', $this->counter()->moveTab($named, $this->table('T6')->id)->label, 'a name chosen by staff stays');
    }

    public function test_a_tab_can_not_be_moved_to_a_table_at_another_branch(): void
    {
        $d = $this->dish();
        $t = $this->table('T1');
        DB::table('locations')->insert(['id' => 7, 'name' => 'Other']);
        $far = $this->floor()->saveTable(['name' => 'Far', 'area_id' => $this->floor()->saveArea(['name' => 'Patio', 'location_id' => 7])->id]);
        $tab = $this->counter()->openTab(['table_id' => $t->id, 'items' => $this->items($d)], null, $this->now);
        $this->fails(fn () => $this->counter()->moveTab($tab, $far->id), 'another branch');
        $this->assertSame($t->id, $tab->fresh()->table_id);
    }

    public function test_the_bill_is_split_by_dish_and_the_table_is_cleaned_after_the_last_is_paid(): void
    {
        $a = $this->dish('Burger', 500);
        $b = $this->dish('Fries', 200);
        $t = $this->table('T1');
        $tab = $this->counter()->openTab(['table_id' => $t->id, 'items' => array_merge($this->items($a, 1), $this->items($b, 2))], null, $this->now);
        $fries = $tab->lines()->where('name', 'Fries')->first();
        $this->fails(fn () => $this->counter()->splitTab($tab, []), 'Choose the dishes');
        $this->fails(fn () => $this->counter()->splitTab($tab, $tab->lines()->pluck('id')->all()), 'whole tab');
        $new = $this->counter()->splitTab($tab, [$fries->id]);
        $this->assertSame([$t->id, 'T1 (2)', 'open', 464.0, 580.0], [$new->table_id, $new->label, $new->payment, (float) $new->total, (float) $tab->fresh()->total]);
        $this->assertSame([1, 1], [$new->lines()->count(), $tab->lines()->count()]);
        $this->counter()->settleTab($new->fresh(), $this->cash(500), null);
        $this->assertSame(['ordered', 'seated'], [$this->state($t), $t->fresh()->state], 'the first bill is still open: the table is not marked for cleaning yet');
        $this->counter()->settleTab($tab->fresh(), $this->cash(1000), null);
        $this->assertSame('cleaning', $this->state($t));
        $this->assertSame(2, count($this->placed), 'two bills, two sales');
    }

    // ------------------------------------------------------------ paying from the phone

    private function phoneTab(): array
    {
        $d = $this->dish();
        $t = $this->table('T1');
        $tab = $this->counter()->openTab(['table_id' => $t->id, 'items' => $this->items($d)], null, $this->now);

        return [$t, $tab, $d];
    }

    public function test_a_tab_paid_from_the_phone_waits_for_the_money_and_then_closes(): void
    {
        $this->app->instance(MenuOrderNotices::class, $this->createMock(MenuOrderNotices::class));
        MenusSettings::save(['tip_ledger_id' => 80], null);
        [$t, $tab] = $this->phoneTab();
        $mpesa = PaymentMethod::find(4);
        $r = $this->counter()->startPhonePayment($tab, $mpesa, '0712345678', ['tip' => 40]);
        $o = $r['order'];
        $this->assertSame(['pending', 1200.0, '0712345678', 1200.0], [$o->payment, (float) $o->total, $this->started[0]['contact']['phone'], $this->started[0]['due']]);
        $this->assertSame([701, 'paying'], [$r['attempt']['id'], $this->state($t)]);
        $this->fails(fn () => $this->counter()->addToTab($o, ['items' => $this->items($this->dish('Fries', 100))]), 'not an open tab');
        $voucher = Voucher::find($o->voucher_id);
        $this->assertSame($o->id, $voucher->meta['menu_order_id']);
        app(MenuOrderService::class)->paid($voucher, Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-1']));
        app(MenuOrderService::class)->paid($voucher, Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-2']));
        $o = $o->fresh();
        $this->assertSame(['paid', 'placed', 40.0, 1200.0, 'cleaning'], [$o->payment, $o->status, (float) $o->tip, (float) $o->tendered, $this->state($t)]);
        $this->assertSame('M-Pesa online', $o->tenders[0]['method']);
    }

    public function test_a_payment_that_is_not_a_tab_waiting_for_the_phone_is_left_alone(): void
    {
        $d = $this->dish();
        $online = MenuOrder::create(['number' => 'MO-1', 'track_token' => str_repeat('b', 40), 'name' => 'Guest', 'fulfil_at' => $this->now, 'order_type' => 'pickup', 'payment' => 'pending', 'status' => 'placed']);
        $this->assertSame('pending', $this->counter()->phoneFailed($online)->payment, 'an online order is not a tab');
        $tab = $this->counter()->openTab(['table_id' => $this->table('T1')->id, 'items' => $this->items($d)], null, $this->now);
        $this->assertSame('open', $this->counter()->phoneFailed($tab)->payment);
    }

    public function test_a_phone_payment_that_fails_gives_the_tab_back(): void
    {
        [$t, $tab, $d] = $this->phoneTab();
        $o = $this->counter()->startPhonePayment($tab, PaymentMethod::find(4), '0712345678')['order'];
        $voucherId = $o->voucher_id;
        $back = $this->counter()->phoneFailed($o);
        $this->assertSame(['open', null, [$voucherId], 'ordered'], [$back->payment, $back->voucher_id, $this->cancelled, $this->state($t)]);
        $this->assertSame('open', $this->counter()->phoneFailed($back)->payment, 'nothing more to undo');
        $this->counter()->addToTab($back, ['items' => $this->items($d, 1)]);
        $this->assertSame(2, $back->lines()->count(), 'the tab can be added to and paid another way');
    }

    public function test_a_payment_that_can_not_start_leaves_the_tab_alone(): void
    {
        [, $tab] = $this->phoneTab();
        $this->gatewayFails = true;
        $this->fails(fn () => $this->counter()->startPhonePayment($tab->fresh(), PaymentMethod::find(4), '0712345678'), 'could not start');
        $this->assertSame(['open', null], [$tab->fresh()->payment, $tab->fresh()->voucher_id], 'nothing was left half done');
        $this->fails(fn () => $this->counter()->startPhonePayment($tab->fresh(), PaymentMethod::find(1), '0712345678'), 'Choose M-Pesa');
        $this->gatewayFails = false;
        $this->fails(fn () => $this->counter()->startPhonePayment($tab->fresh(), PaymentMethod::find(4), ' '), 'phone number');
    }

    public function test_phone_payments_that_never_finish_are_given_back_and_online_orders_are_not_touched(): void
    {
        [, $tab] = $this->phoneTab();
        $o = $this->counter()->startPhonePayment($tab, PaymentMethod::find(4), '0712345678')['order'];
        $this->assertSame(0, $this->counter()->sweepPhone(10), 'too soon');
        MenuOrder::whereKey($o->id)->update(['updated_at' => $this->now->copy()->subMinutes(15)]);
        $this->assertSame(1, $this->counter()->sweepPhone(10));
        $this->assertSame('open', $o->fresh()->payment);
        $again = $this->counter()->startPhonePayment($o->fresh(), PaymentMethod::find(4), '0712345678')['order'];
        $this->assertSame(0, app(MenuOrderService::class)->sweep(30, $this->now->copy()->addDay()), 'the online sweep leaves counter orders alone');
        $this->assertSame('pending', $again->fresh()->payment);
    }

    // ------------------------------------------------------------ the guest at the table

    private function guest(): TableGuest
    {
        return app(TableGuest::class);
    }

    public function test_a_guest_can_order_only_when_the_table_is_open(): void
    {
        $d = $this->dish();
        $t = $this->table('T1');
        $this->fails(fn () => $this->guest()->order($t->qr_token, $this->items($d)), 'has not been opened');
        $this->floor()->seat($t, 2);
        $this->guest()->order($t->qr_token, $this->items($d));
        $tab = $this->floor()->tabOf($t);
        $this->assertSame(['T1', null, 1], [$tab->label, $tab->cashier_id, (int) $tab->lines()->max('round')]);
        $this->guest()->order($t->qr_token, $this->items($d, 1));
        $this->assertSame(2, (int) $tab->lines()->max('round'), 'a second order is another round on the same tab');
        MenusSettings::save(['qr_ordering' => false], null);
        $this->fails(fn () => $this->guest()->order($t->qr_token, $this->items($d)), 'not switched on');
    }

    public function test_a_scan_opens_an_empty_table_only_when_the_settings_allow_it(): void
    {
        $d = $this->dish();
        $t = $this->table('T1');
        MenusSettings::save(['qr_open_by_scan' => true], null);
        $this->guest()->order($t->qr_token, $this->items($d), 3);
        $this->assertSame([3, 'seated'], [$this->floor()->tabOf($t)->guests, $t->fresh()->state]);
    }

    public function test_a_joined_table_orders_onto_the_main_tab_and_the_wrong_code_is_nothing(): void
    {
        $d = $this->dish();
        [$a, $b] = [$this->table('T1'), $this->table('T2')];
        $this->floor()->merge($a, [$b->id]);
        $this->floor()->seat($a, 6);
        $this->guest()->order($b->qr_token, $this->items($d));
        $this->assertSame($a->id, $this->floor()->tabOf($a)->table_id);
        $this->assertSame('T1', $this->guest()->show($b->qr_token)['table']['name']);
        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);
        $this->guest()->table(str_repeat('z', 24));
    }

    public function test_a_guest_sees_the_menu_the_tab_and_how_to_pay_and_may_ask_for_the_bill(): void
    {
        $d = $this->dish();
        $t = $this->table('T1');
        $this->floor()->seat($t, 2);
        $this->guest()->order($t->qr_token, $this->items($d));
        $v = $this->guest()->show($t->qr_token, $this->now);
        $this->assertTrue($v['allowed']['ok']);
        $this->assertSame(['Burger'], array_column($v['tab']['lines'], 'name'));
        $this->assertSame(['M-Pesa online'], array_column($v['payment_methods'], 'name'), 'only ways that can be charged from the phone');
        $this->assertNotEmpty($v['menu']['menus']);
        $this->guest()->askBill($t->qr_token);
        $this->assertSame(['T1'], $this->billed);
        $this->assertTrue($this->guest()->show($t->qr_token)['bill_asked']);
        $r = $this->guest()->pay($t->qr_token, PaymentMethod::find(4), '0712345678', 25);
        $this->assertSame('pending', $r['order']->payment);
        $this->assertFalse($this->guest()->show($t->qr_token)['allowed']['ok'], 'while the bill is being paid nothing more can be ordered');
    }

    public function test_the_floor_screen_data_lists_areas_and_tables(): void
    {
        $this->table('T1');
        $this->table('T2', ['is_active' => false]);
        $hidden = $this->floor()->saveArea(['name' => 'Closed', 'location_id' => self::BRANCH, 'is_active' => false]);
        $this->floor()->saveTable(['name' => 'Z1', 'area_id' => $hidden->id]);
        $f = $this->floor()->floor(self::BRANCH, $this->now);
        $this->assertSame([['Indoor', ['T1']]], array_map(fn ($a) => [$a['name'], array_column($a['tables'], 'name')], $f['areas']));
    }
}

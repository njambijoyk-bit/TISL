<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Menus\Channel;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\Ticket;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use App\Services\Menus\CounterService;
use App\Services\Menus\DishOptions;
use App\Services\Menus\DishService;
use App\Services\Menus\KitchenService;
use App\Services\Menus\MenuOrderNotices;
use App\Services\Menus\MenuOrderService;
use App\Services\Menus\MenuService;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\ReceiptService;
use App\Services\Menus\StationService;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus step 5: the counter. Quick sales paid at once with change, tabs ordered in rounds and paid at the end, service charge and tips, and the receipt. The books are stood in for; what they are asked is checked. */
class MenusCounterTest extends TestCase
{
    use Concerns\CreatesDishTables;

    private array $placed = [];
    private array $settled = [];
    private array $cancelled = [];
    private Carbon $now;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow($this->now = Carbon::parse('2026-10-12 12:00', 'Africa/Nairobi'));
        $this->createDishTables();
        Schema::create('menus_menus', function ($t) { $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->string('description', 500)->nullable(); $t->json('days')->nullable(); $t->time('starts_at')->nullable(); $t->time('ends_at')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_sections', function ($t) { $t->id(); $t->unsignedBigInteger('menu_id'); $t->string('name'); $t->string('description', 300)->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_section_dishes', function ($t) { $t->id(); $t->unsignedBigInteger('section_id'); $t->unsignedBigInteger('dish_id'); $t->integer('sort_order')->default(0); $t->unique(['section_id', 'dish_id']); });
        Schema::create('menus_option_groups', function ($t) { $t->id(); $t->unsignedBigInteger('dish_id'); $t->string('name'); $t->string('kind', 8)->default('single'); $t->unsignedTinyInteger('min_choices')->default(0); $t->unsignedTinyInteger('max_choices')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_options', function ($t) { $t->id(); $t->unsignedBigInteger('group_id'); $t->string('name'); $t->decimal('price_delta', 12, 2)->default(0); $t->boolean('is_default')->default(false); $t->boolean('charge_removal')->default(false); $t->unsignedBigInteger('linked_dish_id')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_option_uses', function ($t) { $t->id(); $t->unsignedBigInteger('option_id'); $t->string('mode', 8)->default('add'); $t->unsignedBigInteger('family_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->decimal('quantity', 18, 4)->nullable(); $t->unsignedBigInteger('unit_id')->nullable(); });
        Schema::create('menus_channels', function ($t) { $t->id(); $t->string('code', 30)->unique(); $t->string('name'); $t->string('order_type', 12); $t->boolean('is_active')->default(false); $t->unsignedSmallInteger('prep_minutes')->default(20); $t->unsignedSmallInteger('slot_minutes')->default(15); $t->unsignedTinyInteger('max_days_ahead')->default(2); $t->boolean('allow_asap')->default(true); $t->json('payment_modes')->nullable(); $t->json('menu_ids')->nullable(); $t->json('shipping_option_ids')->nullable(); $t->decimal('min_order', 12, 2)->default(0); $t->string('note', 300)->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::table('menus_dishes', fn ($t) => $t->unsignedBigInteger('station_id')->nullable());
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_tickets', function ($t) { $t->id(); $t->unsignedBigInteger('order_id'); $t->unsignedBigInteger('station_id'); $t->unsignedSmallInteger('round')->default(1); $t->string('status', 10)->default('new'); $t->dateTime('due_at'); foreach (['started_at', 'ready_at', 'cancelled_at'] as $c) { $t->dateTime($c)->nullable(); } $t->timestamps(); $t->unique(['order_id', 'station_id', 'round']); });
        Schema::create('menus_orders', function ($t) {
            $t->id(); $t->string('number', 20); $t->string('track_token', 40); $t->unsignedBigInteger('channel_id')->default(1); $t->string('order_type', 12)->default('pickup'); $t->string('service', 10)->nullable(); $t->unsignedInteger('short_no')->nullable(); $t->string('label', 80)->nullable(); $t->unsignedBigInteger('cashier_id')->nullable();
            $t->unsignedBigInteger('location_id')->default(self::BRANCH); $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('sale_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('name'); $t->string('email')->nullable(); $t->string('phone', 40)->nullable();
            $t->string('status', 12)->default('placed'); $t->string('payment', 10)->default('pending'); $t->unsignedBigInteger('payment_method_id')->nullable(); $t->boolean('asap')->default(true); $t->dateTime('fulfil_at'); $t->text('delivery_address')->nullable(); $t->unsignedBigInteger('shipping_option_id')->nullable();
            $t->decimal('delivery_fee', 12, 2)->default(0); $t->decimal('subtotal', 12, 2)->default(0); $t->decimal('tax_total', 12, 2)->default(0); $t->decimal('total', 12, 2)->default(0); $t->decimal('tip', 12, 2)->default(0); $t->decimal('service_charge', 12, 2)->default(0); $t->decimal('tendered', 12, 2)->nullable(); $t->decimal('change_due', 12, 2)->default(0);
            $t->json('tax_breakdown')->nullable(); $t->json('tenders')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->string('notes', 500)->nullable(); $t->string('cancel_reason', 300)->nullable();
            foreach (['placed_at', 'accepted_at', 'ready_at', 'completed_at', 'cancelled_at', 'settled_at'] as $c) { $t->dateTime($c)->nullable(); } $t->timestamps();
        });
        Schema::create('menus_order_lines', function ($t) { $t->id(); $t->unsignedBigInteger('order_id'); $t->unsignedBigInteger('dish_id'); $t->unsignedBigInteger('variant_id'); $t->string('name'); $t->decimal('quantity', 10, 2)->default(1); $t->decimal('base_price', 12, 2)->default(0); $t->decimal('unit_price', 12, 2)->default(0); $t->json('options')->nullable(); $t->string('note', 300)->nullable(); $t->unsignedSmallInteger('round')->default(1); $t->json('uses')->nullable(); $t->json('linked')->nullable(); $t->unsignedBigInteger('ticket_id')->nullable(); $t->timestamps(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_online')->default(false); $t->string('gateway')->nullable(); $t->boolean('requires_reference')->default(false); $t->text('instructions')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 12, 2)->default(0); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->string('name')->nullable(); $t->string('symbol')->nullable(); $t->boolean('is_base')->default(false); $t->boolean('is_active')->default(true); $t->timestamps(); });
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'name' => 'Kenyan shilling', 'symbol' => 'KSh', 'is_base' => true]);
        DB::table('payment_methods')->insert([['id' => 1, 'name' => 'Cash', 'kind' => 'cash', 'is_active' => true], ['id' => 2, 'name' => 'M-Pesa', 'kind' => 'mpesa', 'is_active' => true], ['id' => 3, 'name' => 'Old card', 'kind' => 'card', 'is_active' => false]]);
        DB::table('ledgers')->insert([['id' => 80, 'name' => 'Tips payable', 'group_id' => 1], ['id' => 81, 'name' => 'Service charge income', 'group_id' => 1]]);

        $vouchers = $this->createMock(VoucherService::class);
        $vouchers->method('preview')->willReturnCallback(function (array $d) {
            $goods = array_sum(array_map(fn ($l) => $l['type'] === 'product' ? $l['quantity'] * $l['rate'] : 0, $d['lines']));
            $charges = array_sum(array_map(fn ($l) => $l['type'] === 'charge' ? $l['amount'] : 0, $d['lines']));
            $tax = round($goods * 0.16, 2);

            return ['subtotal' => $goods + $charges, 'tax_total' => $tax, 'total' => round($goods + $charges + $tax, 2), 'tax_breakdown' => [['label' => 'VAT', 'percent' => 16.0, 'amount' => $tax]], 'lines' => []];
        });
        $vouchers->method('placeOrder')->willReturnCallback(function (array $d) {
            $this->placed[] = $d;
            $goods = array_sum(array_map(fn ($l) => $l['type'] === 'product' ? $l['quantity'] * $l['rate'] : 0, $d['lines']));
            $charges = array_sum(array_map(fn ($l) => $l['type'] === 'charge' ? $l['amount'] : 0, $d['lines']));

            return Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'SO-'.count($this->placed), 'currency_id' => $d['currency_id'], 'total_amount' => round($goods * 1.16 + $charges, 2), 'meta' => $d['meta']]);
        });
        $vouchers->method('cancel')->willReturnCallback(function (Voucher $v) { $this->cancelled[] = $v->id; return $v; });
        $this->app->instance(VoucherService::class, $vouchers);
        $this->mock(GatewayPaymentService::class);
        $checkout = $this->createMock(CheckoutService::class);
        $checkout->method('settle')->willReturnCallback(function (Voucher $order, array $tenders) {
            $this->settled[] = [$order->id, $tenders];

            return Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-'.count($this->settled), 'total_amount' => $order->total_amount]);
        });
        $this->app->instance(CheckoutService::class, $checkout);
        $this->app->instance(MenuOrderNotices::class, $this->createMock(MenuOrderNotices::class));

        // a counter that is on, a menu served all day with a stocked dish, one station that takes everything
        Channel::create(['code' => 'counter', 'name' => 'Counter', 'order_type' => 'counter', 'is_active' => true, 'prep_minutes' => 0, 'slot_minutes' => 15, 'max_days_ahead' => 0, 'allow_asap' => true, 'payment_modes' => ['later']]);
        app(StationService::class)->save(['name' => 'Kitchen', 'is_default' => true]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function counter(): CounterService
    {
        return app(CounterService::class);
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

    private function in(array $dishes, array $o = []): array
    {
        return $o + ['items' => array_map(fn ($d) => ['dish_id' => $d->id, 'quantity' => 2], $dishes), 'service' => 'take_out', 'tenders' => [['payment_method_id' => 1, 'amount' => 5000]]];
    }

    private function settings(array $s): void
    {
        MenusSettings::save($s, null);
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

    // ------------------------------------------------------------ the rules

    public function test_the_service_charge_and_tip_settings_keep_to_their_limits(): void
    {
        $this->fails(fn () => $this->settings(['service_charge_pct' => 40]), 'between 0 and 30');
        $this->fails(fn () => $this->settings(['service_charge_pct' => 10]), 'account the service charge is booked to');
        $this->fails(fn () => $this->settings(['tip_ledger_id' => 999]), 'does not exist');
        $this->settings(['service_charge_pct' => 10, 'service_charge_ledger_id' => 81, 'tip_ledger_id' => 80]);
        $this->assertSame(['service_charge_pct' => 10.0, 'service_charge_on' => true, 'tips_on' => true], $this->counter()->rules());
        $this->settings(['service_charge_pct' => 0]);
        $this->assertFalse($this->counter()->rules()['service_charge_on']);
    }

    public function test_the_counter_must_be_switched_on(): void
    {
        $d = $this->dish();
        Channel::where('code', 'counter')->update(['is_active' => false]);
        $this->fails(fn () => $this->counter()->sell($this->in([$d]), null, $this->now), 'not switched on');
    }

    // ------------------------------------------------------------ pricing

    public function test_the_service_charge_is_dine_in_only_and_can_be_waived(): void
    {
        $this->settings(['service_charge_pct' => 10, 'service_charge_ledger_id' => 81]);
        $d = $this->dish();
        $in = $this->in([$d]);   // 2 × 500 = 1000, VAT 160
        $this->assertSame([0.0, 1160.0], [$this->counter()->quote($in, $this->now)['service_charge'], $this->counter()->quote($in, $this->now)['total']], 'take out: none');
        $dine = $this->counter()->quote(array_merge($in, ['service' => 'dine_in']), $this->now);
        $this->assertSame([1000.0, 100.0, 160.0, 1260.0], [$dine['subtotal'], $dine['service_charge'], $dine['tax_total'], $dine['total']], '10% of the food before tax; the charge itself carries no VAT here');
        $this->assertSame(0.0, $this->counter()->quote(array_merge($in, ['service' => 'dine_in', 'waive_service' => true]), $this->now)['service_charge']);
    }

    public function test_a_tip_is_a_line_to_the_tip_account_and_needs_one(): void
    {
        $d = $this->dish();
        $this->fails(fn () => $this->counter()->quote($this->in([$d], ['tip' => 50]), $this->now), 'Tips are not set up');
        $this->settings(['tip_ledger_id' => 80]);
        $this->fails(fn () => $this->counter()->quote($this->in([$d], ['tip' => -5]), $this->now), 'less than nothing');
        $q = $this->counter()->quote($this->in([$d], ['tip' => 100]), $this->now);
        $this->assertSame([100.0, 1260.0], [$q['tip'], $q['total']]);
        $o = $this->counter()->sell($this->in([$d], ['tip' => 100]), null, $this->now);
        $tip = collect($this->placed[0]['lines'])->firstWhere('description', 'Tip');
        $this->assertSame([80, 100.0, 'charge'], [$tip['ledger_id'], $tip['amount'], $tip['type']]);
        $this->assertSame([100.0, 1260.0], [(float) $o->tip, (float) $o->total]);
    }

    // ------------------------------------------------------------ selling

    public function test_a_sale_paid_in_cash_gives_change_and_goes_to_the_kitchen(): void
    {
        $d = $this->dish();
        $o = $this->counter()->sell($this->in([$d], ['label' => 'Window']), null, $this->now);
        $this->assertSame(['counter', 'take_out', 'paid', 'placed', 1, 'Window'], [$o->order_type, $o->service, $o->payment, $o->status, $o->short_no, $o->label]);
        $this->assertSame([1160.0, 5000.0, 3840.0], [(float) $o->total, (float) $o->tendered, (float) $o->change_due]);
        $this->assertSame([[$o->voucher_id, [['payment_method_id' => 1, 'amount' => 1160.0, 'reference' => null]]]], $this->settled, 'the books are given only what was kept: the change comes off the cash');
        $this->assertEquals([['method' => 'Cash', 'amount' => 1160.0, 'reference' => null]], $o->tenders);
        $this->assertNotNull($o->sale_id);
        $this->assertSame([$o->id], [Voucher::find($o->voucher_id)->meta['menu_order_id']]);
        $this->assertSame(1, Ticket::where('order_id', $o->id)->count(), 'the kitchen has its ticket');
        $this->assertSame('admin', $this->placed[0]['channel']);
        $this->assertSame(2, $this->counter()->sell($this->in([$d]), null, $this->now)->short_no, 'the number to call out counts up through the day');
        MenuOrder::query()->update(['created_at' => $this->now->copy()->subDay()]);
        $this->assertSame(1, $this->counter()->sell($this->in([$d]), null, $this->now)->short_no, 'and starts again tomorrow');
    }

    public function test_the_payment_must_cover_the_total_and_only_cash_may_be_over(): void
    {
        $d = $this->dish();
        $this->fails(fn () => $this->counter()->sell($this->in([$d], ['tenders' => [['payment_method_id' => 1, 'amount' => 1000]]]), null, $this->now), 'short by 160.00');
        $this->fails(fn () => $this->counter()->sell($this->in([$d], ['tenders' => []]), null, $this->now), 'how it was paid');
        $this->fails(fn () => $this->counter()->sell($this->in([$d], ['tenders' => [['payment_method_id' => 2, 'amount' => 1500]]]), null, $this->now), 'Only cash can be over');
        $this->fails(fn () => $this->counter()->sell($this->in([$d], ['tenders' => [['payment_method_id' => 3, 'amount' => 1160]]]), null, $this->now), 'not available');
        $this->assertSame([], $this->placed, 'nothing was booked');
        $this->assertSame(0, MenuOrder::count());
        $o = $this->counter()->sell($this->in([$d], ['tenders' => [['payment_method_id' => 2, 'amount' => 800, 'reference' => 'QWE123'], ['payment_method_id' => 1, 'amount' => 400]]]), null, $this->now);
        $this->assertSame([2, 800.0, 'QWE123'], [$this->settled[0][1][0]['payment_method_id'], $this->settled[0][1][0]['amount'], $this->settled[0][1][0]['reference']]);
        $this->assertSame([360.0, 40.0], [$this->settled[0][1][1]['amount'], (float) $o->change_due], 'M-Pesa exact, the rest in cash with 40 back');
    }

    public function test_a_dish_that_is_sold_out_or_not_on_the_counter_menus_can_not_be_rung_up(): void
    {
        $d = $this->dish('Burger', 500, 1);
        $this->fails(fn () => $this->counter()->sell($this->in([$d]), null, $this->now), 'Only 1 of Burger left');
        $other = $this->make('Hidden', 100);
        $this->stock((int) $other->variant_id, 5);
        $this->fails(fn () => $this->counter()->sell($this->in([$other]), null, $this->now), 'not on the menu');
        Channel::where('code', 'counter')->update(['menu_ids' => [999]]);
        $e = $this->dish('Chips', 100);
        $this->fails(fn () => $this->counter()->sell($this->in([$e]), null, $this->now), 'not on the menu');
    }

    // ------------------------------------------------------------ tabs

    public function test_a_tab_is_ordered_in_rounds_and_nothing_is_booked_until_it_is_paid(): void
    {
        $this->settings(['service_charge_pct' => 10, 'service_charge_ledger_id' => 81, 'tip_ledger_id' => 80]);
        $d = $this->dish();
        $fries = $this->dish('Fries', 200);
        $this->fails(fn () => $this->counter()->openTab($this->in([$d], ['service' => 'dine_in']), null, $this->now), 'Give the tab a name');
        $tab = $this->counter()->openTab($this->in([$d], ['service' => 'dine_in', 'label' => 'Table 4']), null, $this->now);
        $this->assertSame(['open', 'placed', 1160.0, null], [$tab->payment, $tab->status, (float) $tab->total, $tab->voucher_id]);
        $tab = $this->counter()->addToTab($tab, ['items' => [['dish_id' => $fries->id, 'quantity' => 3]]], null, $this->now);
        $this->assertSame(1160.0 + 696.0, (float) $tab->total, 'the tab adds up as it grows (before service charge and tip)');
        $this->assertSame([[1, 1], [2, 1]], Ticket::where('order_id', $tab->id)->orderBy('round')->get()->map(fn ($t) => [(int) $t->round, $t->lines()->count()])->all(), 'each round has its own ticket');
        $this->assertSame([], $this->placed);
        $this->assertSame([], $this->settled);

        $q = $this->counter()->settleTab($tab, ['tip' => 50, 'tenders' => [['payment_method_id' => 1, 'amount' => 3000]]], null);
        $this->assertSame(1, count($this->placed), 'one sale for the whole tab');
        $products = array_values(array_filter($this->placed[0]['lines'], fn ($l) => $l['type'] === 'product'));
        $this->assertSame([500.0, 200.0], array_map(fn ($l) => (float) $l['rate'], $products));
        $svc = collect($this->placed[0]['lines'])->firstWhere('description', 'Service charge');
        $this->assertSame([160.0, 81], [(float) $svc['amount'], $svc['ledger_id']], '10% of 1000 + 600');
        $this->assertSame(['paid', 50.0, 160.0], [$q->payment, (float) $q->tip, (float) $q->service_charge]);
        $this->assertSame(1856.0 + 160.0 + 50.0, (float) $q->total);
        $this->assertEquals(3000.0, (float) $q->tendered);
        $this->assertSame('placed', $q->status, 'the kitchen has not finished: the order carries on');
        $this->assertNull($q->completed_at);
    }

    public function test_a_tab_paid_after_everything_was_served_is_closed(): void
    {
        $d = $this->dish();
        $tab = $this->counter()->openTab($this->in([$d], ['label' => 'Amina']), null, $this->now);
        app(KitchenService::class)->ready(Ticket::first());
        $this->assertSame('placed', $tab->fresh()->status, 'a tab is never "ready": more may be ordered');
        $q = $this->counter()->settleTab($tab->fresh(), ['tenders' => [['payment_method_id' => 1, 'amount' => 1160]]]);
        $this->assertSame('completed', $q->status);
        $this->assertNotNull($q->completed_at);
    }

    public function test_a_tab_can_not_be_completed_from_the_board_or_settled_twice(): void
    {
        $d = $this->dish();
        $tab = $this->counter()->openTab($this->in([$d], ['label' => 'Amina']), null, $this->now);
        $tab->update(['status' => 'ready']);
        $this->fails(fn () => app(MenuOrderService::class)->advance($tab->fresh(), 'completed'), 'Settle the tab first');
        $this->counter()->settleTab($tab->fresh(), ['tenders' => [['payment_method_id' => 1, 'amount' => 1160]]]);
        $this->fails(fn () => $this->counter()->settleTab($tab->fresh(), ['tenders' => [['payment_method_id' => 1, 'amount' => 1160]]]), 'not an open tab');
        $this->fails(fn () => $this->counter()->addToTab($tab->fresh(), $this->in([$d])), 'not an open tab');
    }

    public function test_a_dish_comes_off_a_tab_only_before_the_kitchen_starts_it(): void
    {
        $a = $this->dish('Burger');
        $b = $this->dish('Fries', 200);
        $tab = $this->counter()->openTab($this->in([$a], ['label' => 'T1']), null, $this->now);
        $tab = $this->counter()->addToTab($tab, $this->in([$b]), null, $this->now);
        $fries = $tab->lines()->where('name', 'Fries')->first();
        $burger = $tab->lines()->where('name', 'Burger')->first();
        app(KitchenService::class)->start(Ticket::find($burger->ticket_id));
        $this->fails(fn () => $this->counter()->voidLine($tab, $burger->id), 'already been started');
        $tab = $this->counter()->voidLine($tab, $fries->id);
        $this->assertSame(1160.0, (float) $tab->total);
        $this->assertSame(1, Ticket::where('order_id', $tab->id)->count(), 'its ticket went with it');
        $this->fails(fn () => $this->counter()->voidLine($tab, $burger->id), 'already been started');
        $solo = $this->counter()->openTab($this->in([$a], ['label' => 'T2']), null, $this->now);
        $this->fails(fn () => $this->counter()->voidLine($solo, $solo->lines()->first()->id), 'cancel the tab instead');
    }

    public function test_cancelling_a_tab_books_nothing_and_stops_the_kitchen(): void
    {
        $d = $this->dish();
        $tab = $this->counter()->openTab($this->in([$d], ['label' => 'T1']), null, $this->now);
        $t = $this->counter()->cancelTab($tab, 'Left');
        $this->assertSame(['cancelled', 'Left'], [$t->status, $t->cancel_reason]);
        $this->assertSame(['cancelled'], Ticket::pluck('status')->all());
        $this->assertSame([[], []], [$this->placed, $this->cancelled], 'there was no sale to undo');
    }

    public function test_the_till_lists_open_tabs_and_paid_orders_waiting_to_be_handed_over(): void
    {
        $d = $this->dish();
        $tab = $this->counter()->openTab($this->in([$d], ['label' => 'T1']), null, $this->now);
        $paid = $this->counter()->sell($this->in([$d]), null, $this->now);
        $done = $this->counter()->sell($this->in([$d]), null, $this->now);
        $done->update(['status' => 'completed']);
        $b = $this->counter()->board();
        $this->assertSame([[$tab->id], [$paid->id]], [$b['tabs']->pluck('id')->all(), $b['ready']->pluck('id')->all()]);
    }

    public function test_a_paid_counter_order_is_handed_over_when_ready(): void
    {
        $d = $this->dish();
        $o = $this->counter()->sell($this->in([$d]), null, $this->now);
        app(KitchenService::class)->ready(Ticket::first());
        $this->assertSame('ready', $o->fresh()->status);
        $this->assertSame('completed', app(MenuOrderService::class)->advance($o->fresh(), 'completed')->status);
    }

    public function test_nobody_is_messaged_about_a_counter_order(): void
    {
        $sent = [];
        $notifier = $this->createMock(Notifier::class);
        $notifier->method('send')->willReturnCallback(function () use (&$sent) { $sent[] = 'send'; return []; });
        $notifier->method('sendToContact')->willReturnCallback(function () use (&$sent) { $sent[] = 'contact'; return []; });
        $n = new MenuOrderNotices($notifier, $this->createMock(Staff::class));
        $d = $this->dish();
        $o = $this->counter()->sell($this->in([$d]), null, $this->now);
        $n->ready($o);
        $n->cancelled($o);
        $this->assertSame([], $sent);
    }

    // ------------------------------------------------------------ the receipt

    public function test_the_receipt_has_the_kiosk_layout_in_the_width_asked(): void
    {
        $this->settings(['service_charge_pct' => 10, 'service_charge_ledger_id' => 81, 'tip_ledger_id' => 80, 'receipt_footer' => 'Thank you!']);
        $d = $this->dish('Steak, Egg & Cheese', 475);
        app(DishOptions::class)->save($d, [['name' => 'Extras', 'kind' => 'multiple', 'options' => [['name' => 'Cheese', 'price_delta' => 50], ['name' => 'No mayo', 'price_delta' => 0]]]]);
        $opts = DB::table('menus_options')->pluck('id', 'name');
        $o = $this->counter()->sell(['service' => 'dine_in', 'label' => 'Table 4', 'tip' => 40, 'items' => [['dish_id' => $d->id, 'quantity' => 2, 'option_ids' => [$opts['Cheese'], $opts['No mayo']], 'note' => 'Hot']],
            'tenders' => [['payment_method_id' => 1, 'amount' => 2000]]], null, $this->now);
        $r = app(ReceiptService::class)->for($o->fresh(), 32);
        $lines = explode("\n", rtrim($r['text']));
        foreach ($lines as $l) {
            $this->assertLessThanOrEqual(32, mb_strlen($l), "too wide: {$l}");
        }
        $text = $r['text'];
        $this->assertMatchesRegularExpression('/Order Type\s+Dine In/', $text);
        $this->assertMatchesRegularExpression('/Order #\s+1\n/', $text);
        $this->assertMatchesRegularExpression('/Tab\s+Table 4/', $text);
        $this->assertMatchesRegularExpression('/2  Steak, Egg & Cheese\s+950\.00/', $text);
        $this->assertMatchesRegularExpression('/   - Cheese\s+100\.00/', $text, 'a choice shows a price only when it costs something');
        $this->assertStringContainsString("\n   - No mayo\n", $text);
        $this->assertStringContainsString('   * Hot', $text);
        $this->assertMatchesRegularExpression('/Subtotal\s+1,050\.00/', $text);
        $this->assertMatchesRegularExpression('/VAT 16%\s+168\.00/', $text);
        $this->assertMatchesRegularExpression('/Service Charge\s+105\.00/', $text);
        $this->assertMatchesRegularExpression('/Tip\s+40\.00/', $text);
        $this->assertMatchesRegularExpression('/TOTAL\s+1,363\.00/', $text);
        $this->assertMatchesRegularExpression('/Cash\s+1,363\.00/', $text);
        $this->assertMatchesRegularExpression('/Change\s+637\.00/', $text);
        $this->assertStringContainsString('Thank you!', $text);
        $this->assertGreaterThan(32, mb_strlen(explode("\n", app(ReceiptService::class)->for($o->fresh(), 42)['text'])[5]), 'the 80 mm printout is wider');
    }

    public function test_an_open_tab_says_it_is_not_paid_yet(): void
    {
        $d = $this->dish();
        $tab = $this->counter()->openTab($this->in([$d], ['label' => 'T1']), null, $this->now);
        $this->assertStringContainsString('NOT PAID YET', app(ReceiptService::class)->for($tab)['text']);
    }
}

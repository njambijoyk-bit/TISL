<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Menus\Channel;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\Plan;
use App\Models\Menus\PlanDay;
use App\Models\Menus\SubDelivery;
use App\Models\Menus\SubPeriod;
use App\Models\Menus\Subscription;
use App\Services\Books\BooksException;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\PlanNotices;
use App\Services\Menus\PlanService;
use App\Services\Menus\SubscriptionService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus step 17: meal plans. Plans and their menus, subscribing, billing a week ahead, paying, skipping, pausing, lapsing and the kitchen orders. "Now" is Monday 12 Oct 2026, 12:00. */
class MenusPlansTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private array $notes = [];
    private array $converted = [];
    private array $voided = [];
    private array $vouchers = [];
    private bool $stockFails = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        Schema::create('menus_plans', function ($t) { $t->id(); $t->string('name', 120); $t->string('slug', 140)->unique(); $t->text('description')->nullable(); $t->string('photo')->nullable(); $t->unsignedBigInteger('location_id'); $t->unsignedTinyInteger('cycle_weeks')->default(1); $t->decimal('day_price', 12, 2)->default(0);
            $t->string('delivery_weekdays', 20)->default('1,2,3,4,5'); $t->unsignedTinyInteger('min_days')->default(1); $t->unsignedSmallInteger('cutoff_hours')->default(24); $t->time('slot_from')->default('12:00:00'); $t->time('slot_to')->default('14:00:00'); $t->boolean('is_active')->default(true);
            $t->integer('sort_order')->default(0); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('menus_plan_days', function ($t) { $t->id(); $t->unsignedBigInteger('plan_id'); $t->unsignedTinyInteger('week_no'); $t->unsignedTinyInteger('weekday'); $t->unsignedBigInteger('dish_id'); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_subscriptions', function ($t) { $t->id(); $t->string('number', 20); $t->string('manage_token', 40)->unique(); $t->unsignedBigInteger('plan_id'); $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('name', 160); $t->string('email', 190)->nullable(); $t->string('phone', 40); $t->text('address');
            $t->string('weekdays', 20); $t->date('start_date'); $t->string('status', 10)->default('pending'); $t->date('paused_from')->nullable(); $t->date('paused_until')->nullable(); $t->unsignedSmallInteger('credit_days')->default(0); $t->unsignedTinyInteger('lapsed')->default(0); $t->string('notes', 500)->nullable();
            $t->dateTime('cancelled_at')->nullable(); $t->string('cancel_reason', 300)->nullable(); $t->timestamps(); });
        Schema::create('menus_sub_periods', function ($t) { $t->id(); $t->unsignedBigInteger('subscription_id'); $t->date('week_start'); $t->unsignedTinyInteger('week_no'); foreach (['subtotal', 'tax_total', 'total'] as $c) { $t->decimal($c, 14, 2)->default(0); } $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('sale_id')->nullable();
            $t->string('status', 8)->default('due'); $t->dateTime('pay_by')->nullable(); $t->dateTime('paid_at')->nullable(); $t->dateTime('reminded_at')->nullable(); $t->timestamps(); $t->unique(['subscription_id', 'week_start']); });
        Schema::create('menus_sub_deliveries', function ($t) { $t->id(); $t->unsignedBigInteger('subscription_id'); $t->unsignedBigInteger('period_id'); $t->date('delivery_date'); $t->string('status', 10)->default('scheduled'); $t->boolean('free')->default(false); $t->json('meals')->nullable(); $t->json('item_ids')->nullable();
            $t->unsignedBigInteger('order_id')->nullable(); $t->dateTime('skipped_at')->nullable(); $t->string('stock_note', 300)->nullable(); $t->timestamps(); $t->unique(['subscription_id', 'delivery_date']); });
        Schema::table('voucher_items', function ($t) { $t->unsignedBigInteger('voucher_id')->nullable(); $t->boolean('is_header')->default(false); });
        Channel::create(['code' => 'delivery', 'name' => 'Delivery', 'order_type' => 'delivery', 'is_active' => true, 'prep_minutes' => 30, 'slot_minutes' => 15, 'max_days_ahead' => 3, 'allow_asap' => true, 'payment_modes' => ['online']]);
        MenusSettings::save(['plans_enabled' => true], null);

        // the books, as the plans use them: a Sales Order with a line for each dish, a delivery note for stock, a cancel
        $v = $this->createMock(VoucherService::class);
        $v->method('preview')->willReturnCallback(function (array $d) {
            $goods = array_sum(array_map(fn ($l) => $l['quantity'] * $l['rate'], $d['lines']));
            $tax = round($goods * 0.16, 2);

            return ['subtotal' => $goods, 'tax_total' => $tax, 'total' => round($goods + $tax, 2), 'tax_breakdown' => [], 'lines' => []];
        });
        $v->method('placeOrder')->willReturnCallback(function (array $d) {
            $goods = array_sum(array_map(fn ($l) => $l['quantity'] * $l['rate'], $d['lines']));
            $o = Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'SO-'.(count($this->vouchers) + 1), 'currency_id' => $d['currency_id'], 'total_amount' => round($goods * 1.16, 2), 'meta' => $d['meta']]);
            foreach ($d['lines'] as $l) {
                DB::table('voucher_items')->insert(['voucher_id' => $o->id, 'dish_id' => $l['dish_id'], 'is_header' => false]);
            }
            $this->vouchers[] = ['id' => $o->id, 'lines' => $d['lines'], 'meta' => $d['meta']];

            return $o;
        });
        $v->method('convert')->willReturnCallback(function (Voucher $o, $type, array $d) {
            if ($this->stockFails) {
                throw new BooksException('Not enough rice.');
            }
            $this->converted[] = [$o->id, $d['lines']];

            return $o;
        });
        $v->method('cancel')->willReturnCallback(function (Voucher $o, $why) { $this->voided[] = $o->id; $o->update(['status' => Voucher::CANCELLED]); return $o; });
        $this->app->instance(VoucherService::class, $v);

        $n = $this->createMock(PlanNotices::class);
        foreach (['weekReady', 'reminder', 'paid', 'lapsed', 'orderMade', 'cancelled', 'staff', 'membershipNeeded'] as $m) {
            $n->method($m)->willReturnCallback(function (...$a) use ($m) { $this->notes[] = [$m, $a[0] instanceof Subscription ? $a[0]->number : (is_string($a[0]) ? $a[0] : null)]; });
        }
        $this->app->instance(PlanNotices::class, $n);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function plans(): PlanService
    {
        return app(PlanService::class);
    }

    private function subs(): SubscriptionService
    {
        return app(SubscriptionService::class);
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected a refusal containing: {$part}");
    }

    private function noted(string $m): int
    {
        return count(array_filter($this->notes, fn ($n) => $n[0] === $m));
    }

    /** a plan Mon-Fri, 600 a day, two dishes a day (200 and 100 on the shelf: they share the day's price 2:1) */
    private function plan(array $o = []): Plan
    {
        $rice = $this->make('Rice and beans', 200);
        $greens = $this->make('Greens', 100);
        $p = $this->plans()->save($o + ['name' => 'Office lunch', 'location_id' => 1, 'day_price' => 600, 'delivery_weekdays' => [1, 2, 3, 4, 5], 'min_days' => 2, 'cutoff_hours' => 24, 'slot_from' => '12:00', 'slot_to' => '14:00']);
        $grid = [];
        foreach ($p->weekdays() as $wd) {
            $grid[] = ['week_no' => 1, 'weekday' => $wd, 'dish_ids' => [$rice->id, $greens->id]];
        }
        $this->plans()->saveMenu($p, $grid);

        return $p->fresh();
    }

    private function method(): int
    {
        return 4;   // M-Pesa online
    }

    /** subscribe Wed/Fri/Mon from Wed 14 Oct */
    private function join(Plan $p, array $o = []): Subscription
    {
        return $this->subs()->subscribe($p, $o + ['name' => 'Amina Yusuf', 'phone' => '0712345678', 'email' => 'amina@example.com', 'address' => 'Kilimani, Nairobi', 'weekdays' => [1, 3, 5], 'start_date' => '2026-10-14', 'payment_method_id' => $this->method()])['subscription'];
    }

    private function pay(Subscription $s, ?SubPeriod $period = null): void
    {
        $period ??= SubPeriod::where('subscription_id', $s->id)->where('status', 'due')->orderBy('week_start')->firstOrFail();
        $sale = Voucher::create(['voucher_type_id' => 2, 'voucher_number' => 'CS-'.$period->id, 'total_amount' => $period->total]);
        $this->subs()->paid(Voucher::findOrFail($period->voucher_id), $sale);
    }

    // ── plans ─────────────────────────────────────────────────────────────

    public function test_plan_validation(): void
    {
        $base = ['name' => 'P', 'location_id' => 1, 'day_price' => 500, 'delivery_weekdays' => [1, 2, 3]];
        $this->fails(fn () => $this->plans()->save(['name' => ' '] + $base), 'name');
        $this->fails(fn () => $this->plans()->save(['name' => str_repeat('a', 121)] + $base), 'name');
        $this->fails(fn () => $this->plans()->save(['location_id' => 9] + $base), 'kitchen');
        $this->fails(fn () => $this->plans()->save(['cycle_weeks' => 0] + $base), '1 to 4 weeks');
        $this->fails(fn () => $this->plans()->save(['cycle_weeks' => 5] + $base), '1 to 4 weeks');
        $this->fails(fn () => $this->plans()->save(['day_price' => 0] + $base), 'price for each delivery day');
        $this->fails(fn () => $this->plans()->save(['day_price' => 10000001] + $base), 'price for each delivery day');
        $this->fails(fn () => $this->plans()->save(['delivery_weekdays' => []] + $base), 'days of the week');
        $this->fails(fn () => $this->plans()->save(['delivery_weekdays' => [0, 1]] + $base), 'days of the week');
        $this->fails(fn () => $this->plans()->save(['delivery_weekdays' => [8]] + $base), 'days of the week');
        $this->fails(fn () => $this->plans()->save(['min_days' => 0] + $base), 'fewest delivery days');
        $this->fails(fn () => $this->plans()->save(['min_days' => 4] + $base), 'fewest delivery days');
        $this->fails(fn () => $this->plans()->save(['cutoff_hours' => 5] + $base), '6 to 168');
        $this->fails(fn () => $this->plans()->save(['cutoff_hours' => 169] + $base), '6 to 168');
        $this->fails(fn () => $this->plans()->save(['slot_from' => '9am'] + $base), 'delivery window');
        $this->fails(fn () => $this->plans()->save(['slot_to' => '25:00'] + $base), 'delivery window');
        $this->fails(fn () => $this->plans()->save(['slot_from' => '14:00', 'slot_to' => '14:00'] + $base), 'end after it starts');
        $this->assertSame(0, Plan::count());
        $this->plans()->save(['name' => str_repeat('a', 120), 'cycle_weeks' => 4, 'min_days' => 3, 'cutoff_hours' => 6, 'slot_from' => '00:00', 'slot_to' => '23:59', 'day_price' => 10000000] + $base);
        $this->plans()->save(['cutoff_hours' => 168, 'min_days' => 1, 'cycle_weeks' => 1, 'day_price' => 0.01] + $base);
        $this->assertSame(2, Plan::count());
    }

    public function test_a_plan_is_saved_with_a_slug_clean_days_and_can_be_edited(): void
    {
        $a = $this->plans()->save(['name' => 'Office lunch', 'location_id' => 1, 'day_price' => 550.555, 'delivery_weekdays' => '5,1,1,3', 'description' => '  Hot lunch ', 'sort_order' => '3']);
        $b = $this->plans()->save(['name' => 'Office lunch', 'location_id' => 1, 'day_price' => 500, 'delivery_weekdays' => [1]]);
        $this->assertSame('office-lunch', $a->slug);
        $this->assertSame('office-lunch-2', $b->slug);
        $this->assertSame('1,3,5', $a->delivery_weekdays);
        $this->assertSame('550.56', (string) $a->day_price);
        $this->assertSame('Hot lunch', $a->description);
        $this->assertSame(3, $a->sort_order);
        $this->assertTrue($a->is_active);
        $e = $this->plans()->save(['is_active' => false, 'description' => ''], $a);
        $this->assertFalse($e->is_active);
        $this->assertNull($e->description);
        $this->assertSame('Office lunch', $e->name);
        $this->assertSame('office-lunch', $e->slug);
    }

    public function test_menu_validation_and_replacement(): void
    {
        $p = $this->plan(['cycle_weeks' => 2, 'delivery_weekdays' => [1, 2, 3]]);
        $d = $this->make('Stew', 150);
        $this->fails(fn () => $this->plans()->saveMenu($p, [['week_no' => 3, 'weekday' => 1, 'dish_ids' => [$d->id]]]), 'outside this plan');
        $this->fails(fn () => $this->plans()->saveMenu($p, [['week_no' => 0, 'weekday' => 1, 'dish_ids' => [$d->id]]]), 'outside this plan');
        $this->fails(fn () => $this->plans()->saveMenu($p, [['week_no' => 1, 'weekday' => 4, 'dish_ids' => [$d->id]]]), 'does not deliver on Thursday');
        $this->fails(fn () => $this->plans()->saveMenu($p, [['week_no' => 1, 'weekday' => 1, 'dish_ids' => [9999]]]), 'does not exist');
        $off = $this->make('Old dish', 100);
        $this->dishes()->save(['is_active' => false], $off->id);
        $this->fails(fn () => $this->plans()->saveMenu($p, [['week_no' => 1, 'weekday' => 1, 'dish_ids' => [$off->id]]]), 'switched off');
        $many = array_map(fn ($i) => $this->make("D{$i}", 10)->id, range(1, 9));
        $this->fails(fn () => $this->plans()->saveMenu($p, [['week_no' => 1, 'weekday' => 1, 'dish_ids' => $many]]), 'at most 8');
        $this->assertSame(8, $this->plans()->saveMenu($p, [['week_no' => 1, 'weekday' => 1, 'dish_ids' => array_slice($many, 0, 8)]]));
        $this->assertSame(8, PlanDay::where('plan_id', $p->id)->count());   // the old menu is gone: nothing half-replaced after a refusal either
        $this->assertSame(2, $this->plans()->saveMenu($p, [['week_no' => 2, 'weekday' => 2, 'dish_ids' => [$d->id, $d->id, $many[0]]]]));
        $this->assertSame(2, PlanDay::where('plan_id', $p->id)->count());
        $this->assertSame(0, $this->plans()->saveMenu($p, []));
    }

    public function test_a_plan_with_subscribers_can_not_be_removed(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->fails(fn () => $this->plans()->delete($p), 'has subscribers');
        $this->subs()->cancel($s);
        $this->plans()->delete($p);   // past subscribers: kept as history, plan switched off
        $this->assertFalse($p->fresh()->is_active);
        $this->assertSame(0, PlanDay::where('plan_id', $p->id)->count());
        $q = $this->plan(['name' => 'Unused']);
        $this->plans()->delete($q);
        $this->assertNull(Plan::find($q->id));
    }

    public function test_the_plan_rows_show_menu_and_subscribers_and_can_be_limited(): void
    {
        $p = $this->plan();
        $this->join($p);
        $this->plan(['name' => 'Off plan', 'is_active' => false]);
        $rows = $this->plans()->rows();
        $this->assertCount(2, $rows);
        $this->assertSame(1, collect($rows)->firstWhere('name', 'Office lunch')['subscribers']);
        $this->assertCount(5, collect($rows)->firstWhere('name', 'Office lunch')['menu']);
        $this->assertCount(1, $this->plans()->rows(null, true));
        $this->assertCount(0, $this->plans()->rows(fn ($q) => $q->where('location_id', 9)));
        $this->assertSame('12:00', $rows[0]['slot_from']);
    }

    // ── subscribing ───────────────────────────────────────────────────────

    public function test_subscribing_bills_the_first_week_and_starts_the_payment(): void
    {
        $p = $this->plan();
        $r = $this->subs()->subscribe($p, ['name' => ' Amina Yusuf ', 'phone' => '0712345678', 'email' => 'amina@example.com', 'address' => 'Kilimani', 'weekdays' => [5, 1, 3], 'start_date' => '2026-10-14', 'payment_method_id' => 4]);
        $s = $r['subscription'];
        $this->assertSame('pending', $s->status);
        $this->assertSame('Amina Yusuf', $s->name);
        $this->assertSame('SB-'.str_pad((string) $s->id, 6, '0', STR_PAD_LEFT), $s->number);
        $this->assertSame('1,3,5', $s->weekdays);
        $this->assertSame(40, strlen($s->manage_token));
        // Wed 14 and Fri 16 only (Monday 12 is before the start)
        $period = SubPeriod::first();
        $this->assertSame('2026-10-12', $period->week_start->toDateString());
        $this->assertSame('due', $period->status);
        $this->assertSame(1200.0, (float) $period->subtotal);
        $this->assertSame(1392.0, (float) $period->total);
        $this->assertSame('2026-10-12 12:30', $period->pay_by->setTimezone('Africa/Nairobi')->format('Y-m-d H:i'));
        $this->assertSame(['2026-10-14', '2026-10-16'], SubDelivery::orderBy('delivery_date')->pluck('delivery_date')->map(fn ($d) => $d->toDateString())->all());
        // the day's price is shared over its dishes 2:1: 400 and 200
        $this->assertSame([400.0, 200.0, 400.0, 200.0], array_map(fn ($l) => (float) $l['rate'], $this->vouchers[0]['lines']));
        $this->assertTrue($this->vouchers[0]['meta']['preorder']);
        $this->assertSame($period->id, $this->vouchers[0]['meta']['menu_period_id']);
        $this->assertCount(1, $this->started);
        $this->assertSame(1392.0, $this->started[0]['due']);
        $this->assertSame($period->voucher_id, $this->started[0]['order']);
        $this->assertSame(1, $this->noted('staff'));
        $this->assertSame(0, $this->noted('weekReady'));   // the first week is paid at once: no "pay for it" notice
        $this->assertStringContainsString('M-Pesa PIN', $r['message']);
    }

    public function test_the_meal_split_keeps_the_exact_day_price(): void
    {
        $p = $this->plan(['day_price' => 100]);
        $this->join($p);
        $rates = array_map(fn ($l) => (float) $l['rate'], $this->vouchers[0]['lines']);
        $this->assertSame([66.67, 33.33], array_slice($rates, 0, 2));
        $this->assertSame(100.0, round($rates[0] + $rates[1], 2));
    }

    public function test_subscribing_validation(): void
    {
        $p = $this->plan();
        $ok = ['name' => 'Amina', 'phone' => '0712', 'email' => 'a@b.co', 'address' => 'Kilimani', 'weekdays' => [1, 3], 'start_date' => '2026-10-14', 'payment_method_id' => 4];
        $this->fails(fn () => $this->subs()->subscribe($p, ['name' => ' '] + $ok), 'Enter your name');
        $this->fails(fn () => $this->subs()->subscribe($p, ['phone' => ''] + $ok), 'phone number');
        $this->fails(fn () => $this->subs()->subscribe($p, ['email' => 'nope'] + $ok), 'email address');
        $this->fails(fn () => $this->subs()->subscribe($p, ['address' => ''] + $ok), 'address to deliver');
        $this->fails(fn () => $this->subs()->subscribe($p, ['weekdays' => [1, 6]] + $ok), 'days this plan delivers');
        $this->fails(fn () => $this->subs()->subscribe($p, ['weekdays' => [1]] + $ok), 'at least 2 delivery days');
        $this->fails(fn () => $this->subs()->subscribe($p, ['start_date' => ''] + $ok), 'day you want to start');
        $this->fails(fn () => $this->subs()->subscribe($p, ['start_date' => '2026-12-12'] + $ok), 'next 60 days');
        $this->fails(fn () => $this->subs()->subscribe($p, ['payment_method_id' => 1] + $ok), 'M-Pesa or a card');
        $this->fails(fn () => $this->subs()->subscribe($p, ['payment_method_id' => 3] + $ok), 'M-Pesa or a card');
        $this->fails(fn () => $this->subs()->subscribe($p, ['payment_method_id' => null] + $ok), 'M-Pesa or a card');
        $this->assertSame(0, Subscription::count());
        $this->assertSame(0, SubPeriod::count());
        $this->subs()->subscribe($p, ['email' => ''] + $ok);
        $this->subs()->subscribe($p, ['start_date' => '2026-12-11', 'weekdays' => [1, 5]] + $ok);   // exactly 60 days ahead
        $this->assertSame(2, Subscription::count());
    }

    public function test_subscribing_is_refused_when_switched_off_or_the_plan_is_off(): void
    {
        $p = $this->plan();
        MenusSettings::save(['plans_enabled' => false], null);
        $this->fails(fn () => $this->join($p), 'not taking meal plan subscriptions');
        MenusSettings::save(['plans_enabled' => true], null);
        $this->plans()->save(['is_active' => false], $p);
        $this->fails(fn () => $this->join($p->fresh()), 'not taking new subscribers');
    }

    public function test_a_start_with_nothing_to_deliver_is_refused_and_leaves_nothing_behind(): void
    {
        $p = $this->plan();
        // start after Friday of this week, but only Mon/Wed/Fri chosen and the week of the 19th is not the first week: the first week has no day
        $this->plans()->saveMenu($p, []);
        $this->fails(fn () => $this->join($p), 'no delivery day with a menu');
        $this->assertSame(0, Subscription::count());
        $this->assertSame(0, Voucher::count());
    }

    public function test_a_day_already_inside_its_cutoff_is_not_part_of_the_first_bill(): void
    {
        $p = $this->plan();
        // Tue 13 12:00 is the cut-off for Wed 14 12:00; at 12:00 on Tue 13 it has passed
        $this->subs()->subscribe($p, ['name' => 'A', 'phone' => '1', 'address' => 'x', 'weekdays' => [3, 5], 'start_date' => '2026-10-14', 'payment_method_id' => 4], null, Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi'));
        $this->assertSame(['2026-10-16'], SubDelivery::pluck('delivery_date')->map(fn ($d) => $d->toDateString())->all());
        $this->assertSame(600.0, (float) SubPeriod::first()->subtotal);
    }

    // ── paying ────────────────────────────────────────────────────────────

    public function test_a_paid_week_activates_the_plan_and_is_safe_to_confirm_twice(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $this->assertSame('active', $s->fresh()->status);
        $period = SubPeriod::first();
        $this->assertSame('paid', $period->status);
        $this->assertNotNull($period->sale_id);
        $this->assertSame(1, $this->noted('paid'));
        $this->pay($s, $period);   // the gateway calling twice
        $this->assertSame(1, $this->noted('paid'));
        $this->assertSame(0, $s->fresh()->lapsed);
        $this->assertSame(0, MenuOrder::count());   // Wednesday is more than a day away
    }

    public function test_paying_something_that_is_not_a_plan_week_does_nothing(): void
    {
        $other = Voucher::create(['voucher_type_id' => 1, 'total_amount' => 10]);
        $this->subs()->paid($other, Voucher::create(['voucher_type_id' => 2, 'total_amount' => 10]));
        $this->assertSame(0, $this->noted('paid'));
    }

    public function test_the_week_is_paid_from_the_plan_page(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $period = SubPeriod::first();
        $this->started = [];
        $r = $this->subs()->pay($s, $period, ['payment_method_id' => 4]);
        $this->assertSame(1392.0, $this->started[0]['due']);
        $this->assertStringContainsString('1,392.00', $r['message']);
        $this->fails(fn () => $this->subs()->pay($s, $period, ['payment_method_id' => 1]), 'M-Pesa or a card');
        $other = $this->join($p, ['phone' => '0799']);
        $this->fails(fn () => $this->subs()->pay($other, $period, ['payment_method_id' => 4]), 'nothing to pay');
        $this->pay($s);
        $this->fails(fn () => $this->subs()->pay($s, $period->fresh(), ['payment_method_id' => 4]), 'nothing to pay');
    }

    // ── the kitchen orders ────────────────────────────────────────────────

    public function test_a_paid_day_becomes_a_kitchen_order_once_its_cutoff_passes_and_takes_its_stock(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $this->assertSame(0, $this->subs()->makeDueOrders());   // Tue 13 12:00 not reached
        $this->assertSame(0, $this->subs()->makeDueOrders(Carbon::parse('2026-10-13 11:59', 'Africa/Nairobi')));
        $this->assertSame(1, $this->subs()->makeDueOrders(Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi')));
        $this->assertSame(0, $this->subs()->makeDueOrders(Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi')));   // once each
        $d = SubDelivery::orderBy('delivery_date')->first();
        $this->assertSame('ordered', $d->status);
        $o = MenuOrder::find($d->order_id);
        $this->assertSame('delivery', $o->order_type);
        $this->assertSame('paid', $o->payment);
        $this->assertSame(600.0, (float) $o->subtotal);
        $this->assertSame(96.0, (float) $o->tax_total);   // 16% of the share of the week's tax
        $this->assertSame('2026-10-14 12:00', $o->fulfil_at->setTimezone('Africa/Nairobi')->format('Y-m-d H:i'));
        $this->assertSame('Kilimani, Nairobi', $o->delivery_address);
        $this->assertSame(2, $o->lines()->count());
        $this->assertCount(1, $this->converted);
        $this->assertCount(2, $this->converted[0][1]);
        $this->assertSame('taken', $d->stock_note);
        $this->assertSame(1, $this->noted('orderMade'));
        $this->assertSame('scheduled', SubDelivery::orderByDesc('delivery_date')->first()->status);
    }

    public function test_a_stock_shortage_is_noted_and_never_stops_the_meal(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $this->stockFails = true;
        $this->assertSame(1, $this->subs()->makeDueOrders(Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi')));
        $d = SubDelivery::orderBy('delivery_date')->first();
        $this->assertSame('ordered', $d->status);
        $this->assertStringContainsString('Stock was not taken: Not enough rice', $d->stock_note);
        $this->assertCount(1, $this->subs()->dayPlan(Carbon::parse('2026-10-14'))['stops']);
        $this->assertNotNull($this->subs()->dayPlan(Carbon::parse('2026-10-14'))['stops'][0]['stock_note']);
    }

    public function test_unpaid_or_cancelled_days_are_not_made(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->assertSame(0, $this->subs()->makeDueOrders(Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi')));   // not paid
        $this->pay($s);
        $this->subs()->cancel($s);
        $this->assertSame(0, $this->subs()->makeDueOrders(Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi')));
        $this->assertSame(0, MenuOrder::count());
    }

    public function test_a_delivery_way_must_exist(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        Channel::where('order_type', 'delivery')->delete();
        $this->assertSame(0, $this->subs()->makeDueOrders(Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi')));   // reported, not thrown
        $this->assertSame('scheduled', SubDelivery::orderBy('delivery_date')->first()->status);
        $this->fails(fn () => $this->subs()->makeOrder($s, $p, SubDelivery::orderBy('delivery_date')->first()), 'delivery way to order');
    }

    // ── skipping ──────────────────────────────────────────────────────────

    public function test_skipping_a_paid_day_is_owed_and_the_next_billed_day_is_free(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $wed = SubDelivery::orderBy('delivery_date')->first();
        $this->subs()->skip($s, $wed);
        $this->assertSame('skipped', $wed->fresh()->status);
        $this->assertSame(1, $s->fresh()->credit_days);
        $this->fails(fn () => $this->subs()->skip($s->fresh(), $wed->fresh()), 'can not be skipped');
        // next week: Mon 19, Wed 21, Fri 23: the first one is free
        $period = $this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-19'));
        $this->assertSame(0, $s->fresh()->credit_days);
        $this->assertSame(1200.0, (float) $period->subtotal);   // 2 paid days, 1 free
        $days = SubDelivery::where('period_id', $period->id)->orderBy('delivery_date')->get();
        $this->assertSame([true, false, false], $days->pluck('free')->all());
        $this->assertSame([0.0, 0.0], array_map(fn ($l) => (float) $l['price'], $days[0]->meals));
        $this->assertSame(1, $this->noted('weekReady'));
        $this->assertStringContainsString('owed from a skipped day', $this->vouchers[count($this->vouchers) - 1]['lines'][0]['notes']);
    }

    public function test_a_day_can_be_put_back_before_its_cutoff_while_the_credit_is_unspent(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $wed = SubDelivery::orderBy('delivery_date')->first();
        $this->subs()->skip($s, $wed);
        $this->subs()->unskip($s->fresh(), $wed->fresh());
        $this->assertSame('scheduled', $wed->fresh()->status);
        $this->assertSame(0, $s->fresh()->credit_days);
        $this->assertNull($wed->fresh()->skipped_at);
        $this->fails(fn () => $this->subs()->unskip($s->fresh(), $wed->fresh()), 'not skipped');
        // credit spent elsewhere: can not be put back
        $this->subs()->skip($s->fresh(), $wed->fresh());
        $this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-19'));
        $this->fails(fn () => $this->subs()->unskip($s->fresh(), $wed->fresh()), 'already used');
    }

    public function test_it_is_too_late_to_skip_or_put_back_inside_the_cutoff(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $wed = SubDelivery::orderBy('delivery_date')->first();
        $late = Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi');
        $this->fails(fn () => $this->subs()->skip($s, $wed, $late), 'too late');
        $this->subs()->skip($s, $wed, Carbon::parse('2026-10-13 11:59', 'Africa/Nairobi'));
        $this->fails(fn () => $this->subs()->unskip($s->fresh(), $wed->fresh(), $late), 'too late to put that day back');
        $other = $this->join($this->plan(['name' => 'Other']), ['phone' => '07']);
        $this->fails(fn () => $this->subs()->skip($other, $wed->fresh()), 'can not be skipped');
    }

    public function test_skipping_a_day_in_an_unpaid_week_re_bills_the_week(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $first = SubPeriod::first();
        $wed = SubDelivery::orderBy('delivery_date')->first();
        $this->subs()->skip($s, $wed);
        $this->assertSame(0, $s->fresh()->credit_days);   // nothing was paid: nothing is owed
        $this->assertSame([$first->voucher_id], $this->voided);
        $period = SubPeriod::where('subscription_id', $s->id)->first();
        $this->assertSame('due', $period->status);
        $this->assertSame(600.0, (float) $period->subtotal);
        $this->assertNotSame($first->voucher_id, $period->voucher_id);
        $this->assertSame(['skipped', 'scheduled'], SubDelivery::orderBy('delivery_date')->pluck('status')->all());
        $this->subs()->unskip($s->fresh(), SubDelivery::orderBy('delivery_date')->first());
        $this->assertSame(1200.0, (float) SubPeriod::first()->subtotal);
        $this->assertSame(['scheduled', 'scheduled'], SubDelivery::orderBy('delivery_date')->pluck('status')->all());
    }

    public function test_skipping_every_day_of_an_unpaid_week_leaves_a_free_paid_week(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        foreach (['2026-10-14', '2026-10-16'] as $date) {
            $this->subs()->skip($s->fresh(), SubDelivery::where('delivery_date', $date)->firstOrFail());
        }
        $period = SubPeriod::first();
        $this->assertSame('paid', $period->status);
        $this->assertSame(0.0, (float) $period->total);
        $this->assertSame(['skipped', 'skipped'], SubDelivery::pluck('status')->all());
    }

    // ── pausing, resuming, cancelling, changing ───────────────────────────

    public function test_pausing_skips_the_days_inside_it_and_resuming_carries_on(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $paused = $this->subs()->pause($s->fresh(), '2026-10-14', '2026-10-20');
        $this->assertSame('paused', $paused->status);
        $this->assertSame('2026-10-14', $paused->paused_from->toDateString());
        $this->assertSame(['skipped', 'skipped'], SubDelivery::orderBy('delivery_date')->pluck('status')->all());
        $this->assertSame(2, $paused->credit_days);   // both days were paid for: both owed
        $this->assertTrue($paused->pausedOn(Carbon::parse('2026-10-18')));
        $this->assertFalse($paused->pausedOn(Carbon::parse('2026-10-21')));
        $r = $this->subs()->resume($paused);
        $this->assertSame('active', $r->status);
        $this->assertNull($r->paused_from);
        $this->fails(fn () => $this->subs()->resume($r), 'not paused');
    }

    public function test_pausing_starts_at_the_earliest_the_kitchen_allows_and_checks_the_dates(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->fails(fn () => $this->subs()->pause($s, '2026-10-20', '2026-10-19'), 'Only a running plan');   // pending
        $this->pay($s);
        $this->fails(fn () => $this->subs()->pause($s->fresh(), '2026-10-20', '2026-10-19'), 'can not resume before it pauses');
        $x = $this->subs()->pause($s->fresh());
        $this->assertSame('2026-10-13', $x->paused_from->toDateString());   // tomorrow: the cut-off is a day
        $this->assertNull($x->paused_until);
        $this->assertTrue($x->pausedOn(Carbon::parse('2027-01-01')));
        $y = $this->subs()->pause($x, '2026-10-01', '2026-10-30');
        $this->assertSame('2026-10-13', $y->paused_from->toDateString());   // can not reach back into days the kitchen already has
    }

    public function test_a_pause_that_has_ended_is_lifted_by_the_daily_run(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $this->subs()->pause($s->fresh(), '2026-10-14', '2026-10-15');
        $this->subs()->run(Carbon::parse('2026-10-15 20:00', 'Africa/Nairobi'));
        $this->assertSame('paused', $s->fresh()->status);   // the last day of the pause is not over
        $this->subs()->run(Carbon::parse('2026-10-16 01:00', 'Africa/Nairobi'));
        $this->assertSame('active', $s->fresh()->status);
    }

    public function test_cancelling_voids_unpaid_weeks_and_cancels_paid_days_not_delivered(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $first = SubPeriod::first();
        $this->pay($s);
        $next = $this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-19'));
        $c = $this->subs()->cancel($s->fresh(), ' moving ');
        $this->assertSame('cancelled', $c->status);
        $this->assertSame('moving', $c->cancel_reason);
        $this->assertNotNull($c->cancelled_at);
        $this->assertSame([$next->voucher_id], $this->voided);
        $this->assertSame('void', $next->fresh()->status);
        $this->assertSame('paid', $first->fresh()->status);
        $this->assertSame(['cancelled', 'cancelled'], SubDelivery::where('period_id', $first->id)->pluck('status')->all());
        $this->assertSame(1, $this->noted('cancelled'));
        $this->fails(fn () => $this->subs()->cancel($c), 'cancelled already');
        // what to give back: both paid days, tax included
        $row = $this->subs()->staffRow($c);
        $this->assertSame(1392.0, $row['refund_due']);
    }

    public function test_changing_address_phone_and_days(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $u = $this->subs()->update($s, ['address' => '  New place ', 'phone' => '0700', 'weekdays' => [2, 4]]);
        $this->assertSame('New place', $u->address);
        $this->assertSame('0700', $u->phone);
        $this->assertSame('2,4', $u->weekdays);
        $this->fails(fn () => $this->subs()->update($s, ['address' => ' ']), 'address');
        $this->fails(fn () => $this->subs()->update($s, ['phone' => '']), 'phone');
        $this->fails(fn () => $this->subs()->update($s, ['weekdays' => [2]]), 'at least 2');
        $this->fails(fn () => $this->subs()->update($s, ['weekdays' => [2, 6]]), 'at least 2');
        $this->subs()->cancel($s);
        $this->fails(fn () => $this->subs()->update($s->fresh(), ['phone' => '1']), 'cancelled');
    }

    // ── the hourly and daily job ──────────────────────────────────────────

    public function test_the_run_bills_the_next_week_ahead_but_only_when_it_is_near(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        // Mon 12 Oct: next Monday is 7 days away, billing is 3 days ahead
        $r = $this->subs()->run();
        $this->assertSame(0, $r['billed']);
        $r = $this->subs()->run(Carbon::parse('2026-10-16 06:00', 'Africa/Nairobi'));   // Friday: the Monday is 3 days away
        $this->assertSame(1, $r['billed']);
        $next = SubPeriod::where('week_start', '2026-10-19')->first();
        $this->assertSame('due', $next->status);
        $this->assertSame(1, $this->noted('weekReady'));
        $this->assertSame(3, SubDelivery::where('period_id', $next->id)->count());
        $this->assertSame(0, $this->subs()->run(Carbon::parse('2026-10-16 07:00', 'Africa/Nairobi'))['billed']);   // not twice
        MenusSettings::save(['plans_bill_ahead_days' => 14], null);
        $this->assertSame(1, $this->subs()->run(Carbon::parse('2026-10-16 08:00', 'Africa/Nairobi'))['billed'] + 1 - 1);   // the week after that
    }

    public function test_the_run_does_not_bill_cancelled_or_pending_plans(): void
    {
        $p = $this->plan();
        MenusSettings::save(['plans_bill_ahead_days' => 14], null);
        $s = $this->join($p);   // pending: the first week is not paid yet
        $this->assertSame(0, $this->subs()->run(Carbon::parse('2026-10-12 12:10', 'Africa/Nairobi'))['billed']);
        $this->pay($s);
        $this->assertGreaterThan(0, $this->subs()->run(Carbon::parse('2026-10-12 12:11', 'Africa/Nairobi'))['billed']);   // active: the same run bills ahead
        $this->subs()->cancel($s->fresh());
        SubPeriod::where('week_start', '>', '2026-10-12')->delete();
        $this->assertSame(0, $this->subs()->run(Carbon::parse('2026-10-12 12:12', 'Africa/Nairobi'))['billed']);
    }

    public function test_an_unpaid_first_week_cancels_the_plan(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $first = SubPeriod::first();
        $this->assertSame(0, $this->subs()->run(Carbon::parse('2026-10-12 12:29', 'Africa/Nairobi'))['lapsed']);
        $r = $this->subs()->run(Carbon::parse('2026-10-12 12:31', 'Africa/Nairobi'));
        $this->assertSame(1, $r['lapsed']);
        $this->assertSame('lapsed', $first->fresh()->status);
        $this->assertSame([$first->voucher_id], $this->voided);
        $this->assertSame('cancelled', $s->fresh()->status);
        $this->assertSame('The first week was not paid.', $s->fresh()->cancel_reason);
        $this->assertSame(['missed', 'missed'], SubDelivery::pluck('status')->all());
        $this->assertSame(0, $this->noted('lapsed'));
    }

    public function test_a_week_not_paid_in_time_lapses_and_two_in_a_row_pause_the_plan(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $one = $this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-19'), Carbon::parse('2026-10-16 06:00', 'Africa/Nairobi'));
        $two = $this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-26'), Carbon::parse('2026-10-23 06:00', 'Africa/Nairobi'));
        // the week is payable until the day before its first delivery, a day ahead of the cut-off
        $this->assertSame('2026-10-18 12:00', $one->pay_by->setTimezone('Africa/Nairobi')->format('Y-m-d H:i'));   // Mon 19 12:00 minus 24h
        $r = $this->subs()->run(Carbon::parse('2026-10-18 13:00', 'Africa/Nairobi'));
        $this->assertSame(1, $r['lapsed']);
        $this->assertSame('lapsed', $one->fresh()->status);
        $this->assertSame(1, $s->fresh()->lapsed);
        $this->assertSame('active', $s->fresh()->status);
        $this->assertSame(['missed', 'missed', 'missed'], SubDelivery::where('period_id', $one->id)->pluck('status')->all());
        $this->assertSame(1, $this->noted('lapsed'));
        $r = $this->subs()->run(Carbon::parse('2026-10-25 13:00', 'Africa/Nairobi'));
        $this->assertSame('paused', $s->fresh()->status);
        $this->assertSame(2, $s->fresh()->lapsed);
        $this->assertSame('2026-10-25', $s->fresh()->paused_from->toDateString());
        $this->assertSame(2, $this->noted('staff'));   // the new subscriber and the pause
        $this->assertSame([$one->voucher_id, $two->voucher_id], $this->voided);
    }

    public function test_paying_resets_the_count_of_missed_weeks(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $s->update(['lapsed' => 1]);
        $one = $this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-19'), Carbon::parse('2026-10-16 06:00', 'Africa/Nairobi'));
        $this->pay($s, $one);
        $this->assertSame(0, $s->fresh()->lapsed);
    }

    public function test_a_lapsed_week_gives_back_the_owed_days_it_was_to_use(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $this->subs()->skip($s->fresh(), SubDelivery::orderBy('delivery_date')->first());
        $next = $this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-19'), Carbon::parse('2026-10-16 06:00', 'Africa/Nairobi'));
        $this->assertSame(0, $s->fresh()->credit_days);
        $this->subs()->run(Carbon::parse('2026-10-18 13:00', 'Africa/Nairobi'));
        $this->assertSame(1, $s->fresh()->credit_days);
        $this->assertSame('lapsed', $next->fresh()->status);
    }

    public function test_a_reminder_goes_out_once_a_day_before_the_deadline(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $one = $this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-19'), Carbon::parse('2026-10-16 06:00', 'Africa/Nairobi'));   // pay by Sun 18 12:00
        $this->subs()->run(Carbon::parse('2026-10-17 11:59', 'Africa/Nairobi'));
        $this->assertSame(0, $this->noted('reminder'));
        $this->subs()->run(Carbon::parse('2026-10-17 12:00', 'Africa/Nairobi'));
        $this->assertSame(1, $this->noted('reminder'));
        $this->subs()->run(Carbon::parse('2026-10-17 13:00', 'Africa/Nairobi'));
        $this->assertSame(1, $this->noted('reminder'));
        $this->assertNotNull($one->fresh()->reminded_at);
    }

    public function test_the_run_does_nothing_before_the_scripts_are_run(): void
    {
        Schema::drop('menus_sub_deliveries');
        $this->assertFalse(SubscriptionService::installed());
        $this->assertSame(['billed' => 0, 'lapsed' => 0, 'orders' => 0], $this->subs()->run());
        $this->assertSame(0, $this->subs()->makeDueOrders());
        $this->assertSame([], $this->plans()->rows());
    }

    // ── what the screens show ─────────────────────────────────────────────

    public function test_the_customer_sees_what_to_pay_and_what_can_still_be_skipped(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $v = $this->subs()->customerView($s);
        $this->assertSame('pending', $v['status']);
        $this->assertSame('Office lunch', $v['plan']['name']);
        $this->assertSame([1, 3, 5], $v['weekdays']);
        $this->assertCount(1, $v['to_pay']);
        $this->assertSame(1392.0, $v['to_pay'][0]['total']);
        $this->assertCount(2, $v['deliveries']);
        $this->assertTrue($v['deliveries'][0]['can_skip']);
        $this->assertFalse($v['deliveries'][0]['can_unskip']);
        $this->assertSame(['Rice and beans', 'Greens'], $v['deliveries'][0]['dishes']);
        $this->assertSame('2026-10-13T12:00:00+03:00', $v['deliveries'][0]['skip_until']);
        $this->assertArrayNotHasKey('manage_token', $v);
        Carbon::setTestNow(Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi'));
        $this->assertFalse($this->subs()->customerView($s)['deliveries'][0]['can_skip']);
    }

    public function test_the_staff_row_shows_the_next_delivery_and_what_is_unpaid(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $row = $this->subs()->staffRow($s);
        $this->assertSame('2026-10-14', $row['next_delivery']);
        $this->assertSame(1392.0, $row['unpaid']);
        $this->assertSame(0.0, $row['refund_due']);
        $this->assertSame($p->id, $row['plan_id']);
        $this->pay($s);
        $this->assertSame(0.0, $this->subs()->staffRow($s->fresh())['unpaid']);
    }

    public function test_the_day_plan_counts_dishes_and_lists_the_stops_and_can_be_limited(): void
    {
        $p = $this->plan();
        $a = $this->join($p);
        $b = $this->join($p, ['name' => 'Brian', 'phone' => '0799', 'address' => 'Westlands']);
        $this->pay($a);
        $this->pay($b);
        $day = $this->subs()->dayPlan(Carbon::parse('2026-10-14'));
        $this->assertSame([['name' => 'Greens', 'count' => 2], ['name' => 'Rice and beans', 'count' => 2]], $day['dishes']);
        $this->assertCount(2, $day['stops']);
        $this->assertSame('12:00–14:00', $day['stops'][0]['window']);
        $this->assertSame(['Westlands', 'Kilimani, Nairobi'], array_reverse(array_column($day['stops'], 'address')));
        $this->assertCount(0, $this->subs()->dayPlan(Carbon::parse('2026-10-14'), fn (Plan $p) => false)['stops']);
        $this->assertCount(0, $this->subs()->dayPlan(Carbon::parse('2026-10-15'))['stops']);   // not a delivery day
        $this->subs()->skip($a->fresh(), SubDelivery::where('subscription_id', $a->id)->orderBy('delivery_date')->first());
        $this->assertCount(1, $this->subs()->dayPlan(Carbon::parse('2026-10-14'))['stops']);
    }

    public function test_unpaid_days_are_not_in_the_day_plan(): void
    {
        $p = $this->plan();
        $this->join($p);
        $this->assertCount(0, $this->subs()->dayPlan(Carbon::parse('2026-10-14'))['stops']);
    }

    public function test_a_week_of_owed_days_costs_nothing_and_is_confirmed_without_a_payment(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $s->fresh()->update(['credit_days' => 5]);
        $period = $this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-19'), Carbon::parse('2026-10-16 06:00', 'Africa/Nairobi'));
        $this->assertSame(0.0, (float) $period->total);
        $this->assertSame(2, $s->fresh()->credit_days);
        $this->assertSame(0, $this->noted('weekReady'));   // nothing to pay: no "pay for it" notice
        $this->started = [];
        $r = $this->subs()->pay($s->fresh(), $period, ['payment_method_id' => 4]);
        $this->assertSame([], $this->started);
        $this->assertStringContainsString('free', $r['message']);
        $this->assertSame('paid', $period->fresh()->status);
        $this->subs()->run(Carbon::parse('2026-10-17 12:00', 'Africa/Nairobi'));
        $this->assertSame(0, $this->noted('reminder'));
    }

    public function test_a_free_first_week_activates_a_pending_plan(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $period = SubPeriod::first();
        $period->update(['total' => 0]);
        $this->subs()->pay($s, $period, ['payment_method_id' => 4]);
        $this->assertSame('active', $s->fresh()->status);
    }

    public function test_a_week_is_billed_once_and_not_for_a_paused_week_or_a_switched_off_dish(): void
    {
        $p = $this->plan();
        $s = $this->join($p, ['weekdays' => [1, 3, 5], 'start_date' => '2026-10-14']);
        $this->pay($s);
        $this->assertNull($this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-12')));   // already billed
        $this->subs()->pause($s->fresh(), '2026-10-19', '2026-10-25');
        $this->assertNull($this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-19'), Carbon::parse('2026-10-16 06:00', 'Africa/Nairobi')));
        $this->subs()->resume($s->fresh());
        $greens = \App\Models\Menus\Dish::where('name', 'Greens')->first();
        $this->dishes()->save(['is_active' => false], $greens->id);
        $period = $this->subs()->billWeek($s->fresh(), $p, Carbon::parse('2026-10-19'), Carbon::parse('2026-10-16 06:00', 'Africa/Nairobi'));
        $this->assertSame(['Rice and beans'], SubDelivery::where('period_id', $period->id)->first()->meals ? array_column(SubDelivery::where('period_id', $period->id)->first()->meals, 'name') : []);
    }

    public function test_the_run_bills_no_more_than_three_weeks_ahead(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        MenusSettings::save(['plans_bill_ahead_days' => 14], null);
        $this->subs()->run(Carbon::parse('2026-10-12 12:05', 'Africa/Nairobi'));
        $this->assertSame(3, SubPeriod::where('subscription_id', $s->id)->count());   // this week and the next two
    }

    public function test_the_email_is_kept_only_when_given_and_a_one_day_pause_is_allowed(): void
    {
        $p = $this->plan();
        $a = $this->join($p);
        $this->assertSame('amina@example.com', $a->email);
        $b = $this->join($p, ['email' => '', 'phone' => '07']);
        $this->assertNull($b->email);
        $this->pay($a);
        $x = $this->subs()->pause($a->fresh(), '2026-10-13', '2026-10-13');
        $this->assertSame('2026-10-13', $x->paused_until->toDateString());
    }

    public function test_the_day_plan_shows_whether_the_meal_is_in_the_kitchen(): void
    {
        $p = $this->plan();
        $s = $this->join($p);
        $this->pay($s);
        $this->assertSame('scheduled', $this->subs()->dayPlan(Carbon::parse('2026-10-14'))['stops'][0]['status']);
        $this->subs()->makeDueOrders(Carbon::parse('2026-10-13 12:00', 'Africa/Nairobi'));
        $stop = $this->subs()->dayPlan(Carbon::parse('2026-10-14'))['stops'][0];
        $this->assertSame('ordered', $stop['status']);
        $this->assertNotNull($stop['order_id']);
    }

    // ── the menu rotates ──────────────────────────────────────────────────

    public function test_the_week_of_the_rotation_counts_from_the_week_the_subscriber_starts(): void
    {
        $p = $this->plan(['cycle_weeks' => 3]);
        $s = $this->join($p);
        $w = fn (string $monday) => $this->subs()->weekNo($s->fresh(), $p->fresh(), Carbon::parse($monday));
        $this->assertSame(1, $w('2026-10-12'));
        $this->assertSame(2, $w('2026-10-19'));
        $this->assertSame(3, $w('2026-10-26'));
        $this->assertSame(1, $w('2026-11-02'));
        $this->assertSame(3, $w('2026-10-05'));   // before the start: counted backwards, never out of range
    }

    public function test_a_day_without_a_menu_or_with_a_switched_off_dish_is_not_delivered(): void
    {
        $p = $this->plan();
        $rice = \App\Models\Menus\Dish::where('name', 'Rice and beans')->first();
        $greens = \App\Models\Menus\Dish::where('name', 'Greens')->first();
        $this->plans()->saveMenu($p, [['week_no' => 1, 'weekday' => 3, 'dish_ids' => [$rice->id]], ['week_no' => 1, 'weekday' => 5, 'dish_ids' => []]]);
        $s = $this->join($p);
        $this->assertSame(['2026-10-14'], SubDelivery::pluck('delivery_date')->map(fn ($d) => $d->toDateString())->all());
        $this->assertSame(600.0, (float) SubPeriod::first()->subtotal);   // the one dish carries the whole day price
        $this->assertSame(1, count($this->vouchers[0]['lines']));
        $this->assertSame(600.0, (float) $this->vouchers[0]['lines'][0]['rate']);
        $this->assertNotNull($greens);
    }
    // ── memberships (Memberships step 4) ─────────────────────────────────

    /** The Memberships tables, the two meal plan columns, and a person who may or may not hold a membership. */
    private function withMemberships(bool $on = true): void
    {
        if (! Schema::hasTable('users')) {
            Schema::create('users', function ($t) { $t->id(); $t->string('name'); $t->string('email')->nullable(); $t->softDeletes(); $t->timestamps(); });
            Schema::create('customers', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('phone')->nullable(); $t->softDeletes(); $t->timestamps(); });
        }
        Schema::create('membership_plans', function ($t) { $t->id(); $t->string('name'); $t->string('slug')->nullable(); $t->string('status')->default('published'); $t->timestamps(); });
        Schema::create('membership_plan_benefits', function ($t) { $t->id(); $t->unsignedBigInteger('plan_id'); $t->string('type'); $t->json('config')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('memberships', function ($t) { $t->id(); $t->string('number')->nullable(); $t->unsignedBigInteger('plan_id'); $t->unsignedBigInteger('member_user_id'); $t->string('status'); $t->timestamps(); });
        Schema::table('menus_plans', function ($t) { $t->boolean('requires_membership')->default(false); $t->json('membership_plan_ids')->nullable(); });
        DB::table('membership_plans')->insert([['id' => 1, 'name' => 'Gold'], ['id' => 2, 'name' => 'Silver']]);
        $this->mock(\App\Services\Licensing\LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturnUsing(fn ($k) => $k !== 'memberships' || $on));
    }

    private function member(string $status = 'active', int $plan = 1, ?float $discount = null): \App\Models\User
    {
        $u = \App\Models\User::forceCreate(['name' => 'Member '.uniqid(), 'email' => uniqid().'@example.com']);
        DB::table('customers')->insert(['user_id' => $u->id, 'phone' => '0711000000']);
        DB::table('memberships')->insert(['number' => 'MB-'.$u->id, 'plan_id' => $plan, 'member_user_id' => $u->id, 'status' => $status]);
        if ($discount !== null) {
            DB::table('membership_plan_benefits')->insert(['plan_id' => $plan, 'type' => 'meals', 'config' => json_encode(['discount_pct' => $discount])]);
        }

        return $u;
    }

    private function joinAs(Plan $p, ?\App\Models\User $u): Subscription
    {
        return $this->subs()->subscribe($p, ['name' => 'Amina Yusuf', 'phone' => '0712345678', 'address' => 'Kilimani', 'weekdays' => [1, 3, 5], 'start_date' => '2026-10-14', 'payment_method_id' => $this->method()], $u)['subscription'];
    }

    public function test_a_meal_plan_can_ask_for_a_membership_and_name_which_plans_count(): void
    {
        $this->withMemberships();
        $p = $this->plan(['requires_membership' => true, 'membership_plan_ids' => [2, 2]]);
        $this->assertTrue($p->requires_membership);
        $this->assertSame([2], $p->membership_plan_ids);
        $row = collect($this->plans()->rows())->firstWhere('id', $p->id);
        $this->assertTrue($row['requires_membership']);
        $this->assertSame([2], $row['membership_plan_ids']);
        $this->fails(fn () => $this->plans()->save(['membership_plan_ids' => [9]], $p), 'membership plans that exist');
        $p = $this->plans()->save(['requires_membership' => false, 'membership_plan_ids' => []], $p);
        $this->assertFalse($p->requires_membership);
        $this->assertNull($p->membership_plan_ids);
    }

    public function test_subscribing_to_a_members_plan_needs_a_running_membership_of_a_plan_that_counts(): void
    {
        $this->withMemberships();
        $p = $this->plan(['requires_membership' => true, 'membership_plan_ids' => [1]]);
        $this->fails(fn () => $this->joinAs($p, null), 'This meal plan is for members on Gold');
        $this->fails(fn () => $this->joinAs($p, $this->member('lapsed')), 'for members');
        $this->fails(fn () => $this->joinAs($p, $this->member('paused')), 'for members');
        $this->fails(fn () => $this->joinAs($p, $this->member('active', 2)), 'for members on Gold');
        $this->assertSame('pending', $this->joinAs($p, $this->member('past_due'))->status);   // late, but inside the grace days
        $this->assertSame('pending', $this->joinAs($p, $this->member('trial'))->status);
        $any = $this->plan(['requires_membership' => true]);
        $this->fails(fn () => $this->joinAs($any, null), 'This meal plan is for members. Join');
        $this->assertSame('pending', $this->joinAs($any, $this->member('active', 2))->status);
    }

    public function test_nothing_is_locked_while_memberships_is_off(): void
    {
        $this->withMemberships(false);
        $p = $this->plan(['requires_membership' => true]);
        $this->assertSame('pending', $this->joinAs($p, null)->status);
    }

    public function test_members_get_their_discount_on_every_week_billed(): void
    {
        $this->withMemberships();
        $p = $this->plan();
        $s = $this->joinAs($p, $this->member('active', 1, 25));
        $period = SubPeriod::where('subscription_id', $s->id)->firstOrFail();
        $rates = array_map(fn ($l) => $l['rate'], end($this->vouchers)['lines']);
        $this->assertSame([300.0, 150.0, 300.0, 150.0], array_slice($rates, 0, 4));   // 450 a day instead of 600, still shared 2:1
        $this->assertEquals(round(450 * 2 * 1.16, 2), (float) $period->total);   // Wed and Fri of the first week
        $full = $this->joinAs($p, $this->member('active', 2));   // a plan without the benefit pays in full
        $this->assertSame([400.0, 200.0], array_slice(array_map(fn ($l) => $l['rate'], end($this->vouchers)['lines']), 0, 2));
        $this->assertSame('pending', $full->status);
    }

    public function test_a_subscription_pauses_when_the_membership_it_needs_ends_and_resumes_only_with_one(): void
    {
        $this->withMemberships();
        $p = $this->plan(['requires_membership' => true]);
        $u = $this->member('active');
        $s = $this->joinAs($p, $u);
        $this->pay($s);
        $this->assertSame('active', $s->fresh()->status);
        DB::table('memberships')->where('member_user_id', $u->id)->update(['status' => 'lapsed']);
        $this->subs()->run();
        $s = $s->fresh();
        $this->assertSame('paused', $s->status);
        $this->assertNull($s->paused_until);
        $this->assertSame(1, $this->noted('membershipNeeded'));
        $this->fails(fn () => $this->subs()->resume($s), 'for members');
        DB::table('memberships')->where('member_user_id', $u->id)->update(['status' => 'active']);
        $this->assertSame('active', $this->subs()->resume($s)->status);
        $this->subs()->run();
        $this->assertSame(1, $this->noted('membershipNeeded'));
    }
}

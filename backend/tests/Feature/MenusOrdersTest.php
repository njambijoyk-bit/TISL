<?php

namespace Tests\Feature;

use App\Models\Books\PaymentAttempt;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Menus\Channel;
use App\Models\Menus\Dish;
use App\Models\Menus\Menu;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\OptionGroup;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use App\Services\Menus\ChannelService;
use App\Services\Menus\MenuOrderNotices;
use App\Services\Menus\MenuOrderService;
use App\Services\Menus\MenuOrderView;
use App\Services\Menus\MenuService;
use App\Services\Menus\DishOptions;
use App\Services\Menus\OrderSlots;
use App\Services\Notify\Notifier;
use App\Services\Notify\Staff;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Menus step 3: ordering food online. When the order can be had, what is asked of the books, who is told, how the kitchen moves an order along, and what happens to the money.
 * The books and the payment gateways are stood in for; what they are asked is checked.
 */
class MenusOrdersTest extends TestCase
{
    use Concerns\CreatesDishTables;

    private array $placed = [];
    private array $started = [];
    private array $cancelled = [];
    private array $settled = [];
    private array $told = [];
    private Carbon $now;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow($this->now = Carbon::parse('2026-10-12 12:00', 'Africa/Nairobi'));   // a Monday
        $this->createDishTables();
        Schema::create('menus_menus', function ($t) { $t->id(); $t->string('name'); $t->string('slug')->unique(); $t->string('description', 500)->nullable(); $t->json('days')->nullable(); $t->time('starts_at')->nullable(); $t->time('ends_at')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_sections', function ($t) { $t->id(); $t->unsignedBigInteger('menu_id'); $t->string('name'); $t->string('description', 300)->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_section_dishes', function ($t) { $t->id(); $t->unsignedBigInteger('section_id'); $t->unsignedBigInteger('dish_id'); $t->integer('sort_order')->default(0); $t->unique(['section_id', 'dish_id']); });
        Schema::create('menus_option_groups', function ($t) { $t->id(); $t->unsignedBigInteger('dish_id'); $t->string('name'); $t->string('kind', 8)->default('single'); $t->unsignedTinyInteger('min_choices')->default(0); $t->unsignedTinyInteger('max_choices')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_options', function ($t) { $t->id(); $t->unsignedBigInteger('group_id'); $t->string('name'); $t->decimal('price_delta', 12, 2)->default(0); $t->boolean('is_default')->default(false); $t->boolean('charge_removal')->default(false); $t->unsignedBigInteger('linked_dish_id')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_option_uses', function ($t) { $t->id(); $t->unsignedBigInteger('option_id'); $t->string('mode', 8)->default('add'); $t->unsignedBigInteger('ingredient_id')->nullable(); $t->string('unit', 4)->default('base'); $t->unsignedBigInteger('family_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->decimal('quantity', 18, 4)->nullable(); $t->unsignedBigInteger('unit_id')->nullable(); });
        Schema::create('menus_channels', function ($t) { $t->id(); $t->string('code', 30)->unique(); $t->string('name'); $t->string('order_type', 12); $t->boolean('is_active')->default(false); $t->unsignedSmallInteger('prep_minutes')->default(20); $t->unsignedSmallInteger('slot_minutes')->default(15); $t->unsignedTinyInteger('max_days_ahead')->default(2); $t->boolean('allow_asap')->default(true); $t->json('payment_modes')->nullable(); $t->json('menu_ids')->nullable(); $t->json('shipping_option_ids')->nullable(); $t->decimal('min_order', 12, 2)->default(0); $t->string('note', 300)->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_orders', function ($t) {
            $t->id(); $t->string('number', 20); $t->string('track_token', 40); $t->unsignedBigInteger('channel_id'); $t->string('order_type', 12); $t->unsignedBigInteger('location_id'); $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('sale_id')->nullable();
            $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('name'); $t->string('email')->nullable(); $t->string('phone', 40); $t->string('status', 12)->default('placed'); $t->string('payment', 10)->default('pending');
            $t->unsignedBigInteger('payment_method_id')->nullable(); $t->boolean('asap')->default(true); $t->dateTime('fulfil_at'); $t->text('delivery_address')->nullable(); $t->unsignedBigInteger('shipping_option_id')->nullable(); $t->decimal('delivery_fee', 12, 2)->default(0);
            $t->decimal('subtotal', 12, 2)->default(0); $t->decimal('tax_total', 12, 2)->default(0); $t->decimal('total', 12, 2)->default(0); $t->unsignedBigInteger('currency_id')->nullable(); $t->string('notes', 500)->nullable(); $t->string('cancel_reason', 300)->nullable();
            foreach (['placed_at', 'accepted_at', 'ready_at', 'completed_at', 'cancelled_at'] as $c) { $t->dateTime($c)->nullable(); } $t->timestamps();
        });
        Schema::create('menus_order_lines', function ($t) { $t->id(); $t->unsignedBigInteger('order_id'); $t->unsignedBigInteger('dish_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->string('name'); $t->decimal('quantity', 10, 2)->default(1); $t->decimal('base_price', 12, 2)->default(0); $t->decimal('unit_price', 12, 2)->default(0); $t->json('options')->nullable(); $t->string('note', 300)->nullable(); $t->timestamps(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_online')->default(false); $t->string('gateway')->nullable(); $t->boolean('requires_reference')->default(false); $t->text('instructions')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 12, 2)->default(0); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->string('name')->nullable(); $t->string('symbol')->nullable(); $t->boolean('is_base')->default(false); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::table('ledgers', fn ($t) => $t->string('side')->nullable());
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'name' => 'Kenyan shilling', 'symbol' => 'KSh', 'is_base' => true]);
        DB::table('payment_methods')->insert([['id' => 1, 'name' => 'M-Pesa', 'kind' => 'mpesa', 'is_online' => true, 'gateway' => 'mpesa_stk', 'is_active' => true], ['id' => 2, 'name' => 'Bank slip', 'kind' => 'bank', 'is_online' => true, 'gateway' => 'bank_manual', 'is_active' => true],
            ['id' => 3, 'name' => 'Cash', 'kind' => 'cash', 'is_online' => false, 'gateway' => null, 'is_active' => true]]);
        DB::table('voucher_types')->insert(['id' => 1, 'base_type' => 'sales_order']);
        $dg = DB::table('ledger_groups')->insertGetId(['name' => 'Shipping & Delivery', 'behaviour' => 'delivery']);
        DB::table('ledgers')->insert([['id' => 70, 'name' => 'Standard delivery', 'group_id' => $dg, 'side' => 'income', 'is_active' => true], ['id' => 71, 'name' => 'Express delivery', 'group_id' => $dg, 'side' => 'income', 'is_active' => true]]);

        $vouchers = $this->createMock(VoucherService::class);
        $vouchers->method('preview')->willReturnCallback(function (array $d) {
            $lines = array_map(fn ($l) => ['item_type' => $l['type'] === 'charge' ? 'charge' : 'dish', 'amount' => $l['type'] === 'charge' ? 150.0 : $l['quantity'] * $l['rate']], $d['lines']);
            $sub = array_sum(array_column($lines, 'amount'));

            return ['lines' => $lines, 'subtotal' => $sub, 'tax_total' => round($sub * 0.16, 2), 'total' => round($sub * 1.16, 2)];
        });
        $vouchers->method('placeOrder')->willReturnCallback(function (array $d) {
            $this->placed[] = $d;
            $sub = array_sum(array_map(fn ($l) => $l['type'] === 'charge' ? 150 : $l['quantity'] * $l['rate'], $d['lines']));

            return Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'SO-'.count($this->placed), 'currency_id' => $d['currency_id'], 'customer_id' => $d['customer_id'], 'total_amount' => round($sub * 1.16, 2), 'meta' => $d['meta']]);
        });
        $vouchers->method('cancel')->willReturnCallback(function (Voucher $v, ?string $reason) {
            $this->cancelled[] = [$v->id, $reason];
            $v->update(['status' => 'cancelled']);

            return $v;
        });
        $this->app->instance(VoucherService::class, $vouchers);
        $gateway = $this->createMock(GatewayPaymentService::class);
        $gateway->method('start')->willReturnCallback(function (Voucher $order, PaymentMethod $m, array $contact, array $tenders, float $due) {
            $this->started[] = compact('contact', 'due') + ['order' => $order->id, 'method' => $m->name];
            $a = new PaymentAttempt();
            $a->forceFill(['id' => 900 + count($this->started), 'status' => 'pending', 'amount' => $due, 'gateway' => $m->gateway]);

            return ['attempt' => $a, 'redirect_url' => $m->gateway === 'mpesa_stk' ? null : 'https://pay.example/x'];
        });
        $this->app->instance(GatewayPaymentService::class, $gateway);
        $checkout = $this->createMock(CheckoutService::class);
        $checkout->method('settle')->willReturnCallback(function (Voucher $order, array $tenders) {
            $this->settled[] = [$order->id, $tenders];

            return Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-'.count($this->settled), 'total_amount' => $order->total_amount]);
        });
        $this->app->instance(CheckoutService::class, $checkout);
        $notices = $this->createMock(MenuOrderNotices::class);
        foreach (['placed', 'paid', 'ready', 'out', 'cancelled'] as $m) {
            $notices->method($m)->willReturnCallback(function (MenuOrder $o) use ($m) { $this->told[] = [$m, $o->number]; });
        }
        $this->app->instance(MenuOrderNotices::class, $notices);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function orders(): MenuOrderService
    {
        return app(MenuOrderService::class);
    }

    /** A pickup channel that is on, a lunch menu (12:00–15:00) with a stocked dish; returns [channel, dish]. */
    private function shop(array $channel = [], float $price = 500, int $stock = 20): array
    {
        $dish = $this->make('Beef stew', $price);
        $this->stockDish($dish, $stock);
        app(MenuService::class)->save(['name' => 'Lunch', 'starts_at' => '12:00', 'ends_at' => '15:00', 'sections' => [['name' => 'Mains', 'dishes' => [$dish->id]]]]);
        $c = Channel::create($channel + ['code' => 'online_pickup', 'name' => 'Pickup', 'order_type' => 'pickup', 'is_active' => true, 'prep_minutes' => 20, 'slot_minutes' => 15, 'max_days_ahead' => 2, 'allow_asap' => true, 'payment_modes' => ['online', 'later']]);

        return [$c, $dish];
    }

    private function order(Dish $dish, array $o = []): array
    {
        return $o + ['channel' => 'online_pickup', 'items' => [['dish_id' => $dish->id, 'quantity' => 2]], 'fulfil' => 'asap', 'name' => 'Wanjiru', 'phone' => '0712345678', 'email' => 'w@example.com', 'payment_mode' => 'later'];
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

    // ------------------------------------------------------------ the channel's rules

    public function test_a_way_to_order_keeps_to_its_limits(): void
    {
        [$c] = $this->shop();
        $c = $c->fresh();
        $svc = app(ChannelService::class);
        $this->fails(fn () => $svc->save($c, ['prep_minutes' => 500]), 'between 0 and 240');
        $this->fails(fn () => $svc->save($c, ['slot_minutes' => 2]), '5 to 120');
        $this->fails(fn () => $svc->save($c, ['max_days_ahead' => 30]), '14');
        $this->fails(fn () => $svc->save($c, ['payment_modes' => []]), 'pay');
        $this->fails(fn () => $svc->save($c, ['menu_ids' => [999]]), 'menu');
        $svc->save($c, ['prep_minutes' => 30, 'slot_minutes' => 30, 'payment_modes' => ['later'], 'min_order' => 300]);
        $c->refresh();
        $this->assertSame([30, 30, ['later'], 300.0], [$c->prep_minutes, $c->slot_minutes, $c->payment_modes, (float) $c->min_order]);
    }

    public function test_delivery_can_not_be_switched_on_without_a_delivery_method(): void
    {
        $d = Channel::create(['code' => 'online_delivery', 'name' => 'Delivery', 'order_type' => 'delivery', 'is_active' => false])->fresh();
        DB::table('ledgers')->update(['is_active' => false]);
        $this->fails(fn () => app(ChannelService::class)->save($d, ['is_active' => true]), 'delivery');
        DB::table('ledgers')->update(['is_active' => true]);
        $this->assertTrue(app(ChannelService::class)->save($d, ['is_active' => true])->is_active);
    }

    // ------------------------------------------------------------ the times

    public function test_the_earliest_time_is_now_plus_preparation_up_to_the_next_step(): void
    {
        [$c] = $this->shop();
        $s = app(OrderSlots::class);
        $this->assertSame('12:30', $s->earliest($c, $this->now)->format('H:i'), '12:20 rounds up to 12:30');
        $this->assertSame('12:30', $s->earliest($c, $this->now->copy()->addMinutes(10))->format('H:i'), 'exactly on a step stays');
        $this->assertSame('12:45', $s->earliest($c, $this->now->copy()->addMinutes(11))->format('H:i'));
        $c->update(['prep_minutes' => 0]);
        $this->assertSame('12:00', $s->earliest($c->fresh(), $this->now)->format('H:i'));
    }

    public function test_times_are_offered_only_while_a_menu_is_served(): void
    {
        [$c] = $this->shop(['max_days_ahead' => 1]);
        $r = app(OrderSlots::class)->forChannel($c, $this->now);
        $this->assertSame('12:30', Carbon::parse($r['asap'])->format('H:i'));
        $today = array_values(array_filter($r['slots'], fn ($t) => Carbon::parse($t)->isSameDay($this->now)));
        $this->assertSame(['12:30', '14:45'], [Carbon::parse($today[0])->format('H:i'), Carbon::parse(end($today))->format('H:i')], 'the lunch menu stops at 15:00');
        $tomorrow = array_values(array_filter($r['slots'], fn ($t) => Carbon::parse($t)->isSameDay($this->now->copy()->addDay())));
        $this->assertSame('12:00', Carbon::parse($tomorrow[0])->format('H:i'));
        $late = app(OrderSlots::class)->forChannel($c, $this->now->copy()->setTime(14, 50));
        $this->assertNull($late['asap'], 'nothing is served by the time it would be ready');
    }

    public function test_only_a_listed_time_can_be_chosen(): void
    {
        [$c] = $this->shop();
        $s = app(OrderSlots::class);
        $at = fn (string $t, string $day = '2026-10-12') => Carbon::parse("{$day} {$t}", 'Africa/Nairobi');
        $this->assertTrue($s->allows($c, $this->now, $at('13:00')));
        $this->assertFalse($s->allows($c, $this->now, $at('12:15')), 'sooner than the kitchen can');
        $this->assertFalse($s->allows($c, $this->now, $at('13:10')), 'not on a step');
        $this->assertFalse($s->allows($c, $this->now, $at('15:00')), 'not served');
        $this->assertFalse($s->allows($c, $this->now, $at('13:00', '2026-10-15')), 'too far ahead');
        $this->assertTrue($s->allows($c, $this->now, $at('13:00', '2026-10-14')));
    }

    // ------------------------------------------------------------ what it comes to

    public function test_the_quote_adds_up_the_choices_and_asks_the_books_for_the_tax(): void
    {
        [, $dish] = $this->shop();
        $g = app(DishOptions::class);
        $g->save($dish, [['name' => 'Size', 'kind' => 'single', 'options' => [['name' => 'Large', 'price_delta' => 100]]]]);
        $opt = DB::table('menus_options')->where('name', 'Large')->value('id');
        $q = $this->orders()->quote($this->order($dish, ['items' => [['dish_id' => $dish->id, 'quantity' => 2, 'option_ids' => [$opt]]]]), null, $this->now);
        $this->assertSame([1200.0, 0.0, 192.0, 1392.0], [$q['subtotal'], $q['delivery_fee'], $q['tax_total'], $q['total']]);
        $this->assertSame([2, 600.0, 1200.0, ['Large']], [$q['lines'][0]['quantity'], $q['lines'][0]['unit_price'], $q['lines'][0]['amount'], $q['lines'][0]['options']]);
        $this->assertSame([], $this->placed, 'a quote books nothing');
        $this->assertSame('12:30', Carbon::parse($q['at'])->format('H:i'));
    }

    public function test_the_smallest_order_is_checked_on_the_food_alone(): void
    {
        [, $dish] = $this->shop(['min_order' => 1500]);
        $this->fails(fn () => $this->orders()->quote($this->order($dish), null, $this->now), 'smallest order is 1,500.00');
        $this->assertSame(1500.0, $this->orders()->quote($this->order($dish, ['items' => [['dish_id' => $dish->id, 'quantity' => 3]]]), null, $this->now)['subtotal'], 'three is enough');
    }

    // ------------------------------------------------------------ placing

    public function test_an_order_to_pay_later_goes_straight_to_the_kitchen(): void
    {
        [$c, $dish] = $this->shop();
        $r = $this->orders()->place($this->order($dish, ['notes' => 'No rush']), null, $this->now);
        $o = $r['order']->fresh();
        $this->assertSame(['placed', 'placed', 'later', true, 'pickup', 1160.0, 'No rush'], [$r['status'], $o->status, $o->payment, $o->asap, $o->order_type, (float) $o->total, $o->notes]);
        $this->assertSame('12:30', $o->fulfil_at->timezone('Africa/Nairobi')->format('H:i'));
        $this->assertSame([], $this->started, 'nothing to charge now');
        $this->assertSame([['placed', $o->number]], $this->told);
        $this->assertSame('MO-'.str_pad((string) $o->id, 6, '0', STR_PAD_LEFT), $o->number);
        $this->assertSame(40, strlen($o->track_token));
        $line = $o->lines[0];
        $this->assertSame(['Beef stew', 2.0, 500.0], [$line->name, (float) $line->quantity, (float) $line->unit_price]);
        $p = $this->placed[0];
        $this->assertSame(['storefront', true, true], [$p['channel'], $p['meta']['menu_order'], $p['meta']['guest']]);
        $this->assertSame('Wanjiru', $p['meta']['contact']['name']);
        $this->assertSame(['dish', $dish->id, 2, 500.0], [$p['lines'][0]['type'], $p['lines'][0]['dish_id'], $p['lines'][0]['quantity'], $p['lines'][0]['rate']]);
        $this->assertSame($o->id, Voucher::find($o->voucher_id)->meta['menu_order_id'], 'the books order points back at the food order');
    }

    public function test_an_order_to_pay_now_starts_the_payment_and_waits_for_the_money(): void
    {
        [, $dish] = $this->shop();
        $r = $this->orders()->place($this->order($dish, ['payment_mode' => 'online', 'payment_method_id' => 1]), null, $this->now);
        $o = $r['order']->fresh();
        $this->assertSame(['awaiting_payment', 'pending', 'placed', 1160.0, 1], [$r['status'], $o->payment, $o->status, $this->started[0]['due'], $o->payment_method_id]);
        $this->assertSame('0712345678', $this->started[0]['contact']['phone']);
        $this->assertSame(901, $r['attempt']['id']);
        $this->assertNull($r['redirect_url'], 'M-Pesa: a prompt on the phone');
    }

    public function test_the_money_arriving_marks_the_order_paid_once(): void
    {
        [, $dish] = $this->shop();
        $o = $this->orders()->place($this->order($dish, ['payment_mode' => 'online', 'payment_method_id' => 1]), null, $this->now)['order'];
        $order = Voucher::find($o->voucher_id);
        $sale = Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'CS-1']);
        $this->orders()->paid($order, $sale);
        $this->orders()->paid($order, $sale);
        $o->refresh();
        $this->assertSame(['paid', $sale->id], [$o->payment, $o->sale_id]);
        $this->assertCount(1, array_filter($this->told, fn ($t) => $t[0] === 'paid'), 'the kitchen is told once');
    }

    public function test_an_order_that_is_not_allowed_is_refused_before_anything_is_booked(): void
    {
        [$c, $dish] = $this->shop();
        $other = $this->make('Chips', 200);
        $this->stockDish($other, 5);
        $cases = [
            'not on a menu' => [fn () => $this->order($other), 'not on the menu'],
            'empty' => [fn () => $this->order($dish, ['items' => []]), 'basket is empty'],
            'too many' => [fn () => $this->order($dish, ['items' => [['dish_id' => $dish->id, 'quantity' => 80]]]), 'call us'],
            'no name' => [fn () => $this->order($dish, ['name' => ' ']), 'your name'],
            'no phone' => [fn () => $this->order($dish, ['phone' => '']), 'phone'],
            'bad email' => [fn () => $this->order($dish, ['email' => 'nope']), 'email'],
            'bad time' => [fn () => $this->order($dish, ['fulfil' => '2026-10-12T12:31:00+03:00']), 'can not be chosen'],
            'not served' => [fn () => $this->order($dish, ['fulfil' => '2026-10-12T15:00:00+03:00']), 'can not be chosen'],
            'pay mode' => [fn () => $this->order($dish, ['payment_mode' => 'barter']), 'how you would like to pay'],
            'no method' => [fn () => $this->order($dish, ['payment_mode' => 'online']), 'how to pay'],
            'cash online' => [fn () => $this->order($dish, ['payment_mode' => 'online', 'payment_method_id' => 3]), 'how to pay'],
            'manual gateway' => [fn () => $this->order($dish, ['payment_mode' => 'online', 'payment_method_id' => 2]), "can't be charged automatically"],
        ];
        foreach ($cases as $name => [$in, $msg]) {
            $this->fails(fn () => $this->orders()->place($in(), null, $this->now), $msg);
        }
        $this->assertSame([], $this->placed, 'nothing reached the books');
        $this->assertSame(0, MenuOrder::count());
    }

    public function test_a_closed_channel_and_a_time_nothing_is_served_are_refused(): void
    {
        [$c, $dish] = $this->shop();
        $c->update(['is_active' => false]);
        $this->fails(fn () => $this->orders()->place($this->order($dish), null, $this->now), 'not available');
        $c->update(['is_active' => true, 'allow_asap' => false]);
        $this->fails(fn () => $this->orders()->place($this->order($dish), null, $this->now), 'choose a time');
        $c->update(['allow_asap' => true]);
        $this->fails(fn () => $this->orders()->place($this->order($dish), null, $this->now->copy()->setTime(14, 50)), 'open');
        $this->fails(fn () => $this->orders()->place($this->order($dish, ['channel' => 'nowhere']), null, $this->now), 'not available');
    }

    public function test_a_dish_that_is_sold_out_or_short_can_not_be_ordered(): void
    {
        [, $dish] = $this->shop([], 500, 3);
        $this->fails(fn () => $this->orders()->place($this->order($dish, ['items' => [['dish_id' => $dish->id, 'quantity' => 2], ['dish_id' => $dish->id, 'quantity' => 2]]]), null, $this->now), 'Only 3 of Beef stew left');
        app(\App\Services\Menus\DishService::class)->soldOutToday($dish, true);
        $this->fails(fn () => $this->orders()->place($this->order($dish), null, $this->now), 'sold out');
        app(\App\Services\Menus\DishService::class)->soldOutToday($dish, false);
        $dish->update(['is_active' => false]);
        $this->fails(fn () => $this->orders()->place($this->order($dish), null, $this->now), 'not available any more');
    }

    public function test_choices_carry_their_effects_and_a_set_meal_side_is_its_own_free_line(): void
    {
        [, $dish] = $this->shop();
        $side = $this->make('Kachumbari', 100);
        $this->stockDish($side, 10);
        app(DishOptions::class)->save($dish, [['name' => 'Side', 'kind' => 'single', 'min_choices' => 1, 'options' => [['name' => 'With kachumbari', 'price_delta' => 80, 'linked_dish_id' => $side->id]]]]);
        $opt = (int) DB::table('menus_options')->value('id');
        $this->fails(fn () => $this->orders()->place($this->order($dish), null, $this->now), 'Side');
        $r = $this->orders()->place($this->order($dish, ['items' => [['dish_id' => $dish->id, 'quantity' => 2, 'option_ids' => [$opt], 'note' => 'Hot please']]]), null, $this->now);
        $lines = $this->placed[0]['lines'];
        $this->assertSame([580.0, 'With kachumbari — Hot please'], [$lines[0]['rate'], $lines[0]['notes']]);
        $this->assertSame([$side->id, 2, 0, 'Part of Beef stew'], [$lines[1]['dish_id'], $lines[1]['quantity'], $lines[1]['rate'], $lines[1]['notes']]);
        $this->assertSame([['id' => $opt, 'group' => 'Side', 'name' => 'With kachumbari', 'price_delta' => 80]], $r['order']->lines[0]->options);
    }

    public function test_the_side_must_be_in_stock_too(): void
    {
        [, $dish] = $this->shop();
        $side = $this->make('Kachumbari', 100);
        app(DishOptions::class)->save($dish, [['name' => 'Side', 'kind' => 'single', 'options' => [['name' => 'With kachumbari', 'linked_dish_id' => $side->id]]]]);
        $opt = (int) DB::table('menus_options')->value('id');
        $this->fails(fn () => $this->orders()->place($this->order($dish, ['items' => [['dish_id' => $dish->id, 'quantity' => 1, 'option_ids' => [$opt]]]]), null, $this->now), 'Kachumbari is sold out');
    }

    public function test_a_signed_in_customer_is_linked_and_a_guest_is_marked(): void
    {
        [, $dish] = $this->shop();
        $user = new class extends \App\Models\User {
            public function __construct() {}
            public function getCustomerAttribute() { return (object) ['id' => 7, 'phone' => '0799']; }
        };
        $user->forceFill(['id' => 3, 'name' => 'Amina', 'email' => 'a@example.com']);
        $o = $this->orders()->place(['channel' => 'online_pickup', 'items' => [['dish_id' => $dish->id, 'quantity' => 1]], 'payment_mode' => 'later'], $user, $this->now)['order'];
        $this->assertSame([7, 3, 'Amina', '0799', 'a@example.com'], [$o->customer_id, $o->user_id, $o->name, $o->phone, $o->email]);
        $this->assertNull($this->placed[0]['meta']['guest']);
    }

    // ------------------------------------------------------------ delivery

    private function delivery(array $o = []): array
    {
        $c = Channel::create($o + ['code' => 'online_delivery', 'name' => 'Delivery', 'order_type' => 'delivery', 'is_active' => true, 'payment_modes' => ['online', 'later']]);

        return [$c];
    }

    public function test_a_delivery_needs_an_address_and_a_method_and_adds_the_fee(): void
    {
        [, $dish] = $this->shop();
        $this->delivery(['shipping_option_ids' => [70, 71]]);
        $in = $this->order($dish, ['channel' => 'online_delivery']);
        $this->fails(fn () => $this->orders()->place($in, null, $this->now), 'address');
        $in['address'] = 'Kenyatta Avenue 12, Nakuru';
        $this->fails(fn () => $this->orders()->place($in, null, $this->now), 'how you want it delivered');
        $in['shipping_option_id'] = 999;
        $this->fails(fn () => $this->orders()->place($in, null, $this->now), 'how you want it delivered');
        $in['shipping_option_id'] = 71;
        $o = $this->orders()->place($in, null, $this->now)['order']->fresh();
        $this->assertSame(['delivery', 'Kenyatta Avenue 12, Nakuru', 71, 150.0, 1150.0, 1334.0], [$o->order_type, $o->delivery_address, $o->shipping_option_id, (float) $o->delivery_fee, (float) $o->subtotal, (float) $o->total]);
        $last = end($this->placed[0]['lines']);
        $this->assertSame(['charge', 'shipping', 71], [$last['type'], $last['kind'], $last['shipping_option_id']]);
    }

    public function test_the_only_allowed_delivery_method_is_used_when_none_is_named_and_others_are_refused(): void
    {
        [, $dish] = $this->shop();
        $this->delivery(['shipping_option_ids' => [70]]);
        $in = $this->order($dish, ['channel' => 'online_delivery', 'address' => 'Kenyatta Avenue 12, Nakuru']);
        $this->assertSame(70, $this->orders()->place($in, null, $this->now)['order']->shipping_option_id);
        $this->fails(fn () => $this->orders()->place($in + ['shipping_option_id' => 71], null, $this->now), 'delivered');
    }

    public function test_a_pickup_never_gets_a_delivery_charge(): void
    {
        [, $dish] = $this->shop();
        $this->orders()->place($this->order($dish, ['address' => 'Somewhere far', 'shipping_option_id' => 70]), null, $this->now);
        $this->assertSame(['dish'], array_unique(array_column($this->placed[0]['lines'], 'type')));
    }

    public function test_delivery_does_not_count_towards_the_smallest_order(): void
    {
        [, $dish] = $this->shop();
        $this->delivery(['shipping_option_ids' => [70], 'min_order' => 1100]);
        $in = $this->order($dish, ['channel' => 'online_delivery', 'address' => 'Kenyatta Avenue 12, Nakuru']);
        $this->fails(fn () => $this->orders()->place($in, null, $this->now), 'smallest order is 1,100.00');
        $in['items'][0]['quantity'] = 3;
        $this->assertSame(1500.0, $this->orders()->quote($in, null, $this->now)['subtotal'] - 150.0);
    }

    // ------------------------------------------------------------ the kitchen moves it along

    private function placedOrder(string $mode = 'later', string $channel = 'online_pickup'): MenuOrder
    {
        static $made = false;
        $dish = Dish::first();
        if (! $dish) {
            [, $dish] = $this->shop();
        }
        if (! Channel::where('code', 'online_delivery')->exists()) {
            $this->delivery(['shipping_option_ids' => [70]]);
        }
        $in = $this->order($dish, ['channel' => $channel, 'address' => 'Kenyatta Avenue 12, Nakuru', 'payment_mode' => $mode] + ($mode === 'online' ? ['payment_method_id' => 1] : []));

        return $this->orders()->place($in, null, $this->now)['order']->fresh();
    }

    public function test_an_order_waiting_for_its_money_can_not_be_started(): void
    {
        $o = $this->placedOrder('online');
        $this->fails(fn () => $this->orders()->advance($o, 'accepted'), 'waiting for the customer');
        $o->update(['payment' => 'failed']);
        $this->fails(fn () => $this->orders()->advance($o, 'accepted'), 'failed');
    }

    public function test_a_pickup_goes_placed_accepted_preparing_ready_and_is_paid_at_the_counter(): void
    {
        $o = $this->placedOrder();
        $o = $this->orders()->advance($o, 'accepted');
        $this->assertNotNull($o->accepted_at);
        $o = $this->orders()->advance($o, 'preparing');
        $o = $this->orders()->advance($o, 'ready');
        $this->assertSame(['ready', [['ready', $o->number]]], [$o->status, array_values(array_filter($this->told, fn ($t) => $t[0] === 'ready'))]);
        $this->assertNotNull($o->ready_at);
        $this->fails(fn () => $this->orders()->advance($o, 'out'), 'Only a delivery');
        $this->fails(fn () => $this->orders()->advance($o, 'completed'), 'Take the payment');
        $this->fails(fn () => $this->orders()->advance($o, 'placed'), 'can not become');
        $o = $this->orders()->takePayment($o, [['payment_method_id' => 3]]);
        $this->assertSame(['completed', 'paid'], [$o->status, $o->payment]);
        $this->assertNotNull($o->completed_at);
        $this->assertNotNull($o->sale_id);
        $this->assertSame(Voucher::find($o->voucher_id)->total_amount, Voucher::find($this->settled[0][0])->total_amount);
        $this->assertSame([[['payment_method_id' => 3, 'amount' => 1160.0, 'reference' => null]]], [$this->settled[0][1]]);
    }

    public function test_the_payment_taken_at_the_door_must_match_the_order(): void
    {
        $o = $this->orders()->advance($this->orders()->advance($this->placedOrder(), 'preparing'), 'ready');
        $this->fails(fn () => $this->orders()->takePayment($o, [['payment_method_id' => 3, 'amount' => 1000]]), 'must come to 1,160.00');
        $this->fails(fn () => $this->orders()->takePayment($o, []), 'must come to');
        $o = $this->orders()->takePayment($o, [['payment_method_id' => 3, 'amount' => 1000], ['payment_method_id' => 1, 'amount' => 160, 'reference' => 'QWE123']]);
        $this->assertSame('completed', $o->status);
        $this->assertSame('QWE123', $this->settled[0][1][1]['reference']);
    }

    public function test_payment_is_not_taken_twice_or_too_early_or_for_an_order_already_paid(): void
    {
        $o = $this->placedOrder();
        $this->fails(fn () => $this->orders()->takePayment($o, [['payment_method_id' => 3]]), 'when the order is ready');
        $paid = $this->placedOrder('online');
        $paid->update(['payment' => 'paid']);
        $this->fails(fn () => $this->orders()->takePayment($paid, [['payment_method_id' => 3]]), 'does not wait');
    }

    public function test_a_delivery_goes_out_before_it_is_delivered_and_a_paid_one_completes_without_payment(): void
    {
        $o = $this->placedOrder('online', 'online_delivery');
        $o->update(['payment' => 'paid']);
        $o = $this->orders()->advance($this->orders()->advance($o, 'preparing'), 'ready');
        $this->fails(fn () => $this->orders()->advance($o, 'completed'), 'out for delivery first');
        $o = $this->orders()->advance($o, 'out');
        $this->assertSame([['out', $o->number]], array_values(array_filter($this->told, fn ($t) => $t[0] === 'out')));
        $this->assertSame('completed', $this->orders()->advance($o, 'completed')->status);
        $this->assertSame([], $this->settled, 'already paid: nothing to take');
    }

    public function test_a_finished_order_is_finished(): void
    {
        $o = $this->placedOrder('online');
        $o->update(['payment' => 'paid', 'status' => 'completed']);
        $this->fails(fn () => $this->orders()->advance($o, 'ready'), 'can not become');
        $this->fails(fn () => $this->orders()->cancel($o), 'can not be cancelled');
    }

    // ------------------------------------------------------------ cancelling

    public function test_cancelling_an_unpaid_order_cancels_it_in_the_books(): void
    {
        $o = $this->placedOrder();
        $o = $this->orders()->cancel($o, ' Out of stock ');
        $this->assertSame(['cancelled', 'Out of stock', false], [$o->status, $o->cancel_reason, $o->refundDue()]);
        $this->assertSame($o->voucher_id, $this->cancelled[0][0]);
        $this->assertSame('cancelled', Voucher::find($o->voucher_id)->status);
        $this->assertSame([['cancelled', $o->number]], array_values(array_filter($this->told, fn ($t) => $t[0] === 'cancelled')));
    }

    public function test_an_order_waiting_for_payment_that_is_cancelled_counts_as_failed_payment(): void
    {
        $o = $this->orders()->cancel($this->placedOrder('online'));
        $this->assertSame(['cancelled', 'failed'], [$o->status, $o->payment]);
    }

    public function test_cancelling_a_paid_order_flags_the_refund_and_leaves_the_sale_for_staff(): void
    {
        $o = $this->placedOrder('online');
        $o->update(['payment' => 'paid']);
        $o = $this->orders()->advance($o, 'cancelled', null, 'Kitchen closed');
        $this->assertSame([true, 'paid'], [$o->refundDue(), $o->payment]);
        $this->assertSame([], $this->cancelled, 'the money is in the books as a sale: staff refund it, nothing is voided here');
    }

    public function test_the_sweep_cancels_only_old_unpaid_online_orders(): void
    {
        $old = $this->placedOrder('online');
        $fresh = $this->placedOrder('online');
        $later = $this->placedOrder('later');
        $paid = $this->placedOrder('online');
        $paid->update(['payment' => 'paid']);
        $started = $this->placedOrder('online');
        $started->update(['status' => 'accepted']);
        MenuOrder::whereIn('id', [$old->id, $later->id, $paid->id, $started->id])->update(['created_at' => $this->now->copy()->subMinutes(45)]);
        MenuOrder::whereKey($fresh->id)->update(['created_at' => $this->now->copy()->subMinutes(10)]);
        $this->assertSame(1, $this->orders()->sweep(30, $this->now));
        $this->assertSame(['cancelled', 'placed', 'placed', 'placed', 'accepted'], [$old->fresh()->status, $fresh->fresh()->status, $later->fresh()->status, $paid->fresh()->status, $started->fresh()->status]);
        $this->assertSame(0, $this->orders()->sweep(30, $this->now), 'nothing left to do the second time');
    }

    // ------------------------------------------------------------ what each side sees

    public function test_the_customer_follows_their_order_and_may_cancel_only_before_the_kitchen_starts(): void
    {
        $o = $this->placedOrder();
        $v = app(MenuOrderView::class)->customer($o);
        $this->assertTrue($v['can_cancel']);
        $this->assertSame(['placed', 'preparing', 'ready', 'completed'], array_column($v['steps'], 'key'));
        $this->assertSame([true], array_column(array_filter($v['steps'], fn ($s) => $s['current']), 'current'));
        $this->assertArrayNotHasKey('track_token', $v);
        $this->assertArrayNotHasKey('phone', $v, 'the page behind a link does not show the phone number');
        $paid = $this->placedOrder('online');
        $paid->update(['payment' => 'paid']);
        $this->assertFalse(app(MenuOrderView::class)->customer($paid)['can_cancel'], 'once paid, they call us');
        $o = $this->orders()->advance($o, 'accepted');
        $this->assertTrue(app(MenuOrderView::class)->customer($o)['can_cancel'] === false);
        $d = app(MenuOrderView::class)->customer($this->placedOrder('online', 'online_delivery'));
        $this->assertSame(['placed', 'preparing', 'ready', 'out', 'completed'], array_column($d['steps'], 'key'));
        $this->assertSame('Delivered', end($d['steps'])['label']);
    }

    public function test_the_kitchen_is_offered_only_the_steps_that_make_sense(): void
    {
        $view = app(MenuOrderView::class);
        $o = $this->placedOrder();
        $this->assertSame(['accepted', 'preparing', 'ready', 'cancelled'], $view->staff($o)['next']);
        $ready = $this->orders()->advance($o, 'ready');
        $this->assertSame(['cancelled'], $view->staff($ready)['next'], 'a pickup to be paid at the counter completes through the payment');
        $this->assertTrue($view->staff($ready)['needs_payment']);
        $pending = $this->placedOrder('online');
        $this->assertSame([], $view->staff($pending)['next']);
        $d = $this->placedOrder('online', 'online_delivery');
        $d->update(['payment' => 'paid', 'status' => 'ready']);
        $this->assertSame(['out', 'cancelled'], $view->staff($d->fresh())['next']);
    }

    public function test_the_kitchen_is_told_only_once_the_money_is_in(): void
    {
        $users = [(new \App\Models\User())->forceFill(["id" => 1])];
        $sent = [];
        $notifier = $this->createMock(Notifier::class);
        $notifier->method('send')->willReturnCallback(function ($to, $type, $title) use (&$sent) { $sent[] = [$type, $title]; return []; });
        $notifier->method('sendToContact')->willReturnCallback(function ($c, $type, $title) use (&$sent) { $sent[] = ['guest:'.$type, $title]; return []; });
        $staff = $this->createMock(Staff::class);
        $staff->method('holding')->willReturn(collect($users));
        $notices = new MenuOrderNotices($notifier, $staff);
        $o = $this->placedOrder('online');
        $notices->placed($o);
        $this->assertSame([['guest:menu_order_placed', "We have your order {$o->number}"]], $sent, 'the customer only: the payment has not arrived');
        $sent = [];
        $o->update(['payment' => 'paid']);
        $notices->paid($o->fresh());
        $this->assertSame(['guest:menu_order_placed', 'menu_order_new'], array_column($sent, 0));
        $sent = [];
        $later = $this->placedOrder();
        $notices->placed($later);
        $this->assertContains('menu_order_new', array_column($sent, 0), 'pay-later orders go to the kitchen at once');
    }

    // ------------------------------------------------------------ the pages' endpoints

    public function test_the_page_lists_only_the_ways_that_are_on_with_times_and_automatic_payment(): void
    {
        [$c] = $this->shop();
        Channel::create(['code' => 'online_delivery', 'name' => 'Delivery', 'order_type' => 'delivery', 'is_active' => false]);
        $r = app(\App\Http\Controllers\Api\MenusOrderController::class)->channels()->getData(true);
        $this->assertSame(['online_pickup'], array_column($r['channels'], 'code'));
        $this->assertSame('12:30', Carbon::parse($r['channels'][0]['asap'])->format('H:i'));
        $this->assertNotEmpty($r['channels'][0]['slots']);
        $this->assertSame(['M-Pesa'], array_column($r['payment_methods'], 'name'), 'cash and a manual bank slip are not offered online');
        $this->assertSame([self::BRANCH], array_column($r['locations'], 'id'));
    }

    public function test_a_customer_cancels_by_their_link_only_before_the_kitchen_starts(): void
    {
        $o = $this->placedOrder();
        $ctl = app(\App\Http\Controllers\Api\MenusOrderController::class);
        $this->assertSame('placed', $ctl->show($o->track_token)->getData(true)['order']['status']);
        $started = $this->placedOrder();
        $this->orders()->advance($started, 'accepted');
        $r = $ctl->cancel(new \Illuminate\Http\Request(), $started->track_token);
        $this->assertSame(422, $r->status());
        $this->assertSame('accepted', $started->fresh()->status);
        $r = $ctl->cancel(new \Illuminate\Http\Request(), $o->track_token);
        $this->assertSame([200, 'cancelled', 'Cancelled by the customer'], [$r->status(), $o->fresh()->status, $o->fresh()->cancel_reason]);
        $this->expectException(\Illuminate\Database\Eloquent\ModelNotFoundException::class);
        $ctl->show(str_repeat('a', 40));
    }
}

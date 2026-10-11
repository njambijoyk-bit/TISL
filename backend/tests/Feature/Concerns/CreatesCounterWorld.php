<?php

namespace Tests\Feature\Concerns;

use App\Models\Books\Voucher;
use App\Models\Menus\Channel;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\VoucherService;
use App\Services\Menus\MenuOrderNotices;
use App\Services\Menus\StationService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** The counter and floor tests' world: every Menus table, the books and the payment gateway stood in for (what they are asked is recorded), a counter that is on and one kitchen station. */
trait CreatesCounterWorld
{
    use CreatesDishTables;

    private array $placed = [];
    private array $settled = [];
    private array $cancelled = [];

    private Carbon $now;
    private array $started = [];
    private bool $gatewayFails = false;

    protected function createCounterWorld(): void
    {
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
            $t->id(); $t->string('number', 20); $t->string('track_token', 40); $t->unsignedBigInteger('channel_id')->default(1); $t->string('order_type', 12)->default('pickup'); $t->string('service', 10)->nullable(); $t->unsignedInteger('short_no')->nullable(); $t->string('label', 80)->nullable(); $t->unsignedBigInteger('cashier_id')->nullable(); $t->unsignedBigInteger('table_id')->nullable(); $t->unsignedSmallInteger('guests')->nullable();
            $t->unsignedBigInteger('location_id')->default(self::BRANCH); $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('sale_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('name'); $t->string('email')->nullable(); $t->string('phone', 40)->nullable();
            $t->string('status', 12)->default('placed'); $t->string('payment', 10)->default('pending'); $t->unsignedBigInteger('payment_method_id')->nullable(); $t->boolean('asap')->default(true); $t->dateTime('fulfil_at'); $t->text('delivery_address')->nullable(); $t->unsignedBigInteger('shipping_option_id')->nullable();
            $t->decimal('delivery_fee', 12, 2)->default(0); $t->decimal('subtotal', 12, 2)->default(0); $t->decimal('tax_total', 12, 2)->default(0); $t->decimal('total', 12, 2)->default(0); $t->decimal('tip', 12, 2)->default(0); $t->decimal('service_charge', 12, 2)->default(0); $t->decimal('tendered', 12, 2)->nullable(); $t->decimal('change_due', 12, 2)->default(0);
            $t->json('tax_breakdown')->nullable(); $t->json('tenders')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->string('notes', 500)->nullable(); $t->string('cancel_reason', 300)->nullable();
            foreach (['placed_at', 'accepted_at', 'ready_at', 'completed_at', 'cancelled_at', 'settled_at'] as $c) { $t->dateTime($c)->nullable(); } $t->timestamps();
        });
        Schema::create('menus_areas', function ($t) { $t->id(); $t->unsignedBigInteger('location_id'); $t->string('name', 60); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_tables', function ($t) { $t->id(); $t->unsignedBigInteger('area_id'); $t->string('name', 40); $t->unsignedSmallInteger('seats')->default(2); $t->string('shape', 8)->default('square'); foreach (['x', 'y'] as $c) { $t->unsignedSmallInteger($c)->default(0); } foreach (['w', 'h'] as $c) { $t->unsignedSmallInteger($c)->default(2); }
            $t->string('qr_token', 24)->unique(); $t->unsignedBigInteger('resource_id')->nullable(); $t->string('state', 10)->default('free'); $t->unsignedSmallInteger('guests')->nullable(); $t->dateTime('seated_at')->nullable(); $t->dateTime('bill_asked_at')->nullable(); $t->unsignedBigInteger('merged_into')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_order_lines', function ($t) { $t->id(); $t->unsignedBigInteger('order_id'); $t->unsignedBigInteger('dish_id'); $t->unsignedBigInteger('variant_id'); $t->string('name'); $t->decimal('quantity', 10, 2)->default(1); $t->decimal('base_price', 12, 2)->default(0); $t->decimal('unit_price', 12, 2)->default(0); $t->json('options')->nullable(); $t->string('note', 300)->nullable(); $t->unsignedSmallInteger('round')->default(1); $t->json('uses')->nullable(); $t->json('linked')->nullable(); $t->unsignedBigInteger('ticket_id')->nullable(); $t->timestamps(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_online')->default(false); $t->string('gateway')->nullable(); $t->boolean('requires_reference')->default(false); $t->text('instructions')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 12, 2)->default(0); $t->unsignedBigInteger('source_voucher_id')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->string('name')->nullable(); $t->string('symbol')->nullable(); $t->boolean('is_base')->default(false); $t->boolean('is_active')->default(true); $t->timestamps(); });
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'name' => 'Kenyan shilling', 'symbol' => 'KSh', 'is_base' => true]);
        DB::table('payment_methods')->insert([['id' => 1, 'name' => 'Cash', 'kind' => 'cash', 'is_active' => true, 'is_online' => false, 'gateway' => null], ['id' => 2, 'name' => 'M-Pesa', 'kind' => 'mpesa', 'is_active' => true, 'is_online' => false, 'gateway' => null],
            ['id' => 3, 'name' => 'Old card', 'kind' => 'card', 'is_active' => false, 'is_online' => false, 'gateway' => null], ['id' => 4, 'name' => 'M-Pesa online', 'kind' => 'mpesa', 'is_active' => true, 'is_online' => true, 'gateway' => 'mpesa_stk']]);
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
        $gateway = $this->createMock(GatewayPaymentService::class);
        $gateway->method('start')->willReturnCallback(function (Voucher $order, \App\Models\Books\PaymentMethod $m, array $contact, array $tenders, float $due) {
            if ($this->gatewayFails) {
                throw new \App\Services\Books\BooksException('The payment could not start.');
            }
            $this->started[] = compact('contact', 'due') + ['order' => $order->id, 'method' => $m->name];
            $a = new \App\Models\Books\PaymentAttempt();
            $a->forceFill(['id' => 700 + count($this->started), 'status' => 'pending', 'amount' => $due, 'gateway' => $m->gateway]);

            return ['attempt' => $a, 'redirect_url' => null];
        });
        $this->app->instance(GatewayPaymentService::class, $gateway);
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
}

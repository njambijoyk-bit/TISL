<?php

namespace Tests\Feature;

use App\Models\Books\PaymentAttempt;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Services\Books\BooksException;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A cart with ready-now AND preorder items checked out in one go: two orders, one payment. The books' own order-making is exercised elsewhere; here the rules
 * around it: how the cart is split, the one combined price, "together or not at all", one M-Pesa prompt for both totals, and one payment settling both orders.
 */
class MixedCartCheckoutTest extends NotifyTestCase
{
    use Concerns\CreatesPreorderTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPreorderTables();
        Schema::table('vouchers', function ($t) { $t->decimal('total_amount', 12, 2)->default(0); $t->timestamps(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_online')->default(false); $t->string('gateway')->nullable(); $t->boolean('requires_reference')->default(false); $t->text('instructions')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('payment_attempts', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('payment_method_id')->nullable(); $t->string('gateway')->nullable(); $t->string('status')->default('pending'); $t->decimal('amount', 12, 2)->default(0); $t->unsignedBigInteger('currency_id')->nullable(); $t->decimal('gateway_amount', 12, 2)->nullable(); $t->string('gateway_currency')->nullable(); $t->string('phone')->nullable(); $t->string('merchant_request_id')->nullable(); $t->string('checkout_request_id')->nullable(); $t->string('receipt_number')->nullable(); $t->json('callback_raw')->nullable(); $t->string('failure_reason')->nullable(); $t->json('tenders')->nullable(); $t->unsignedBigInteger('settled_voucher_id')->nullable(); $t->dateTime('confirmed_at')->nullable(); $t->dateTime('failed_at')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->text('notes')->nullable(); $t->timestamps(); });
        DB::table('voucher_types')->insert([['id' => 1, 'base_type' => 'sales_order'], ['id' => 2, 'base_type' => 'cash_sale']]);
        $this->mock(\App\Services\DarajaService::class);   // the real one wants M-Pesa keys at construction
    }

    /** A partial CheckoutService built the way the container builds it (its constructor needs the books). */
    private function partial(): CheckoutService
    {
        $args = array_map(fn ($p) => app($p->getType()->getName()), (new \ReflectionClass(CheckoutService::class))->getConstructor()->getParameters());

        return \Mockery::mock(CheckoutService::class, $args)->makePartial()->shouldAllowMockingProtectedMethods();
    }

    private function item(int $id, bool $pre, float $qty = 1): array
    {
        return ['product_id' => $id, 'quantity' => $qty, 'preorder' => $pre];
    }

    private function cart(array $over = []): array
    {
        return $over + ['items' => [$this->item(1, false), $this->item(2, true), $this->item(3, false)], 'promo_code' => 'SAVE10', 'payment_mode' => 'pay_later', 'payment_method_id' => null, 'phone' => '0712345678'];
    }

    /** The service with only the parts under test real: `quote` and `place` are stood in for. */
    private function service(array $quotes = [], array $places = []): CheckoutService
    {
        $m = $this->partial();
        $q = $quotes;
        $m->shouldReceive('quote')->andReturnUsing(function ($in) use (&$q) {
            return array_shift($q);
        });
        $p = $places;
        $m->shouldReceive('place')->andReturnUsing(function ($in) use (&$p) {
            $m = array_shift($p);
            $this->seenPlaces[] = $in;

            return $m;
        });

        return $m;
    }

    private array $seenPlaces = [];

    private function invoke(CheckoutService $s, string $method, array $args)
    {
        $r = new \ReflectionMethod(CheckoutService::class, $method);
        $r->setAccessible(true);

        return $r->invoke($s, ...$args);
    }

    // ------------------------------------------------------------ splitting the cart

    public function test_items_are_split_by_their_own_flag_and_only_the_ready_order_takes_the_promo_code(): void
    {
        [$ready, $pre] = $this->invoke($this->service(), 'splitTogether', [$this->cart()]);
        $this->assertSame([1, 3], array_column($ready['items'], 'product_id'));
        $this->assertSame([2], array_column($pre['items'], 'product_id'));
        $this->assertSame([false, true], [$ready['preorder'], $pre['preorder']]);
        $this->assertSame(['SAVE10', null], [$ready['promo_code'], $pre['promo_code']]);
        $this->assertSame([false, false], [$ready['together'], $pre['together']], 'the parts are not themselves "together": no loop');
    }

    public function test_both_kinds_of_item_are_needed_and_gift_vouchers_are_left_out(): void
    {
        foreach ([[[$this->item(1, false)]], [[$this->item(2, true)]]] as [$items]) {
            try {
                $this->invoke($this->service(), 'splitTogether', [$this->cart(['items' => $items])]);
                $this->fail('Expected a refusal');
            } catch (BooksException $e) {
                $this->assertStringContainsString('needs both', $e->getMessage());
            }
        }
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('gift voucher is bought on its own');
        $this->invoke($this->service(), 'splitTogether', [$this->cart(['gift_vouchers' => [['amount' => 500]]])]);
    }

    // ------------------------------------------------------------ one price

    public function test_the_combined_quote_adds_the_two_parts_and_names_each(): void
    {
        $a = ['currency' => ['code' => 'KES'], 'lines' => [['description' => 'Mug']], 'subtotal' => 800.0, 'tax_total' => 128.0, 'tax_breakdown' => [['label' => 'VAT 16%', 'percent' => 16, 'amount' => 128.0]],
            'total' => 928.0, 'discounts' => [['source' => 'promo', 'amount' => 80.0]], 'gift' => null, 'customer' => ['name' => 'Amina'], 'due_now' => 928.0, 'promo_accepted' => true, 'available' => ['gift_vouchers' => [['code' => 'G1']], 'promo' => 1]];
        $b = ['currency' => ['code' => 'KES'], 'lines' => [['description' => 'Gadget']], 'subtotal' => 1000.0, 'tax_total' => 160.0, 'tax_breakdown' => [['label' => 'VAT 16%', 'percent' => 16, 'amount' => 160.0]],
            'total' => 1160.0, 'discounts' => [], 'gift' => null, 'customer' => ['name' => 'Amina'], 'due_now' => 1160.0, 'promo_accepted' => false, 'available' => []];
        $q = $this->invoke($this->service([$a, $b]), 'quoteTogether', [$this->cart(), null]);

        $this->assertSame([1800.0, 288.0, 2088.0, 2088.0], [$q['subtotal'], $q['tax_total'], $q['total'], $q['due_now']]);
        $this->assertSame([['label' => 'VAT 16%', 'percent' => 16, 'amount' => 288.0]], $q['tax_breakdown']);
        $this->assertSame([null, true], [$q['lines'][0]['preorder'] ?? null, $q['lines'][1]['preorder']]);
        $this->assertSame([['kind' => 'ready', 'total' => 928.0], ['kind' => 'preorder', 'total' => 1160.0]], $q['parts']);
        $this->assertSame([], $q['available']['gift_vouchers'], 'no gift vouchers on a combined checkout');
        $this->assertTrue($q['promo_accepted'], 'the promo is judged on the ready-now order');
    }

    // ------------------------------------------------------------ placing

    private function placed(int $id, string $number, float $total, string $status = 'placed', ?float $due = null): array
    {
        DB::table('vouchers')->insert(['id' => $id, 'voucher_type_id' => 1, 'status' => 'posted', 'voucher_number' => $number, 'total_amount' => $total, 'meta' => json_encode([]), 'created_at' => now(), 'updated_at' => now()]);

        return ['order' => ['id' => $id, 'number' => $number, 'total' => $total], 'status' => $status, 'due' => $due ?? $total, 'message' => ''];
    }

    public function test_pay_later_places_both_orders_and_pairs_them(): void
    {
        $s = $this->service([], [$this->placed(10, 'ORD-1', 928.0), $this->placed(11, 'PRE-1', 1160.0)]);
        $r = $this->invoke($s, 'placeTogether', [$this->cart(), null]);

        $this->assertSame('placed', $r['status']);
        $this->assertSame(['ORD-1', 'PRE-1'], array_column($r['orders'], 'number'));
        $this->assertSame('ORD-1', $r['order']['number']);
        $this->assertStringContainsString('ORD-1 (ready now) and PRE-1 (preorder)', $r['message']);
        $this->assertSame(11, Voucher::find(10)->meta['paired_order_id']);
        $this->assertSame(10, Voucher::find(11)->meta['paired_order_id']);
        $this->assertFalse($this->seenPlaces[0]['preorder']);
        $this->assertTrue($this->seenPlaces[1]['preorder']);
        $this->assertFalse($this->seenPlaces[0]['_defer_online'], 'nothing deferred when not paying online');
    }

    public function test_online_makes_one_prompt_for_both_totals(): void
    {
        $method = PaymentMethod::forceCreate(['name' => 'M-Pesa', 'gateway' => 'mpesa_stk', 'is_active' => true]);
        $gateway = \Mockery::mock(GatewayPaymentService::class);
        $gateway->shouldReceive('initiateMpesa')->once()->withArgs(function ($voucher, $m, $phone, $planned, $due) {
            return $voucher->id === 10 && $phone === '0712345678' && $planned === [] && abs($due - 2088.0) < 0.001;
        })->andReturn(PaymentAttempt::forceCreate(['voucher_id' => 10, 'status' => 'pending', 'amount' => 2088, 'payment_method_id' => 1]));
        $this->app->instance(GatewayPaymentService::class, $gateway);
        $s = $this->partial();
        $places = [$this->placed(10, 'ORD-1', 928.0, 'awaiting_payment'), $this->placed(11, 'PRE-1', 1160.0, 'awaiting_payment')];
        $s->shouldReceive('place')->andReturnUsing(function ($in) use (&$places) {
            $this->seenPlaces[] = $in;

            return array_shift($places);
        });

        $r = $this->invoke($s, 'placeTogether', [$this->cart(['payment_mode' => 'online', 'payment_method_id' => $method->id]), null]);
        $this->assertSame(['awaiting_payment', 2088.0], [$r['status'], $r['attempt']['amount']]);
        $this->assertSame([10, 11], array_column($r['orders'], 'id'));
        $this->assertTrue($this->seenPlaces[0]['_defer_online'] && $this->seenPlaces[1]['_defer_online'], 'each order waits for the single prompt');
    }

    public function test_account_credit_and_gift_vouchers_are_not_for_a_combined_checkout(): void
    {
        foreach ([['payment_mode' => 'account'], ['payment_mode' => 'credit'], ['gift_voucher_codes' => ['G-1']]] as $over) {
            try {
                $this->invoke($this->service(), 'placeTogether', [$this->cart($over), null]);
                $this->fail('Expected a refusal');
            } catch (BooksException $e) {
                $this->assertStringContainsString('one order at a time', $e->getMessage());
            }
        }
        $this->assertSame([], $this->seenPlaces, 'nothing was placed');
    }

    public function test_if_the_second_order_can_not_be_placed_the_first_is_not_kept(): void
    {
        $s = $this->partial();
        $n = 0;
        $s->shouldReceive('place')->andReturnUsing(function () use (&$n) {
            if ($n++ === 0) {
                return $this->placed(10, 'ORD-1', 928.0);
            }
            throw new BooksException('Gadget is in stock now. Order it in the normal cart.');
        });
        try {
            $this->invoke($s, 'placeTogether', [$this->cart(), null]);
            $this->fail('Expected the checkout to fail');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Gadget is in stock now', $e->getMessage());
        }
        $this->assertSame(0, DB::table('vouchers')->count(), 'together or not at all');
    }

    // ------------------------------------------------------------ one payment, two orders

    private function pay(float $amount, array $primaryMeta, ?array $paired, ?int $failFor = null): array
    {
        DB::table('vouchers')->insert(['id' => 10, 'voucher_type_id' => 1, 'status' => 'posted', 'voucher_number' => 'ORD-1', 'total_amount' => 928.0, 'meta' => json_encode($primaryMeta), 'created_at' => now(), 'updated_at' => now()]);
        if ($paired) {
            DB::table('vouchers')->insert($paired + ['id' => 11, 'voucher_type_id' => 1, 'voucher_number' => 'PRE-1', 'total_amount' => 1160.0, 'meta' => json_encode([]), 'created_at' => now(), 'updated_at' => now()]);
        }
        $attempt = PaymentAttempt::forceCreate(['voucher_id' => 10, 'status' => 'confirmed', 'amount' => $amount, 'payment_method_id' => 3, 'receipt_number' => 'QWE123', 'tenders' => []]);
        $settled = [];
        $checkout = \Mockery::mock(CheckoutService::class);
        $checkout->shouldReceive('settle')->andReturnUsing(function ($order, $tenders) use (&$settled, $failFor) {
            if ($order->id === $failFor) {
                throw new BooksException('Ledger is closed');
            }
            $settled[$order->id] = $tenders;

            return (new Voucher)->forceFill(['id' => 100 + $order->id]);
        });
        $this->app->instance(CheckoutService::class, $checkout);
        $r = new \ReflectionMethod(GatewayPaymentService::class, 'settle');
        $r->setAccessible(true);
        $r->invoke(app(GatewayPaymentService::class), $attempt);

        return [$settled, $attempt->fresh()];
    }

    public function test_one_payment_settles_both_orders_each_with_its_own_part(): void
    {
        [$settled, $attempt] = $this->pay(2088.0, ['paired_order_id' => 11], ['status' => 'posted']);
        $this->assertSame([928.0], array_column($settled[10], 'amount'));
        $this->assertSame([1160.0], array_column($settled[11], 'amount'));
        $this->assertSame(['QWE123'], array_unique(array_merge(array_column($settled[10], 'reference'), array_column($settled[11], 'reference'))), 'the same M-Pesa receipt on both');
        $this->assertSame(110, $attempt->settled_voucher_id);
    }

    public function test_an_ordinary_payment_is_unchanged(): void
    {
        [$settled] = $this->pay(928.0, [], null);
        $this->assertSame([10], array_keys($settled));
        $this->assertSame([928.0], array_column($settled[10], 'amount'));
    }

    public function test_a_paired_order_that_can_not_take_its_part_is_noted_for_staff_not_ignored(): void
    {
        [$settled, $attempt] = $this->pay(2088.0, ['paired_order_id' => 11], ['status' => 'cancelled']);
        $this->assertSame([10], array_keys($settled), 'the cancelled order is not settled');
        $this->assertStringContainsString('PRE-1 could not be settled', $attempt->notes);
        $this->assertStringContainsString('unallocated', $attempt->notes);
    }

    public function test_a_failure_settling_the_second_order_does_not_undo_the_first(): void
    {
        [$settled, $attempt] = $this->pay(2088.0, ['paired_order_id' => 11], ['status' => 'posted'], 11);
        $this->assertSame([10], array_keys($settled), 'the first order is settled');
        $this->assertSame(110, $attempt->settled_voucher_id, 'and recorded on the payment');
        $this->assertStringContainsString('PRE-1 could not be settled', $attempt->notes);
        $this->assertStringContainsString('Ledger is closed', $attempt->notes);
    }
}

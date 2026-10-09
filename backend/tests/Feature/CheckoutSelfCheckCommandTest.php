<?php

namespace Tests\Feature;

use App\Models\Books\PaymentAttempt;
use App\Models\Books\Voucher;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `checkout:selfcheck` is meant to be run on the real database (the books' own tables are not in the repo, so a test can not stand them up). What is proved here:
 * the command runs end to end, reports pass and fail faithfully, and leaves nothing behind — with the books stood in for.
 */
class CheckoutSelfCheckCommandTest extends NotifyTestCase
{
    use Concerns\CreatesPreorderTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createPreorderTables();
        Schema::table('vouchers', function ($t) { $t->decimal('total_amount', 12, 2)->default(0); $t->timestamps(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_online')->default(false); $t->string('gateway')->nullable(); $t->boolean('requires_reference')->default(false); $t->text('instructions')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('payment_attempts', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('payment_method_id')->nullable(); $t->string('gateway')->nullable(); $t->string('status')->default('pending'); $t->decimal('amount', 12, 2)->default(0); $t->unsignedBigInteger('currency_id')->nullable(); $t->decimal('gateway_amount', 12, 2)->nullable(); $t->string('gateway_currency')->nullable(); $t->string('phone')->nullable(); $t->string('merchant_request_id')->nullable(); $t->string('checkout_request_id')->nullable(); $t->string('receipt_number')->nullable(); $t->json('callback_raw')->nullable(); $t->string('failure_reason')->nullable(); $t->json('tenders')->nullable(); $t->unsignedBigInteger('settled_voucher_id')->nullable(); $t->dateTime('confirmed_at')->nullable(); $t->dateTime('failed_at')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->text('notes')->nullable(); $t->timestamps(); });
        DB::table('payment_methods')->insert(['id' => 3, 'name' => 'M-Pesa', 'gateway' => 'mpesa_stk', 'is_online' => true, 'created_at' => now(), 'updated_at' => now()]);
        $this->admin(7);
        DB::table('customers')->insert(['id' => 4, 'user_id' => 7, 'email' => 'c@example.com', 'created_at' => now(), 'updated_at' => now()]);
    }

    /** The books stood in for: place saves two paired orders and one attempt; the callback settles them (or, when told, leaves the preorder unsettled). */
    private function books(bool $settleSecond = true): void
    {
        $checkout = \Mockery::mock(CheckoutService::class);
        $checkout->shouldReceive('quote')->andReturn(['total' => 300.0, 'parts' => [['kind' => 'ready', 'total' => 100.0], ['kind' => 'preorder', 'total' => 200.0]]]);
        $checkout->shouldReceive('place')->andReturnUsing(function () {
            DB::table('vouchers')->insert([
                ['id' => 1, 'voucher_number' => 'SO-1', 'total_amount' => 100.0, 'meta' => json_encode(['paired_order_id' => 2]), 'created_at' => now(), 'updated_at' => now()],
                ['id' => 2, 'voucher_number' => 'PRE-1', 'total_amount' => 200.0, 'meta' => json_encode(['paired_order_id' => 1]), 'created_at' => now(), 'updated_at' => now()],
            ]);
            PaymentAttempt::forceCreate(['id' => 9, 'voucher_id' => 1, 'amount' => 300.0, 'gateway_amount' => 300.0, 'merchant_request_id' => 'M', 'checkout_request_id' => 'C', 'payment_method_id' => 3]);

            return ['status' => 'awaiting_payment', 'orders' => [['id' => 1], ['id' => 2]], 'attempt' => ['id' => 9]];
        });
        $this->app->bind(CheckoutService::class, fn () => $checkout);

        $gateway = \Mockery::mock(GatewayPaymentService::class);
        $gateway->shouldReceive('handleCallback')->andReturnUsing(function ($parsed) use ($settleSecond) {
            $this->assertTrue($parsed['is_success'], 'the real callback parser read the callback as a success');
            $this->assertSame('SELFCHECK1', $parsed['receipt_number']);
            PaymentAttempt::find(9)->update(['status' => PaymentAttempt::CONFIRMED]);
            DB::table('vouchers')->insert(['id' => 11, 'source_voucher_id' => 1, 'status' => Voucher::POSTED, 'voucher_number' => 'CS-1', 'total_amount' => 100.0, 'created_at' => now(), 'updated_at' => now()]);
            if ($settleSecond) {
                DB::table('vouchers')->insert(['id' => 12, 'source_voucher_id' => 2, 'status' => Voucher::POSTED, 'voucher_number' => 'CS-2', 'total_amount' => 200.0, 'created_at' => now(), 'updated_at' => now()]);
            }

            return true;
        });
        $this->app->bind(GatewayPaymentService::class, fn () => $gateway);
    }

    private function run_(array $opts = []): \Illuminate\Testing\PendingCommand
    {
        return $this->artisan('checkout:selfcheck', $opts + ['--customer' => 4, '--ready' => 1, '--preorder' => 2, '--method' => 3]);
    }

    public function test_a_good_checkout_passes_and_nothing_is_kept(): void
    {
        $this->books();
        $this->run_()->expectsOutputToContain('All 14 checks passed.')->assertExitCode(0);
        $this->assertSame(0, DB::table('vouchers')->count(), 'everything the check placed was undone');
        $this->assertSame(0, DB::table('payment_attempts')->count());
    }

    public function test_an_order_left_unsettled_is_reported_as_a_failure_and_still_undone(): void
    {
        $this->books(false);
        $this->run_()->expectsOutputToContain('check(s) failed.')->assertExitCode(1);
        $this->assertSame(0, DB::table('vouchers')->count());
    }

    public function test_it_asks_for_what_it_needs_before_touching_anything(): void
    {
        $this->artisan('checkout:selfcheck')->expectsOutputToContain('Give --customer')->assertExitCode(2);
        $this->artisan('checkout:selfcheck', ['--customer' => 99, '--ready' => 1, '--preorder' => 2])->expectsOutputToContain('Give --customer')->assertExitCode(2);
    }
}

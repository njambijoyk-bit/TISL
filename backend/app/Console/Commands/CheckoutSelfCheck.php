<?php

namespace App\Console\Commands;

use App\Models\Books\PaymentAttempt;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Customer;
use App\Services\Books\CheckoutService;
use App\Services\Books\GatewayPaymentService;
use App\Services\Books\SelfCheck\FakeDaraja;
use App\Services\DarajaService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;

/**
 * Runs a real mixed checkout (a ready-now item and a preorder, paid by M-Pesa) through the real books of THIS database, with a pretend M-Pesa, and then
 * undoes everything. Nothing is saved, no message is sent and no M-Pesa prompt goes out. (Order and voucher numbers may skip a few: the database does not give those back.)
 */
class CheckoutSelfCheck extends Command
{
    protected $signature = 'checkout:selfcheck
        {--customer= : id of a customer who has a login}
        {--ready= : product id of an item that is in stock}
        {--preorder= : product id of an item with an open preorder offer}
        {--ready-variant= : variant id, when the ready item has several}
        {--preorder-variant= : variant id, when the preorder item has several}
        {--method= : payment method id (an automatic M-Pesa method); the first one offered at checkout when left out}';

    protected $description = 'Place a mixed ready-now + preorder checkout through the real books, pay it with a pretend M-Pesa, check both orders, then undo it all';

    /** @var array<int, array{0: bool, 1: string}> */
    private array $checks = [];

    private function check(bool $ok, string $what): bool
    {
        $this->checks[] = [$ok, $what];
        $this->line(($ok ? '  <info>PASS</info> ' : '  <error>FAIL</error> ') . $what);

        return $ok;
    }

    public function handle(): int
    {
        $customer = $this->option('customer') ? Customer::find((int) $this->option('customer')) : null;
        $user = $customer?->user;
        if (! $customer || ! $user || ! $this->option('ready') || ! $this->option('preorder')) {
            $this->error('Give --customer (a customer with a login), --ready (an in-stock product id) and --preorder (a product id with an open preorder offer).');

            return self::INVALID;
        }
        $method = $this->option('method') ? PaymentMethod::find((int) $this->option('method')) : PaymentMethod::offeredAtCheckout()->where('gateway', 'mpesa_stk')->first();
        if (! $method || $method->gateway !== 'mpesa_stk') {
            $this->error('No automatic M-Pesa payment method found (give --method).');

            return self::INVALID;
        }

        // nothing leaves the server: no queue jobs, no mail, no web requests, and the M-Pesa API is a stand-in
        Queue::fake();
        Mail::fake();
        Http::fake();
        app()->instance(DarajaService::class, new FakeDaraja);
        app()->forgetInstance(GatewayPaymentService::class);
        app()->forgetInstance(CheckoutService::class);

        $level = DB::transactionLevel();
        DB::beginTransaction();
        try {
            $this->runCheckout($customer, $user, $method);
        } catch (\Throwable $e) {
            $this->check(false, 'the checkout ran without an error: ' . $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')');
        } finally {
            while (DB::transactionLevel() > $level) {
                DB::rollBack();
            }
        }
        $failed = count(array_filter($this->checks, fn ($c) => ! $c[0]));
        $this->newLine();
        $this->line('Everything was undone: nothing was saved.');
        $failed ? $this->error("{$failed} check(s) failed.") : $this->info('All ' . count($this->checks) . ' checks passed.');

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function runCheckout(Customer $customer, $user, PaymentMethod $method): void
    {
        $item = fn ($id, $variant, $pre) => array_filter(['product_id' => (int) $id, 'variant_id' => $variant ? (int) $variant : null, 'quantity' => 1, 'preorder' => $pre], fn ($v) => $v !== null);
        $cart = [
            'items' => [$item($this->option('ready'), $this->option('ready-variant'), false), $item($this->option('preorder'), $this->option('preorder-variant'), true)],
            'together' => true, 'customer_email' => $customer->email ?? $user->email, 'customer_phone' => '0700000000', 'phone' => '0700000000',
            'shipping_address' => 'Self-check, Nairobi', 'payment_mode' => 'online', 'payment_method_id' => $method->id,
            'policy_acceptances' => [['key' => 'standard_order_policy', 'response' => 'accepted']],
        ];
        $checkout = app(CheckoutService::class);

        $this->line('Pricing the cart');
        $quote = $checkout->quote($cart, $user);
        $this->check(count($quote['parts'] ?? []) === 2, 'the quote has a ready-now part and a preorder part');
        $this->check(abs(array_sum(array_column($quote['parts'], 'total')) - (float) $quote['total']) < 0.01, 'the two parts add up to the total (' . $quote['total'] . ')');

        $this->line('Placing both orders');
        $res = $checkout->place($cart, $user);
        $this->check(($res['status'] ?? null) === 'awaiting_payment' && count($res['orders'] ?? []) === 2, 'two orders placed, waiting for one M-Pesa payment');
        $ready = Voucher::find($res['orders'][0]['id']);
        $pre = Voucher::find($res['orders'][1]['id']);
        $this->line("  ready-now {$ready->voucher_number}, preorder {$pre->voucher_number}");
        $this->check(($ready->meta['paired_order_id'] ?? null) === $pre->id && ($pre->meta['paired_order_id'] ?? null) === $ready->id, 'each order knows the other');
        $this->check(PaymentAttempt::whereIn('voucher_id', [$ready->id, $pre->id])->count() === 1, 'there is exactly one payment attempt');
        $attempt = PaymentAttempt::findOrFail($res['attempt']['id']);
        $this->check(abs((float) $attempt->amount - ((float) $ready->total_amount + (float) $pre->total_amount)) < 0.01, "the one payment asks for both totals ({$attempt->amount})");

        $this->line('M-Pesa confirms the payment');
        $raw = ['Body' => ['stkCallback' => ['MerchantRequestID' => $attempt->merchant_request_id, 'CheckoutRequestID' => $attempt->checkout_request_id, 'ResultCode' => 0, 'ResultDesc' => 'The service request is processed successfully.',
            'CallbackMetadata' => ['Item' => [['Name' => 'Amount', 'Value' => (float) $attempt->gateway_amount], ['Name' => 'MpesaReceiptNumber', 'Value' => 'SELFCHECK1'], ['Name' => 'PhoneNumber', 'Value' => 254700000000]]]]]];
        $gateway = app(GatewayPaymentService::class);
        $this->check($gateway->handleCallback(app(DarajaService::class)->parseCallback($raw), $raw) === true, 'the callback was accepted');

        $attempt->refresh();
        $this->check($attempt->status === PaymentAttempt::CONFIRMED, 'the payment is confirmed');
        $this->check(! str_contains((string) $attempt->notes, 'could not be settled'), 'no settlement problem is noted on the payment' . ($attempt->notes ? " (notes: {$attempt->notes})" : ''));
        $paid = 0.0;
        foreach ([$ready, $pre] as $order) {
            $sale = $order->children()->where('status', Voucher::POSTED)->first();
            $this->check((bool) $sale, "{$order->voucher_number} became a posted sale" . ($sale ? " ({$sale->voucher_number})" : ''));
            if ($sale) {
                $paid += (float) $sale->total_amount;
                $this->check(abs((float) $sale->total_amount - (float) $order->total_amount) < 0.01, "{$order->voucher_number}'s sale is for its own total ({$sale->total_amount})");
            }
        }
        $this->check(abs($paid - (float) $attempt->amount) < 0.01, 'the two sales together equal the one payment (nothing left unallocated)');
    }
}

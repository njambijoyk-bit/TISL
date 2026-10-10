<?php

namespace App\Services\Books;

use App\Models\Books\PaymentAttempt;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\User;
use App\Services\CurrencyConversionService;
use App\Services\DarajaService;
use App\Services\Payments\Gateways;
use App\Services\Payments\PaymentSettings;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Collecting money through a gateway. A gateway attempt is not an accounting event:
 * only when the gateway confirms does the order become a Cash Sale (or the payment
 * a Receipt against an invoice). M-Pesa can only charge in KES, so the amount is
 * converted for the gateway alone — the books keep the order's own currency.
 */
class GatewayPaymentService
{
    public const GATEWAY_CURRENCY = 'KES';   // a constraint of the M-Pesa API, not of the platform

    public function __construct(private DarajaService $daraja, private CurrencyConversionService $money) {}

    public function initiateMpesa(Voucher $voucher, PaymentMethod $method, string $phone, array $plannedTenders, float $due, ?User $user = null): PaymentAttempt
    {
        if ($due <= 0) {
            throw new BooksException('There is nothing to collect.');
        }
        if (trim($phone) === '') {
            throw new BooksException('Enter the M-Pesa phone number.');
        }
        $kes = $this->money->findByCode(self::GATEWAY_CURRENCY) ?? throw new BooksException('Add the ' . self::GATEWAY_CURRENCY . ' currency (with a rate) to accept M-Pesa.');
        $currency = $this->money->currencyFrom($voucher->currency_id);
        $gatewayAmount = (float) ceil($this->money->convert($due, $currency, $kes));
        try {
            $this->daraja->validateAmount($gatewayAmount);
            $phone = $this->daraja->normalizePhone($phone);
            $ref = 'PAY-' . $voucher->id . '-' . strtoupper(substr(md5(uniqid('', true)), 0, 6));
            $res = $this->daraja->stkPush($phone, $gatewayAmount, $ref, (string) $voucher->id);
        } catch (\InvalidArgumentException $e) {
            throw new BooksException($e->getMessage());
        } catch (\RuntimeException $e) {
            Log::error('Gateway: STK Push failed', ['error' => $e->getMessage()]);
            throw new BooksException('We could not send the M-Pesa prompt: ' . $e->getMessage());
        }

        return PaymentAttempt::create([
            'voucher_id' => $voucher->id, 'customer_id' => $voucher->customer_id, 'payment_method_id' => $method->id, 'gateway' => 'mpesa_stk',
            'status' => PaymentAttempt::PENDING, 'amount' => $due, 'currency_id' => $voucher->currency_id, 'gateway_amount' => $gatewayAmount,
            'gateway_currency' => self::GATEWAY_CURRENCY, 'phone' => $phone, 'merchant_request_id' => $res['MerchantRequestID'] ?? null,
            'checkout_request_id' => $res['CheckoutRequestID'] ?? null, 'tenders' => $plannedTenders, 'created_by' => $user?->id,
        ]);
    }

    /** Can the shop charge this method itself (an M-Pesa prompt or a card page), rather than the customer paying by their own means and staff confirming? */
    public static function isAutomatic(?PaymentMethod $m): bool
    {
        return $m && ($m->gateway === 'mpesa_stk' || Gateways::has((string) $m->gateway));
    }

    /**
     * Start a payment on whichever online method was chosen. An M-Pesa prompt goes to the phone (no redirect); a card provider gives a page to send the customer to.
     *
     * @param  array{phone?: ?string, email?: ?string, name?: ?string}  $contact
     * @return array{attempt: PaymentAttempt, redirect_url: ?string}
     */
    public function start(Voucher $voucher, PaymentMethod $method, array $contact, array $plannedTenders, float $due, ?User $user = null): array
    {
        if ($method->gateway === 'mpesa_stk') {
            return ['attempt' => $this->initiateMpesa($voucher, $method, (string) ($contact['phone'] ?? ''), $plannedTenders, $due, $user), 'redirect_url' => null];
        }
        if (Gateways::has((string) $method->gateway)) {
            return $this->initiateCard($voucher, $method, $contact, $plannedTenders, $due, $user);
        }

        throw new BooksException("{$method->name} can't be charged automatically yet — choose another way to pay.");
    }

    /** The code in the link a customer comes back with: proves the link is the one we made for this payment (no sign-in is needed to see how it went). */
    public static function returnToken(int $attemptId): string
    {
        return substr(hash_hmac('sha256', 'payment-return-' . $attemptId, (string) config('app.key')), 0, 32);
    }

    /** @return array{attempt: PaymentAttempt, redirect_url: ?string} */
    public function initiateCard(Voucher $voucher, PaymentMethod $method, array $contact, array $plannedTenders, float $due, ?User $user = null): array
    {
        if ($due <= 0) {
            throw new BooksException('There is nothing to collect.');
        }
        $gateway = Gateways::get((string) $method->gateway);
        $cfg = app(PaymentSettings::class)->get($gateway->key());
        if (empty($cfg['enabled']) || ! $gateway->configured($cfg)) {
            throw new BooksException("{$method->name} is not set up. Choose another way to pay.");
        }
        $currency = $this->money->currencyFrom($voucher->currency_id);
        $chargeCode = strtoupper((string) ($cfg['charge_currency'] ?: $currency->code));
        $chargeAmount = $due;
        if ($chargeCode !== strtoupper($currency->code)) {
            $to = $this->money->findByCode($chargeCode) ?? throw new BooksException("The currency {$chargeCode} is not set up here (Settings → Currency), so {$method->name} can not charge in it.");
            $chargeAmount = round((float) $this->money->convert($due, $currency, $to), 2);
        }
        $attempt = PaymentAttempt::create(['voucher_id' => $voucher->id, 'customer_id' => $voucher->customer_id, 'payment_method_id' => $method->id, 'gateway' => $gateway->key(), 'status' => PaymentAttempt::PENDING,
            'amount' => $due, 'currency_id' => $voucher->currency_id, 'gateway_amount' => $chargeAmount, 'gateway_currency' => $chargeCode, 'phone' => $contact['phone'] ?? null, 'tenders' => $plannedTenders, 'created_by' => $user?->id]);
        $attempt->merchant_request_id = 'TISL-' . $attempt->id . '-' . strtoupper(substr(md5(uniqid('', true)), 0, 6));   // our own reference: unique, and what the provider echoes back
        $front = rtrim((string) config('app.frontend_url'), '/') . '/payment/return?attempt=' . $attempt->id . '&t=' . self::returnToken($attempt->id);
        try {
            $r = $gateway->start($cfg, ['reference' => $attempt->merchant_request_id, 'amount' => $chargeAmount, 'currency' => $chargeCode, 'email' => $contact['email'] ?? null, 'phone' => $contact['phone'] ?? null,
                'name' => $contact['name'] ?? null, 'description' => 'Order ' . $voucher->voucher_number, 'return_url' => $front, 'cancel_url' => $front . '&cancelled=1',
                'webhook_url' => url('/api/payments/webhook/' . $gateway->key()), 'attempt_id' => (int) $attempt->id]);
        } catch (\Throwable $e) {
            Log::error('Gateway: card payment did not start', ['provider' => $gateway->key(), 'error' => $e->getMessage()]);
            $attempt->update(['status' => PaymentAttempt::FAILED, 'failed_at' => now(), 'failure_reason' => 'Could not start: ' . $e->getMessage()]);
            throw new BooksException('We could not start the card payment (' . $gateway->label() . '). Please try again or choose another way to pay.');
        }
        $attempt->update(['checkout_request_id' => $r['provider_ref'], 'callback_raw' => ['redirect_url' => $r['redirect_url']]]);

        return ['attempt' => $attempt->fresh(), 'redirect_url' => $r['redirect_url']];
    }

    /**
     * Ask the provider what happened and act on the answer: paid → confirmed and booked (only when it took what we asked for), failed → failed, anything else stays waiting.
     * Safe to call again and again (a webhook, the customer returning and a status check can all arrive together).
     */
    public function verifyCard(PaymentAttempt $attempt): PaymentAttempt
    {
        $gateway = Gateways::get((string) $attempt->gateway);
        $cfg = app(PaymentSettings::class)->get($gateway->key());
        if (! $gateway->configured($cfg)) {
            return $attempt;
        }
        $res = $gateway->verify($cfg, $attempt);
        if ($res['state'] === 'pending') {
            return $attempt;
        }
        DB::transaction(function () use ($attempt, $res) {
            $a = PaymentAttempt::whereKey($attempt->id)->lockForUpdate()->first();
            if (! $a || $a->status !== PaymentAttempt::PENDING) {
                return;
            }
            if ($res['state'] === 'failed') {
                $a->update(['status' => PaymentAttempt::FAILED, 'failed_at' => now(), 'failure_reason' => $res['reason'] ?: 'The payment did not go through.']);

                return;
            }
            $short = $res['amount'] !== null && $res['amount'] + 0.01 < (float) $a->gateway_amount;
            $other = $res['currency'] !== null && strtoupper((string) $a->gateway_currency) !== $res['currency'];
            if ($short || $other) {   // money arrived but not what was asked for: never book it automatically
                $a->update(['notes' => trim(($a->notes ? $a->notes . ' · ' : '') . "The provider reports {$res['amount']} {$res['currency']} paid, but {$a->gateway_amount} {$a->gateway_currency} was asked for: check it with the provider before booking.")]);
                Log::warning('Gateway: card payment amount mismatch', ['attempt' => $a->id, 'reported' => $res]);

                return;
            }
            $a->update(['status' => PaymentAttempt::CONFIRMED, 'receipt_number' => $res['receipt'], 'confirmed_at' => now()]);
            $this->settle($a);
        });

        return $attempt->fresh();
    }

    /** A call to our webhook for a card provider. False when it is not believable (the caller answers 400); true otherwise, whether or not it was about a payment we know. */
    public function handleWebhook(string $part, \Illuminate\Http\Request $request): bool
    {
        $gateway = Gateways::get($part);
        $cfg = app(PaymentSettings::class)->get($part);
        $ref = $gateway->parseWebhook($request, $cfg);
        if ($ref === null) {
            Log::warning('Gateway: webhook refused', ['provider' => $part, 'ip' => $request->ip()]);

            return false;
        }
        $attempt = PaymentAttempt::where('gateway', $part)->where(function ($q) use ($ref) {
            $q->when($ref['reference'], fn ($w) => $w->orWhere('merchant_request_id', $ref['reference']))->when($ref['provider_ref'], fn ($w) => $w->orWhere('checkout_request_id', $ref['provider_ref']));
        })->first();
        if ($attempt) {
            $this->verifyCard($attempt);   // never trust the call about the outcome: ask the provider
        }

        return true;
    }

    /**
     * Daraja called back. Returns true when the callback was for one of our attempts (so the
     * old payments handler should not also look for it).
     */
    public function handleCallback(array $parsed, array $raw): bool
    {
        $attempt = PaymentAttempt::where('checkout_request_id', $parsed['checkout_request_id'])->first();
        if (! $attempt) {
            return false;
        }
        if ($attempt->status === PaymentAttempt::CONFIRMED) {
            return true;
        }
        $verified = $parsed['is_success'] ? $this->daraja->verifyPaid($attempt->checkout_request_id) : null;

        DB::transaction(function () use ($attempt, $parsed, $raw, $verified) {
            $attempt = PaymentAttempt::whereKey($attempt->id)->lockForUpdate()->first();
            if ($attempt->status === PaymentAttempt::CONFIRMED) {
                return;
            }
            $base = ['callback_raw' => $raw, 'merchant_request_id' => $parsed['merchant_request_id'] ?: $attempt->merchant_request_id];
            if ($parsed['is_success'] && $verified === true) {
                $attempt->update($base + ['status' => PaymentAttempt::CONFIRMED, 'receipt_number' => $parsed['receipt_number'], 'confirmed_at' => now()]);
                $this->settle($attempt);
            } elseif ($parsed['is_success']) {
                $attempt->update($base + ['notes' => 'Callback said paid but Daraja could not confirm yet — use "check status".']);
            } else {
                $attempt->update($base + ['status' => PaymentAttempt::FAILED, 'failure_reason' => $parsed['result_desc'], 'failed_at' => now()]);
            }
        });

        return true;
    }

    /** Ask Daraja now (the customer says they paid but the callback never came). */
    public function refresh(PaymentAttempt $attempt): PaymentAttempt
    {
        if ($attempt->status === PaymentAttempt::PENDING && Gateways::has((string) $attempt->gateway)) {
            return $this->verifyCard($attempt);   // a card payment: ask the provider
        }
        if ($attempt->status !== PaymentAttempt::PENDING || ! $attempt->checkout_request_id) {
            return $attempt;
        }
        $verified = $this->daraja->verifyPaid($attempt->checkout_request_id);
        if ($verified === true) {
            DB::transaction(function () use ($attempt) {
                $a = PaymentAttempt::whereKey($attempt->id)->lockForUpdate()->first();
                if ($a->status === PaymentAttempt::PENDING) {
                    $a->update(['status' => PaymentAttempt::CONFIRMED, 'confirmed_at' => now(), 'notes' => 'Confirmed by status query']);
                    $this->settle($a);
                }
            });
        } elseif ($verified === false) {
            $attempt->update(['status' => PaymentAttempt::FAILED, 'failure_reason' => 'Not paid (cancelled, timed out or wrong PIN)', 'failed_at' => now()]);
        }

        return $attempt->fresh();
    }

    /** Tickets are issued once the money is in. A problem there must never undo a payment that has been received, so it is logged and noted on the attempt for staff. */
    private function issueTickets(Voucher $order, Voucher $sale, PaymentAttempt $attempt): void
    {
        try {
            $issuer = app(\App\Services\Events\TicketIssuer::class);
            if ($issuer->isEventOrder($order) && $issuer->orderPaid($order, $sale)['short']) {
                $attempt->update(['notes' => trim(($attempt->notes ? $attempt->notes . ' · ' : '') . 'The seats were gone when this payment arrived: a refund request was opened under Events.')]);
            }
        } catch (\Throwable $e) {
            Log::error('Gateway: tickets could not be issued after payment', ['attempt' => $attempt->id, 'order' => $order->id, 'error' => $e->getMessage()]);
            $attempt->update(['notes' => trim(($attempt->notes ? $attempt->notes . ' · ' : '') . "The payment is booked but the tickets could not be issued ({$e->getMessage()}): please check the event's tickets.")]);
        }
    }

    /** Money is in: the order becomes a Cash Sale, or the payment is a Receipt against the invoice. */
    private function settle(PaymentAttempt $attempt): void
    {
        $voucher = Voucher::with('type')->findOrFail($attempt->voucher_id);
        // a ready-now order and a preorder checked out together share ONE payment: the order paid here takes its own part, the other order the rest
        $paired = ! empty($voucher->meta['paired_order_id']) ? Voucher::with('type')->find($voucher->meta['paired_order_id']) : null;
        if ($paired && ($paired->status !== Voucher::POSTED || $paired->type?->base_type !== 'sales_order' || $paired->children()->where('status', Voucher::POSTED)->exists())) {
            $attempt->update(['notes' => trim(($attempt->notes ? $attempt->notes . ' · ' : '') . "The paired order {$paired->voucher_number} could not be settled with this payment (cancelled, or already paid): the rest of it is unallocated, please check.")]);
            $paired = null;
        }
        $own = $paired ? round((float) $attempt->amount - (float) $paired->total_amount, 2) : (float) $attempt->amount;
        $tenders = array_merge($attempt->tenders ?? [], [[
            'payment_method_id' => $attempt->payment_method_id, 'amount' => $own, 'reference' => $attempt->receipt_number,
        ]]);
        $vouchers = app(VoucherService::class);
        if ($voucher->type->base_type === 'sales') {
            $receipt = $vouchers->receive($voucher, ['tenders' => $tenders, 'amount' => (float) $attempt->amount + array_sum(array_column($attempt->tenders ?? [], 'amount')), 'reference_no' => $attempt->receipt_number, 'channel' => 'storefront'], null);
            $attempt->update(['settled_voucher_id' => $receipt->id]);
            app(\App\Services\Notify\OrderNotices::class)->invoicePaid($voucher, $receipt);

            return;
        }
        $sale = app(CheckoutService::class)->settle($voucher, $tenders, null);
        $attempt->update(['settled_voucher_id' => $sale->id]);
        $this->issueTickets($voucher, $sale, $attempt);   // an order for event tickets: the tickets become valid now
        if ($paired) {
            // The money has arrived and the first order is settled: a problem with the second must not undo that (the whole callback would roll back and the payment be lost). Staff finish it by hand.
            try {
                DB::transaction(fn () => app(CheckoutService::class)->settle($paired, [['payment_method_id' => $attempt->payment_method_id, 'amount' => (float) $paired->total_amount, 'reference' => $attempt->receipt_number]], null));
            } catch (\Throwable $e) {
                Log::error('Gateway: the paired order could not be settled', ['attempt' => $attempt->id, 'paired' => $paired->id, 'error' => $e->getMessage()]);
                $attempt->update(['notes' => trim(($attempt->notes ? $attempt->notes . ' · ' : '') . "The paired order {$paired->voucher_number} could not be settled with this payment ({$e->getMessage()}): its part is unallocated, please settle it by hand.")]);
            }
        }
    }
}

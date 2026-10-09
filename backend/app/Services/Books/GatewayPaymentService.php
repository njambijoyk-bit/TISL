<?php

namespace App\Services\Books;

use App\Models\Books\PaymentAttempt;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\User;
use App\Services\CurrencyConversionService;
use App\Services\DarajaService;
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
        if ($paired) {
            app(CheckoutService::class)->settle($paired, [['payment_method_id' => $attempt->payment_method_id, 'amount' => (float) $paired->total_amount, 'reference' => $attempt->receipt_number]], null);
        }
    }
}

<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class DarajaService
{
    private string $baseUrl;
    private string $consumerKey;
    private string $consumerSecret;
    private string $businessShortCode;
    private string $passkey;
    private string $callbackUrl;
    private string $accountReference;
    private string $transactionDesc;

    public function __construct()
    {
        $this->baseUrl           = config('daraja.env') === 'production'
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';

        $this->consumerKey       = config('daraja.consumer_key');
        $this->consumerSecret    = config('daraja.consumer_secret');
        $this->businessShortCode = config('daraja.shortcode');
        $this->passkey           = config('daraja.passkey');
        $this->callbackUrl       = config('daraja.callback_url');
        $this->accountReference  = config('daraja.account_reference', 'TISL');
        $this->transactionDesc   = config('daraja.transaction_desc', 'Order Payment');
    }

    // =========================================================================
    // ACCESS TOKEN
    // Cached for 55 minutes (token valid for 60).
    // =========================================================================

    public function getAccessToken(): string
    {
        return Cache::remember('daraja_access_token', 55 * 60, function () {
            $response = Http::withBasicAuth($this->consumerKey, $this->consumerSecret)
                ->timeout(30)
                ->get("{$this->baseUrl}/oauth/v1/generate", ['grant_type' => 'client_credentials']);

            if (!$response->successful()) {
                Log::error('Daraja: Failed to get access token', [
                    'status'   => $response->status(),
                    'body'     => $response->body(),
                ]);
                throw new \RuntimeException('Daraja authentication failed. Check consumer key/secret.');
            }

            $token = $response->json('access_token');

            if (!$token) {
                throw new \RuntimeException('Daraja returned empty access token.');
            }

            return $token;
        });
    }

    // =========================================================================
    // STK PUSH
    // Returns the full Daraja response array on success.
    // Throws RuntimeException on failure — caller handles try/catch.
    // =========================================================================

    public function stkPush(
        string $phone,
        float  $amount,
        string $paymentNumber,  // Our internal PAY-XXXX reference stored in AccountReference
        string $orderId,        // For logging context only
    ): array {
        $token     = $this->getAccessToken();
        $timestamp = now()->format('YmdHis');
        $password  = base64_encode($this->businessShortCode . $this->passkey . $timestamp);

        // Daraja requires whole numbers — round up, never down
        $amountInt = (int) ceil($amount);

        // Normalize phone: strip leading 0, ensure 254 prefix
        $phone = $this->normalizePhone($phone);

        $payload = [
            'BusinessShortCode' => $this->businessShortCode,
            'Password'          => $password,
            'Timestamp'         => $timestamp,
            'TransactionType'   => 'CustomerPayBillOnline',
            'Amount'            => $amountInt,
            'PartyA'            => $phone,
            'PartyB'            => $this->businessShortCode,
            'PhoneNumber'       => $phone,
            'CallBackURL'       => $this->callbackUrl,
            'AccountReference'  => $paymentNumber,      // PAY-2025-42-001
            'TransactionDesc'   => $this->transactionDesc,
        ];

        Log::info('Daraja: Initiating STK Push', [
            'order_id'       => $orderId,
            'payment_number' => $paymentNumber,
            'phone'          => $phone,
            'amount'         => $amountInt,
        ]);

        $response = Http::withToken($token)
            ->timeout(30)
            ->post("{$this->baseUrl}/mpesa/stkpush/v1/processrequest", $payload);

        $data = $response->json();

        Log::info('Daraja: STK Push response', [
            'order_id'       => $orderId,
            'payment_number' => $paymentNumber,
            'response'       => $data,
        ]);

        if (!$response->successful()) {
            throw new \RuntimeException(
                'Daraja STK Push request failed: ' . ($data['errorMessage'] ?? $response->body())
            );
        }

        // ResponseCode '0' means request accepted (not payment confirmed)
        if (($data['ResponseCode'] ?? '') !== '0') {
            throw new \RuntimeException(
                'Daraja rejected the STK Push: ' . ($data['ResponseDescription'] ?? 'Unknown error')
            );
        }

        return $data;
        // Caller stores: $data['MerchantRequestID'] and $data['CheckoutRequestID']
    }

    // =========================================================================
    // PARSE CALLBACK
    // Takes the raw request body from Daraja and returns a clean structured array.
    // Always call this in the callback controller — never read raw body directly.
    // =========================================================================

    public function parseCallback(array $rawBody): array
    {
        $stkCallback = $rawBody['Body']['stkCallback'] ?? null;

        if (!$stkCallback) {
            throw new \RuntimeException('Invalid callback structure: missing stkCallback body.');
        }

        $resultCode        = (int)    ($stkCallback['ResultCode']        ?? -1);
        $resultDesc        = (string) ($stkCallback['ResultDesc']        ?? '');
        $merchantRequestId = (string) ($stkCallback['MerchantRequestID'] ?? '');
        $checkoutRequestId = (string) ($stkCallback['CheckoutRequestID'] ?? '');
        $isSuccess         = $resultCode === 0;

        $parsed = [
            'is_success'          => $isSuccess,
            'result_code'         => $resultCode,
            'result_desc'         => $resultDesc,
            'merchant_request_id' => $merchantRequestId,
            'checkout_request_id' => $checkoutRequestId,
            'receipt_number'      => null,
            'transaction_date'    => null,
            'phone_confirmed'     => null,
            'amount_confirmed'    => null,
        ];

        if ($isSuccess) {
            $items = collect($stkCallback['CallbackMetadata']['Item'] ?? []);

            $parsed['receipt_number']   = $items->firstWhere('Name', 'MpesaReceiptNumber')['Value'] ?? null;
            $parsed['amount_confirmed'] = (float) ($items->firstWhere('Name', 'Amount')['Value'] ?? 0);
            $parsed['phone_confirmed']  = (string) ($items->firstWhere('Name', 'PhoneNumber')['Value'] ?? '');

            // Daraja sends TransactionDate as YYYYMMDDHHmmss integer e.g. 20250315143022
            $rawDate = $items->firstWhere('Name', 'TransactionDate')['Value'] ?? null;
            if ($rawDate) {
                try {
                    $parsed['transaction_date'] = \Carbon\Carbon::createFromFormat('YmdHis', (string) $rawDate);
                } catch (\Exception $e) {
                    $parsed['transaction_date'] = null;
                    Log::warning('Daraja: Could not parse TransactionDate', ['raw' => $rawDate]);
                }
            }
        }

        return $parsed;
    }

    // =========================================================================
    // STK PUSH QUERY
    // Use this to manually check payment status if callback never arrives.
    // Useful for finance portal "Check Status" button.
    // =========================================================================

    public function queryStatus(string $checkoutRequestId): array
    {
        $token     = $this->getAccessToken();
        $timestamp = now()->format('YmdHis');
        $password  = base64_encode($this->businessShortCode . $this->passkey . $timestamp);

        $response = Http::withToken($token)
            ->timeout(30)
            ->post("{$this->baseUrl}/mpesa/stkpushquery/v1/query", [
                'BusinessShortCode' => $this->businessShortCode,
                'Password'          => $password,
                'Timestamp'         => $timestamp,
                'CheckoutRequestID' => $checkoutRequestId,
            ]);

        $data = $response->json();

        Log::info('Daraja: STK Query response', [
            'checkout_request_id' => $checkoutRequestId,
            'response'            => $data,
        ]);

        return $data;
    }

    // =========================================================================
    // PHONE NORMALIZER
    // Accepts: 07XXXXXXXX, 7XXXXXXXX, 2547XXXXXXXX, +2547XXXXXXXX
    // Returns: 2547XXXXXXXX
    // =========================================================================

    public function normalizePhone(string $phone): string
    {
        $phone = preg_replace('/\D/', '', $phone); // strip non-digits

        if (str_starts_with($phone, '0')) {
            $phone = '254' . substr($phone, 1);
        } elseif (str_starts_with($phone, '+254')) {
            $phone = substr($phone, 1); // strip the +
        } elseif (str_starts_with($phone, '7') || str_starts_with($phone, '1')) {
            $phone = '254' . $phone;
        }

        if (strlen($phone) !== 12) {
            throw new \InvalidArgumentException("Invalid Kenyan phone number: {$phone}");
        }

        return $phone;
    }

    // =========================================================================
    // VALIDATE AMOUNT
    // Daraja minimum is KSh 10. Throws on violation.
    // =========================================================================

    public function validateAmount(float $amount): void
    {
        if ($amount < 10) {
            throw new \InvalidArgumentException("Payment amount must be at least KSh 10. Got: {$amount}");
        }

        if ($amount > 150000) {
            throw new \InvalidArgumentException("Payment amount exceeds Daraja single-transaction limit of KSh 150,000.");
        }
    }
}
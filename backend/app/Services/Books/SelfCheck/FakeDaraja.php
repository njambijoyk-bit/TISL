<?php

namespace App\Services\Books\SelfCheck;

use App\Services\DarajaService;

/** M-Pesa stand-in for `checkout:selfcheck`: no prompt is sent and no request leaves the server; the real phone and amount checks and callback parsing still run. */
class FakeDaraja extends DarajaService
{
    public function __construct()
    {
        // no keys needed: nothing here talks to Safaricom
    }

    public function stkPush(string $phone, float $amount, string $paymentNumber, string $orderId): array
    {
        return ['MerchantRequestID' => 'SELFCHECK-M-' . $orderId, 'CheckoutRequestID' => 'SELFCHECK-C-' . $orderId, 'ResponseCode' => '0'];
    }

    public function verifyPaid(string $checkoutRequestId): ?bool
    {
        return true;
    }
}

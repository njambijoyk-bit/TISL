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

    private int $n = 0;

    public function stkPush(string $phone, float $amount, string $paymentNumber, string $orderId): array
    {
        $this->n++;   // each prompt has its own id, as the real thing has (a deposit and then its balance are two prompts on one invoice)

        return ['MerchantRequestID' => 'SELFCHECK-M-' . $orderId . '-' . $this->n, 'CheckoutRequestID' => 'SELFCHECK-C-' . $orderId . '-' . $this->n, 'ResponseCode' => '0'];
    }

    public function verifyPaid(string $checkoutRequestId): ?bool
    {
        return true;
    }
}

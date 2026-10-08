<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\GatewayPaymentService;
use App\Services\DarajaService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * The one public door for the M-Pesa gateway: Daraja calls back here when a customer has paid or not.
 * The payment attempts themselves are made and settled by the books (checkout and GatewayPaymentService).
 */
class PaymentController extends Controller
{
    public function __construct(private DarajaService $daraja) {}

    /** Daraja hits this directly, so it always answers "Accepted" (otherwise Safaricom retries). */
    public function callback(Request $request)
    {
        $accepted = response()->json(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
        $rawBody  = $request->all();

        $expectedToken = (string) config('daraja.callback_token');
        if ($expectedToken !== '' && ! hash_equals($expectedToken, (string) $request->query('token', ''))) {
            Log::warning('Daraja: Callback rejected — missing or wrong token', ['ip' => $request->ip()]);

            return $accepted;
        }

        Log::info('Daraja: Callback received', ['body' => $rawBody, 'ip' => $request->ip()]);

        try {
            $parsed = $this->daraja->parseCallback($rawBody);
        } catch (\Exception $e) {
            Log::error('Daraja: Callback parse failed', ['error' => $e->getMessage(), 'body' => $rawBody]);

            return $accepted;
        }

        // A checkout attempt: settles its Sales Order into a Cash Sale
        if (! app(GatewayPaymentService::class)->handleCallback($parsed, $rawBody)) {
            Log::warning('Daraja: Callback received for unknown CheckoutRequestID', ['checkout_request_id' => $parsed['checkout_request_id'] ?? null]);
        }

        return $accepted;
    }
}

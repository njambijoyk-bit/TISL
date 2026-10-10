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

        if (! \App\Services\Payments\PaymentSettings::callbackTokenValid((string) $request->query('token', ''))) {   // the current token, or the one before it for two hours after a change
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

    /**
     * A card provider calls this when something happens to a payment. It is public, so nothing in it is taken on trust: the provider's signature is checked
     * (where the provider signs), and then the provider is asked what really happened. An unbelievable call is refused with 400; anything else is answered the way
     * that provider expects, so it stops retrying.
     */
    public function webhook(Request $request, string $provider)
    {
        abort_unless(\App\Services\Payments\Gateways::has($provider), 404);
        try {
            $ok = app(GatewayPaymentService::class)->handleWebhook($provider, $request);
        } catch (\Throwable $e) {
            Log::error('Gateway: webhook failed', ['provider' => $provider, 'error' => $e->getMessage()]);

            return response()->json(['received' => false], 500);   // a real failure on our side: let the provider try again
        }

        return $ok ? response()->json(\App\Services\Payments\Gateways::get($provider)->ack($request)) : response()->json(['received' => false], 400);
    }

    /**
     * Where the customer lands after the provider's page: how the payment went. The link carries a code that only we can make, so no sign-in is needed (they may be
     * a guest, or on another device). ?check=1 asks the provider now instead of waiting for the webhook.
     */
    public function attemptStatus(Request $request, int $id)
    {
        $a = \App\Models\Books\PaymentAttempt::findOrFail($id);
        abort_unless(hash_equals(GatewayPaymentService::returnToken((int) $a->id), (string) $request->query('t', '')), 404);
        if ($request->boolean('check')) {
            $a = app(GatewayPaymentService::class)->refresh($a);
        }
        $order = \App\Models\Books\Voucher::find($a->voucher_id);

        return response()->json(['id' => $a->id, 'status' => $a->status, 'failure_reason' => $a->failure_reason, 'receipt' => $a->receipt_number, 'order_number' => $order?->voucher_number,
            'amount' => (float) $a->amount, 'gateway' => $a->gateway]);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Payment;
use App\Services\DarajaService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class PaymentController extends Controller
{
    public function __construct(private DarajaService $daraja) {}

    // =========================================================================
    // INDEX — Finance / Admin / SuperAdmin list all payments
    // =========================================================================

    public function index(Request $request)
    {
        $this->authorize('viewAny', Payment::class);

        $query = Payment::with([
            'order:id,order_number,total,total_kes,payment_status',
            'customer:id,first_name,last_name,email,phone',
            'initiatedBy:id,name'
        ])->latest('created_at');

        if ($request->filled('order_id'))       $query->where('order_id', $request->order_id);
        if ($request->filled('status'))         $query->where('status', $request->status);
        if ($request->filled('dispute_status')) $query->where('dispute_status', $request->dispute_status);
        if ($request->filled('method'))         $query->where('method', $request->method);
        if ($request->filled('from_date'))      $query->whereDate('created_at', '>=', $request->from_date);
        if ($request->filled('to_date'))        $query->whereDate('created_at', '<=', $request->to_date);

        if ($request->user()->role === 'finance') {
            $query->where('initiated_by', $request->user()->id);
        }

        $payments = $query->paginate($request->get('per_page', 20));

        return response()->json([
            'data' => $payments->items(),
            'meta' => [
                'current_page' => $payments->currentPage(),
                'last_page'    => $payments->lastPage(),
                'per_page'     => $payments->perPage(),
                'total'        => $payments->total(),
            ],
        ]);
    }

    // =========================================================================
    // SHOW — single payment detail
    // =========================================================================

    public function show(Request $request, Payment $payment)
    {
        $this->authorize('view', $payment);

        $payment->load([
            'order', 'customer', 'initiatedBy',
            'previousPayment', 'disputeRaisedBy', 'disputeResolvedBy'
        ]);

        return response()->json(['payment' => $payment]);
    }

    // =========================================================================
    // INITIATE STK PUSH
    // POST /admin/payments/initiate
    // =========================================================================

    public function initiate(Request $request)
    {
        $this->authorize('create', Payment::class);

        $validator = Validator::make($request->all(), [
            'order_id'              => 'required|exists:orders,id',
            'phone_override'        => 'nullable|string',
            'phone_override_reason' => 'nullable|string|max:255',
            'notes'                 => 'nullable|string|max:1000',
            'is_partial'            => 'nullable|boolean',
            'partial_amount'        => 'nullable|numeric|min:10',
            'force_override'        => 'nullable|boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        DB::beginTransaction();
        try {
            $order = Order::with('customer')->findOrFail($request->order_id);

            $forceOverride = $request->boolean('force_override');

            // ── Guards ────────────────────────────────────────────────────

            if (in_array($order->status, ['cancelled', 'failed'])) {
                return response()->json([
                    'message' => "Cannot request payment: order status is '{$order->status}'.",
                    'order_status' => $order->status,
                    'hint' => 'Restore or recreate the order first.',
                ], 400);
            }

            if (in_array($order->payment_status, ['paid', 'refunded']) && !$forceOverride) {
                return response()->json([
                    'message' => "Order payment is already '{$order->payment_status}'.",
                    'hint' => 'Use force_override=true to request payment anyway.',
                ], 400);
            }

            $snapshot = Payment::buildSnapshot($order);
            if ($snapshot['snapshot_amount_still_owed_kes'] <= 0 && !$forceOverride) {
                return response()->json([
                    'message' => 'No outstanding balance to collect.',
                    'hint' => 'Use force_override=true to request payment with zero balance.',
                ], 400);
            }

            $existingPending = Payment::where('order_id', $order->id)->where('status', 'pending')->first();

            if ($existingPending) {
                return response()->json([
                    'message' => 'A payment request is already awaiting customer response.',
                    'pending_payment_id' => $existingPending->id,
                    'hint' => 'Cancel the pending request before sending a new one.',
                ], 400);
            }

            // ── Resolve amount ────────────────────────────────────────────
            $isPartial = (bool) ($request->is_partial ?? false);
            $amount = $isPartial && $request->filled('partial_amount')
                ? min((float) $request->partial_amount, $snapshot['snapshot_amount_still_owed_kes'])
                : $snapshot['snapshot_amount_still_owed_kes'];

            $this->daraja->validateAmount($amount);

            // ── Resolve phone ───────────────────────────────────────────────
            $customerPhone = $order->customer->phone;
            $phoneOverridden = false;
            $overrideReason = null;

            if ($request->filled('phone_override') && $request->phone_override !== $customerPhone) {
                if (!$request->filled('phone_override_reason')) {
                    return response()->json(['message' => 'Phone override reason is required.'], 422);
                }
                $phoneOverridden = true;
                $overrideReason = $request->phone_override_reason;
                $phone = $request->phone_override;
            } else {
                $phone = $customerPhone;
            }
            $phone = $this->daraja->normalizePhone($phone);

            // ── Fire STK Push ───────────────────────────────────────────────
            $paymentNumber = Payment::generatePaymentNumber($order->id, 'regular');
            $darajaResponse = $this->daraja->stkPush($phone, $amount, $paymentNumber, (string) $order->id);

            // ── Create payment record ───────────────────────────────────────
            $paymentData = [
                'customer_id'                 => $order->customer_id,
                'initiated_by'                => $request->user()->id,
                'payment_number'              => $paymentNumber,
                'method'                      => 'mpesa',
                'status'                      => 'pending',
                'currency'                    => $order->currency ?? 'KES',
                'exchange_rate_to_kes'        => $order->exchange_rate_to_kes ?? 1,
                'amount_expected'             => $amount,
                'amount_received'             => 0,
                'is_partial'                  => $isPartial,
                ...$snapshot,
                'phone_number'                => $phone,
                'phone_overridden'            => $phoneOverridden,
                'phone_override_reason'       => $overrideReason,
                'merchant_request_id'         => $darajaResponse['MerchantRequestID'],
                'checkout_request_id'         => $darajaResponse['CheckoutRequestID'],
                'notes'                       => $request->notes,
                'is_retry'                    => false,
                'retry_count'                 => 0,
                'dispute_status'              => 'none',
                'initiated_at'                => now(),
            ];

            $paymentData['order_id'] = $order->id;

            $payment = Payment::create($paymentData);

            DB::commit();

            Log::info('Payment: STK Push initiated', [
                'payment_id' => $payment->id,
                'order_id' => $order->id,
                'amount' => $amount,
            ]);

            return response()->json([
                'message' => 'Payment request sent to customer phone.',
                'payment_id' => $payment->id,
                'payment_number' => $paymentNumber,
                'status' => 'pending',
                'order_type' => 'regular',
            ], 201);

        } catch (\InvalidArgumentException $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            DB::rollBack();
            Log::error('Payment: STK Push failed', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'Failed to send payment request.'], 502);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Payment: Unexpected error', ['error' => $e->getMessage()]);
            return response()->json(['message' => 'An unexpected error occurred.'], 500);
        }
    }

    // =========================================================================
    // DARAJA CALLBACK
    //
    // The callback body is never trusted on its own:
    //  - optional shared token in the URL (DARAJA_CALLBACK_TOKEN)
    //  - a "success" callback only confirms the payment after Daraja's own
    //    STK query agrees it was paid
    //  - the amount recorded is the amount we pushed, not the amount posted
    //  - the payment row is locked so duplicate callbacks can't double-process
    // Always answers "Accepted" so Safaricom doesn't retry.
    // =========================================================================

    public function callback(Request $request)
    {
        $accepted = response()->json(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
        $rawBody  = $request->all();

        $expectedToken = (string) config('daraja.callback_token');
        if ($expectedToken !== '' && !hash_equals($expectedToken, (string) $request->query('token', ''))) {
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

        $payment = Payment::where('checkout_request_id', $parsed['checkout_request_id'])->first();

        if (!$payment) {
            Log::warning('Daraja: Callback received for unknown CheckoutRequestID', [
                'checkout_request_id' => $parsed['checkout_request_id'],
            ]);
            return $accepted;
        }

        if ($payment->isConfirmed()) {
            Log::info('Daraja: Duplicate callback for already-confirmed payment', ['payment_id' => $payment->id]);
            return $accepted;
        }

        // Ask Daraja before touching the payment (outside the transaction: it's an HTTP call)
        $verified = $parsed['is_success']
            ? $this->daraja->verifyPaid($payment->checkout_request_id)
            : null;

        DB::beginTransaction();
        try {
            $payment = Payment::whereKey($payment->id)->lockForUpdate()->first();

            if ($payment->isConfirmed()) {
                DB::rollBack();
                return $accepted;
            }

            $callbackFields = [
                'callback_raw'          => $rawBody,
                'callback_received_at'  => now(),
                'callback_result_code'  => $parsed['result_code'],
                'callback_result_desc'  => $parsed['result_desc'],
                'merchant_request_id'   => $parsed['merchant_request_id'] ?: $payment->merchant_request_id,
            ];

            if ($parsed['is_success'] && $verified === true) {
                $this->confirmVerifiedPayment($payment, $parsed, $callbackFields, 'callback');

            } elseif ($parsed['is_success']) {
                // Claimed success that Daraja did not confirm (false) or could not confirm yet (null).
                // Keep it pending; the admin "Query Daraja" action finishes it once Daraja agrees.
                $payment->update(array_merge($callbackFields, [
                    'admin_notes' => $this->appendNote(
                        $payment->admin_notes,
                        $verified === false
                            ? 'Callback reported success but Daraja STK query says NOT paid. Left pending — investigate.'
                            : 'Callback reported success; Daraja could not confirm yet. Left pending — use "Query Daraja".'
                    ),
                ]));

                Log::warning('Daraja: Success callback not verified', [
                    'payment_id' => $payment->id,
                    'verified'   => $verified,
                    'ip'         => $request->ip(),
                ]);

            } else {
                $payment->update(array_merge($callbackFields, [
                    'status'         => 'failed',
                    'failure_reason' => $parsed['result_desc'],
                    'failed_at'      => now(),
                ]));

                Log::info('Payment: Failed via callback', [
                    'payment_id'  => $payment->id,
                    'result_code' => $parsed['result_code'],
                    'result_desc' => $parsed['result_desc'],
                ]);
            }

            DB::commit();

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Daraja: Callback DB processing failed', [
                'error'   => $e->getMessage(),
                'payload' => $rawBody,
            ]);
        }

        return $accepted;
    }

    /**
     * Mark a payment confirmed after Daraja's STK query said it was paid.
     * Call inside a transaction with the payment row locked.
     */
    private function confirmVerifiedPayment(Payment $payment, array $parsed, array $extraFields, string $source): void
    {
        // An STK push can only be paid in full, for exactly the amount we pushed.
        $pushedAmount  = (float) ceil((float) $payment->amount_expected);
        $claimedAmount = (float) ($parsed['amount_confirmed'] ?? 0);

        if ($claimedAmount > 0 && abs($claimedAmount - $pushedAmount) > 0.001) {
            Log::warning('Daraja: Callback amount differs from pushed amount — using pushed amount', [
                'payment_id' => $payment->id,
                'pushed'     => $pushedAmount,
                'claimed'    => $claimedAmount,
            ]);
        }

        $payment->update(array_merge($extraFields, [
            'status'                 => 'confirmed',
            'amount_received'        => $pushedAmount,
            'mpesa_receipt_number'   => $parsed['receipt_number'],
            'mpesa_transaction_date' => $parsed['transaction_date'],
            'mpesa_phone_confirmed'  => $parsed['phone_confirmed'],
            'mpesa_amount_confirmed' => $pushedAmount,
            'confirmed_at'           => now(),
        ]));

        $payment->refresh();
        $payment->syncOrderPaymentStatus();

        Log::info('Payment: Confirmed (verified with Daraja)', [
            'payment_id'     => $payment->id,
            'payment_number' => $payment->payment_number,
            'receipt'        => $parsed['receipt_number'],
            'amount'         => $pushedAmount,
            'source'         => $source,
        ]);
    }

    private function appendNote(?string $notes, string $note): string
    {
        return ($notes ? $notes . "\n\n" : '') . '[' . now()->format('Y-m-d H:i:s') . '] ' . $note;
    }

    // =========================================================================
    // STATUS POLL — unchanged
    // =========================================================================

    public function status(Request $request, Payment $payment)
    {
        $this->authorize('view', $payment);

        return response()->json([
            'payment_id'             => $payment->id,
            'payment_number'         => $payment->payment_number,
            'status'                 => $payment->status,
            'amount_expected'        => $payment->amount_expected,
            'amount_received'        => $payment->amount_received,
            'mpesa_receipt_number'   => $payment->mpesa_receipt_number,
            'mpesa_amount_confirmed' => $payment->mpesa_amount_confirmed,
            'failure_reason'         => $payment->failure_reason,
            'confirmed_at'             => $payment->confirmed_at,
            'failed_at'                => $payment->failed_at,
            'order_payment_status'     => $payment->parentOrder()?->payment_status ?? null,
        ]);
    }

    // =========================================================================
    // MANUAL STATUS QUERY — also finishes a pending payment Daraja reports as paid
    // =========================================================================

    public function queryDaraja(Request $request, Payment $payment)
    {
        $this->authorize('view', $payment);

        if (!$payment->isPending()) {
            return response()->json([
                'message' => 'Only pending payments can be queried.',
                'status'  => $payment->status,
            ], 400);
        }

        try {
            $result = $this->daraja->queryStatus($payment->checkout_request_id);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Daraja query failed.',
                'error'   => $e->getMessage(),
            ], 502);
        }

        $paid = array_key_exists('ResultCode', $result) && (string) $result['ResultCode'] === '0';

        // Daraja says paid and we already hold its success callback: finish the payment now.
        if ($paid && !empty($payment->callback_raw)) {
            try {
                $parsed = $this->daraja->parseCallback($payment->callback_raw);

                if ($parsed['is_success'] && $parsed['checkout_request_id'] === $payment->checkout_request_id) {
                    DB::transaction(function () use ($payment, $parsed, $request) {
                        $locked = Payment::whereKey($payment->id)->lockForUpdate()->first();
                        if ($locked->isPending()) {
                            $this->confirmVerifiedPayment($locked, $parsed, [
                                'admin_notes' => $this->appendNote(
                                    $locked->admin_notes,
                                    'Confirmed via Daraja query by ' . $request->user()->name . '.'
                                ),
                            ], 'manual_query');
                        }
                    });
                }
            } catch (\Throwable $e) {
                Log::error('Daraja: Manual confirmation failed', ['payment_id' => $payment->id, 'error' => $e->getMessage()]);
            }
        }

        return response()->json([
            'message'        => 'Daraja query returned.',
            'daraja_result'  => $result,
            'payment_status' => $payment->fresh()->status,
            'hint'           => $paid && empty($payment->callback_raw)
                ? 'Daraja says paid, but the callback has not arrived yet. Query again shortly.'
                : 'If ResultCode is 0 the payment is confirmed. 1032 means the customer cancelled.',
        ]);
    }

    // =========================================================================
    // CANCEL PENDING PUSH — unchanged
    // =========================================================================

    public function cancel(Request $request, Payment $payment)
    {
        $this->authorize('cancel', $payment);

        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $payment->update([
            'status'         => 'cancelled',
            'failure_reason' => $request->reason,
            'cancelled_at'   => now(),
            'admin_notes'    => ($payment->admin_notes ? $payment->admin_notes . "\\n\\n" : '')
                . '[CANCELLED by ' . $request->user()->name . ' on ' . now()->format('Y-m-d H:i:s') . '] '
                . $request->reason,
        ]);

        Log::info('Payment: Pending push cancelled', [
            'payment_id'  => $payment->id,
            'cancelled_by'=> $request->user()->id,
            'reason'      => $request->reason,
        ]);

        return response()->json([
            'message' => 'Payment request cancelled.',
            'payment' => $payment->fresh(),
        ]);
    }

    // =========================================================================
    // RETRY — polymorphic
    // =========================================================================

    public function retry(Request $request, Payment $payment)
    {
        $this->authorize('retry', $payment);

        $validator = Validator::make($request->all(), [
            'phone_override'        => 'nullable|string',
            'phone_override_reason' => 'nullable|string|max:255',
            'notes'                 => 'nullable|string|max:1000',
            'is_partial'            => 'nullable|boolean',
            'partial_amount'        => 'nullable|numeric|min:10',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $order = $payment->parentOrder();
        if (!$order) {
            return response()->json(['message' => 'Parent order not found.'], 404);
        }

        $existingPending = Payment::where('order_id', $order->id)
            ->where('status', 'pending')->where('id', '!=', $payment->id)->first();

        if ($existingPending) {
            return response()->json([
                'message'            => 'Another payment request is already pending for this order.',
                'pending_payment_id' => $existingPending->id,
            ], 400);
        }

        DB::beginTransaction();
        try {
            $snapshot = Payment::buildSnapshot($order);

            if ($snapshot['snapshot_amount_still_owed_kes'] <= 0) {
                return response()->json(['message' => 'This order is already fully paid.'], 400);
            }

            $isPartial = (bool) ($request->is_partial ?? $payment->is_partial);
            if ($isPartial && $request->filled('partial_amount')) {
                $amount = (float) $request->partial_amount;
                if ($amount > $snapshot['snapshot_amount_still_owed_kes']) {
                    return response()->json([
                        'message'          => 'Partial amount exceeds outstanding balance.',
                        'amount_still_owed'=> $snapshot['snapshot_amount_still_owed_kes'],
                    ], 400);
                }
            } else {
                $amount    = $payment->amount_expected;
                $isPartial = false;
            }

            $this->daraja->validateAmount($amount);

            $phoneOverridden = false;
            $overrideReason  = null;
            if ($request->filled('phone_override') && $request->phone_override !== $order->customer->phone) {
                if (!$request->filled('phone_override_reason')) {
                    return response()->json(['message' => 'Phone override reason is required.'], 422);
                }
                $phoneOverridden = true;
                $overrideReason  = $request->phone_override_reason;
                $phone           = $request->phone_override;
            } else {
                $phone = $payment->phone_number;
            }

            $phone         = $this->daraja->normalizePhone($phone);
            $paymentNumber = Payment::generatePaymentNumber($order->id, 'regular');

            $darajaResponse = $this->daraja->stkPush(
                phone:         $phone,
                amount:        $amount,
                paymentNumber: $paymentNumber,
                orderId:       (string) $order->id,
            );

            $newPaymentData = [
                'customer_id'              => $order->customer_id,
                'initiated_by'             => $request->user()->id,
                'previous_payment_id'        => $payment->id,
                'payment_number'             => $paymentNumber,
                'method'                     => 'mpesa',
                'status'                     => 'pending',
                'currency'                   => $order->currency ?? 'KES',
                'exchange_rate_to_kes'       => $order->exchange_rate_to_kes ?? 1,
                'amount_expected'            => $amount,
                'amount_received'            => 0,
                'is_partial'                 => $isPartial,
                ...$snapshot,
                'phone_number'               => $phone,
                'phone_overridden'           => $phoneOverridden,
                'phone_override_reason'      => $overrideReason,
                'merchant_request_id'        => $darajaResponse['MerchantRequestID'],
                'checkout_request_id'        => $darajaResponse['CheckoutRequestID'],
                'notes'                      => $request->notes,
                'is_retry'                   => true,
                'retry_count'                => ($payment->retry_count ?? 0) + 1,
                'dispute_status'             => 'none',
                'initiated_at'               => now(),
            ];

            $newPaymentData['order_id'] = $order->id;

            $newPayment = Payment::create($newPaymentData);

            DB::commit();

            return response()->json([
                'message'        => 'Retry payment request sent.',
                'payment_id'     => $newPayment->id,
                'payment_number' => $paymentNumber,
                'status'         => 'pending',
            ], 201);

        } catch (\InvalidArgumentException $e) {
            DB::rollBack();
            return response()->json(['message' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            DB::rollBack();
            return response()->json(['message' => 'STK Push failed.', 'error' => $e->getMessage()], 502);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Unexpected error.', 'error' => $e->getMessage()], 500);
        }
    }

    // =========================================================================
    // RAISE DISPUTE — unchanged
    // =========================================================================

    public function raiseDispute(Request $request, Payment $payment)
    {
        $this->authorize('raiseDispute', $payment);

        $validator = Validator::make($request->all(), [
            'reason'   => 'required|string|max:2000',
            'evidence' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $payment->update([
            'dispute_status'    => 'raised',
            'dispute_reason'    => $request->reason,
            'dispute_raised_at' => now(),
            'dispute_raised_by' => $request->user()->id,
            'dispute_evidence'  => $request->evidence ?? [],
        ]);

        Log::info('Payment: Dispute raised', [
            'payment_id' => $payment->id,
            'raised_by'  => $request->user()->id,
            'reason'     => $request->reason,
        ]);

        return response()->json([
            'message' => 'Dispute raised successfully.',
            'payment' => $payment->fresh(),
        ]);
    }

    // =========================================================================
    // RESOLVE DISPUTE — unchanged
    // =========================================================================

    public function resolveDispute(Request $request, Payment $payment)
    {
        $this->authorize('resolveDispute', $payment);

        $validator = Validator::make($request->all(), [
            'resolution'        => 'required|in:resolved,rejected',
            'resolution_notes'  => 'required|string|max:2000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $payment->update([
            'dispute_status'           => $request->resolution,
            'dispute_resolved_at'      => now(),
            'dispute_resolved_by'      => $request->user()->id,
            'dispute_resolution_notes' => $request->resolution_notes,
        ]);

        Log::info('Payment: Dispute resolved', [
            'payment_id'  => $payment->id,
            'resolved_by' => $request->user()->id,
            'resolution'  => $request->resolution,
        ]);

        return response()->json([
            'message' => 'Dispute ' . $request->resolution . '.',
            'payment' => $payment->fresh(),
        ]);
    }

    // =========================================================================
    // ADD ADMIN NOTES — unchanged
    // =========================================================================

    public function addNotes(Request $request, Payment $payment)
    {
        $this->authorize('addAdminNotes', $payment);

        $validator = Validator::make($request->all(), [
            'notes' => 'required|string|max:2000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $payment->update([
            'admin_notes' => ($payment->admin_notes ? $payment->admin_notes . "\\n\\n" : '')
                . '[' . $request->user()->name . ' — ' . now()->format('Y-m-d H:i:s') . "]\\n"
                . $request->notes,
        ]);

        return response()->json([
            'message' => 'Notes added.',
            'payment' => $payment->fresh(),
        ]);
    }

    // =========================================================================
    // ORDER PAYMENT SUMMARY — polymorphic
    // =========================================================================

    public function orderPayments(Request $request)
    {
        $this->authorize('viewAny', Payment::class);

        $validator = Validator::make($request->all(), [
            'order_id' => 'required|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $orderId = $request->order_id;

        $order = Order::findOrFail($orderId);

        $payments = Payment::with(['initiatedBy', 'previousPayment'])
            ->where('order_id', $orderId)
            ->orderBy('created_at', 'asc')
            ->get();

        $totalConfirmed = $payments->where('status', 'confirmed')->where('method', '!=', 'credit')->sum('mpesa_amount_confirmed');
        $totalKes = (float) ($order->total_kes ?? $order->total ?? 0);

        return response()->json([
            'order_id'             => $orderId,
            'order_number'         => $order->order_number,
            'order_type'           => 'regular',
            'order_total_kes'      => $totalKes,
            'total_confirmed_kes'  => (float) $totalConfirmed,
            'balance_remaining'    => max(0, $totalKes - (float) $totalConfirmed),
            'order_payment_status' => $order->payment_status,
            'payments'             => $payments,
        ]);
    }

    // =========================================================================
    // CUSTOMER ORDER PAYMENT HISTORY — polymorphic
    // =========================================================================

    public function customerOrderPayments(Request $request, $orderId = null)
    {
        // Support both path param (/order/42) and query param (?order_id=42)
        $resolvedId = $orderId ?: $request->order_id;

        if (!$resolvedId) {
            return response()->json(['message' => 'Order ID is required.'], 422);
        }

        $user     = $request->user();
        $customer = \App\Models\Customer::where('user_id', $user->id)->firstOrFail();

        $order = Order::where('id', $resolvedId)
            ->where('customer_id', $customer->id)
            ->firstOrFail();

        $payments = Payment::where('order_id', $resolvedId)
            ->orderBy('created_at', 'asc')
            ->get([
                'id', 'payment_number', 'status', 'amount_expected',
                'amount_received', 'is_partial', 'mpesa_receipt_number', 'method',
                'mpesa_amount_confirmed', 'failure_reason', 'initiated_at', 'confirmed_at'
            ]);

        $totalConfirmed = $payments->where('status', 'confirmed')->where('method', '!=', 'credit')->sum('mpesa_amount_confirmed');
        $totalKes       = (float) ($order->total_kes ?? $order->total ?? 0);

        return response()->json([
            'order_id'             => $resolvedId,
            'order_number'         => $order->order_number,
            'order_type'           => 'regular',
            'order_total_kes'      => $totalKes,
            'total_confirmed_kes'  => (float) $totalConfirmed,
            'balance_remaining'    => max(0, $totalKes - (float) $totalConfirmed),
            'order_payment_status' => $order->payment_status,
            'payments'             => $payments,
        ]);
    }

    // =========================================================================
    // PAYMENT SUMMARY — polymorphic
    // =========================================================================

    public function summary(Request $request)
    {
        $this->authorize('viewAny', Payment::class);

        $query = Payment::query();

        if ($request->user()->role === 'finance') {
            $query->where('initiated_by', $request->user()->id);
        }

        $today = now()->toDateString();

        return response()->json([
            'today_collected'    => (float) (clone $query)->whereDate('confirmed_at', $today)->sum('mpesa_amount_confirmed'),
            'today_count'        => (clone $query)->whereDate('initiated_at', $today)->count(),
            'pending_count'      => (clone $query)->where('status', 'pending')->count(),
            'failed_count'       => (clone $query)->where('status', 'failed')->count(),
            'open_disputes'      => (clone $query)->whereIn('dispute_status', ['raised', 'investigating'])->count(),
            'month_collected'    => (float) (clone $query)->whereMonth('confirmed_at', now()->month)->whereYear('confirmed_at', now()->year)->sum('mpesa_amount_confirmed'),
            'month_count'        => (clone $query)->whereMonth('initiated_at', now()->month)->whereYear('initiated_at', now()->year)->count(),
            'regular_orders_count' => (clone $query)->whereNotNull('order_id')->count(),
        ]);
    }
}

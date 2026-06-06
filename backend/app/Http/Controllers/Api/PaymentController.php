<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\AuctionOrder;
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
            'auctionOrder:id,order_number,total,total_kes,payment_status',
            'customer:id,first_name,last_name,email,phone',
            'initiatedBy:id,name'
        ])->latest('created_at');

        if ($request->filled('order_id'))       $query->where('order_id', $request->order_id);
        if ($request->filled('auction_order_id'))$query->where('auction_order_id', $request->auction_order_id);
        if ($request->filled('status'))         $query->where('status', $request->status);
        if ($request->filled('dispute_status')) $query->where('dispute_status', $request->dispute_status);
        if ($request->filled('method'))         $query->where('method', $request->method);
        if ($request->filled('from_date'))      $query->whereDate('created_at', '>=', $request->from_date);
        if ($request->filled('to_date'))        $query->whereDate('created_at', '<=', $request->to_date);
        if ($request->filled('order_type')) {
            $request->order_type === 'auction'
                ? $query->whereNotNull('auction_order_id')
                : $query->whereNotNull('order_id');
        }

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
            'order', 'auctionOrder', 'customer', 'initiatedBy',
            'previousPayment', 'disputeRaisedBy', 'disputeResolvedBy'
        ]);

        return response()->json(['payment' => $payment]);
    }

    // =========================================================================
    // INITIATE STK PUSH — polymorphic for regular & auction orders
    // POST /admin/payments/initiate
    // =========================================================================

    public function initiate(Request $request)
    {
        $this->authorize('create', Payment::class);

        $validator = Validator::make($request->all(), [
            'order_id'              => 'required_without:auction_order_id|nullable|exists:orders,id',
            'auction_order_id'      => 'required_without:order_id|nullable|exists:auction_orders,id',
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
            // Resolve order (regular or auction)
            $isAuction = $request->filled('auction_order_id');
            $order = $isAuction
                ? AuctionOrder::with('customer')->findOrFail($request->auction_order_id)
                : Order::with('customer')->findOrFail($request->order_id);

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

            $existingPending = Payment::where(function ($q) use ($isAuction, $order) {
                if ($isAuction) {
                    $q->where('auction_order_id', $order->id);
                } else {
                    $q->where('order_id', $order->id);
                }
            })->where('status', 'pending')->first();

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
            $paymentNumber = Payment::generatePaymentNumber($order->id, $isAuction ? 'auction' : 'regular');
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

            if ($isAuction) {
                $paymentData['auction_order_id'] = $order->id;
            } else {
                $paymentData['order_id'] = $order->id;
            }

            $payment = Payment::create($paymentData);

            DB::commit();

            Log::info('Payment: STK Push initiated', [
                'payment_id' => $payment->id,
                'order_id' => $order->id,
                'auction_order' => $isAuction,
                'amount' => $amount,
            ]);

            return response()->json([
                'message' => 'Payment request sent to customer phone.',
                'payment_id' => $payment->id,
                'payment_number' => $paymentNumber,
                'status' => 'pending',
                'order_type' => $isAuction ? 'auction' : 'regular',
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
    // DARAJA CALLBACK — unchanged logic, works for both order types
    // =========================================================================

    public function callback(Request $request)
    {
        $rawBody = $request->all();
        Log::info('Daraja: Callback received', ['body' => $rawBody]);

        try {
            $parsed = $this->daraja->parseCallback($rawBody);
        } catch (\Exception $e) {
            Log::error('Daraja: Callback parse failed', ['error' => $e->getMessage(), 'body' => $rawBody]);
            return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
        }

        DB::beginTransaction();
        try {
            $payment = Payment::where('checkout_request_id', $parsed['checkout_request_id'])->first();

            if (!$payment) {
                Log::warning('Daraja: Callback received for unknown CheckoutRequestID', [
                    'checkout_request_id' => $parsed['checkout_request_id'],
                ]);
                DB::rollBack();
                return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
            }

            if ($payment->isConfirmed()) {
                Log::info('Daraja: Duplicate callback for already-confirmed payment', ['payment_id' => $payment->id]);
                DB::rollBack();
                return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
            }

            $callbackFields = [
                'callback_raw'          => $rawBody,
                'callback_received_at'  => now(),
                'callback_result_code'  => $parsed['result_code'],
                'callback_result_desc'  => $parsed['result_desc'],
                'merchant_request_id'   => $parsed['merchant_request_id'] ?: $payment->merchant_request_id,
            ];

            if ($parsed['is_success']) {
                $amountConfirmed = $parsed['amount_confirmed'];

                $payment->update(array_merge($callbackFields, [
                    'status'                 => 'confirmed',
                    'amount_received'        => $amountConfirmed,
                    'mpesa_receipt_number'   => $parsed['receipt_number'],
                    'mpesa_transaction_date' => $parsed['transaction_date'],
                    'mpesa_phone_confirmed'  => $parsed['phone_confirmed'],
                    'mpesa_amount_confirmed' => $amountConfirmed,
                    'confirmed_at'           => now(),
                ]));

                $payment->refresh();
                $payment->syncOrderPaymentStatus();

                Log::info('Payment: Confirmed via callback', [
                    'payment_id'     => $payment->id,
                    'payment_number' => $payment->payment_number,
                    'receipt'        => $parsed['receipt_number'],
                    'amount'         => $amountConfirmed,
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

        return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
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
    // MANUAL STATUS QUERY — unchanged
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
            return response()->json([
                'message'          => 'Daraja query returned.',
                'daraja_result'    => $result,
                'payment_status'   => $payment->fresh()->status,
                'hint'             => 'If ResultCode is 0, the callback may still arrive shortly. If 1032, customer cancelled.',
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Daraja query failed.',
                'error'   => $e->getMessage(),
            ], 502);
        }
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

        $isAuction = $payment->auction_order_id !== null;

        $existingPending = Payment::where(function ($q) use ($isAuction, $order) {
            if ($isAuction) {
                $q->where('auction_order_id', $order->id);
            } else {
                $q->where('order_id', $order->id);
            }
        })->where('status', 'pending')->where('id', '!=', $payment->id)->first();

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
            $paymentNumber = Payment::generatePaymentNumber($order->id, $isAuction ? 'auction' : 'regular');

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

            if ($isAuction) {
                $newPaymentData['auction_order_id'] = $order->id;
            } else {
                $newPaymentData['order_id'] = $order->id;
            }

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
            'order_id'         => 'required_without:auction_order_id|nullable|integer',
            'auction_order_id' => 'required_without:order_id|nullable|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $isAuction = $request->filled('auction_order_id');
        $orderId = $isAuction ? $request->auction_order_id : $request->order_id;

        $order = $isAuction
            ? AuctionOrder::findOrFail($orderId)
            : Order::findOrFail($orderId);

        $payments = Payment::with(['initiatedBy', 'previousPayment'])
            ->where($isAuction ? 'auction_order_id' : 'order_id', $orderId)
            ->orderBy('created_at', 'asc')
            ->get();

        $totalConfirmed = $payments->where('status', 'confirmed')->where('method', '!=', 'credit')->sum('mpesa_amount_confirmed');
        $totalKes = (float) ($order->total_kes ?? $order->total ?? 0);

        return response()->json([
            'order_id'             => $orderId,
            'order_number'         => $order->order_number,
            'order_type'           => $isAuction ? 'auction' : 'regular',
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
        $isAuction = $request->filled('auction_order_id');
        
        if ($orderId) {
            // Called via /payments/order/{orderId} — always a regular order
            $resolvedId = $orderId;
            $isAuction  = false;
        } else {
            $resolvedId = $isAuction ? $request->auction_order_id : $request->order_id;
        }

        if (!$resolvedId) {
            return response()->json(['message' => 'Order ID is required.'], 422);
        }

        $user     = $request->user();
        $customer = \App\Models\Customer::where('user_id', $user->id)->firstOrFail();

        $orderClass = $isAuction ? AuctionOrder::class : Order::class;
        $order = $orderClass::where('id', $resolvedId)
            ->where('customer_id', $customer->id)
            ->firstOrFail();

        $payments = Payment::where($isAuction ? 'auction_order_id' : 'order_id', $resolvedId)
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
            'order_type'           => $isAuction ? 'auction' : 'regular',
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
            'auction_orders_count' => (clone $query)->whereNotNull('auction_order_id')->count(),
            'regular_orders_count' => (clone $query)->whereNotNull('order_id')->count(),
        ]);
    }
}

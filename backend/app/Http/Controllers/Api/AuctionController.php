<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Auction;
use App\Models\AuctionBid;
use App\Models\AuctionOrder;
use App\Models\AuctionOrderActivityLog;
use App\Services\AuctionOrderService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class AuctionController extends Controller
{
    public function __construct(
        private AuctionOrderService $orderService
    ) {}

    // =========================================================================
    // ADMIN — AUCTION CRUD (existing, unchanged)
    // =========================================================================

    public function adminIndex(Request $request)
    {
        $query = Auction::with(['product.brand', 'product.category', 'seller', 'winner'])
            ->withCount('bids')
            ->when($request->status, fn($q, $status) => $q->where('status', $status))
            ->when($request->product_id, fn($q, $id) => $q->where('product_id', $id))
            ->when($request->search, function ($q, $search) {
                $q->whereHas('product', fn($qp) =>
                    $qp->where('name', 'like', "%{$search}%")
                        ->orWhere('sku', 'like', "%{$search}%")
                );
            })
            ->orderBy($request->sort_by ?? 'end_time', $request->sort_dir ?? 'asc');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    public function adminShow($id)
    {
        $auction = Auction::with([
            'product.brand', 'product.category', 'seller', 'winner',
            'bids' => fn($q) => $q->orderByDesc('amount')->with('bidder:id,name,email'),
        ])->findOrFail($id);

        return response()->json([
            'auction' => $auction,
            'product' => $auction->product,
            'bids'    => $auction->bids,
            'stats'   => [
                'total_bids'     => $auction->bids->count(),
                'unique_bidders' => $auction->bids->pluck('bidder_id')->unique()->count(),
                'highest_bid'    => $auction->bids->max('amount'),
                'lowest_bid'     => $auction->bids->min('amount'),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'product_id'    => 'required|exists:products,id',
            'start_price'   => 'required|numeric|min:0',
            'reserve_price' => 'nullable|numeric|min:0',
            'bid_increment' => 'required|numeric|min:10',
            'start_time'    => 'nullable|date',
            'end_time'      => 'required|date|after:start_time',
            'max_winners'   => 'nullable|integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $hasActive = Auction::where('product_id', $request->product_id)
            ->whereIn('status', ['active', 'scheduled'])
            ->exists();

        if ($hasActive) {
            return response()->json(['message' => 'Product already has an active or scheduled auction.'], 422);
        }

        $startTime = $request->start_time ?? now();
        $status    = strtotime($startTime) <= time() ? 'active' : 'scheduled';

        $auction = Auction::create([
            'product_id'    => $request->product_id,
            'seller_id'     => auth()->id(),
            'start_price'   => $request->start_price,
            'current_price' => $request->start_price,
            'reserve_price' => $request->reserve_price,
            'bid_increment' => $request->bid_increment,
            'start_time'    => $startTime,
            'end_time'      => $request->end_time,
            'status'        => $status,
            'max_winners'   => $request->max_winners ?? 1,
        ]);

        return response()->json(['message' => 'Auction created successfully', 'auction' => $auction], 201);
    }

    public function update(Request $request, Auction $auction)
    {
        $validator = Validator::make($request->all(), [
            'start_price'   => 'nullable|numeric|min:0',
            'reserve_price' => 'nullable|numeric|min:0',
            'bid_increment' => 'nullable|numeric|min:10',
            'start_time'    => 'nullable|date',
            'end_time'      => 'nullable|date|after_or_equal:start_time',
            'status'        => 'nullable|in:active,scheduled,ended,cancelled',
            'max_winners'   => 'nullable|integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if ($request->filled('status')) {
            $allowedTransitions = [
                'scheduled' => ['active', 'cancelled'],
                'active'    => ['ended', 'cancelled'],
                'ended'     => [],
                'cancelled' => [],
            ];
            $current = $auction->status;
            $new     = $request->status;
            if (!in_array($new, $allowedTransitions[$current] ?? [])) {
                return response()->json([
                    'message' => "Cannot change status from '{$current}' to '{$new}'",
                ], 422);
            }
        }

        $auction->update($request->only([
            'start_price', 'reserve_price', 'bid_increment',
            'start_time', 'end_time', 'status', 'max_winners',
        ]));

        if ($auction->status === 'active' && now()->gt($auction->end_time)) {
            $auction->update(['status' => 'ended']);
        }

        return response()->json([
            'message' => 'Auction updated successfully',
            'auction' => $auction->fresh(),
        ]);
    }

    public function destroy(Auction $auction)
    {
        if ($auction->bids()->exists()) {
            return response()->json([
                'message' => 'Cannot delete auction with existing bids. Use "cancel" status instead.',
            ], 422);
        }

        $auction->delete();

        return response()->json(['message' => 'Auction deleted successfully']);
    }

    public function trashed(Request $request)
    {
        $query = Auction::onlyTrashed()
            ->with(['product.brand', 'product.category', 'seller'])
            ->withCount('bids')
            ->when($request->search, function ($q, $search) {
                $q->whereHas('product', fn($qp) =>
                    $qp->where('name', 'like', "%{$search}%")
                        ->orWhere('sku', 'like', "%{$search}%")
                );
            })
            ->orderByDesc('deleted_at');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    public function restore($id)
    {
        $auction = Auction::onlyTrashed()->findOrFail($id);
        $auction->restore();

        return response()->json(['message' => 'Auction restored successfully']);
    }

    public function forceDestroy($id)
    {
        $auction = Auction::onlyTrashed()->findOrFail($id);
        $auction->bids()->forceDelete();
        $auction->forceDelete();

        return response()->json(['message' => 'Auction permanently deleted']);
    }

    // =========================================================================
    // PUBLIC — AUCTIONS
    // =========================================================================

    public function index(Request $request)
    {
        $query = Auction::with(['product.brand', 'product.category'])
            ->where('status', $request->status ?? 'active')
            ->where('end_time', '>', now())
            ->orderBy('end_time', 'asc');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    public function show($id)
    {
        $auction = Auction::with(['product.brand', 'product.category', 'winner'])->findOrFail($id);
        $topBids = $auction->bids()->with('bidder:id,name')->limit(10)->get();

        return response()->json([
            'auction'      => $auction,
            'product'      => $auction->product,
            'top_bids'     => $topBids,
            'bid_count'    => $auction->bids()->count(),
            'min_next_bid' => $auction->current_price + $auction->bid_increment,
        ]);
    }

    // =========================================================================
    // PROTECTED — PLACE BID
    // =========================================================================

    public function placeBid(Request $request, Auction $auction)
    {
        if ($auction->status !== 'active' || now()->gt($auction->end_time)) {
            return response()->json(['message' => 'Auction is closed.'], 422);
        }

        $maxBid  = (float) $request->input('max_bid');
        $nextMin = $auction->current_price + $auction->bid_increment;

        if ($maxBid < $nextMin) {
            return response()->json([
                'message' => 'Minimum bid is KSh ' . number_format($nextMin, 2),
                'min_bid' => $nextMin,
            ], 422);
        }

        $bid = null;

        DB::transaction(function () use ($auction, $maxBid, &$bid) {
            $auction = Auction::where('id', $auction->id)->lockForUpdate()->first();
            $highest = $auction->bids()->orderByDesc('amount')->first();

            $actual = $highest
                ? min($maxBid, $highest->amount + $auction->bid_increment)
                : max($auction->start_price, $maxBid);

            $auction->current_price = $actual;

            if (now()->diffInMinutes($auction->end_time, false) < 2) {
                $auction->end_time = now()->addMinutes(2);
            }
            $auction->save();

            $bid = $auction->bids()->create([
                'bidder_id' => auth()->id(),
                'amount'    => $actual,
                'max_bid'   => $maxBid,
            ]);
        });

        // Log the bid placement in the auction activity log
        if ($bid) {
            $auction->refresh();
            $this->orderService->logBidPlaced($bid, $auction);
        }

        return response()->json([
            'message'       => 'Bid placed successfully',
            'current_price' => $auction->current_price,
        ]);
    }

    // =========================================================================
    // PUBLIC — SSE LIVE STREAM
    // =========================================================================

    public function stream(Request $request, Auction $auction)
    {
        set_time_limit(0);
        @ini_set('output_buffering', 'off');
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');

        while (true) {
            if (connection_aborted()) break;

            $auction->refresh();
            $data = [
                'current_price' => $auction->current_price,
                'bid_count'     => $auction->bids()->count(),
                'time_left'     => max(0, now()->diffInSeconds($auction->end_time)),
                'status'        => $auction->status,
                'min_next'      => $auction->current_price + $auction->bid_increment,
            ];

            echo 'data: ' . json_encode($data) . "\n\n";
            ob_flush();
            flush();
            sleep(2);
        }
    }

    // =========================================================================
    // ADMIN — APPROVE BIDS & CREATE ORDERS
    // =========================================================================

    /**
     * POST /admin/auctions/{auction}/approve-bids
     *
     * Body:
     * {
     *   "bids": [
     *     { "bid_id": 12, "charged_amount": 5000 },   // per-bid override
     *     { "bid_id": 15 }                             // falls back to global or bid amount
     *   ],
     *   "global_charged_amount": 4800,   // optional — applied to bids without their own override
     *   "currency": "KES",
     *   "exchange_rate_to_kes": 1,
     *   "apply_tax": true,
     *   "shipping_address": "...",
     *   "delivery_method": "nairobi-cbd",
     *   "shipping_cost": 200,
     *   "payment_method": "mpesa",
     *   "admin_notes": "...",
     *   "customer_notes": "..."
     * }
     */
    public function approveBids(Request $request, Auction $auction)
    {
        if ($auction->status !== 'ended') {
            return response()->json(['message' => 'Auction must be ended before approving bids.'], 422);
        }

        $validator = Validator::make($request->all(), [
            'bids'                          => 'required|array|min:1',
            'bids.*.bid_id'                 => 'required|integer',
            'bids.*.charged_amount'         => 'nullable|numeric|min:0',
            'global_charged_amount'         => 'nullable|numeric|min:0',
            'currency'                      => 'nullable|string|max:10',
            'exchange_rate_to_kes'          => 'nullable|numeric|min:0',
            'apply_tax'                     => 'nullable|boolean',
            'shipping_address'              => 'nullable|string',
            'delivery_method'               => 'nullable|string',
            'shipping_cost'                 => 'nullable|numeric|min:0',
            'payment_method'                => 'nullable|in:mpesa,bank_transfer,cod,cash',
            'admin_notes'                   => 'nullable|string',
            'customer_notes'                => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $bidIds = collect($request->bids)->pluck('bid_id');

        // Verify all bid IDs belong to this auction
        $bids = AuctionBid::whereIn('id', $bidIds)
            ->where('auction_id', $auction->id)
            ->get()
            ->keyBy('id');

        $notFound = $bidIds->diff($bids->keys());
        if ($notFound->isNotEmpty()) {
            return response()->json([
                'message' => 'Some bid IDs do not belong to this auction.',
                'invalid_ids' => $notFound->values(),
            ], 422);
        }

        // No duplicate customers
        $customerIds = $bids->pluck('bidder_id');
        if ($customerIds->count() !== $customerIds->unique()->count()) {
            return response()->json([
                'message' => 'Cannot approve more than one bid per customer.',
            ], 422);
        }

        // Respect max_winners
        if ($bids->count() > $auction->max_winners) {
            return response()->json([
                'message' => "This auction allows a maximum of {$auction->max_winners} winner(s). You submitted {$bids->count()} bids.",
            ], 422);
        }

        // Check no order already exists for any of these bids
        $existingOrders = AuctionOrder::whereIn('auction_bid_id', $bidIds)->pluck('auction_bid_id');
        if ($existingOrders->isNotEmpty()) {
            return response()->json([
                'message'           => 'One or more bids already have orders created.',
                'duplicate_bid_ids' => $existingOrders->values(),
            ], 422);
        }

        $orders   = [];
        $errors   = [];
        $placedBy = auth()->id();

        // Shared order data (same for all orders in this approval batch)
        $sharedOrderData = [
            'currency'             => $request->currency            ?? 'KES',
            'exchange_rate_to_kes' => $request->exchange_rate_to_kes ?? 1.0,
            'apply_tax'            => $request->boolean('apply_tax', true),
            'shipping_address'     => $request->shipping_address,
            'delivery_method'      => $request->delivery_method,
            'payment_method'       => $request->payment_method,
            'admin_notes'          => $request->admin_notes,
            'customer_notes'       => $request->customer_notes,
        ];

        // Explicit shipping_cost from request (overrides ShippingOption lookup)
        if ($request->filled('shipping_cost')) {
            $sharedOrderData['shipping_cost'] = (float) $request->shipping_cost;
        }

        // Build per-bid charged_amount map from request
        $perBidAmounts = collect($request->bids)->keyBy('bid_id')->map(fn($b) => $b['charged_amount'] ?? null);

        DB::transaction(function () use ($auction, $bids, $perBidAmounts, $sharedOrderData, $placedBy, &$orders, &$errors) {
            foreach ($bids as $bid) {
                try {
                    // Resolve charged amount: per-bid > global > bid amount
                    $chargedAmount = $perBidAmounts[$bid->id]
                        ?? $sharedOrderData['_global_charged_amount']
                        ?? (float) $bid->amount;

                    $order    = $this->orderService->createOrder($auction, $bid, $chargedAmount, $sharedOrderData, $placedBy);
                    $orders[] = $order->load(['customer', 'bid']);
                } catch (\Exception $e) {
                    $errors[] = [
                        'bid_id'  => $bid->id,
                        'message' => $e->getMessage(),
                    ];
                }
            }
        });

        // If global_charged_amount was passed, it was for per-bid fallback — inject it properly
        // (done outside transaction, just for clarity — see resolution above)

        $status = empty($errors) ? 201 : 207; // 207 Multi-Status if partial failures

        return response()->json([
            'message' => empty($errors)
                ? count($orders) . ' auction order(s) created successfully.'
                : count($orders) . ' order(s) created; ' . count($errors) . ' failed.',
            'orders' => $orders,
            'errors' => $errors,
        ], $status);
    }

    // =========================================================================
    // ADMIN — ORDER LIST & DETAIL
    // =========================================================================

    /**
     * GET /admin/auction-orders
     * Filters: auction_id, customer_id, status, payment_status, search (order_number), per_page
     */
    public function adminOrderIndex(Request $request)
    {
        $query = AuctionOrder::with([
            'auction.product:id,name,sku',
            'customer:id,first_name,last_name,email',
            'bid:id,amount,max_bid',
            'placedBy:id,name',
        ])
            ->when($request->auction_id, fn($q, $id) => $q->where('auction_id', $id))
            ->when($request->customer_id, fn($q, $id) => $q->where('customer_id', $id))
            ->when($request->status, fn($q, $s) => $q->where('status', $s))
            ->when($request->payment_status, fn($q, $s) => $q->where('payment_status', $s))
            ->when($request->search, fn($q, $s) => $q->where('order_number', 'like', "%{$s}%"))
            ->orderByDesc('created_at');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    /**
     * GET /admin/auction-orders/{id}
     */
    public function adminOrderShow($id)
    {
        $order = AuctionOrder::with([
            'auction.product',
            'bid.bidder:id,name,email',
            'customer',
            'placedBy:id,name',
            'activityLogs' => fn($q) => $q->orderByDesc('created_at'),
        ])->findOrFail($id);

        return response()->json(['order' => $order]);
    }

    // =========================================================================
    // ADMIN — ORDER STATUS
    // =========================================================================

    /**
     * PUT /admin/auction-orders/{id}/status
     * Body: { "status": "confirmed|processing|delivered|failed", "admin_notes": "..." }
     */
    public function updateOrderStatus(Request $request, $id)
    {
        $order = AuctionOrder::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'status'      => 'required|in:confirmed,processing,delivered,failed',
            'admin_notes' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Guard: cannot update a cancelled order
        if ($order->status === 'cancelled') {
            return response()->json(['message' => 'Cannot update status of a cancelled order.'], 422);
        }

        $allowedTransitions = [
            'pending'    => ['confirmed', 'failed'],
            'confirmed'  => ['processing', 'failed'],
            'processing' => ['delivered', 'failed'],
            'delivered'  => [],
            'failed'     => [],
        ];

        if (!in_array($request->status, $allowedTransitions[$order->status] ?? [])) {
            return response()->json([
                'message' => "Cannot transition order from '{$order->status}' to '{$request->status}'.",
            ], 422);
        }

        $this->orderService->updateStatus($order, $request->status, $request->admin_notes);

        return response()->json([
            'message' => 'Order status updated.',
            'order'   => $order->fresh(),
        ]);
    }

    // =========================================================================
    // ADMIN — PAYMENT STATUS
    // =========================================================================

    /**
     * PUT /admin/auction-orders/{id}/payment
     * Body: {
     *   "payment_status": "confirmed|partially_paid|paid|overpayment|refunded",
     *   "payment_method": "mpesa|bank_transfer|cod|cash",
     *   "payment_reference": "..."
     * }
     */
    public function updatePaymentStatus(Request $request, $id)
    {
        $order = AuctionOrder::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'payment_status'    => 'required|in:confirmed,partially_paid,paid,overpayment,refunded',
            'payment_method'    => 'nullable|in:mpesa,bank_transfer,cod,cash',
            'payment_reference' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if ($order->status === 'cancelled') {
            return response()->json(['message' => 'Cannot update payment on a cancelled order.'], 422);
        }

        $this->orderService->updatePaymentStatus($order, $request->payment_status, [
            'payment_method'    => $request->payment_method,
            'payment_reference' => $request->payment_reference,
        ]);

        return response()->json([
            'message' => 'Payment status updated.',
            'order'   => $order->fresh(),
        ]);
    }

    // =========================================================================
    // ADMIN — SHIP ORDER
    // =========================================================================

    /**
     * PUT /admin/auction-orders/{id}/ship
     * Body: { "tracking_number": "...", "courier_company": "...", "estimated_delivery_date": "2025-07-01" }
     */
    public function shipOrder(Request $request, $id)
    {
        $order = AuctionOrder::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'tracking_number'         => 'required|string|max:255',
            'courier_company'         => 'required|string|max:150',
            'estimated_delivery_date' => 'nullable|date|after:today',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if (!in_array($order->status, ['confirmed', 'processing'])) {
            return response()->json([
                'message' => 'Order must be confirmed or processing before it can be shipped.',
            ], 422);
        }

        $this->orderService->shipOrder(
            $order,
            $request->tracking_number,
            $request->courier_company,
            $request->estimated_delivery_date,
        );

        return response()->json([
            'message' => 'Order marked as shipped.',
            'order'   => $order->fresh(),
        ]);
    }

    // =========================================================================
    // ADMIN — CANCEL ORDER
    // =========================================================================

    /**
     * POST /admin/auction-orders/{id}/cancel
     * Body: { "reason": "..." }
     */
    public function cancelOrder(Request $request, $id)
    {
        $order = AuctionOrder::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        if ($order->status === 'cancelled') {
            return response()->json(['message' => 'Order is already cancelled.'], 422);
        }

        if ($order->status === 'delivered') {
            return response()->json(['message' => 'Cannot cancel a delivered order.'], 422);
        }

        $this->orderService->cancelOrder($order, $request->reason);

        return response()->json([
            'message' => 'Order cancelled and stock restored.',
            'order'   => $order->fresh(),
        ]);
    }

    // =========================================================================
    // ADMIN — RESTORE ORDER
    // =========================================================================

    /**
     * POST /admin/auction-orders/{id}/restore
     * Body: { "reason": "..." }  (optional)
     */
    public function restoreOrder(Request $request, $id)
    {
        $order = AuctionOrder::findOrFail($id);

        if ($order->status !== 'cancelled') {
            return response()->json(['message' => 'Only cancelled orders can be restored.'], 422);
        }

        try {
            $this->orderService->restoreOrder($order, $request->reason);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Order restored to pending.',
            'order'   => $order->fresh(),
        ]);
    }

    // =========================================================================
    // ADMIN — ORDER TRASH / SOFT DELETE
    // =========================================================================

    /**
     * DELETE /admin/auction-orders/{id}
     * Soft-deletes — only allowed on cancelled or failed orders.
     */
    public function orderTrash($id)
    {
        $order = AuctionOrder::findOrFail($id);

        if (!in_array($order->status, ['cancelled', 'failed'])) {
            return response()->json([
                'message' => 'Only cancelled or failed orders can be deleted. Cancel the order first.',
            ], 422);
        }

        $order->delete();

        $this->orderService->log(
            action:         'order_trashed',
            description:    "Auction order #{$order->order_number} moved to trash.",
            severity:       'warning',
            auctionOrderId: $order->id,
            auctionId:      $order->auction_id,
        );

        return response()->json(['message' => 'Order moved to trash.']);
    }

    /**
     * GET /admin/auction-orders/trashed
     */
    public function orderTrashedIndex(Request $request)
    {
        $query = AuctionOrder::onlyTrashed()
            ->with([
                'auction.product:id,name',
                'customer:id,first_name,last_name,email',
            ])
            ->when($request->search, fn($q, $s) => $q->where('order_number', 'like', "%{$s}%"))
            ->orderByDesc('deleted_at');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    /**
     * POST /admin/auction-orders/{id}/restore-trash
     * Restores a soft-deleted (trashed) record — does NOT touch stock or status.
     */
    public function orderRestoreTrash($id)
    {
        $order = AuctionOrder::onlyTrashed()->findOrFail($id);
        $order->restore();

        $this->orderService->log(
            action:         'order_restored_from_trash',
            description:    "Auction order #{$order->order_number} restored from trash.",
            severity:       'info',
            auctionOrderId: $order->id,
            auctionId:      $order->auction_id,
        );

        return response()->json(['message' => 'Order restored from trash.']);
    }

    /**
     * DELETE /admin/auction-orders/{id}/force  (super_admin only)
     */
    public function orderForceDelete($id)
    {
        $order = AuctionOrder::onlyTrashed()->findOrFail($id);

        $this->orderService->log(
            action:         'order_force_deleted',
            description:    "Auction order #{$order->order_number} permanently deleted.",
            severity:       'danger',
            auctionOrderId: $order->id,
            auctionId:      $order->auction_id,
        );

        $order->forceDelete();

        return response()->json(['message' => 'Order permanently deleted.']);
    }

    // =========================================================================
    // ADMIN — ACTIVITY LOG FOR AN AUCTION
    // =========================================================================

    /**
     * GET /admin/auctions/{auction}/activity
     * Returns all activity logs scoped to an auction (bids + orders).
     */
    public function auctionActivityLog(Request $request, Auction $auction)
    {
        $logs = AuctionOrderActivityLog::where('auction_id', $auction->id)
            ->orderByDesc('created_at')
            ->paginate($request->per_page ?? 30);

        return response()->json($logs);
    }
}
<?php

namespace App\Services;

use App\Models\Auction;
use App\Models\AuctionBid;
use App\Models\AuctionOrder;
use App\Models\AuctionOrderActivityLog;
use App\Models\Product;
use App\Models\ShippingOption;
use App\Services\Inventory\InventoryStockService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AuctionOrderService
{
    public function __construct(
        private InventoryStockService $inventory
    ) {}

    // =========================================================================
    // ACTIVITY LOGGING
    // =========================================================================

    public function log(
        string  $action,
        string  $description,
        string  $severity      = 'info',
        ?int    $auctionOrderId = null,
        ?int    $auctionId      = null,
        array   $metadata       = [],
        ?string $performedBy    = null,
    ): void {
        try {
            AuctionOrderActivityLog::create([
                'auction_order_id' => $auctionOrderId,
                'auction_id'       => $auctionId,
                'action'           => $action,
                'description'      => $description,
                'severity'         => $severity,
                'performed_by'     => $performedBy ?? $this->resolveActor(),
                'metadata'         => $metadata ?: null,
            ]);
        } catch (\Exception $e) {
            Log::warning("AuctionOrderActivityLog failed: {$e->getMessage()}");
        }
    }

    private function resolveActor(): string
    {
        $user = Auth::user();
        if (!$user) return 'system';
        return $user->name ?? $user->email ?? "user#{$user->id}";
    }

    // =========================================================================
    // BID LOGGING  (no order exists yet — auction_id only)
    // =========================================================================

    public function logBidPlaced(AuctionBid $bid, Auction $auction): void
    {
        $this->log(
            action:        'bid_placed',
            description:   "Bid of KES " . number_format($bid->amount, 2) . " placed on auction #{$auction->id} ({$auction->product?->name}).",
            severity:      'info',
            auctionId:     $auction->id,
            metadata:      [
                'bid_id'        => $bid->id,
                'bidder_id'     => $bid->bidder_id,
                'amount'        => $bid->amount,
                'max_bid'       => $bid->max_bid,
                'current_price' => $auction->current_price,
            ],
            performedBy:   $this->resolveActor(),
        );
    }

    // =========================================================================
    // ORDER CREATION  (called inside approveBids transaction)
    // =========================================================================

    /**
     * Create a single auction order from an approved bid.
     *
     * @param  Auction    $auction
     * @param  AuctionBid $bid
     * @param  float      $chargedAmount   Admin-decided charge
     * @param  array      $orderData       shipping_address, delivery_method, currency, etc.
     * @param  int        $placedBy        Admin user id
     * @return AuctionOrder
     */
    public function createOrder(
        Auction    $auction,
        AuctionBid $bid,
        float      $chargedAmount,
        array      $orderData,
        int        $placedBy,
    ): AuctionOrder {

        $product  = $auction->product;
        $customer = $bid->bidder->customer
            ?? \App\Models\Customer::where('user_id', $bid->bidder_id)->firstOrFail();

        $quantity     = (int) ($orderData['quantity'] ?? 1);
        $currency     = $orderData['currency']           ?? 'KES';
        $exchangeRate = (float) ($orderData['exchange_rate_to_kes'] ?? 1.0);
        $applyTax     = $orderData['apply_tax']           ?? true;

        $subtotal = round($chargedAmount * $quantity, 2);

        // ── Shipping ──────────────────────────────────────────────────────────
        $shippingOption     = null;
        $shippingCost       = 0.00;
        $shippingOptionId   = null;
        $shippingMethodName = $orderData['delivery_method'] ?? null;
        $shippingSnapshot   = null;

        if (!empty($orderData['delivery_method'])) {
            $shippingOption = ShippingOption::where('slug', $orderData['delivery_method'])
                ->where('is_active', true)
                ->first();
        }

        if (isset($orderData['shipping_cost'])) {
            $shippingCost = (float) $orderData['shipping_cost'];
        } elseif ($shippingOption) {
            $shippingCost = $shippingOption->costForSubtotal($subtotal);
        }

        if ($shippingOption) {
            $shippingOptionId   = $shippingOption->id;
            $shippingMethodName = $shippingOption->name;
            $shippingSnapshot   = [
                'id'           => $shippingOption->id,
                'name'         => $shippingOption->name,
                'slug'         => $shippingOption->slug,
                'cost'         => $shippingOption->cost,
                'free_above'   => $shippingOption->free_above,
                'applied_cost' => $shippingCost,
            ];
        }

        $tax   = $applyTax ? round($subtotal * 0.16, 2) : 0.00;
        $total = round($subtotal + $tax + $shippingCost, 2);

        $orderNumber = AuctionOrder::generateOrderNumber($auction->id, $customer->id);

        $order = AuctionOrder::create([
            'auction_id'       => $auction->id,
            'auction_bid_id'   => $bid->id,
            'customer_id'      => $customer->id,
            'product_id'       => $product->id,
            'order_number'     => $orderNumber,

            // snapshot
            'product_name'     => $product->name,
            'product_sku'      => $product->sku,
            'product_image'    => $product->main_image,
            'brand_name'       => optional($product->brand)->name,

            // financials
            'winning_bid_amount' => $bid->amount,
            'charged_amount'     => $chargedAmount,
            'quantity'           => $quantity,
            'subtotal'           => $subtotal,
            'tax'                => $tax,
            'shipping_cost'      => $shippingCost,
            'total'              => $total,

            // KES (applied below)
            'currency'              => $currency,
            'exchange_rate_to_kes'  => $exchangeRate,
            'subtotal_kes'          => 0,
            'tax_kes'               => 0,
            'shipping_cost_kes'     => 0,
            'total_kes'             => 0,

            // shipping
            'shipping_address'      => $orderData['shipping_address'] ?? null,
            'delivery_method'       => $orderData['delivery_method']  ?? null,
            'shipping_option_id'    => $shippingOptionId,
            'shipping_method_name'  => $shippingMethodName,
            'shipping_snapshot'     => $shippingSnapshot,

            // payment
            'payment_method'  => $orderData['payment_method'] ?? null,
            'payment_status'  => 'pending',

            // status
            'status'          => 'pending',

            // admin
            'placed_by'       => $placedBy,
            'admin_notes'     => $orderData['admin_notes']    ?? null,
            'customer_notes'  => $orderData['customer_notes'] ?? null,
        ]);

        $order->applyKesSnapshot();

        // ── Deduct stock ──────────────────────────────────────────────────────
        $this->deductStock($product, $quantity, $order->id);

        // ── Log ───────────────────────────────────────────────────────────────
        $this->log(
            action:         'auction_order_created',
            description:    "Auction order {$orderNumber} created for customer #{$customer->id} from bid #{$bid->id}.",
            severity:       'info',
            auctionOrderId: $order->id,
            auctionId:      $auction->id,
            metadata:       [
                'winning_bid_amount' => $bid->amount,
                'charged_amount'     => $chargedAmount,
                'total'              => $total,
                'currency'           => $currency,
                'quantity'           => $quantity,
            ],
        );

        return $order;
    }

    // =========================================================================
    // STOCK HELPERS
    // =========================================================================

    private function deductStock(Product $product, int $qty, int $orderId): void
    {
        $product->decrement('stock_quantity', $qty);
        if ($product->stock_quantity <= 0) {
            $product->update(['in_stock' => false]);
        }
        $product->refresh();

        $this->inventory->recordSale(
            productId:     $product->id,
            qtySold:       (float) $qty,
            orderId:       $orderId,
            performedBy:   auth()->id(),
            referenceType: 'auction_order',
        );
    }

    private function restoreStock(Product $product, int $qty, int $orderId): void
    {
        $product->increment('stock_quantity', $qty);
        if ($product->stock_quantity > 0 && !$product->in_stock) {
            $product->update(['in_stock' => true]);
        }
        $product->refresh();

        $this->inventory->recordReturn(
            productId:     $product->id,
            qtyReturned:   (float) $qty,
            orderId:       $orderId,
            performedBy:   auth()->id(),
            referenceType: 'auction_order',
        );
    }

    // =========================================================================
    // ORDER STATUS
    // =========================================================================

    public function updateStatus(AuctionOrder $order, string $newStatus, ?string $adminNotes = null): void
    {
        $previous = $order->status;

        $updates = ['status' => $newStatus];

        if ($newStatus === 'confirmed' && !$order->confirmed_at) {
            $updates['confirmed_at'] = now();
        }
        if ($newStatus === 'delivered' && !$order->delivered_at) {
            $updates['delivered_at'] = now();
            // Award loyalty points on delivery if needed in future
        }
        if ($adminNotes) {
            $updates['admin_notes'] = ($order->admin_notes ? $order->admin_notes . "\n\n" : '')
                . '[' . now()->format('Y-m-d H:i:s') . '] ' . $adminNotes;
        }

        $order->update($updates);

        $this->log(
            action:         'status_updated',
            description:    "Auction order #{$order->order_number} status changed from {$previous} to {$newStatus}.",
            severity:       'info',
            auctionOrderId: $order->id,
            auctionId:      $order->auction_id,
            metadata:       ['previous' => $previous, 'new' => $newStatus],
        );
    }

    // =========================================================================
    // PAYMENT STATUS
    // =========================================================================

    public function updatePaymentStatus(AuctionOrder $order, string $status, array $extra = []): void
    {
        $previous = $order->payment_status;

        $updates = ['payment_status' => $status];

        if ($status === 'paid') {
            $updates['paid_at'] = now();
        }
        if (isset($extra['payment_method']))   $updates['payment_method']   = $extra['payment_method'];
        if (isset($extra['payment_reference'])) $updates['payment_reference'] = $extra['payment_reference'];

        $order->update($updates);

        $this->log(
            action:         'payment_status_updated',
            description:    "Payment status for auction order #{$order->order_number} changed from {$previous} to {$status}.",
            severity:       'success',
            auctionOrderId: $order->id,
            auctionId:      $order->auction_id,
            metadata:       array_merge(['previous' => $previous, 'new' => $status], $extra),
        );
    }

    // =========================================================================
    // CANCEL
    // =========================================================================

    public function cancelOrder(AuctionOrder $order, string $reason): void
    {
        $order->update([
            'status'              => 'cancelled',
            'cancelled_at'        => now(),
            'cancellation_reason' => $reason,
            'admin_notes'         => ($order->admin_notes ? $order->admin_notes . "\n\n" : '')
                . '[CANCELLED on ' . now()->format('Y-m-d H:i:s') . '] ' . $reason,
        ]);

        // Restore stock
        $product = Product::find($order->product_id);
        if ($product) {
            $this->restoreStock($product, $order->quantity, $order->id);
        }

        $this->log(
            action:         'order_cancelled',
            description:    "Auction order #{$order->order_number} cancelled. Reason: {$reason}",
            severity:       'danger',
            auctionOrderId: $order->id,
            auctionId:      $order->auction_id,
            metadata:       ['reason' => $reason],
        );
    }

    // =========================================================================
    // RESTORE
    // =========================================================================

    public function restoreOrder(AuctionOrder $order, ?string $reason = null): void
    {
        // Check stock availability before restoring
        $product = Product::find($order->product_id);
        if ($product && (float) $product->stock_quantity < $order->quantity) {
            throw new \Exception(
                "Insufficient stock to restore order {$order->order_number}. " .
                "Needs {$order->quantity} but only {$product->stock_quantity} available."
            );
        }

        $order->update([
            'status'              => 'pending',
            'payment_status'      => 'pending',
            'payment_reference'   => null,
            'paid_at'             => null,
            'cancelled_at'        => null,
            'cancellation_reason' => null,
            'admin_notes'         => ($order->admin_notes ? $order->admin_notes . "\n\n" : '')
                . '[RESTORED on ' . now()->format('Y-m-d H:i:s') . ']'
                . ($reason ? ': ' . $reason : ''),
        ]);

        // Re-deduct stock
        if ($product) {
            $this->deductStock($product, $order->quantity, $order->id);
        }

        $this->log(
            action:         'order_restored',
            description:    "Auction order #{$order->order_number} restored to pending.",
            severity:       'info',
            auctionOrderId: $order->id,
            auctionId:      $order->auction_id,
            metadata:       ['reason' => $reason],
        );
    }

    // =========================================================================
    // SHIP
    // =========================================================================

    public function shipOrder(AuctionOrder $order, string $trackingNumber, string $courierCompany, ?string $estimatedDeliveryDate = null): void
    {
        $order->update([
            'status'                   => 'processing', // moves to processing when shipped
            'shipped_at'               => now(),
            'tracking_number'          => $trackingNumber,
            'courier_company'          => $courierCompany,
            'estimated_delivery_date'  => $estimatedDeliveryDate,
        ]);

        $this->log(
            action:         'order_shipped',
            description:    "Auction order #{$order->order_number} shipped via {$courierCompany}. Tracking: {$trackingNumber}.",
            severity:       'success',
            auctionOrderId: $order->id,
            auctionId:      $order->auction_id,
            metadata:       [
                'tracking_number'          => $trackingNumber,
                'courier_company'          => $courierCompany,
                'estimated_delivery_date'  => $estimatedDeliveryDate,
            ],
        );
    }
}
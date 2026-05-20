<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Hamper;
use App\Models\HamperOrder;
use App\Models\LoyaltyPointTransaction;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ReferralCode;
use App\Models\ReferralCodeUsage;
use App\Models\StoreCreditTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class HamperOrderController extends Controller
{
    /**
     * Admin: List all hamper orders.
     */
    public function index(Request $request): JsonResponse
    {
        $orders = HamperOrder::with(['customer:id,first_name,last_name,email', 'hamper:id,name'])
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->status))
            ->when($request->filled('search'), function ($q) use ($request) {
                $q->where('order_number', 'like', '%' . $request->search . '%')
                    ->orWhereHas('customer', function ($cq) use ($request) {
                        $cq->where('first_name', 'like', '%' . $request->search . '%')
                            ->orWhere('last_name', 'like', '%' . $request->search . '%')
                            ->orWhere('email', 'like', '%' . $request->search . '%');
                    });
            })
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return response()->json($orders);
    }

    /**
     * Customer: List their own hamper orders.
     */
    public function myOrders(Request $request): JsonResponse
    {
        $customer = $request->user()->customer;
        if (!$customer) {
            return response()->json(['message' => 'Customer profile not found'], 404);
        }

        $orders = HamperOrder::where('customer_id', $customer->id)
            ->with(['hamper:id,name,slug'])
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 10));

        return response()->json($orders);
    }

    /**
     * Show hamper order detail (Admin or Owner).
     */
    public function show(Request $request, $id): JsonResponse
    {
        $query = HamperOrder::with(['customer', 'hamper', 'order']);
        
        $order = $query->findOrFail($id);

        // if not admin, check ownership
        $user = $request->user();
        if (!in_array($user->role, ['admin', 'super_admin', 'manager', 'finance', 'logistics', 'sales_rep'])) {
            if ($order->customer_id !== $user->customer?->id) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }
        }

        return response()->json($order);
    }

    /**
     * Admin: Update status.
     */
    public function updateStatus(Request $request, $id): JsonResponse
    {
        $order = HamperOrder::findOrFail($id);

        $request->validate([
            'status' => 'required|in:pending,confirmed,processing,shipped,delivered,cancelled,refunded',
            'notes'  => 'nullable|string',
        ]);

        $oldStatus = $order->status;
        $newStatus = $request->status;

        // Block status changes on converted orders — manage via the standard order instead
        if ($order->order_id) {
            return response()->json(['message' => 'This hamper order has been converted to a standard order. Manage status via the standard order.'], 422);
        }

        // Prevent cancelling/refunding an already cancelled/refunded order
        if (in_array($oldStatus, ['cancelled', 'refunded']) && in_array($newStatus, ['cancelled', 'refunded'])) {
            return response()->json(['message' => 'This order is already ' . $oldStatus], 422);
        }

        DB::beginTransaction();
        try {
            $isNewCancellation = in_array($newStatus, ['cancelled', 'refunded'])
                && !in_array($oldStatus, ['cancelled', 'refunded']);

            $isReactivation = in_array($oldStatus, ['cancelled', 'refunded'])
                && !in_array($newStatus, ['cancelled', 'refunded']);

            if ($isNewCancellation) {
                $this->reverseFinancials($order);
            }

            if ($isReactivation) {
                $this->restoreFinancials($order);
            }

            $order->status = $newStatus;

            $logNote = "[" . now()->format('Y-m-d H:i:s') . "] Status changed from {$oldStatus} to {$order->status}.";
            if ($request->filled('notes')) {
                $logNote .= " Note: " . $request->notes;
            }

            $order->notes = ($order->notes ? $order->notes . "\n" : "") . $logNote;
            $order->save();

            DB::commit();

            return response()->json(['message' => 'Order status updated', 'data' => $order->fresh()]);

        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('Hamper order status update failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to update status', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Reverse store credit, loyalty points, and promo stats when cancelling/refunding.
     * Idempotent: skips if financials were already reversed.
     */
    private function reverseFinancials(HamperOrder $order): void
    {
        if ($order->financials_reversed_at) return;

        $customer = Customer::find($order->customer_id);
        if (!$customer) return;

        // 1. Refund store credit
        if ((float) $order->store_credit_used > 0) {
            $refundAmount = (float) $order->store_credit_used;
            $newBalance = round((float) $customer->store_credit + $refundAmount, 2);

            StoreCreditTransaction::create([
                'customer_id'    => $customer->id,
                'amount'         => $refundAmount,
                'balance_after'  => $newBalance,
                'type'           => 'order_refund',
                'reference_type' => HamperOrder::class,
                'reference_id'   => $order->id,
                'note'           => "Refunded from cancelled hamper order {$order->order_number}",
            ]);

            $customer->update(['store_credit' => $newBalance]);
        }

        // 2. Reverse loyalty points
        if ((int) $order->loyalty_points_earned > 0) {
            $pointsToReverse = (int) $order->loyalty_points_earned;
            $newPointBalance = max(0, (int) $customer->loyalty_points - $pointsToReverse);

            LoyaltyPointTransaction::create([
                'customer_id'    => $customer->id,
                'points'         => -$pointsToReverse,
                'balance_after'  => $newPointBalance,
                'type'           => 'order_cancel',
                'point_type'     => 'permanent',
                'reference_type' => HamperOrder::class,
                'reference_id'   => $order->id,
                'note'           => "Reversed from cancelled hamper order {$order->order_number}",
            ]);

            $customer->update(['loyalty_points' => $newPointBalance]);
        }

        // 3. Reverse promo code stats + mark usage as cancelled
        if ($order->referral_code_id) {
            $code = ReferralCode::find($order->referral_code_id);
            if ($code) {
                if ($code->times_used > 0) $code->decrement('times_used');
                if ($code->successful_uses > 0) $code->decrement('successful_uses');
                if ($code->total_orders > 0) $code->decrement('total_orders');

                $discountAmount = (float) $order->discount_amount;
                if ($discountAmount > 0 && $code->total_discount_given >= $discountAmount) {
                    $code->decrement('total_discount_given', $discountAmount);
                }

                $code->refresh();
                $code->update([
                    'average_order_value' => $code->total_orders > 0
                        ? round($code->total_revenue / $code->total_orders, 2)
                        : 0,
                ]);
            }

            $usage = ReferralCodeUsage::where('hamper_order_id', $order->id)
                ->where('referral_code_id', $order->referral_code_id)
                ->whereIn('status', ['completed', 'pending'])
                ->first();

            if ($usage) {
                $usage->update(['status' => 'cancelled']);
            }
        }

        // 4. Restore hamper stock
        $hamper = Hamper::find($order->hamper_id);
        if ($hamper && $hamper->stock_remaining !== null) {
            $hamper->increment('stock_remaining');
            if ($hamper->is_sold_out) {
                $hamper->update(['is_sold_out' => false]);
            }
        }

        $order->financials_reversed_at = now();
    }

    /**
     * Restore financials when reactivating a cancelled/refunded order.
     * Re-deducts store credit, re-awards loyalty points, re-increments promo stats, re-decrements stock.
     * Idempotent: only runs if financials were previously reversed.
     */
    private function restoreFinancials(HamperOrder $order): void
    {
        if (!$order->financials_reversed_at) return;

        $customer = Customer::find($order->customer_id);
        if (!$customer) return;

        // 1. Re-deduct store credit that was refunded
        if ((float) $order->store_credit_used > 0) {
            $deductAmount = (float) $order->store_credit_used;
            $newBalance = round(max(0, (float) $customer->store_credit - $deductAmount), 2);

            StoreCreditTransaction::create([
                'customer_id'    => $customer->id,
                'amount'         => -$deductAmount,
                'balance_after'  => $newBalance,
                'type'           => 'order_spend',
                'reference_type' => HamperOrder::class,
                'reference_id'   => $order->id,
                'note'           => "Re-deducted on reactivation of hamper order {$order->order_number}",
            ]);

            $customer->update(['store_credit' => $newBalance]);
        }

        // 2. Re-award loyalty points
        if ((int) $order->loyalty_points_earned > 0) {
            $pointsToRestore = (int) $order->loyalty_points_earned;
            $newPointBalance = (int) $customer->loyalty_points + $pointsToRestore;

            LoyaltyPointTransaction::create([
                'customer_id'    => $customer->id,
                'points'         => $pointsToRestore,
                'balance_after'  => $newPointBalance,
                'type'           => 'order_restore',
                'point_type'     => 'permanent',
                'reference_type' => HamperOrder::class,
                'reference_id'   => $order->id,
                'note'           => "Restored on reactivation of hamper order {$order->order_number}",
            ]);

            $customer->update(['loyalty_points' => $newPointBalance]);
        }

        // 3. Re-increment promo code stats + mark usage as completed
        if ($order->referral_code_id) {
            $code = ReferralCode::find($order->referral_code_id);
            if ($code) {
                $code->increment('times_used');
                $code->increment('successful_uses');
                $code->increment('total_orders');

                $discountAmount = (float) $order->discount_amount;
                if ($discountAmount > 0) {
                    $code->increment('total_discount_given', $discountAmount);
                }

                $code->refresh();
                $code->update([
                    'average_order_value' => $code->total_orders > 0
                        ? round($code->total_revenue / $code->total_orders, 2)
                        : 0,
                ]);
            }

            $usage = ReferralCodeUsage::where('hamper_order_id', $order->id)
                ->where('referral_code_id', $order->referral_code_id)
                ->where('status', 'cancelled')
                ->first();

            if ($usage) {
                $usage->update(['status' => 'completed', 'completed_at' => now()]);
            }
        }

        // 4. Re-decrement hamper stock
        $hamper = Hamper::find($order->hamper_id);
        if ($hamper && $hamper->stock_remaining !== null) {
            if ($hamper->stock_remaining > 0) {
                $hamper->decrement('stock_remaining');
            }
            if ($hamper->stock_remaining <= 0) {
                $hamper->update(['is_sold_out' => true]);
            }
        }

        $order->financials_reversed_at = null;
    }

    /**
     * Admin: Convert HamperOrder to standard Order.
     */
    public function convertToOrder(Request $request, $id): JsonResponse
    {
        $hamperOrder = HamperOrder::findOrFail($id);

        if ($hamperOrder->order_id) {
            return response()->json(['message' => 'This hamper order has already been converted to a standard order.'], 422);
        }

        if (!in_array($hamperOrder->status, ['confirmed', 'processing'])) {
            return response()->json(['message' => 'Only confirmed or processing hamper orders can be converted.'], 422);
        }

        DB::beginTransaction();
        try {
            $snapshot = $hamperOrder->hamper_snapshot;
            $items = $snapshot['items'] ?? [];
            
            // Calculate total of original prices to find the bundle discount
            $originalItemsTotal = 0;
            foreach ($items as $item) {
                $originalItemsTotal += (float) ($item['price'] ?? 0) * (int) ($item['quantity'] ?? 1);
            }

            // The discount to reach the hamper subtotal
            $bundleDiscount = max(0, $originalItemsTotal - (float) $hamperOrder->subtotal);

            // Create Standard Order — copy financials as-is from hamper order
            $order = Order::create([
                'order_number'               => 'ORD-HMP-' . strtoupper(Str::random(8)),
                'type'                       => 'hamper',
                'customer_id'                => $hamperOrder->customer_id,
                'placed_by'                  => auth()->id(),
                'subtotal'                   => $hamperOrder->subtotal,
                'tax'                        => $hamperOrder->vat_amount,
                'discount'                   => 0,
                'currency'                   => 'KES',
                'exchange_rate_to_kes'       => 1,
                'shipping_option_id'         => $hamperOrder->shipping_option_id,
                'shipping_method_name'       => $hamperOrder->shipping_method_name,
                'shipping_snapshot'          => $hamperOrder->shipping_snapshot,
                'shipping_cost'              => $hamperOrder->shipping_cost,
                'total'                      => $hamperOrder->total,
                'payment_method'             => 'request_invoice',
                'payment_status'             => 'unpaid',
                'status'                     => 'confirmed',
                'confirmed_at'               => now(),
                'priority'                   => 'medium',
                'shipping_address'           => is_array($hamperOrder->shipping_address) ? json_encode($hamperOrder->shipping_address) : $hamperOrder->shipping_address,
                'delivery_method'            => 'standard_delivery',
                'referral_code_id'           => $hamperOrder->referral_code_id,
                'promo_discount'             => $hamperOrder->discount_amount,
                'store_credit_deduction'     => 0,
                'store_credit_deduction_kes' => 0,
                'admin_notes'                => "Converted from Hamper Order #{$hamperOrder->order_number}"
                    . ($hamperOrder->promo_code ? " | Promo: {$hamperOrder->promo_code} (-" . number_format((float)$hamperOrder->discount_amount, 2) . ")" : "")
                    . ((float)$hamperOrder->store_credit_used > 0 ? " | Store credit: " . number_format((float)$hamperOrder->store_credit_used, 2) . " (already deducted on hamper order)" : "")
                    . ($hamperOrder->loyalty_points_earned > 0 ? " | Loyalty: {$hamperOrder->loyalty_points_earned} pts (already awarded on hamper order)" : ""),
            ]);

            $order->applyKesSnapshot();

            // Distribute the bundle discount proportionally across items
            $discountDistributed = 0;
            $lastIndex = count($items) - 1;

            foreach ($items as $index => $item) {
                $product = Product::find($item['id'] ?? null);
                
                $unitPrice = (float) ($item['price'] ?? 0);
                $qty = (int) ($item['quantity'] ?? 1);
                $lineTotal = round($unitPrice * $qty, 2);

                // Proportional share of the bundle discount
                if ($originalItemsTotal > 0 && $bundleDiscount > 0) {
                    if ($index === $lastIndex) {
                        $itemDiscount = round($bundleDiscount - $discountDistributed, 2);
                    } else {
                        $itemDiscount = round(($lineTotal / $originalItemsTotal) * $bundleDiscount, 2);
                        $discountDistributed += $itemDiscount;
                    }
                } else {
                    $itemDiscount = 0;
                }

                $lineTotalAfterDiscount = round($lineTotal - $itemDiscount, 2);

                OrderItem::create([
                    'order_id'                  => $order->id,
                    'item_type'                 => 'product',
                    'product_id'                => $item['id'] ?? null,
                    'product_name'              => $item['name'] ?? 'Unknown Item',
                    'product_sku'               => $item['sku'] ?? null,
                    'brand_name'                => $product?->brand?->name,
                    'product_image'             => $item['main_image'] ?? null,
                    'quantity'                  => $qty,
                    'unit_price'                => $unitPrice,
                    'line_total'                => $lineTotal,
                    'discount_amount'           => $itemDiscount,
                    'line_total_after_discount' => $lineTotalAfterDiscount,
                    'completion_status'         => 'not_started',
                    'stock_status'              => $product && $product->stock_quantity >= $qty ? 'in_stock' : 'out_of_stock',
                ]);
                
                if ($product) {
                    $product->decrement('stock_quantity', $qty);
                    if ($product->stock_quantity <= 0) $product->update(['in_stock' => false]);
                }
            }

            // Link HamperOrder to standard Order
            $hamperOrder->order_id = $order->id;
            $hamperOrder->notes = ($hamperOrder->notes ? $hamperOrder->notes . "\n" : "") . "[" . now()->format('Y-m-d H:i:s') . "] Converted to standard order #{$order->order_number}.";
            $hamperOrder->save();

            // Update customer order statistics
            $customer = Customer::find($hamperOrder->customer_id);
            if ($customer) {
                $customer->recalculateStatistics();
            }

            DB::commit();

            return response()->json([
                'message' => 'Successfully converted to standard order',
                'order'   => $order,
            ]);

        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('Hamper conversion failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to convert order', 'error' => $e->getMessage()], 500);
        }
    }
}

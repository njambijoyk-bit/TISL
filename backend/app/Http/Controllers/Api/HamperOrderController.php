<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\HamperOrder;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
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
        $order->status = $request->status;

        $logNote = "[" . now()->format('Y-m-d H:i:s') . "] Status changed from {$oldStatus} to {$order->status}.";
        if ($request->filled('notes')) {
            $logNote .= " Note: " . $request->notes;
        }

        $order->notes = ($order->notes ? $order->notes . "\n" : "") . $logNote;
        $order->save();

        return response()->json(['message' => 'Order status updated', 'data' => $order]);
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

            // Create Standard Order
            $order = Order::create([
                'order_number'               => 'ORD-HMP-' . strtoupper(Str::random(8)),
                'customer_id'                => $hamperOrder->customer_id,
                'placed_by'                  => auth()->id(),
                'subtotal'                   => $originalItemsTotal,
                'tax'                        => $hamperOrder->vat_amount,
                'discount'                   => $bundleDiscount + (float) $hamperOrder->discount_amount,
                'currency'                   => 'KES',
                'exchange_rate_to_kes'       => 1,
                'shipping_cost'              => $hamperOrder->shipping_cost,
                'total'                      => $hamperOrder->total,
                'payment_method'             => 'request_invoice',
                'payment_status'             => 'unpaid',
                'status'                     => 'pending',
                'priority'                   => 'medium',
                'shipping_address'           => is_array($hamperOrder->shipping_address) ? json_encode($hamperOrder->shipping_address) : $hamperOrder->shipping_address,
                'delivery_method'            => 'standard_delivery',
                'referral_code_id'           => $hamperOrder->referral_code_id,
                'promo_discount'             => $hamperOrder->discount_amount,
                'store_credit_deduction'     => $hamperOrder->store_credit_used,
                'store_credit_deduction_kes' => $hamperOrder->store_credit_used,
                'admin_notes'                => "Converted from Hamper Order #{$hamperOrder->order_number}",
            ]);

            $order->applyKesSnapshot();

            // Create Order Items
            foreach ($items as $index => $item) {
                $product = Product::find($item['id'] ?? null);

                $unitPrice = (float) ($item['price'] ?? 0);
                $qty = (int) ($item['quantity'] ?? 1);

                OrderItem::create([
                    'order_id'                  => $order->id,
                    'item_type'                 => 'product',
                    'product_id'                => $item['id'] ?? null,
                    'product_name'              => $item['name'] ?? 'Unknown Item',
                    'product_sku'               => $item['sku'] ?? null,
                    'product_image'             => $item['main_image'] ?? null,
                    'quantity'                  => $qty,
                    'unit_price'                => $unitPrice,
                    'line_total'                => $unitPrice * $qty,
                    'line_total_after_discount' => $unitPrice * $qty,
                    'discount_amount'           => 0,
                    'completion_status'         => 'not_started',
                    'stock_status'              => 'in_stock',
                    'display_order'             => $index,
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

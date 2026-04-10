<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductReview;
use Illuminate\Http\Request;

class ReviewEligibilityController extends Controller
{
    /**
     * Check if customer can review a product
     */
    public function canReview(Request $request, $productId)
    {
        // Get all delivered orders for this user that contain the product
        $eligibleOrders = Order::where('user_id', $request->user()->id)
            ->where('status', 'delivered')
            ->whereHas('items', function($q) use ($productId) {
                $q->where('product_id', $productId);
            })
            ->with(['items' => function($q) use ($productId) {
                $q->where('product_id', $productId);
            }])
            ->get();

        if ($eligibleOrders->isEmpty()) {
            return response()->json([
                'can_review' => false,
                'reason' => 'You must purchase and receive this product before reviewing it'
            ], 200);
        }

        // Check which orders haven't been reviewed yet
        $ordersToReview = [];
        foreach ($eligibleOrders as $order) {
            $hasReviewed = ProductReview::where('user_id', $request->user()->id)
                ->where('product_id', $productId)
                ->where('order_id', $order->id)
                ->exists();

            if (!$hasReviewed) {
                $ordersToReview[] = [
                    'order_id' => $order->id,
                    'order_number' => $order->order_number,
                    'delivered_at' => $order->delivered_at,
                ];
            }
        }

        if (empty($ordersToReview)) {
            return response()->json([
                'can_review' => false,
                'reason' => 'You have already reviewed this product for all your orders'
            ], 200);
        }

        return response()->json([
            'can_review' => true,
            'orders' => $ordersToReview,
            'message' => 'You can review this product'
        ], 200);
    }
}
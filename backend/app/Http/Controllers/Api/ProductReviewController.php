<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductReview;
use App\Models\Product;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class ProductReviewController extends Controller
{
    /**
     * Get all reviews for a product (PUBLIC)
     */
    public function index(Request $request, $productId)
    {
        $product = Product::findOrFail($productId);

        $query = ProductReview::with(['user'])
            ->where('product_id', $productId)
            ->approved();

        // Filter by rating
        if ($request->has('rating')) {
            $query->rating($request->rating);
        }

        // Filter verified purchases only
        if ($request->has('verified_only')) {
            $query->verifiedPurchase();
        }

        // Sort
        $sortBy = $request->get('sort_by', 'created_at');
        $sortOrder = $request->get('sort_order', 'desc');
        
        if ($sortBy === 'helpful') {
            $query->orderBy('helpful_count', 'desc');
        } else {
            $query->orderBy($sortBy, $sortOrder);
        }

        $reviews = $query->paginate($request->get('per_page', 20));

        return response()->json([
            'product' => [
                'id' => $product->id,
                'name' => $product->name,
                'average_rating' => $product->rating,
                'total_reviews' => $product->reviews,
            ],
            'reviews' => $reviews,
            'rating_breakdown' => $this->getRatingBreakdown($productId)
        ], 200);
    }

    /**
     * Get customer's own reviews (CUSTOMER)
     */
    public function myReviews(Request $request)
    {
        $reviews = ProductReview::with(['product', 'order'])
            ->where('user_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($reviews, 200);
    }

    /**
     * Store a new review (CUSTOMER - must have purchased)
     */
    public function store(Request $request, $productId)
    {
        $product = Product::findOrFail($productId);

        $validator = Validator::make($request->all(), [
            'order_id' => 'required|exists:orders,id',
            'rating' => 'required|integer|min:1|max:5',
            'title' => 'nullable|string|max:100',
            'comment' => 'required|string|min:10|max:1000',
            'images' => 'nullable|array|max:5',
            'images.*' => 'image|mimes:jpeg,png,jpg|max:2048',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Verify order belongs to user
        $order = Order::where('id', $request->order_id)
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$order) {
            return response()->json([
                'message' => 'Order not found or does not belong to you'
            ], 404);
        }

        // Verify order contains this product
        $orderItem = OrderItem::where('order_id', $order->id)
            ->where('product_id', $productId)
            ->first();

        if (!$orderItem) {
            return response()->json([
                'message' => 'You have not purchased this product'
            ], 400);
        }

        // Check if already reviewed
        $existingReview = ProductReview::where('user_id', $request->user()->id)
            ->where('product_id', $productId)
            ->where('order_id', $order->id)
            ->first();

        if ($existingReview) {
            return response()->json([
                'message' => 'You have already reviewed this product for this order'
            ], 400);
        }

        try {
            // Handle image uploads
            $imagePaths = [];
            if ($request->hasFile('images')) {
                foreach ($request->file('images') as $image) {
                    $path = $image->store('reviews', 'public');
                    $imagePaths[] = $path;
                }
            }

            // Create review
            $review = ProductReview::create([
                'product_id' => $productId,
                'user_id' => $request->user()->id,
                'order_id' => $order->id,
                'rating' => $request->rating,
                'title' => $request->title,
                'comment' => $request->comment,
                'images' => $imagePaths,
                'is_verified_purchase' => true,
                'is_approved' => false, // Requires admin approval
            ]);

            return response()->json([
                'message' => 'Review submitted successfully. It will be published after admin approval.',
                'review' => $review
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to submit review',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Update own review (CUSTOMER)
     */
    public function update(Request $request, $id)
    {
        $review = ProductReview::findOrFail($id);

        // Check ownership
        if ($review->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validator = Validator::make($request->all(), [
            'rating' => 'integer|min:1|max:5',
            'title' => 'nullable|string|max:100',
            'comment' => 'string|min:10|max:1000',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $review->update([
                'rating' => $request->rating ?? $review->rating,
                'title' => $request->title ?? $review->title,
                'comment' => $request->comment ?? $review->comment,
                'is_approved' => false, // Needs re-approval after edit
            ]);

            return response()->json([
                'message' => 'Review updated. It will be reviewed by admin again.',
                'review' => $review->fresh()
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to update review',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Delete own review (CUSTOMER)
     */
    public function destroy(Request $request, $id)
    {
        $review = ProductReview::findOrFail($id);

        // Check ownership
        if ($review->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        try {
            // Delete images
            if ($review->images) {
                foreach ($review->images as $image) {
                    Storage::disk('public')->delete($image);
                }
            }

            $product = $review->product;
            $review->delete();

            // Update product rating
            $product->updateRating();

            return response()->json([
                'message' => 'Review deleted successfully'
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'message' => 'Failed to delete review',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Mark review as helpful (PUBLIC - once per user)
     */
    public function markHelpful(Request $request, $id)
    {
        $review = ProductReview::findOrFail($id);
        $review->incrementHelpful();

        return response()->json([
            'message' => 'Marked as helpful',
            'helpful_count' => $review->helpful_count
        ], 200);
    }

    // ============================================
    // ADMIN ROUTES
    // ============================================

    /**
     * Get all reviews (ADMIN)
     */
    public function adminIndex(Request $request)
    {
        $query = ProductReview::with(['product', 'user', 'order']);

        // Filter by approval status
        if ($request->has('approved')) {
            if ($request->approved === 'true') {
                $query->approved();
            } else {
                $query->pending();
            }
        }

        // Filter by rating
        if ($request->has('rating')) {
            $query->rating($request->rating);
        }

        // Search
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('comment', 'like', "%{$search}%")
                  ->orWhereHas('user', function($q2) use ($search) {
                      $q2->where('name', 'like', "%{$search}%");
                  })
                  ->orWhereHas('product', function($q2) use ($search) {
                      $q2->where('name', 'like', "%{$search}%");
                  });
            });
        }

        $reviews = $query->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 20));

        return response()->json($reviews, 200);
    }

    /**
     * Approve review (ADMIN)
     */
    public function approve(Request $request, $id)
    {
        $review = ProductReview::findOrFail($id);
        $review->approve();

        return response()->json([
            'message' => 'Review approved',
            'review' => $review->fresh()
        ], 200);
    }

    /**
     * Reject review (ADMIN)
     */
    public function reject(Request $request, $id)
    {
        $review = ProductReview::findOrFail($id);
        $review->reject();

        return response()->json([
            'message' => 'Review rejected',
            'review' => $review->fresh()
        ], 200);
    }

    /**
     * Delete review (ADMIN)
     */
    public function adminDestroy(Request $request, $id)
    {
        $review = ProductReview::findOrFail($id);

        // Delete images
        if ($review->images) {
            foreach ($review->images as $image) {
                Storage::disk('public')->delete($image);
            }
        }

        $product = $review->product;
        $review->delete();

        // Update product rating
        $product->updateRating();

        return response()->json([
            'message' => 'Review deleted'
        ], 200);
    }

    /**
     * Get review statistics (ADMIN)
     */
    public function statistics()
    {
        $stats = [
            'total_reviews' => ProductReview::count(),
            'pending' => ProductReview::pending()->count(),
            'approved' => ProductReview::approved()->count(),
            'verified_purchases' => ProductReview::verifiedPurchase()->count(),
            'with_images' => ProductReview::withImages()->count(),
            'average_rating' => ProductReview::approved()->avg('rating'),
            'rating_breakdown' => [
                '5_star' => ProductReview::approved()->rating(5)->count(),
                '4_star' => ProductReview::approved()->rating(4)->count(),
                '3_star' => ProductReview::approved()->rating(3)->count(),
                '2_star' => ProductReview::approved()->rating(2)->count(),
                '1_star' => ProductReview::approved()->rating(1)->count(),
            ]
        ];

        return response()->json($stats, 200);
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    /**
     * Get rating breakdown for a product
     */
    private function getRatingBreakdown($productId)
    {
        return [
            '5_star' => ProductReview::where('product_id', $productId)->approved()->rating(5)->count(),
            '4_star' => ProductReview::where('product_id', $productId)->approved()->rating(4)->count(),
            '3_star' => ProductReview::where('product_id', $productId)->approved()->rating(3)->count(),
            '2_star' => ProductReview::where('product_id', $productId)->approved()->rating(2)->count(),
            '1_star' => ProductReview::where('product_id', $productId)->approved()->rating(1)->count(),
        ];
    }
}
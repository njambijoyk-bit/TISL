<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProductReview extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'user_id',
        'order_id',
        'rating',
        'title',
        'comment',
        'images',
        'is_verified_purchase',
        'is_approved',
        'helpful_count',
    ];

    protected $casts = [
        'images' => 'array',
        'is_verified_purchase' => 'boolean',
        'is_approved' => 'boolean',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the product this review belongs to.
     */
    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * Get the user who wrote this review.
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the order this review is for (if verified purchase).
     */
    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    // ========================================
    // SCOPES
    // ========================================

    /**
     * Scope to get approved reviews.
     */
    public function scopeApproved($query)
    {
        return $query->where('is_approved', true);
    }

    /**
     * Scope to get pending reviews.
     */
    public function scopePending($query)
    {
        return $query->where('is_approved', false);
    }

    /**
     * Scope to get verified purchase reviews.
     */
    public function scopeVerifiedPurchase($query)
    {
        return $query->where('is_verified_purchase', true);
    }

    /**
     * Scope to filter by rating.
     */
    public function scopeRating($query, $rating)
    {
        return $query->where('rating', $rating);
    }

    /**
     * Scope to get reviews with images.
     */
    public function scopeWithImages($query)
    {
        return $query->whereNotNull('images');
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Approve this review.
     */
    public function approve(): void
    {
        $this->update(['is_approved' => true]);
        
        // Update product rating
        $this->product->updateRating();
    }

    /**
     * Reject/unapprove this review.
     */
    public function reject(): void
    {
        $this->update(['is_approved' => false]);
        
        // Update product rating
        $this->product->updateRating();
    }

    /**
     * Increment helpful count.
     */
    public function incrementHelpful(): void
    {
        $this->increment('helpful_count');
    }

    /**
     * Check if review is from verified purchase.
     */
    public function isVerifiedPurchase(): bool
    {
        return $this->is_verified_purchase;
    }

    /**
     * Check if review is approved.
     */
    public function isApproved(): bool
    {
        return $this->is_approved;
    }

    /**
     * Get star rating as HTML.
     */
    public function getStarsHtml(): string
    {
        $fullStars = floor($this->rating);
        $halfStar = ($this->rating - $fullStars) >= 0.5 ? 1 : 0;
        $emptyStars = 5 - $fullStars - $halfStar;

        $html = str_repeat('⭐', $fullStars);
        if ($halfStar) $html .= '⭐'; // You can use a half-star icon
        $html .= str_repeat('☆', $emptyStars);

        return $html;
    }

    /**
     * Get review excerpt (truncated comment).
     */
    public function getExcerpt($length = 100): string
    {
        if (!$this->comment) {
            return '';
        }

        if (strlen($this->comment) <= $length) {
            return $this->comment;
        }

        return substr($this->comment, 0, $length) . '...';
    }

    /**
     * Get review image URLs.
     */
    public function getImageUrls(): array
    {
        if (empty($this->images)) {
            return [];
        }

        return array_map(function ($image) {
            if (str_starts_with($image, 'http')) {
                return $image;
            }
            return asset('storage/' . $image);
        }, $this->images);
    }

    /**
     * Get reviewer name.
     */
    public function getReviewerName(): string
    {
        if ($this->user) {
            return $this->user->name;
        }
        return 'Anonymous';
    }

    /**
     * Get verified badge HTML.
     */
    public function getVerifiedBadge(): string
    {
        if ($this->is_verified_purchase) {
            return '<span class="badge badge-success">✓ Verified Purchase</span>';
        }
        return '';
    }
}
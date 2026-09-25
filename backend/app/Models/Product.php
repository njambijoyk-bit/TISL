<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\Auction;
use App\Traits\HasCurrencyConversion;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Product extends Model
{
    use HasFactory, SoftDeletes, HasCurrencyConversion;
    
    protected $appends = [
        'main_image_url',
        'image_urls',
    ];

    protected $fillable = [
        'name',
        'slug',
        'sku',
        'category_id',
        'brand_id',
        'type',
        'price',
        'currency_id',
        'original_price',
        'price_is_negotiable',
        'in_stock',
        'stock_quantity',
        'description',
        'short_description',
        'features',
        'specifications',
        'images',
        'main_image',
        'variants',
        'has_variants',
        'bulk_pricing',
        'rating',
        'reviews',
        'badge',
        'is_featured',
        'is_new',
        'on_sale',
        'view_count',
        'purchase_count',
        'meta_title',
        'meta_description',
        'meta_keywords',
        'related_products',
        'recommended_products',
        'status',
        'is_visible',
        'published_at',
        'admin_notes',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'original_price' => 'decimal:2',
        'price_is_negotiable' => 'boolean',
        'in_stock' => 'boolean',
        'features' => 'array',
        'specifications' => 'array',
        'images' => 'array',
        'variants' => 'array',
        'has_variants' => 'boolean',
        'bulk_pricing' => 'array',
        'rating' => 'decimal:2',
        'is_featured' => 'boolean',
        'is_new' => 'boolean',
        'on_sale' => 'boolean',
        'is_visible' => 'boolean',
        'meta_keywords' => 'array',
        'related_products' => 'array',
        'recommended_products' => 'array',
        'published_at' => 'datetime',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the category this product belongs to.
     */
    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    /**
     * Get the brand this product belongs to.
     */
    public function brand()
    {
        return $this->belongsTo(Brand::class);
    }

    // Relationship: Check if product has an active auction
    public function activeAuction()
    {
        return $this->hasOne(Auction::class)->where('status', 'active')->latest();
    }
    /**
     * Get all reviews for this product (alias for productReviews).
     */
    public function reviews()
    {
        return $this->hasMany(ProductReview::class);
    }

    /**
     * Get all reviews for this product.
     */
    public function productReviews()
    {
        return $this->hasMany(ProductReview::class);
    }

    /**
     * Get approved reviews only.
     */
    public function approvedReviews()
    {
        return $this->hasMany(ProductReview::class)->where('is_approved', true);
    }

    /**
     * Get the user who created this product.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the user who last updated this product.
     */
    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Get order items for this product.
     */
    public function orderItems()
    {
        return $this->hasMany(OrderItem::class);
    }

    /**
     * Get quote items for this product.
     */
    public function quoteItems()
    {
        return $this->hasMany(QuoteItem::class);
    }

    // ========================================
    // VARIANT / OPTION / IMAGE RELATIONSHIPS
    // ========================================
    // Named productVariants()/productImages() rather than variants()/images():
    // the products table already has raw JSON columns called 'variants' and
    // 'images' (see $casts above). Eloquent always resolves a magic property
    // access ($product->variants) against an existing raw attribute before
    // it ever considers a relationship of the same name - so a variants()
    // relation would be silently unreachable via $product->variants, only
    // callable as $product->variants(). Distinct names sidestep that trap.

    /**
     * Structured variants (product_variants table) - the new system. Does
     * NOT replace the legacy 'variants' JSON column / has_variants flag;
     * both currently coexist. Use hasStructuredVariants() to tell which
     * system a given product is actually using.
     */
    public function productVariants()
    {
        return $this->hasMany(ProductVariant::class)->orderBy('id');
    }

    public function activeProductVariants()
    {
        return $this->hasMany(ProductVariant::class)->where('status', 'active');
    }

    public function defaultVariant()
    {
        return $this->hasOne(ProductVariant::class)->where('is_default', true);
    }

    public function options()
    {
        return $this->hasMany(ProductOption::class)->orderBy('position');
    }

    /** Gallery/variant/option-value images from product_images - distinct from the raw 'images' JSON column. */
    public function productImages()
    {
        return $this->hasMany(ProductImage::class)->orderBy('position');
    }

    /** Entity-level tax overrides where this product is the taxable entity. */
    public function taxApplicability()
    {
        return $this->morphMany(\App\Models\TaxApplicability::class, 'taxable');
    }

    // ========================================
    // ACCESSORS & MUTATORS
    // ========================================

    /**
     * Get main image URL.
     * ✨ FIXED: Now properly accesses raw attributes
     */
    public function getMainImageUrlAttribute(): ?string
    {
        // Get raw main_image from database attributes (not the accessor)
        $mainImage = $this->attributes['main_image'] ?? null;
        
        if ($mainImage) {
            // If already full URL (external like CDN)
            if (str_starts_with($mainImage, 'http')) {
                return $mainImage;
            }
            // Local storage path - convert to full URL
            // /storage/products/abc.png → http://localhost:8000/storage/products/abc.png
            return asset($mainImage);
        }

        // Fallback to first image if main_image is null
        $images = $this->attributes['images'] ?? null;
        if ($images) {
            // Decode JSON if images is stored as JSON string
            if (is_string($images)) {
                $images = json_decode($images, true);
            }
            
            if (!empty($images) && is_array($images)) {
                $firstImage = $images[0];
                if (str_starts_with($firstImage, 'http')) {
                    return $firstImage;
                }
                return asset($firstImage);
            }
        }

        // Default placeholder
        return asset('images/product-placeholder.png');
    }

    /**
     * Get all image URLs.
     * ✨ FIXED: Now properly handles JSON and array images
     */
    public function getImageUrlsAttribute(): array
    {
        // Get raw images from database
        $images = $this->attributes['images'] ?? null;
        
        // Handle empty images
        if (empty($images)) {
            return [asset('images/product-placeholder.png')];
        }
        
        // Decode JSON if needed
        if (is_string($images)) {
            $images = json_decode($images, true);
        }
        
        // Ensure it's an array
        if (!is_array($images)) {
            return [asset('images/product-placeholder.png')];
        }

        // Convert all paths to full URLs
        return array_map(function ($image) {
            if (str_starts_with($image, 'http')) {
                return $image; // Already full URL
            }
            return asset($image); // Convert to full URL
        }, $images);
    }

    /**
     * Automatically generate slug from name.
     */
    public function setNameAttribute($value)
    {
        $this->attributes['name'] = $value;
        
        if (!isset($this->attributes['slug']) || empty($this->attributes['slug'])) {
            $this->attributes['slug'] = Str::slug($value);
        }
    }

    /**
     * Get discount percentage if on sale.
     */
    public function getDiscountPercentageAttribute(): ?float
    {
        if ($this->original_price && $this->original_price > $this->price) {
            return round((($this->original_price - $this->price) / $this->original_price) * 100, 2);
        }
        return null;
    }

    /** Converted price for browsing/comparison — the raw price/currency_id stay untouched. */
    public function getDisplayPriceAttribute(): ?float
    {
        return $this->convertAmount((float) $this->price);
    }

    // ========================================
    // SCOPES
    // ========================================

    /**
     * Scope to get active products.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active')->where('is_visible', true);
    }

    /**
     * Scope to get in stock products.
     */
    public function scopeInStock($query)
    {
        return $query->where('in_stock', true)->where('stock_quantity', '>', 0);
    }

    /**
     * Scope to get featured products.
     */
    public function scopeFeatured($query)
    {
        return $query->where('is_featured', true);
    }

    /**
     * Scope to get products on sale.
     */
    public function scopeOnSale($query)
    {
        return $query->where('on_sale', true);
    }

    /**
     * Scope to get new products.
     */
    public function scopeNew($query)
    {
        return $query->where('is_new', true);
    }

    /**
     * Scope to filter by category.
     */
    public function scopeInCategory($query, $categoryId)
    {
        return $query->where('category_id', $categoryId);
    }

    /**
     * Scope to filter by brand.
     */
    public function scopeByBrand($query, $brandId)
    {
        return $query->where('brand_id', $brandId);
    }

    /**
     * Scope to filter by price range.
     */
    public function scopePriceRange($query, $min, $max)
    {
        return $query->whereBetween('price', [$min, $max]);
    }

    /**
     * Scope to search products.
     */
    public function scopeSearch($query, $search)
    {
        return $query->where(function ($q) use ($search) {
            $q->where('name', 'like', "%{$search}%")
              ->orWhere('description', 'like', "%{$search}%")
              ->orWhere('short_description', 'like', "%{$search}%")
              ->orWhere('sku', 'like', "%{$search}%");
        });
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Check if product is in stock.
     */
    public function isInStock(): bool
    {
        return $this->in_stock && $this->stock_quantity > 0;
    }

    /**
     * Check if product needs restocking.
     */
    public function needsRestock($threshold = 10): bool
    {
        return $this->stock_quantity <= $threshold;
    }

    /**
     * Increment view count.
     */
    public function incrementViewCount(): void
    {
        $this->increment('view_count');
    }

    /**
     * Increment purchase count.
     */
    public function incrementPurchaseCount($quantity = 1): void
    {
        $this->increment('purchase_count', $quantity);
    }

    /**
     * Decrease stock quantity.
     */
    public function decreaseStock($quantity): void
    {
        $newQuantity = $this->stock_quantity - $quantity;
        
        $this->update([
            'stock_quantity' => max(0, $newQuantity),
            'in_stock' => $newQuantity > 0
        ]);
    }

    /**
     * Increase stock quantity.
     */
    public function increaseStock($quantity): void
    {
        $this->increment('stock_quantity', $quantity);
        
        if (!$this->in_stock) {
            $this->update(['in_stock' => true]);
        }
    }

    /**
     * Calculate average rating from reviews.
     */
    public function updateRating(): void
    {
        $avgRating = $this->approvedReviews()->avg('rating');
        $reviewCount = $this->approvedReviews()->count();

        $this->update([
            'rating' => $avgRating ?? 0,
            'reviews' => $reviewCount
        ]);
    }

    /**
     * Get price to display (considering negotiable).
     */
    public function getDisplayPrice(): string
    {
        if ($this->price_is_negotiable) {
            return 'Negotiable - Request Quote';
        }

        $price = 'KSh ' . number_format($this->price, 2);

        if ($this->original_price && $this->original_price > $this->price) {
            $originalPrice = 'KSh ' . number_format($this->original_price, 2);
            return "{$price} <del>{$originalPrice}</del>";
        }

        return $price;
    }

    /**
     * Whether this product's variants live in the structured product_variants
     * table (new system) rather than only the legacy 'variants' JSON column.
     * has_variants alone doesn't tell you which system populated it.
     */
    public function hasStructuredVariants(): bool
    {
        return $this->has_variants && $this->productVariants()->exists();
    }

    /**
     * Check if product has bulk pricing.
     */
    public function hasBulkPricing(): bool
    {
        return !empty($this->bulk_pricing);
    }

    /**
     * Get bulk price for quantity.
     */
    public function getBulkPrice($quantity): ?float
    {
        if (!$this->hasBulkPricing()) {
            return null;
        }

        foreach ($this->bulk_pricing as $tier) {
            if ($quantity >= $tier['min_qty'] && $quantity <= $tier['max_qty']) {
                return (float) $tier['price'];
            }
        }

        return null;
    }
}
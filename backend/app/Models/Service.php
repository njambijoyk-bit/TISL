<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class Service extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'name',
        'slug',
        'sku',
        'category_id',
        'service_category',
        'type',
        'base_price',
        'price_is_negotiable',
        'pricing_model',
        'hourly_rate',
        'daily_rate',
        'minimum_charge',
        'description',
        'short_description',
        'features',
        'deliverables',
        'requirements',
        'estimated_duration',
        'unit_of_measure',
        'requires_site_visit',
        'is_remote_available',
        'service_area',
        'max_concurrent_bookings',
        'pricing_tiers',
        'images',
        'main_image',
        'brochure_url',
        'video_url',
        'is_available',
        'status',
        'is_visible',
        'lead_time',
        'booking_required',
        'related_services',
        'required_products',
        'optional_products',
        'meta_title',
        'meta_description',
        'meta_keywords',
        'badge',
        'is_featured',
        'rating',
        'review_count',
        'quote_count',
        'order_count',
        'view_count',
        'admin_notes',
        'created_by',
        'updated_by',
        'published_at',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'base_price' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'daily_rate' => 'decimal:2',
        'minimum_charge' => 'decimal:2',
        'price_is_negotiable' => 'boolean',
        'requires_site_visit' => 'boolean',
        'is_remote_available' => 'boolean',
        'is_available' => 'boolean',
        'is_visible' => 'boolean',
        'booking_required' => 'boolean',
        'is_featured' => 'boolean',
        'features' => 'array',
        'deliverables' => 'array',
        'requirements' => 'array',
        'pricing_tiers' => 'array',
        'images' => 'array',
        'related_services' => 'array',
        'required_products' => 'array',
        'optional_products' => 'array',
        'meta_keywords' => 'array',
        'rating' => 'decimal:2',
        'review_count' => 'integer',
        'quote_count' => 'integer',
        'order_count' => 'integer',
        'view_count' => 'integer',
        'max_concurrent_bookings' => 'integer',
        'published_at' => 'datetime',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'status_label',
        'pricing_model_label',
        'main_image_url',
        'images_url',
        'is_published',
        'required_products_full',
        'optional_products_full',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the category this service belongs to.
     */
    public function category()
    {
        return $this->belongsTo(ServiceCategory::class, 'category_id');
    }

    /**
     * Alias for category relationship
     */
    public function serviceCategory()
    {
        return $this->belongsTo(ServiceCategory::class, 'category_id');
    }

    /**
     * Get the user who created this service.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the user who last updated this service.
     */
    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Get all quote items that reference this service.
     */
    public function quoteItems()
    {
        return $this->hasMany(QuoteItem::class);
    }

    /**
     * Get all order items that reference this service.
     */
    public function orderItems()
    {
        return $this->hasMany(OrderItem::class);
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    public function getRequiredProductsFullAttribute()
    {
        return $this->getRequiredProducts()->values();
    }

    public function getOptionalProductsFullAttribute()
    {
        return $this->getOptionalProducts()->values();
    }


    /**
     * Get human-readable status label.
     */
    public function getStatusLabelAttribute(): string
    {
        return match($this->status) {
            'draft' => 'Draft',
            'active' => 'Active',
            'inactive' => 'Inactive',
            'discontinued' => 'Discontinued',
            default => ucfirst($this->status),
        };
    }

    /**
     * Get human-readable pricing model label.
     */
    public function getPricingModelLabelAttribute(): string
    {
        return match($this->pricing_model) {
            'fixed' => 'Fixed Price',
            'hourly' => 'Hourly Rate',
            'daily' => 'Daily Rate',
            'project_based' => 'Project Based',
            'subscription' => 'Subscription',
            default => ucfirst($this->pricing_model),
        };
    }

    /**
     * Get main image URL.
     */
    public function getMainImageUrlAttribute()
    {
        // Case 1: explicit URL already stored
        if ($this->main_image && str_starts_with($this->main_image, 'http')) {
            return $this->main_image;
        }

        // Case 2: JSON array
        $images = json_decode($this->main_image, true);
        if (is_array($images) && count($images) > 0) {
            return asset($images[0]);
        }

        // Case 3: single relative path
        if ($this->main_image) {
            return asset($this->main_image);
        }

        return asset('/images/service-placeholder.png');
    }
   
    public function getImagesUrlAttribute()
    {
        if (!$this->images) return [];

        return collect($this->images)->map(function ($img) {
            // If it's already a URL
            if (str_starts_with($img, 'http')) return $img;

            // Otherwise prefix with asset path
            return asset($img);
        })->toArray();
    }

    /**
     * Check if service is published.
     */
    public function getIsPublishedAttribute(): bool
    {
        return $this->published_at !== null && $this->published_at <= now();
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get only active services.
     */
    public function scopeActive($query)
    {
        return $query->where('status', 'active')
                     ->where('is_available', true);
    }

    /**
     * Scope to get visible services.
     */
    public function scopeVisible($query)
    {
        return $query->where('is_visible', true);
    }

    /**
     * Scope to get published services.
     */
    public function scopePublished($query)
    {
        return $query->whereNotNull('published_at')
                     ->where('published_at', '<=', now());
    }

    /**
     * Scope to get featured services.
     */
    public function scopeFeatured($query)
    {
        return $query->where('is_featured', true);
    }

    /**
     * Scope to get services by category.
     */
    public function scopeByCategory($query, int $categoryId)
    {
        return $query->where('category_id', $categoryId);
    }

    /**
     * Scope to get services by pricing model.
     */
    public function scopeByPricingModel($query, string $model)
    {
        return $query->where('pricing_model', $model);
    }

    /**
     * Scope to search services.
     */
    public function scopeSearch($query, string $search)
    {
        return $query->where(function ($q) use ($search) {
            $q->where('name', 'like', "%{$search}%")
              ->orWhere('description', 'like', "%{$search}%")
              ->orWhere('sku', 'like', "%{$search}%")
              ->orWhere('service_category', 'like', "%{$search}%");
        });
    }

    /**
     * Scope to filter by remote availability.
     */
    public function scopeRemoteAvailable($query)
    {
        return $query->where('is_remote_available', true);
    }

    /**
     * Scope to filter by site visit requirement.
     */
    public function scopeRequiresSiteVisit($query)
    {
        return $query->where('requires_site_visit', true);
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Increment quote count.
     */
    public function incrementQuoteCount(): void
    {
        $this->increment('quote_count');
    }

    /**
     * Increment order count.
     */
    public function incrementOrderCount(): void
    {
        $this->increment('order_count');
    }

    /**
     * Increment view count.
     */
    public function incrementViewCount(): void
    {
        $this->increment('view_count');
    }

    /**
     * Mark as published.
     */
    public function markAsPublished(): void
    {
        $this->update([
            'status' => 'active',
            'published_at' => now(),
        ]);
    }

    /**
     * Mark as draft.
     */
    public function markAsDraft(): void
    {
        $this->update([
            'status' => 'draft',
            'published_at' => null,
        ]);
    }

    /**
     * Get price based on pricing model.
     */
    public function getPrice(): ?float
    {
        return match($this->pricing_model) {
            'fixed' => $this->base_price,
            'hourly' => $this->hourly_rate,
            'daily' => $this->daily_rate,
            'project_based' => $this->base_price,
            'subscription' => $this->base_price,
            default => $this->base_price,
        };
    }

    /**
     * Check if service can be booked.
     */
    public function canBeBooked(): bool
    {
        return $this->is_available 
            && $this->status === 'active' 
            && $this->is_visible;
    }

    /**
     * Get all related service models.
     */
    public function getRelatedServices()
    {
        if (!$this->related_services || empty($this->related_services)) {
            return collect([]);
        }

        return Service::whereIn('id', $this->related_services)
                     ->active()
                     ->get();
    }

    /**
     * Get all required product models.
     */
    public function getRequiredProducts()
    {
        if (!$this->required_products || empty($this->required_products)) {
            return collect([]);
        }

        return Product::whereIn('id', $this->required_products)
                     ->active()
                     ->get();
    }

    /**
     * Get all optional product models.
     */
    public function getOptionalProducts()
    {
        if (!$this->optional_products || empty($this->optional_products)) {
            return collect([]);
        }

        return Product::whereIn('id', $this->optional_products)
                     ->active()
                     ->get();
    }

    // ========================================
    // EVENTS
    // ========================================

    /**
     * Boot method for model events.
     */
    protected static function boot()
    {
        parent::boot();
        
        // Auto-generate slug before creating
        static::creating(function ($service) {
            if (!$service->slug) {
                $service->slug = Str::slug($service->name);
            }
        });

        // Update slug when name changes
        static::updating(function ($service) {
            if ($service->isDirty('name') && !$service->isDirty('slug')) {
                $service->slug = Str::slug($service->name);
            }
        });
    }
}
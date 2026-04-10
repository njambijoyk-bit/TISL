<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class QuoteItem extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'quote_id',
        'item_type',
        'is_custom_item',
        'product_id',
        'product_name',
        'product_sku',
        'brand_name',
        'product_image',
        'variant_details',
        'service_id',
        'service_name',
        'service_description',
        'service_category',
        'custom_item_details',
        'quantity',
        'unit_of_measure',
        'unit_price',
        'original_price',
        'line_total',
        'discount_amount',
        'line_total_after_discount',
        'estimated_hours',
        'hourly_rate',
        'labor_cost',
        'material_cost',
        'estimated_duration',
        'scheduled_start_date',
        'scheduled_end_date',
        'is_bulk_pricing',
        'is_negotiated_price',
        'is_taxable',
        'pricing_notes',
        'availability_status',
        'lead_time',
        'requires_site_visit',
        'prerequisites',
        'notes',
        'display_order',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'is_custom_item' => 'boolean',
        'quantity' => 'decimal:2',
        'unit_price' => 'decimal:2',
        'original_price' => 'decimal:2',
        'line_total' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'line_total_after_discount' => 'decimal:2',
        'estimated_hours' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'labor_cost' => 'decimal:2',
        'material_cost' => 'decimal:2',
        'variant_details' => 'array',
        'custom_item_details' => 'array',
        'scheduled_start_date' => 'date',
        'scheduled_end_date' => 'date',
        'is_bulk_pricing' => 'boolean',
        'is_negotiated_price' => 'boolean',
        'is_taxable' => 'boolean',
        'requires_site_visit' => 'boolean',
        'display_order' => 'integer',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'item_type_label',
        'is_product',
        'is_service',
        'has_discount',
        'discount_percentage',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the quote this item belongs to.
     */
    public function quote()
    {
        return $this->belongsTo(Quote::class);
    }

    /**
     * Get the product (may be null if custom item or service).
     */
    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * Get the service (may be null if custom item or product).
     */
    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    /**
     * Get order items created from this quote item.
     */
    public function orderItems()
    {
        return $this->hasMany(OrderItem::class, 'quote_item_id');
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    /**
     * Get human-readable item type label.
     */
    public function getItemTypeLabelAttribute(): string
    {
        return match($this->item_type) {
            'product' => 'Product',
            'service' => 'Service',
            'fee' => 'Fee',
            'custom_product' => 'Custom Product',
            'custom_service' => 'Custom Service',
            'custom' => 'Custom Item',
            default => ucfirst($this->item_type),
        };
    }

    /**
     * Check if item is a product.
     */
    public function getIsProductAttribute(): bool
    {
        return in_array($this->item_type, ['product', 'custom_product']);
    }

    /**
     * Check if item is a service.
     */
    public function getIsServiceAttribute(): bool
    {
        return in_array($this->item_type, ['service', 'custom_service']);
    }

    /**
     * Check if item has a discount.
     */
    public function getHasDiscountAttribute(): bool
    {
        return $this->discount_amount > 0;
    }

    /**
     * Calculate discount percentage.
     */
    public function getDiscountPercentageAttribute(): float
    {
        if ($this->line_total == 0) {
            return 0;
        }

        return round(($this->discount_amount / $this->line_total) * 100, 2);
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get items for a specific quote.
     */
    public function scopeForQuote($query, int $quoteId)
    {
        return $query->where('quote_id', $quoteId);
    }

    /**
     * Scope to get items by type.
     */
    public function scopeByType($query, string $type)
    {
        return $query->where('item_type', $type);
    }

    /**
     * Scope to get product items.
     */
    public function scopeProducts($query)
    {
        return $query->whereIn('item_type', ['product', 'custom_product']);
    }

    /**
     * Scope to get service items.
     */
    public function scopeServices($query)
    {
        return $query->whereIn('item_type', ['service', 'custom_service']);
    }

    /**
     * Scope to get custom items.
     */
    public function scopeCustom($query)
    {
        return $query->where('is_custom_item', true);
    }

    /**
     * Scope to get catalog items (non-custom).
     */
    public function scopeCatalog($query)
    {
        return $query->where('is_custom_item', false);
    }

    /**
     * Scope to get items requiring site visit.
     */
    public function scopeRequiresSiteVisit($query)
    {
        return $query->where('requires_site_visit', true);
    }

    /**
     * Scope to get items ordered by display_order.
     */
    public function scopeOrdered($query)
    {
        return $query->orderBy('display_order', 'asc')
                     ->orderBy('id', 'asc');
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Calculate line total from quantity and unit price.
     */
    public function calculateLineTotal(): float
    {
        $qty = floatval($this->quantity ?? 0);
        $original = floatval($this->original_price ?? $this->unit_price ?? 0);

        return $original * $qty; // ✅ original_price × quantity
    }

    /**
     * Get item display name.
     */
    public function getDisplayName(): string
    {
        if ($this->is_product) {
            return $this->product_name ?? 'Unknown Product';
        }

        if ($this->is_service) {
            return $this->service_name ?? 'Unknown Service';
        }

        return $this->product_name ?? $this->service_name ?? 'Custom Item';
    }

    /**
     * Get product/service image URL.
     */
    public function getImageUrl(): string
    {
        $image = $this->product_image;

        if (!$image) {
            return $this->is_service 
                ? asset('images/service-placeholder.png')
                : asset('images/product-placeholder.png');
        }

        if (str_starts_with($image, 'http')) {
            return $image;
        }

        return asset('storage/' . $image);
    }

    /**
     * Calculate total cost (labor + materials).
     */
    public function getTotalCost(): float
    {
        return ($this->labor_cost ?? 0) + ($this->material_cost ?? 0);
    }

    /**
     * Check if item is available.
     */
    public function isAvailable(): bool
    {
        return $this->availability_status === 'in_stock' 
            || $this->availability_status === 'available';
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
        
        // Auto-calculate line_total before saving
        static::saving(function ($item) {
            // Recompute whenever any pricing input changes
            if ($item->isDirty(['quantity', 'unit_price', 'original_price'])) {

                $qty = floatval($item->quantity ?? 0);

                // Ensure original_price always exists (fallback to unit_price)
                $original = floatval($item->original_price ?? $item->unit_price ?? 0);
                $unit = floatval($item->unit_price ?? 0);

                // ✅ Your definitions
                $item->original_price = $original;
                $item->line_total = $original * $qty;

                $item->discount_amount = ($original - $unit) * $qty;

                $item->line_total_after_discount = $item->line_total - $item->discount_amount;
            }
        });
    }
}
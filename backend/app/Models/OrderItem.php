<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'order_id',
        // NEW SERVICE FIELDS
        'item_type',
        'is_custom_item',
        // END NEW FIELDS
        'product_id',
        // NEW SERVICE FIELDS
        'service_id',
        // END NEW FIELDS
        'quote_item_id',
        'product_name',
        'product_sku',
        'brand_name',
        'product_image',
        // NEW SERVICE FIELDS
        'service_name',
        'service_description',
        'service_category',
        'custom_item_details',
        // END NEW FIELDS
        'quantity',
        // NEW SERVICE FIELDS
        'unit_of_measure',
        // END NEW FIELDS
        'backorder_quantity',
        'fulfillment_status',
        'unit_price',
        'line_total',
        'discount_amount',
        'line_total_after_discount',
        // NEW SERVICE FIELDS
        'estimated_hours',
        'hourly_rate',
        'labor_cost',
        'material_cost',
        'estimated_duration',
        'scheduled_start_date',
        'scheduled_end_date',
        'completion_status',
        'completion_percentage',
        'is_taxable',
        'requires_site_visit',
        'prerequisites',
        // END NEW FIELDS
        'variant_details',
        'stock_status',
        'reserved_at',
        'is_bulk_pricing',
        'is_negotiated_price',
        'pricing_notes',
        'notes',
        'quantity_returned',
        'refund_amount',
        'return_status',
        'line_total_kes',
        'line_total_after_discount_kes',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'quantity' => 'decimal:2',
        'backorder_quantity' => 'integer',
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'line_total_after_discount' => 'decimal:2',
        // NEW SERVICE FIELDS
        'estimated_hours' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'labor_cost' => 'decimal:2',
        'material_cost' => 'decimal:2',
        'scheduled_start_date' => 'date',
        'scheduled_end_date' => 'date',
        'completion_percentage' => 'integer',
        'is_custom_item' => 'boolean',
        'is_taxable' => 'boolean',
        'requires_site_visit' => 'boolean',
        'custom_item_details' => 'array',
        // END NEW FIELDS
        'variant_details' => 'array',
        'reserved_at' => 'datetime',
        'is_bulk_pricing' => 'boolean',
        'is_negotiated_price' => 'boolean',
        'quantity_returned' => 'integer',
        'refund_amount' => 'decimal:2',
        'line_total_kes' => 'decimal:2',
        'line_total_after_discount_kes' => 'decimal:2',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'in_stock_quantity',
        'is_backorder',
        'is_partial_backorder',
        'is_fully_in_stock',
        // NEW SERVICE ATTRIBUTES
        'item_type_label',
        'is_product',
        'is_service',
        'is_in_progress',
        'is_completed',
        // END NEW ATTRIBUTES
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the order this item belongs to.
     */
    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    /**
     * Get the product (may be null if product deleted or service).
     */
    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * Get the service (may be null if service deleted or product).
     */
    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    /**
     * Get the quote item this was converted from (if applicable).
     */
    public function quoteItem()
    {
        return $this->belongsTo(QuoteItem::class);
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    /**
     * Get in-stock quantity (total - backorder).
     */
    public function getInStockQuantityAttribute(): int
    {
        return max(0, $this->quantity - $this->backorder_quantity);
    }

    /**
     * Check if item has backorder quantity.
     */
    public function getIsBackorderAttribute(): bool
    {
        return $this->backorder_quantity > 0;
    }

    /**
     * Check if item is partially backordered.
     */
    public function getIsPartialBackorderAttribute(): bool
    {
        return $this->backorder_quantity > 0 && $this->backorder_quantity < $this->quantity;
    }

    /**
     * Check if item is fully in stock.
     */
    public function getIsFullyInStockAttribute(): bool
    {
        return $this->backorder_quantity === 0;
    }

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
     * Check if service is in progress.
     */
    public function getIsInProgressAttribute(): bool
    {
        return $this->is_service && $this->completion_status === 'in_progress';
    }

    /**
     * Check if service is completed.
     */
    public function getIsCompletedAttribute(): bool
    {
        return $this->is_service && $this->completion_status === 'completed';
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get items for a specific order.
     */
    public function scopeForOrder($query, int $orderId)
    {
        return $query->where('order_id', $orderId);
    }

    /**
     * Scope to get items for a specific product.
     */
    public function scopeForProduct($query, int $productId)
    {
        return $query->where('product_id', $productId);
    }

    /**
     * Scope to get items for a specific service.
     */
    public function scopeForService($query, int $serviceId)
    {
        return $query->where('service_id', $serviceId);
    }

    /**
     * Scope to get items with backorder.
     */
    public function scopeWithBackorder($query)
    {
        return $query->where('backorder_quantity', '>', 0);
    }

    /**
     * Scope to get fully in-stock items.
     */
    public function scopeFullyInStock($query)
    {
        return $query->where('backorder_quantity', 0);
    }

    /**
     * Scope to get items by fulfillment status.
     */
    public function scopeByFulfillmentStatus($query, string $status)
    {
        return $query->where('fulfillment_status', $status);
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
     * Scope to get items by completion status.
     */
    public function scopeByCompletionStatus($query, string $status)
    {
        return $query->where('completion_status', $status);
    }

    /**
     * Scope to get in-progress services.
     */
    public function scopeInProgress($query)
    {
        return $query->services()->where('completion_status', 'in_progress');
    }

    /**
     * Scope to get completed services.
     */
    public function scopeCompleted($query)
    {
        return $query->services()->where('completion_status', 'completed');
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Calculate line total from quantity and unit price.
     */
    public function calculateLineTotal(): float
    {
        return $this->quantity * $this->unit_price;
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
    public function getProductImageUrl(): string
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
     * Mark service as started.
     */
    public function markAsStarted(): void
    {
        if (!$this->is_service) {
            return;
        }

        $this->update([
            'completion_status' => 'in_progress',
            'completion_percentage' => $this->completion_percentage > 0 ? $this->completion_percentage : 10,
        ]);
    }

    /**
     * Mark service as completed.
     */
    public function markAsCompleted(): void
    {
        if (!$this->is_service) {
            return;
        }

        $this->update([
            'completion_status' => 'completed',
            'completion_percentage' => 100,
        ]);
    }

    /**
     * Update completion percentage.
     */
    public function updateCompletionPercentage(int $percentage): void
    {
        if (!$this->is_service) {
            return;
        }

        $percentage = max(0, min(100, $percentage));

        $status = match(true) {
            $percentage === 0 => 'not_started',
            $percentage === 100 => 'completed',
            default => 'in_progress',
        };

        $this->update([
            'completion_percentage' => $percentage,
            'completion_status' => $status,
        ]);
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

        static::saving(function ($item) {
            // Skip auto-calculation for quote conversions
            if ($item->quote_item_id !== null && !$item->exists) {
                return;
            }

            if ($item->isDirty(['quantity', 'unit_price', 'discount_amount'])) {
                $qty        = (float) $item->quantity;
                $unitPrice  = (float) $item->unit_price;
                $discAmount = (float) $item->discount_amount; // signed: + discount, - markup

                // net payable = what customer actually pays
                $item->line_total_after_discount = round($qty * $unitPrice, 2);

                // gross reference = net + signed adjustment
                // positive discAmount → line_total > line_total_after_discount (discount case)
                // negative discAmount → line_total < line_total_after_discount (markup case)
                $item->line_total = round($item->line_total_after_discount + $discAmount, 2);
            }
        });
    }
}
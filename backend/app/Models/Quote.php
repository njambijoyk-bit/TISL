<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\Currency;

class Quote extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'quote_number',
        'customer_id',
        'created_by',
        'assigned_to',
        'subtotal',
        'tax',
        'discount',
        'discount_percentage',
        'shipping_cost',
        'total',
        'quote_type',
        'status',
        'priority',
        'valid_from',
        'valid_until',
        'converted_to_order_id',
        'converted_at',
        'customer_notes',
        'admin_notes',
        'terms_and_conditions',
        'payment_terms',
        'delivery_terms',
        'sent_at',
        'viewed_at',
        'responded_at',
        'rejection_reason',
        'pricing_type',
        'is_negotiable',
        'currency',
        'exchange_rate_to_kes',
        'subtotal_kes',
        'total_kes',
        'converted_currency_at',
        'service_start_date',
        'service_end_date',
        'billing_schedule',
        'reference_number',
        'version',
        'parent_quote_id',
        'metadata',
        'shipping_address',
        'billing_address',
        'billing_same_as_shipping',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'subtotal' => 'decimal:2',
        'tax' => 'decimal:2',
        'discount' => 'decimal:2',
        'discount_percentage' => 'decimal:2',
        'shipping_cost' => 'decimal:2',
        'total' => 'decimal:2',
        'exchange_rate_to_kes' => 'decimal:8',
        'subtotal_kes' => 'decimal:2',
        'total_kes' => 'decimal:2',
        'converted_currency_at' => 'datetime',
        'is_negotiable' => 'boolean',
        'billing_same_as_shipping' => 'boolean',
        'metadata' => 'array',
        'valid_from' => 'datetime',
        'valid_until' => 'datetime',
        'converted_at' => 'datetime',
        'sent_at' => 'datetime',
        'viewed_at' => 'datetime',
        'responded_at' => 'datetime',
        'service_start_date' => 'datetime',
        'service_end_date' => 'datetime',
        'version' => 'integer',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'status_label',
        'quote_type_label',
        'is_expired',
        'is_valid',
        'is_converted',
        'can_be_approved',
        'can_be_revised',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the customer that owns the quote.
     */
    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Get the user who created this quote.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the admin assigned to this quote.
     */
    public function assignedTo()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /**
     * Get all items for this quote.
     */
    public function items()
    {
        return $this->hasMany(QuoteItem::class);
    }

    /**
     * Get the order this quote was converted to.
     */
    public function order()
    {
        return $this->belongsTo(Order::class, 'converted_to_order_id');
    }

    /**
     * Get the parent quote (if this is a revision).
     */
    public function parentQuote()
    {
        return $this->belongsTo(Quote::class, 'parent_quote_id');
    }

    /**
     * Get all quote revisions (child quotes).
     */
    public function revisions()
    {
        return $this->hasMany(Quote::class, 'parent_quote_id');
    }

    /**
     * Get quote requests that led to this quote.
     */
    public function quoteRequests()
    {
        return $this->hasMany(QuoteRequest::class);
    }

    // ========================================
    // ACCESSORS (Computed Properties)
    // ========================================

    /**
     * Get human-readable status label.
     */
    public function getStatusLabelAttribute(): string
    {
        return match($this->status) {
            'draft' => 'Draft',
            'pending' => 'Pending Approval',
            'revised' => 'Revised',
            'approved' => 'Approved',
            'rejected' => 'Rejected',
            'expired' => 'Expired',
            'converted' => 'Converted to Order',
            default => ucfirst($this->status),
        };
    }

    /**
     * Get human-readable quote type label.
     */
    public function getQuoteTypeLabelAttribute(): string
    {
        return match($this->quote_type) {
            'product' => 'Product Quote',
            'service' => 'Service Quote',
            'mixed' => 'Product & Service Quote',
            default => ucfirst($this->quote_type),
        };
    }

    /**
     * Check if quote is expired.
     */
    public function getIsExpiredAttribute(): bool
    {
        return $this->valid_until && $this->valid_until < now();
    }

    /**
     * Check if quote is currently valid.
     */
    public function getIsValidAttribute(): bool
    {
        if (!$this->valid_from || !$this->valid_until) {
            return false;
        }

        return now()->between($this->valid_from, $this->valid_until);
    }

    /**
     * Check if quote has been converted to order.
     */
    public function getIsConvertedAttribute(): bool
    {
        return $this->status === 'converted' && $this->converted_to_order_id !== null;
    }

    /**
     * Check if quote can be approved.
     */
    public function getCanBeApprovedAttribute(): bool
    {
        return in_array($this->status, ['pending', 'revised']) && $this->is_valid;
    }

    /**
     * Check if quote can be revised.
     */
    public function getCanBeRevisedAttribute(): bool
    {
        return in_array($this->status, ['pending', 'rejected']);
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get quotes by status.
     */
    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Scope to get draft quotes.
     */
    public function scopeDraft($query)
    {
        return $query->where('status', 'draft');
    }

    /**
     * Scope to get pending quotes.
     */
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    /**
     * Scope to get approved quotes.
     */
    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    /**
     * Scope to get converted quotes.
     */
    public function scopeConverted($query)
    {
        return $query->where('status', 'converted');
    }

    /**
     * Scope to get expired quotes.
     */
    public function scopeExpired($query)
    {
        return $query->where('status', 'expired')
                     ->orWhere(function ($q) {
                         $q->whereNotNull('valid_until')
                           ->where('valid_until', '<', now());
                     });
    }

    /**
     * Scope to get valid quotes.
     */
    public function scopeValid($query)
    {
        return $query->whereNotNull('valid_from')
                     ->whereNotNull('valid_until')
                     ->where('valid_from', '<=', now())
                     ->where('valid_until', '>=', now());
    }

    /**
     * Scope to get quotes for a specific customer.
     */
    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    /**
     * Scope to get quotes by type.
     */
    public function scopeByType($query, string $type)
    {
        return $query->where('quote_type', $type);
    }

    /**
     * Scope to search quotes.
     */
    public function scopeSearch($query, string $search)
    {
        return $query->where(function ($q) use ($search) {
            $q->where('quote_number', 'like', "%{$search}%")
              ->orWhere('reference_number', 'like', "%{$search}%")
              ->orWhereHas('customer', function ($customerQuery) use ($search) {
                  $customerQuery->where('first_name', 'like', "%{$search}%")
                               ->orWhere('last_name', 'like', "%{$search}%")
                               ->orWhere('email', 'like', "%{$search}%");
              });
        });
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Send quote to customer.
     */
    public function send(): void
    {
        $this->update([
            'status' => 'pending',
            'sent_at' => now(),
        ]);
    }

    /**
     * Mark quote as viewed by customer.
     */
    public function markAsViewed(): void
    {
        if (!$this->viewed_at) {
            $this->update(['viewed_at' => now()]);
        }
    }

    /**
     * Approve quote.
     */
    public function approve(): void
    {
        $this->update([
            'status' => 'approved',
            'responded_at' => now(),
        ]);
    }

    /**
     * Reject quote.
     */
    public function reject(string $reason): void
    {
        $this->update([
            'status' => 'rejected',
            'rejection_reason' => $reason,
            'responded_at' => now(),
        ]);
    }

    /**
     * Create a revision of this quote.
     */
    public function createRevision(): self
    {
        $revision = $this->replicate();
        $revision->parent_quote_id = $this->id;
        $revision->version = $this->version + 1;
        $revision->status = 'draft';
        $revision->sent_at = null;
        $revision->viewed_at = null;
        $revision->responded_at = null;
        $revision->save();

        // Copy items
        foreach ($this->items as $item) {
            $newItem = $item->replicate();
            $newItem->quote_id = $revision->id;
            $newItem->save();
        }

        return $revision;
    }

    /**
     * Convert quote to order.
     */
    public function convertToOrder(): Order
    {
        $order = Order::create([
            'assigned_to' => $this->assigned_to,
            'customer_id' => $this->customer_id,
            'placed_by' => $this->created_by,
            'quote_id' => $this->id,
            'subtotal' => $this->subtotal,
            'tax' => $this->tax,
            'discount' => $this->discount,
            'currency' => $this->currency,
            'exchange_rate_to_kes' => $this->exchange_rate_to_kes,
            'subtotal_kes' => $this->subtotal_kes,
            'total_kes' => $this->total_kes,
            'converted_at' => $this->converted_currency_at ?? now(),
            'shipping_cost' => $this->shipping_cost,
            'total' => $this->total,
            'order_type' => $this->quote_type === 'mixed' ? 'mixed' : ($this->quote_type === 'service' ? 'service' : 'quotation'),
            'status' => 'pending',
            'payment_method' => 'request_invoice',
            'payment_status' => 'unpaid',
            'shipping_address' => $this->shipping_address,
            'billing_address' => $this->billing_address,
            'billing_same_as_shipping' => $this->billing_same_as_shipping,
            'customer_notes' => $this->customer_notes,
            'service_start_date' => $this->service_start_date,
            'service_end_date' => $this->service_end_date,
            'billing_schedule' => $this->billing_schedule,
        ]);

        // Convert items
        foreach ($this->items as $quoteItem) {
            $order->items()->create([
                'quote_item_id' => $quoteItem->id,
                'item_type' => $quoteItem->item_type,
                'is_custom_item' => $quoteItem->is_custom_item,
                'product_id' => $quoteItem->product_id,
                'service_id' => $quoteItem->service_id,
                'product_name' => $quoteItem->product_name ?? $quoteItem->service_name,
                'product_sku' => $quoteItem->product_sku,
                'brand_name' => $quoteItem->brand_name,
                'product_image' => $quoteItem->product_image,
                'service_name' => $quoteItem->service_name,
                'service_description' => $quoteItem->service_description,
                'service_category' => $quoteItem->service_category,
                'custom_item_details' => $quoteItem->custom_item_details,
                'quantity' => $quoteItem->quantity,
                'unit_of_measure' => $quoteItem->unit_of_measure,
                'unit_price' => $quoteItem->unit_price,
                'line_total' => $quoteItem->line_total,
                'discount_amount' => $quoteItem->discount_amount,
                'line_total_after_discount' => $quoteItem->line_total_after_discount,
                'estimated_hours' => $quoteItem->estimated_hours,
                'hourly_rate' => $quoteItem->hourly_rate,
                'labor_cost' => $quoteItem->labor_cost,
                'material_cost' => $quoteItem->material_cost,
                'estimated_duration' => $quoteItem->estimated_duration,
                'scheduled_start_date' => $quoteItem->scheduled_start_date,
                'scheduled_end_date' => $quoteItem->scheduled_end_date,
                'is_taxable' => $quoteItem->is_taxable,
                'requires_site_visit' => $quoteItem->requires_site_visit,
                'prerequisites' => $quoteItem->prerequisites,
                'variant_details' => $quoteItem->variant_details,
                'is_bulk_pricing' => $quoteItem->is_bulk_pricing,
                'is_negotiated_price' => $quoteItem->is_negotiated_price,
                'pricing_notes' => $quoteItem->pricing_notes,
                'notes' => $quoteItem->notes,
            ]);
        }

        // Mark quote as converted
        $this->update([
            'status' => 'converted',
            'converted_to_order_id' => $order->id,
            'converted_at' => now(),
        ]);

        return $order;
    }

    /**
     * Calculate totals from items.
     */
    public function calculateTotals(): void
    {
        $subtotal = $this->items->sum('line_total_after_discount');
        
        $this->update([
            'subtotal' => $subtotal,
            'total' => $subtotal + $this->tax + $this->shipping_cost - $this->discount,
        ]);
    }

    /**
     * Get total items count.
     */
    public function getTotalItemsCount(): int
    {
        return $this->items->sum('quantity');
    }

    /**
     * Check if quote has services.
     */
    public function hasServices(): bool
    {
        return $this->items->whereIn('item_type', ['service', 'custom_service'])->count() > 0;
    }

    /**
     * Check if quote has products.
     */
    public function hasProducts(): bool
    {
        return $this->items->whereIn('item_type', ['product', 'custom_product'])->count() > 0;
    }

    public function applyKesSnapshot(): void
{
    $rate = Currency::rateToKes($this->currency ?? 'KES');

    $this->exchange_rate_to_kes = $rate;
    $this->subtotal_kes = $this->subtotal !== null ? round(((float)$this->subtotal) * $rate, 2) : null;
    $this->total_kes = $this->total !== null ? round(((float)$this->total) * $rate, 2) : null;
    $this->converted_currency_at = now();

    // avoid triggering observers infinitely if you later add them
    $this->saveQuietly();
}

    // ========================================
    // STATIC METHODS
    // ========================================

    /**
     * Generate unique quote number.
     */
    public static function generateQuoteNumber(): string
    {
        $year = date('Y');
        $lastQuote = self::whereYear('created_at', $year)
            ->orderBy('id', 'desc')
            ->first();
        
        $sequence = $lastQuote 
            ? (int) substr($lastQuote->quote_number, -5) + 1 
            : 1;
        
        return 'QT-' . $year . '-' . str_pad($sequence, 5, '0', STR_PAD_LEFT);
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
        
        // Auto-generate quote number before creating
        static::creating(function ($quote) {
            if (!$quote->quote_number) {
                $quote->quote_number = self::generateQuoteNumber();
            }

            // Set default validity period (30 days)
            if (!$quote->valid_from) {
                $quote->valid_from = now();
            }
            if (!$quote->valid_until) {
                $quote->valid_until = now()->addDays(30);
            }
        });
    }
}
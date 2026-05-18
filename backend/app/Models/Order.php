<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'order_number',
        'customer_id',
        'placed_by',
        'subtotal',
        'tax',
        'discount',
        'currency',
        'shipping_cost',
        'total',
        'exchange_rate_to_kes',
        'subtotal_kes',
        'total_kes',
        'converted_at',
        'payment_method',
        'payment_status',
        'payment_reference',
        'paid_at',
        'status',
        'priority',
        'shipping_address',
        'delivery_method',
        'tracking_number',
        'courier_company',
        'estimated_delivery_date',
        'delivered_at',
        // NEW SERVICE FIELDS
        'service_start_date',
        'service_end_date',
        'project_name',
        'project_details',
        'billing_schedule',
        // END NEW FIELDS
        'billing_address',
        'billing_same_as_shipping',
        'order_type',
        'quote_id',
        'referral_code_id',
        'referral_discount',
        'promo_code_id',
        'promo_discount',
        'customer_notes',
        'admin_notes',
        'metadata',
        'invoice_number',
        'invoice_generated_at',
        'assigned_to',
        'confirmed_at',
        'shipped_at',
        'cancelled_at',
        'cancellation_reason',
        'rating',
        'feedback',
    ];

    protected $dates = ['deleted_at'];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'subtotal' => 'decimal:2',
        'tax' => 'decimal:2',
        'discount' => 'decimal:2',
        'shipping_cost' => 'decimal:2',
        'total' => 'decimal:2',
        'exchange_rate_to_kes' => 'decimal:8',
        'subtotal_kes' => 'decimal:2',
        'total_kes' => 'decimal:2',
        'converted_at' => 'datetime',
        'referral_discount' => 'decimal:2',
        'promo_discount' => 'decimal:2',
        'billing_same_as_shipping' => 'boolean',
        'metadata' => 'array',
        'project_details' => 'array', // NEW
        'paid_at' => 'datetime',
        'estimated_delivery_date' => 'datetime',
        'delivered_at' => 'datetime',
        'service_start_date' => 'datetime', // NEW
        'service_end_date' => 'datetime', // NEW
        'invoice_generated_at' => 'datetime',
        'confirmed_at' => 'datetime',
        'shipped_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    /**
     * Append custom attributes.
     */
    protected $appends = [
        'status_label',
        'payment_status_label',
        'order_type_label', // NEW
        'can_cancel',
        'can_confirm',
        'is_delivered',
        'is_service_order', // NEW
        'has_services', // NEW
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the customer that owns the order.
     */
    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Get the user who placed this order.
     */
    public function placedBy()
    {
        return $this->belongsTo(User::class, 'placed_by');
    }

    /**
     * Get all items for this order.
     */
    public function items()
    {
        return $this->hasMany(OrderItem::class);
    }

    /**
     * Get the quote this order was created from (if any).
     */
    public function quote()
    {
        return $this->belongsTo(Quote::class);
    }

    /**
     * Get the referral code used (if any).
     */
    public function referralCode()
    {
        return $this->belongsTo(ReferralCode::class);
    }

    /**
     * Get the promo code used (if any).
     */
    public function promoCode()
    {
        return $this->belongsTo(ReferralCode::class, 'promo_code_id');
    }

    /**
     * Get the admin assigned to this order.
     */
    public function assignedTo()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    /**
     * Get the hamper order associated with this standard order.
     */
    public function hamperOrder()
    {
        return $this->hasOne(HamperOrder::class);
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
            'pending' => 'Pending',
            'confirmed' => 'Confirmed',
            'processing' => 'Processing',
            'ready_for_pickup' => 'Ready for Pickup',
            'shipped' => 'Shipped',
            'delivered' => 'Delivered',
            'cancelled' => 'Cancelled',
            'failed' => 'Failed',
            default => ucfirst($this->status),
        };
    }

    /**
     * Get human-readable payment status label.
     */
    public function getPaymentStatusLabelAttribute(): string
    {
        return match($this->payment_status) {
            'unpaid' => 'Unpaid',
            'partially_paid' => 'Partially Paid',
            'paid' => 'Paid',
            'refunded' => 'Refunded',
            'failed' => 'Failed',
            default => ucfirst($this->payment_status),
        };
    }

    /**
     * Get human-readable order type label.
     */
    public function getOrderTypeLabelAttribute(): string
    {
        return match($this->order_type) {
            'standard' => 'Standard Order',
            'quotation' => 'Quotation Order',
            'bulk' => 'Bulk Order',
            'b2b' => 'B2B Order',
            'service' => 'Service Order',
            'mixed' => 'Product & Service Order',
            'project' => 'Project Order',
            'subscription' => 'Subscription Order',
            default => ucfirst($this->order_type),
        };
    }

    /**
     * Check if order can be cancelled.
     */
    public function getCanCancelAttribute(): bool
    {
        return in_array($this->status, ['pending', 'confirmed']);
    }

    /**
     * Check if order can be confirmed.
     */
    public function getCanConfirmAttribute(): bool
    {
        return $this->status === 'pending';
    }

    /**
     * Check if order is delivered.
     */
    public function getIsDeliveredAttribute(): bool
    {
        return $this->status === 'delivered';
    }

    /**
     * Check if this is a service order.
     */
    public function getIsServiceOrderAttribute(): bool
    {
        return in_array($this->order_type, ['service', 'mixed', 'project', 'subscription']);
    }

    /**
     * Check if order has service items.
     */
    public function getHasServicesAttribute(): bool
    {
        return $this->items()->whereIn('item_type', ['service', 'custom_service'])->exists();
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get orders by status.
     */
    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Scope to get pending orders.
     */
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    /**
     * Scope to get confirmed orders.
     */
    public function scopeConfirmed($query)
    {
        return $query->where('status', 'confirmed');
    }

    /**
     * Scope to get processing orders.
     */
    public function scopeProcessing($query)
    {
        return $query->where('status', 'processing');
    }

    /**
     * Scope to get shipped orders.
     */
    public function scopeShipped($query)
    {
        return $query->where('status', 'shipped');
    }

    /**
     * Scope to get delivered orders.
     */
    public function scopeDelivered($query)
    {
        return $query->where('status', 'delivered');
    }

    /**
     * Scope to get cancelled orders.
     */
    public function scopeCancelled($query)
    {
        return $query->where('status', 'cancelled');
    }

    /**
     * Scope to get paid orders.
     */
    public function scopePaid($query)
    {
        return $query->where('payment_status', 'paid');
    }

    /**
     * Scope to get unpaid orders.
     */
    public function scopeUnpaid($query)
    {
        return $query->where('payment_status', 'unpaid');
    }

    /**
     * Scope to get orders for a specific customer.
     */
    public function scopeForCustomer($query, int $customerId)
    {
        return $query->where('customer_id', $customerId);
    }

    /**
     * Scope to get service orders.
     */
    public function scopeServiceOrders($query)
    {
        return $query->whereIn('order_type', ['service', 'mixed', 'project', 'subscription']);
    }

    /**
     * Scope to get orders by type.
     */
    public function scopeByType($query, string $type)
    {
        return $query->where('order_type', $type);
    }

    /**
     * Scope to search orders.
     */
    public function scopeSearch($query, string $search)
    {
        return $query->where(function ($q) use ($search) {
            $q->where('order_number', 'like', "%{$search}%")
              ->orWhere('project_name', 'like', "%{$search}%")
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
     * Mark order as confirmed.
     */
    
    public function markAsConfirmed(?User $admin = null): void
    {
        $this->update([
            'status' => 'confirmed',
            'confirmed_at' => now(),
            'assigned_to' => $admin ? $admin->id : null,
        ]);
    }

    /**
     * Mark order as processing.
     */
    public function markAsProcessing(): void
    {
        $this->update([
            'status' => 'processing',
        ]);
    }

    /**
     * Mark order as shipped.
     */
    public function markAsShipped(string $trackingNumber, string $courierCompany): void
    {
        $this->update([
            'status' => 'shipped',
            'shipped_at' => now(),
            'tracking_number' => $trackingNumber,
            'courier_company' => $courierCompany,
        ]);
    }

    /**
     * Mark order as delivered.
     */
    public function markAsDelivered(): void
    {
        $this->update([
            'status' => 'delivered',
            'delivered_at' => now(),
        ]);
    }

    /**
     * Mark order as cancelled.
     */
    public function markAsCancelled(string $reason): void
    {
        $this->update([
            'status' => 'cancelled',
            'cancelled_at' => now(),
            'cancellation_reason' => $reason,
        ]);
    }

    /**
     * Mark payment as paid.
     */
    public function markAsPaid(?string $reference = null): void
    {
        $this->update([
            'payment_status'    => 'paid',
            'paid_at'           => now(),
            'payment_reference' => $reference ?? $this->payment_reference,
        ]);

        // ── Loyalty: earn points on payment ──────────────────────────────────────
        try {
            $this->load('customer');
            if ($this->customer) {
                app(\App\Services\LoyaltyService::class)->earnPointsForOrder($this);
            }
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning("Loyalty earn failed for order {$this->id}: " . $e->getMessage());
        }
    }

    /**  
     * Get total confirmed payments from payments table  
     */  
    public function getTotalConfirmedPayments(): float  
    {  
        return (float) \App\Models\Payment::where('order_id', $this->id)  
            ->where('status', 'confirmed')  
            ->sum('mpesa_amount_confirmed');  
    }

    /**
     * Generate invoice number.
     */
    public function generateInvoiceNumber(): string
    {
        $invoiceNumber = 'INV-' . date('Y') . '-' . str_pad($this->id, 6, '0', STR_PAD_LEFT);
        
        $this->update([
            'invoice_number' => $invoiceNumber,
            'invoice_generated_at' => now(),
        ]);
        
        return $invoiceNumber;
    }

    /**
     * Check if order can be cancelled.
     */
    public function canBeCancelled(): bool
    {
        return in_array($this->status, ['pending', 'confirmed']);
    }

    /**
     * Get total items count.
     */
    public function getTotalItemsCount(): int
    {
        return $this->items->sum('quantity');
    }

    /**
     * Get backorder items count.
     */
    public function getBackorderItemsCount(): int
    {
        return $this->items->sum('backorder_quantity');
    }

    /**
     * Check if order has backorder items.
     */
    public function hasBackorderItems(): bool
    {
        return $this->items->where('backorder_quantity', '>', 0)->count() > 0;
    }

    /**
     * Get in-stock items count.
     */
    public function getInStockItemsCount(): int
    {
        return $this->getTotalItemsCount() - $this->getBackorderItemsCount();
    }

    /**
     * Get service items count.
     */
    public function getServiceItemsCount(): int
    {
        return $this->items()->whereIn('item_type', ['service', 'custom_service'])->count();
    }

    /**
     * Get product items count.
     */
    public function getProductItemsCount(): int
    {
        return $this->items()->whereIn('item_type', ['product', 'custom_product'])->count();
    }

    public function applyKesSnapshot(): void
{
    $rate = Currency::rateToKes($this->currency ?? 'KES');

    $this->exchange_rate_to_kes = $rate;
    $this->subtotal_kes = $this->subtotal !== null ? round(((float)$this->subtotal) * $rate, 2) : null;
    $this->total_kes = $this->total !== null ? round(((float)$this->total) * $rate, 2) : null;
    $this->converted_at = now();

    $this->saveQuietly();
}

    // ========================================
    // STATIC METHODS
    // ========================================

    /**
     * Generate unique order number.
     */
    public static function generateOrderNumber(): string
    {
        $year = date('Y');
        $lastOrder = self::whereYear('created_at', $year)
            ->orderBy('id', 'desc')
            ->first();
        
        $sequence = $lastOrder 
            ? (int) substr($lastOrder->order_number, -5) + 1 
            : 1;
        
        return 'TISL-' . $year . '-' . str_pad($sequence, 5, '0', STR_PAD_LEFT);
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
        
        // Auto-generate order number before creating
        static::creating(function ($order) {
            if (!$order->order_number) {
                $order->order_number = self::generateOrderNumber();
            }
        });

        // Sync status changes to linked HamperOrder notes
        static::updated(function ($order) {
            $hamperOrder = HamperOrder::where('order_id', $order->id)->first();
            if ($hamperOrder) {
                $importantStatuses = ['shipped', 'delivered', 'cancelled'];
                $statusChanged = $order->wasChanged('status') && in_array($order->status, $importantStatuses);
                $paymentRefunded = $order->wasChanged('payment_status') && $order->payment_status === 'refunded';

                if ($statusChanged || $paymentRefunded) {
                    $note = "[" . now()->format('Y-m-d H:i:s') . "] Linked standard order status changed to '{$order->status}' (Payment: '{$order->payment_status}').";
                    $hamperOrder->notes = ($hamperOrder->notes ? $hamperOrder->notes . "\n" : "") . $note;
                    $hamperOrder->save();
                }
            }
        });
    }
}

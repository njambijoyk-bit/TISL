<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Vendor extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'vendor_number',
        'company_name',
        'contact_name',
        'email',
        'phone',
        'alternate_phone',
        'website',
        'tax_id',
        'registration_number',
        'address',
        'city',
        'country',
        'payment_terms_days',
        'commission_rate',
        'currency',
        'bank_details',
        'total_purchase_orders',
        'total_purchased',
        'average_po_value',
        'first_po_date',
        'last_po_date',
        'average_lead_time_days',
        'status',
        'status_reason',
        'is_verified',
        'verified_at',
        'tags',
        'notes',
        'created_by',
        'approved_by',
        'last_login_at',
        'last_login_ip',
    ];

    protected $casts = [
        'bank_details'           => 'array',
        'tags'                   => 'array',
        'is_verified'            => 'boolean',
        'commission_rate'        => 'decimal:2',
        'total_purchased'        => 'decimal:2',
        'average_po_value'       => 'decimal:2',
        'average_lead_time_days' => 'decimal:2',
        'total_purchase_orders'  => 'integer',
        'payment_terms_days'     => 'integer',
        'verified_at'            => 'datetime',
        'first_po_date'          => 'datetime',
        'last_po_date'           => 'datetime',
        'last_login_at'          => 'datetime',
    ];

    // =========================================================================
    // RELATIONSHIPS
    // =========================================================================

    /**
     * The User account for this vendor (portal login).
     * Mirrors: Customer::user()
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * All purchase orders raised against this vendor.
     */
    public function purchaseOrders()
    {
        return $this->hasMany(PurchaseOrder::class);
    }

    /**
     * Open (non-cancelled, non-received) purchase orders.
     */
    public function openPurchaseOrders()
    {
        return $this->hasMany(PurchaseOrder::class)
            ->whereNotIn('status', ['received', 'cancelled']);
    }

    /**
     * Products this vendor supplies (via pivot).
     */
    public function products()
    {
        return $this->belongsToMany(Product::class, 'vendor_products')
            ->withPivot([
                'vendor_sku',
                'cost_price',
                'min_order_qty',
                'lead_time_days',
                'is_primary_vendor',
                'is_available',
                'notes',
            ])
            ->withTimestamps();
    }

    /**
     * Products for which this vendor is the primary supplier.
     */
    public function primaryProducts()
    {
        return $this->belongsToMany(Product::class, 'vendor_products')
            ->withPivot(['vendor_sku', 'cost_price', 'min_order_qty', 'lead_time_days'])
            ->wherePivot('is_primary_vendor', true)
            ->withTimestamps();
    }

    /**
     * Staff member who created this vendor record.
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Staff member who approved/verified this vendor.
     */
    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    // =========================================================================
    // SCOPES
    // =========================================================================

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopePendingApproval($query)
    {
        return $query->where('status', 'pending_approval');
    }

    public function scopeVerified($query)
    {
        return $query->where('is_verified', true);
    }

    public function scopeSearch($query, string $term)
    {
        return $query->where(function ($q) use ($term) {
            $q->where('company_name',   'like', "%{$term}%")
              ->orWhere('contact_name', 'like', "%{$term}%")
              ->orWhere('email',        'like', "%{$term}%")
              ->orWhere('phone',        'like', "%{$term}%")
              ->orWhere('vendor_number','like', "%{$term}%")
              ->orWhere('tax_id',       'like', "%{$term}%");
        });
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    // =========================================================================
    // ACCESSORS
    // =========================================================================

    /**
     * Primary bank account details (first entry in bank_details array).
     */
    public function getPrimaryBankAccountAttribute(): ?array
    {
        $details = $this->bank_details;
        return (!empty($details) && is_array($details)) ? $details[0] : null;
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    /**
     * Recalculate and persist purchase order statistics.
     * Call this after a PO is received or cancelled.
     * Mirrors Customer::recalculateStats() pattern.
     */
    public function recalculateStats(): void
    {
        $received = $this->purchaseOrders()
            ->where('status', 'received');

        $total        = $received->count();
        $totalSpent   = $received->sum('total_kes');
        $avgValue     = $total > 0 ? $totalSpent / $total : 0;
        $firstDate    = $received->min('received_at');
        $lastDate     = $received->max('received_at');

        // Rolling average lead time: days between sent_at and received_at
        $avgLead = $this->purchaseOrders()
            ->where('status', 'received')
            ->whereNotNull('shipped_at')
            ->whereNotNull('received_at')
            ->selectRaw('AVG(DATEDIFF(received_at, shipped_at)) as avg_lead')
            ->value('avg_lead');

        $this->update([
            'total_purchase_orders'  => $total,
            'total_purchased'        => $totalSpent,
            'average_po_value'       => round($avgValue, 2),
            'first_po_date'          => $firstDate,
            'last_po_date'           => $lastDate,
            'average_lead_time_days' => $avgLead ? round($avgLead, 2) : null,
        ]);
    }

    /**
     * Generate the next vendor number in sequence.
     * Mirrors the customer_number pattern in UserController::store().
     */
    public static function generateVendorNumber(): string
    {
        $nextId = (static::withTrashed()->max('id') ?? 0) + 1;
        return 'VEND-' . date('Y') . '-' . str_pad($nextId, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Check if vendor has an active portal account.
     */
    public function hasPortalAccess(): bool
    {
        return $this->user_id !== null
            && $this->user !== null
            && $this->user->status === 'active';
    }
}
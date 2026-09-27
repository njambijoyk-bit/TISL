<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PurchaseOrder extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'po_number',
        'vendor_id',
        'raised_by',
        'assigned_to',
        'status',
        'cancellation_reason',
        'currency',
        'exchange_rate_to_kes',
        'subtotal',
        'tax',
        'shipping_cost',
        'total',
        'total_kes',
        'converted_at',
        'payment_status',
        'payment_reference',
        'payment_due_date',
        'paid_at',
        'delivery_address',
        'expected_delivery_date',
        'shipped_at',
        'received_at',
        'tracking_number',
        'courier_company',
        'notes',
        'admin_notes',
        'metadata',
    ];

    protected $casts = [
        'exchange_rate_to_kes'    => 'decimal:6',
        'subtotal'                => 'decimal:2',
        'tax'                     => 'decimal:2',
        'shipping_cost'           => 'decimal:2',
        'total'                   => 'decimal:2',
        'total_kes'               => 'decimal:2',
        'converted_at'            => 'datetime',
        'payment_due_date'        => 'datetime',
        'paid_at'                 => 'datetime',
        'expected_delivery_date'  => 'datetime',
        'shipped_at'              => 'datetime',
        'received_at'             => 'datetime',
        'metadata'                => 'array',
    ];

    // =========================================================================
    // RELATIONSHIPS
    // =========================================================================

    public function vendor()
    {
        return $this->belongsTo(Vendor::class);
    }

    public function raiser()
    {
        return $this->belongsTo(User::class, 'raised_by');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function items()
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }

    // =========================================================================
    // SCOPES
    // =========================================================================

    public function scopeOpen($query)
    {
        return $query->whereNotIn('status', ['received', 'cancelled']);
    }

    public function scopeForVendor($query, int $vendorId)
    {
        return $query->where('vendor_id', $vendorId);
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopePendingDelivery($query)
    {
        return $query->whereIn('status', ['sent', 'acknowledged', 'partially_shipped', 'shipped']);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Apply KES snapshot from the currency engine — mirrors Order::applyKesSnapshot().
     * Call when status moves to 'sent' (rate is locked at that point).
     */
    public function applyKesSnapshot(float $rate): void
    {
        $this->update([
            'exchange_rate_to_kes' => $rate,
            'total_kes'            => round($this->total * $rate, 2),
            'converted_at'         => now(),
        ]);
    }

    /**
     * Generate the next PO number.
     */
    public static function generatePoNumber(): string
    {
        $nextId = (static::withTrashed()->max('id') ?? 0) + 1;
        return 'PO-' . date('Y') . '-' . str_pad($nextId, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Recalculate totals from line items.
     * Call after items are added, removed, or updated.
     */
    public function recalculateTotals(): void
    {
        $subtotal = $this->items()->sum('line_total');
        $total    = $subtotal + $this->tax + $this->shipping_cost;

        $this->update([
            'subtotal' => round($subtotal, 2),
            'total'    => round($total, 2),
        ]);
    }

    /**
     * Mark all items as received and trigger stock update.
     * Called when status transitions to 'received'.
     */
    public function receiveAllItems(): void
    {
        $this->items->each(function (PurchaseOrderItem $item) {
            $remaining = $item->quantity - $item->quantity_received;
            if ($remaining > 0 && $item->product_id) {
                $item->product->increaseStock($remaining); // method already on Product model
            }
            $item->update([
                'quantity_received'   => $item->quantity,
                'fulfillment_status'  => 'received',
            ]);
        });

        $this->update([
            'status'      => 'received',
            'received_at' => now(),
        ]);

        $this->vendor->recalculateStats();
    }
}
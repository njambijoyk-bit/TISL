<?php
// ============================================================
// OrderShipment.php
// ============================================================
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderShipment extends Model
{
    protected $fillable = [
        'order_id',
        'workflow',
        'dispatched_by',
        'driver_id',
        'manifest_id',
        'courier_name',
        'tracking_number',
        'tracking_url',
        'estimated_delivery_date',
        'notes',
        'status',
        'delivered_at',
    ];

    protected $casts = [
        'estimated_delivery_date' => 'datetime',
        'delivered_at'            => 'datetime',
    ];

    protected $appends = ['workflow_label', 'status_label'];

    // ── Relationships ────────────────────────────────────────

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function dispatcher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispatched_by');
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function manifest(): BelongsTo
    {
        return $this->belongsTo(DeliveryManifest::class, 'manifest_id');
    }

    // ── Accessors ────────────────────────────────────────────

    public function getWorkflowLabelAttribute(): string
    {
        return match ($this->workflow) {
            'internal'         => 'Internal Driver',
            'external_courier' => 'External Courier',
            'instore'          => 'In-Store / Pickup',
            default            => ucfirst($this->workflow),
        };
    }

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'dispatched'  => 'Dispatched',
            'in_transit'  => 'In Transit',
            'delivered'   => 'Delivered',
            'failed'      => 'Failed',
            default       => ucfirst($this->status),
        };
    }

    // ── Scopes ───────────────────────────────────────────────

    /**
     * Shipments that are not yet in a terminal state.
     * Use this everywhere instead of repeating whereNotIn('status', ['delivered', 'failed']).
     */
    public function scopeActive($query)
    {
        return $query->whereNotIn('status', ['delivered', 'failed']);
    }

    // ── Helpers ──────────────────────────────────────────────

    public function hasTrackingLink(): bool
    {
        return ! empty($this->tracking_url);
    }

    public function isInternal(): bool
    {
        return $this->workflow === 'internal';
    }

    public function isExternalCourier(): bool
    {
        return $this->workflow === 'external_courier';
    }

    public function isInstore(): bool
    {
        return $this->workflow === 'instore';
    }
}

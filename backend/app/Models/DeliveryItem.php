<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class DeliveryItem extends Model
{
    protected $fillable = [
        'manifest_id',
        'order_id',
        'status',
        'sort_order',
        'estimated_arrival',
        'delivery_latitude',      
        'delivery_longitude', 
        'arrival_latitude',
        'arrival_longitude',
        'distance_from_prev_km',
        'time_from_prev_minutes',
        'delivery_notes',
        'proof_of_delivery',
        'failed_reason',
        'attempted_at',
        'delivered_at',
    ];

    protected $casts = [
        'estimated_arrival'      => 'datetime',
        'attempted_at'           => 'datetime',
        'delivered_at'           => 'datetime',
        'delivery_latitude'      => 'decimal:7',  
        'delivery_longitude'     => 'decimal:7',  
        'arrival_latitude'       => 'decimal:7',
        'arrival_longitude'      => 'decimal:7',
        'distance_from_prev_km'  => 'decimal:2',
        'time_from_prev_minutes' => 'integer',
        'sort_order'             => 'integer',
    ];

    protected $appends = [
        'status_label',
        'proof_of_delivery_url',
        'is_on_time',
        'minutes_late',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function manifest(): BelongsTo
    {
        return $this->belongsTo(DeliveryManifest::class, 'manifest_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }

    public function rating(): HasOne
    {
        return $this->hasOne(DeliveryRating::class, 'delivery_item_id');
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(DeliveryIncident::class, 'delivery_item_id');
    }

    // ========================================
    // ACCESSORS
    // ========================================

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'pending'          => 'Pending',
            'out_for_delivery' => 'Out for Delivery',
            'delivered'        => 'Delivered',
            'failed'           => 'Failed',
            'returned'         => 'Returned',
            default            => ucfirst($this->status),
        };
    }

    public function getProofOfDeliveryUrlAttribute(): ?string
    {
        if (! $this->proof_of_delivery) return null;

        if (str_starts_with($this->proof_of_delivery, 'http')) {
            return $this->proof_of_delivery;
        }

        return url(Storage::url($this->proof_of_delivery));
    }

    public function getIsOnTimeAttribute(): ?bool
    {
        if (! $this->delivered_at || ! $this->estimated_arrival) return null;
        return $this->delivered_at->lte($this->estimated_arrival);
    }

    public function getMinutesLateAttribute(): ?int
    {
        if (! $this->delivered_at || ! $this->estimated_arrival) return null;
        $diff = $this->estimated_arrival->diffInMinutes($this->delivered_at, false);
        return $diff > 0 ? $diff : 0;
    }

    // ========================================
    // HELPERS
    // ========================================

    /**
     * Mark this stop as delivered and sync the order status.
     */
    public function markDelivered(
        ?float  $lat   = null,
        ?float  $lng   = null,
        ?string $notes = null,
        ?string $proof = null,
    ): void {
        $this->update([
            'status'            => 'delivered',
            'delivered_at'      => now(),
            'attempted_at'      => now(),
            'arrival_latitude'  => $lat,
            'arrival_longitude' => $lng,
            'delivery_notes'    => $notes ?? $this->delivery_notes,
            'proof_of_delivery' => $proof ?? $this->proof_of_delivery,
        ]);

        // Sync order status
        $this->order->markAsDelivered();
    }

    /**
     * Mark this stop as failed — order stays shipped, logistics decides.
     */
    public function markFailed(string $reason, ?float $lat = null, ?float $lng = null): void
    {
        $this->update([
            'status'            => 'failed',
            'attempted_at'      => now(),
            'failed_reason'     => $reason,
            'arrival_latitude'  => $lat,
            'arrival_longitude' => $lng,
        ]);
        // Order intentionally stays 'shipped' — logistics takes over
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeDelivered($query)
    {
        return $query->where('status', 'delivered');
    }

    public function scopeFailed($query)
    {
        return $query->where('status', 'failed');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

// ============================================================
// DeliveryRating.php
// ============================================================
class DeliveryRating extends Model
{
    protected $fillable = [
        'order_id',
        'delivery_item_id',
        'customer_id',
        'driver_id',
        'rating',
        'comment',
        'is_visible_to_driver',
    ];

    protected $casts = [
        'rating'               => 'integer',
        'is_visible_to_driver' => 'boolean',
    ];

    // ── Relationships ────────────────────────────────────────

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function deliveryItem(): BelongsTo
    {
        return $this->belongsTo(DeliveryItem::class, 'delivery_item_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeForDriver($query, int $driverId)
    {
        return $query->where('driver_id', $driverId);
    }

    public function scopeVisibleToDriver($query)
    {
        return $query->where('is_visible_to_driver', true);
    }
}
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;

// ============================================================
// DriverRatingAdjustment.php
// ============================================================
class DriverRatingAdjustment extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'driver_id',
        'adjusted_by',
        'adjustment_value',
        'reason',
    ];

    protected $casts = [
        'adjustment_value' => 'decimal:2',
        'created_at'       => 'datetime',
    ];

    // ── Relationships ────────────────────────────────────────

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'adjusted_by');
    }

    // ── Static: compute overall rating for a driver ──────────

    /**
     * Overall driver rating:
     *   avg(delivery_ratings) + sum(driver_rating_adjustments)
     *   Capped between 1.0 and 5.0
     */
    public static function overallRatingFor(int $driverId): ?float
    {
        $avg = DeliveryRating::where('driver_id', $driverId)->avg('rating');

        if ($avg === null) return null;

        $adjustment = static::where('driver_id', $driverId)->sum('adjustment_value');

        $overall = (float) $avg + (float) $adjustment;

        return round(max(1.0, min(5.0, $overall)), 2);
    }

    /**
     * Rating breakdown for admin display.
     */
    public static function ratingBreakdownFor(int $driverId): array
    {
        // Single query for avg + count instead of two separate calls
        $stats = DeliveryRating::where('driver_id', $driverId)
            ->selectRaw('AVG(rating) as avg, COUNT(*) as count')
            ->first();

        $avg        = (float) ($stats->avg ?? 0);
        $count      = (int) ($stats->count ?? 0);
        $adjustment = (float) static::where('driver_id', $driverId)->sum('adjustment_value');
        $overall    = $avg > 0 ? round(max(1.0, min(5.0, $avg + $adjustment)), 2) : null;

        $distribution = DeliveryRating::where('driver_id', $driverId)
            ->selectRaw('rating, COUNT(*) as count')
            ->groupBy('rating')
            ->pluck('count', 'rating')
            ->toArray();

        return [
            'raw_average'      => round($avg, 2),
            'total_ratings'    => $count,
            'total_adjustment' => $adjustment,
            'overall_rating'   => $overall,
            'distribution'     => $distribution,
        ];
    }
}
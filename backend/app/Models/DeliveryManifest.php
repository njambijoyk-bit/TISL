<?php

namespace App\Models;

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class DeliveryManifest extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'manifest_number',
        'driver_id',
        'assigned_by',
        'status',
        'delivery_method', 
        'scheduled_date',
        'notes',
        'start_latitude',
        'start_longitude',
        'end_latitude',
        'end_longitude',
        'total_distance_km',
        'actual_duration_minutes',
        'started_at',
        'dispatched_at',
        'completed_at',
        'ai_generated',
        'ai_notes',
    ];

    protected $casts = [
        'scheduled_date'          => 'date',
        'started_at'              => 'datetime',
        'dispatched_at'           => 'datetime',
        'completed_at'            => 'datetime',
        'ai_generated'            => 'boolean',
        'ai_notes'                => 'array',
        'start_latitude'          => 'decimal:7',
        'start_longitude'         => 'decimal:7',
        'end_latitude'            => 'decimal:7',
        'end_longitude'           => 'decimal:7',
        'total_distance_km'       => 'decimal:2',
        'actual_duration_minutes' => 'integer',
    ];

    protected $appends = [
        'status_label',
        'completion_rate',
        'is_overdue',
    ];

    // ========================================
    // BOOT — auto-generate manifest number
    // ========================================

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (DeliveryManifest $manifest) {
            if (! $manifest->manifest_number) {
                $manifest->manifest_number = static::generateManifestNumber();
            }
        });
    }

    public static function generateManifestNumber(): string
    {
        $date = now()->format('Ymd');

        return DB::transaction(function () use ($date) {
            // Lock the latest row for this date so concurrent requests
            // queue up rather than reading the same sequence value
            $last = static::whereDate('created_at', today())
                ->orderByDesc('id')
                ->lockForUpdate()
                ->first();

            $sequence = $last
                ? ((int) substr($last->manifest_number, -3)) + 1
                : 1;

            return 'MNF-' . $date . '-' . str_pad($sequence, 3, '0', STR_PAD_LEFT);
        });
    }

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function assigner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(DeliveryItem::class, 'manifest_id')->orderBy('sort_order');
    }

    public function locationPings(): HasMany
    {
        return $this->hasMany(DriverLocationPing::class, 'manifest_id');
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(DeliveryIncident::class, 'manifest_id');
    }

    // ========================================
    // public function activityLogs(): HasMany
    // {
        // return $this->hasMany(DeliveryActivityLog::class, 'loggable_id')
           // ->where('loggable_type', self::class)
            // ->orderByDesc('created_at');
    // }
    public function activityLogs(): MorphMany
    {
        return $this->morphMany(DeliveryActivityLog::class, 'loggable')
            ->orderByDesc('created_at');
    }

    // ========================================
    // ACCESSORS
    // ========================================

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'draft'       => 'Draft',
            'dispatched'  => 'Dispatched',
            'in_progress' => 'In Progress',
            'completed'   => 'Completed',
            'cancelled'   => 'Cancelled',
            default       => ucfirst($this->status),
        };
    }

    public function getCompletionRateAttribute(): ?float
    {
        // Avoid implicit query when items aren't eager-loaded.
        // Always load items when you need this value:
        //   DeliveryManifest::with('items')->find($id)
        if (! $this->relationLoaded('items')) return null;

        $total = $this->items->count();
        if ($total === 0) return 0.0;

        $done = $this->items->whereIn('status', ['delivered', 'failed', 'returned'])->count();
        return round(($done / $total) * 100, 1);
    }

    public function getIsOverdueAttribute(): bool
    {
        return ! in_array($this->status, ['completed', 'cancelled'])
            && $this->scheduled_date
            && $this->scheduled_date->isPast();
    }

    // ========================================
    // HELPERS
    // ========================================

    public function canBeDispatched(): bool
    {
        return $this->status === 'draft' && $this->items()->exists();
    }

    public function canBeCancelled(): bool
    {
        return in_array($this->status, ['draft', 'dispatched']);
    }

    /**
     * Calculate total distance from GPS ping trail using Haversine formula.
     * Called on manifest completion.
     */
    public function calculateDistanceFromPings(): float
    {
        $pings = $this->locationPings()
            ->orderBy('pinged_at')
            ->get(['latitude', 'longitude']);

        if ($pings->count() < 2) return 0.0;

        $total = 0.0;

        for ($i = 1; $i < $pings->count(); $i++) {
            $total += $this->haversine(
                (float) $pings[$i - 1]->latitude,
                (float) $pings[$i - 1]->longitude,
                (float) $pings[$i]->latitude,
                (float) $pings[$i]->longitude,
            );
        }

        return round($total, 2);
    }

    private function haversine(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $R    = 6371; // Earth radius in km
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);

        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;

        return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeForDriver($query, int $driverId)
    {
        return $query->where('driver_id', $driverId);
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeScheduledOn($query, string $date)
    {
        return $query->whereDate('scheduled_date', $date);
    }

    public function scopeActive($query)
    {
        return $query->whereIn('status', ['dispatched', 'in_progress']);
    }
}

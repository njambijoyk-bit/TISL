<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// ============================================================
// DriverLocationPing.php
// ============================================================
class DriverLocationPing extends Model
{
    // Only has created_at, no updated_at — high-volume insert table
    public $timestamps = false;

    protected $fillable = [
        'driver_id',
        'manifest_id',
        'latitude',
        'longitude',
        'accuracy',
        'speed',
        'heading',
        'pinged_at',
    ];

    protected $casts = [
        'latitude'   => 'decimal:7',
        'longitude'  => 'decimal:7',
        'accuracy'   => 'decimal:2',
        'speed'      => 'decimal:2',
        'heading'    => 'decimal:2',
        'pinged_at'  => 'datetime',
        'created_at' => 'datetime',
    ];

    public function driver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'driver_id');
    }

    public function manifest(): BelongsTo
    {
        return $this->belongsTo(DeliveryManifest::class, 'manifest_id');
    }

    // Speed in km/h (browser gives m/s)
    public function getSpeedKmhAttribute(): ?float
    {
        return $this->speed !== null ? round((float) $this->speed * 3.6, 1) : null;
    }
}

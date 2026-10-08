<?php

namespace App\Models;

/**
 * Driver is not a separate table — it's a scoped view of the User model
 * for users with role = 'driver'. This makes type-hinting, policies,
 * and route model binding cleaner without a separate profile table.
 *
 * Usage:
 *   Driver::find($id)         // only finds users with role = 'driver'
 *   Driver::active()->get()   // active drivers only
 */
class Driver extends User
{
    protected $table = 'users';

    /**
     * Always scope queries to driver role.
     */
    protected static function booted(): void
    {
        // a driver is whoever holds a role that lets them use the driver app but not the admin area
        static::addGlobalScope('driver', function ($query) {
            $query->holding(app(\App\Services\Access\Authorizer::class)->driverRoleKeys());
        });

        // a new driver gets a driver role unless one was given
        static::creating(function (Driver $driver) {
            if (! $driver->role || ! in_array($driver->role, app(\App\Services\Access\Authorizer::class)->driverRoleKeys(), true)) {
                $driver->role = app(\App\Services\Access\Authorizer::class)->driverRoleKeys()[0] ?? $driver->role;
            }
        });
    }

    // ── Relationships ────────────────────────────────────────

    public function manifests()
    {
        return $this->hasMany(DeliveryManifest::class, 'driver_id');
    }

    public function locationPings()
    {
        return $this->hasMany(DriverLocationPing::class, 'driver_id');
    }

    public function ratings()
    {
        return $this->hasMany(DeliveryRating::class, 'driver_id');
    }

    public function ratingAdjustments()
    {
        return $this->hasMany(DriverRatingAdjustment::class, 'driver_id');
    }

    public function incidents()
    {
        return $this->hasMany(DeliveryIncident::class, 'reported_against');
    }

    // ── Helpers ──────────────────────────────────────────────

    public function overallRating(): ?float
    {
        return DriverRatingAdjustment::overallRatingFor($this->id);
    }

    public function ratingBreakdown(): array
    {
        return DriverRatingAdjustment::ratingBreakdownFor($this->id);
    }

    public function hasOpenIncidents(): bool
    {
        return $this->incidents()
            ->whereIn('severity', ['high', 'critical'])
            ->whereIn('status', ['open', 'under_review'])
            ->exists();
    }

    // ── Scopes ───────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeWithOpenIncidents($query)
    {
        return $query->whereHas('incidents', fn($q) =>
            $q->whereIn('severity', ['high', 'critical'])
              ->whereIn('status', ['open', 'under_review'])
        );
    }
}
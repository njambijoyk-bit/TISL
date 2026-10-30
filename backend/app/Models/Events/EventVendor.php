<?php

namespace App\Models\Events;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A supplier's business profile (caterer, decorator, photographer...). What it sells is in its packages. */
class EventVendor extends Model
{
    use SoftDeletes;

    protected $table = 'event_vendors';

    public const CATEGORIES = ['caterer' => 'Caterer', 'decorator' => 'Decorator', 'photographer' => 'Photographer', 'videographer' => 'Videographer', 'entertainer' => 'Entertainer / DJ / band', 'equipment' => 'Equipment hire',
        'transport' => 'Transport', 'planner' => 'Event planner', 'florist' => 'Florist', 'cake' => 'Cakes and bakery', 'other' => 'Other'];

    protected $fillable = ['name', 'slug', 'category', 'summary', 'description', 'email', 'phone', 'website', 'logo', 'service_areas', 'tax_pin', 'registration_no', 'status', 'status_note', 'verified_at', 'verified_by',
        'commission_percent', 'is_listed', 'created_by'];

    protected $casts = ['service_areas' => 'array', 'is_listed' => 'boolean', 'verified_at' => 'datetime', 'commission_percent' => 'decimal:2'];

    /** May it be listed and booked? Only once verified. */
    public function inGoodStanding(): bool
    {
        return $this->status === 'verified';
    }
}

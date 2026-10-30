<?php

namespace App\Models\Events;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A venue's profile. Its halls or spaces, with capacity and price, are in event_venue_spaces. */
class EventVenue extends Model
{
    use SoftDeletes;

    protected $table = 'event_venues';

    protected $fillable = ['name', 'slug', 'summary', 'description', 'country', 'county', 'town', 'address', 'latitude', 'longitude', 'map_url', 'directions', 'parking', 'accessibility', 'facilities', 'email', 'phone', 'website',
        'tax_pin', 'registration_no', 'status', 'status_note', 'verified_at', 'verified_by', 'commission_percent', 'is_listed', 'created_by'];

    protected $casts = ['facilities' => 'array', 'is_listed' => 'boolean', 'verified_at' => 'datetime', 'commission_percent' => 'decimal:2', 'latitude' => 'float', 'longitude' => 'float'];

    public function inGoodStanding(): bool
    {
        return $this->status === 'verified';
    }
}

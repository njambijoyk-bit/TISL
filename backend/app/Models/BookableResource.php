<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Something that can be booked: a staff member, a room, a table, a piece of equipment. Bookings (and the calendar) refer to it. */
class BookableResource extends Model
{
    public const TYPES = ['staff', 'room', 'table', 'equipment'];

    protected $table = 'bookable_resources';

    protected $fillable = ['type', 'user_id', 'name', 'location_id', 'capacity', 'buffer_before_min', 'buffer_after_min', 'is_active', 'notes'];

    protected $casts = ['capacity' => 'integer', 'buffer_before_min' => 'integer', 'buffer_after_min' => 'integer', 'is_active' => 'boolean'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function hours(): HasMany
    {
        return $this->hasMany(ResourceHour::class, 'resource_id')->orderBy('weekday')->orderBy('starts_at');
    }

    public function timeOff(): HasMany
    {
        return $this->hasMany(ResourceTimeOff::class, 'resource_id')->orderBy('starts_at');
    }

    public function services(): HasMany
    {
        return $this->hasMany(ResourceService::class, 'resource_id');
    }
}

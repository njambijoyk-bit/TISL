<?php

namespace App\Models\Events;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** A kind of ticket (General, VIP, Free RSVP…) with its price, number and sale window. */
class EventTicketType extends Model
{
    use SoftDeletes;

    protected $table = 'event_ticket_types';

    protected $fillable = ['event_id', 'name', 'description', 'price', 'capacity', 'min_per_order', 'max_per_order', 'sale_starts_at', 'sale_ends_at', 'sort_order', 'is_active'];

    protected $casts = ['price' => 'decimal:2', 'capacity' => 'integer', 'min_per_order' => 'integer', 'max_per_order' => 'integer', 'sale_starts_at' => 'datetime', 'sale_ends_at' => 'datetime', 'is_active' => 'boolean'];

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function tickets(): HasMany
    {
        return $this->hasMany(EventTicket::class, 'ticket_type_id');
    }

    /** the sessions this type is limited to; none listed = every session */
    public function sessions(): BelongsToMany
    {
        return $this->belongsToMany(EventSession::class, 'event_ticket_type_sessions', 'ticket_type_id', 'session_id');
    }

    public function isFree(): bool
    {
        return (float) $this->price <= 0;
    }

    /** Is it for sale at this moment (active and inside its sale window)? */
    public function onSaleNow(?\Illuminate\Support\Carbon $now = null): bool
    {
        $now ??= now();

        return $this->is_active
            && ($this->sale_starts_at === null || $this->sale_starts_at->lte($now))
            && ($this->sale_ends_at === null || $this->sale_ends_at->gte($now));
    }
}

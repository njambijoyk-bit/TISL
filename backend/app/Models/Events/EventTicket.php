<?php

namespace App\Models\Events;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One admission. */
class EventTicket extends Model
{
    protected $table = 'event_tickets';

    public const HELD = 'held';           // reserved while the buyer pays
    public const VALID = 'valid';         // paid (or free): gets the holder in
    public const CANCELLED = 'cancelled'; // refunded or cancelled by staff: the code no longer works
    public const RELEASED = 'released';   // the hold ran out unpaid: the seat went back

    protected $fillable = ['event_id', 'ticket_type_id', 'reference', 'state', 'held_until', 'order_id', 'sale_id', 'customer_id', 'buyer_name', 'buyer_email', 'buyer_phone', 'holder_name', 'price', 'issued_at',
        'cancelled_at', 'cancel_reason', 'sold_by'];

    protected $casts = ['held_until' => 'datetime', 'issued_at' => 'datetime', 'cancelled_at' => 'datetime', 'price' => 'decimal:2'];

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(EventTicketType::class, 'ticket_type_id')->withTrashed();
    }

    public function checkins(): HasMany
    {
        return $this->hasMany(EventCheckin::class, 'ticket_id');
    }

    /** a seat that counts against the numbers: paid, or held and the hold has not run out */
    public function scopeTakingASeat($q)
    {
        return $q->where(function ($w) {
            $w->where('state', self::VALID)->orWhere(fn ($h) => $h->where('state', self::HELD)->where('held_until', '>', now()));
        });
    }
}

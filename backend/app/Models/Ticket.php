<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Ticket extends Model
{
    use SoftDeletes;

    /** What is assigned to someone is on their calendar; the entry follows assignment, status and deletion. */
    protected static function booted(): void
    {
        $sync = function (Ticket $t) {
            try {
                app(\App\Services\Calendar\CalendarService::class)->syncTicket($t);
            } catch (\Throwable) {
                // the calendar must never stop a ticket being saved
            }
        };
        static::saved($sync);
        static::deleted($sync);
        static::restored($sync);
        static::forceDeleted(function (Ticket $t) {
            try {
                app(\App\Services\Calendar\CalendarService::class)->remove('ticket', $t->id);
            } catch (\Throwable) {
                //
            }
        });
    }

    protected $fillable = [
        'ticket_number',
        'customer_id',
        'assigned_to',
        'subject',
        'description',
        'status',
        'priority',
        'category',
        'first_responded_at',
        'resolved_at',
        'closed_at',
    ];

    protected $casts = [
        'first_responded_at' => 'datetime',
        'resolved_at'        => 'datetime',
        'closed_at'          => 'datetime',
    ];

    // ─────────────────────────────
    // Relationships
    // ─────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function assignedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(TicketReply::class)->orderBy('created_at', 'asc');
    }

    // ─────────────────────────────
    // Scopes
    // ─────────────────────────────

    public function scopeOpen($query)
    {
        return $query->where('status', 'open');
    }

    public function scopeUnassigned($query)
    {
        return $query->whereNull('assigned_to');
    }
}

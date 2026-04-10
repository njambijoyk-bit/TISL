<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Ticket extends Model
{
    use SoftDeletes;

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

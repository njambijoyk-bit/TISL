<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TicketReply extends Model
{
    protected $fillable = [
        'ticket_id',
        'user_id',
        'customer_id',
        'message',
        'is_internal',
    ];

    protected $casts = [
        'is_internal' => 'boolean',
    ];

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(Ticket::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Determine the sender display name, regardless of whether staff or customer.
     */
    public function getSenderAttribute(): array
    {
        if ($this->user_id) {
            return [
                'type' => 'staff',
                'name' => $this->user?->name ?? 'Staff',
            ];
        }
        return [
            'type' => 'customer',
            'name' => $this->customer
                ? trim($this->customer->first_name . ' ' . $this->customer->last_name)
                : 'Customer',
        ];
    }
}

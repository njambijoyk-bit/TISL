<?php

namespace App\Models\Events;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A buyer asks for money back; staff decide. */
class EventRefundRequest extends Model
{
    protected $table = 'event_refund_requests';

    public const PENDING = 'pending';
    public const APPROVED = 'approved';
    public const DECLINED = 'declined';

    protected $fillable = ['event_id', 'ticket_id', 'status', 'reason', 'amount', 'requested_by', 'decided_by', 'decided_at', 'decision_note'];

    protected $casts = ['amount' => 'decimal:2', 'decided_at' => 'datetime'];

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(EventTicket::class, 'ticket_id');
    }
}

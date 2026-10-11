<?php

namespace App\Models\Security;

use Illuminate\Database\Eloquent\Model;

/** One "is this really you, and is this what you meant?" question about one sensitive action. */
class AuthPendingAction extends Model
{
    protected $table = 'auth_pending_actions';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected $casts = ['facts' => 'array', 'strength_needed' => 'integer', 'reason_required' => 'boolean', 'needs_second_person' => 'boolean', 'second_required' => 'boolean',
        'second_approved_at' => 'datetime', 'second_rejected_at' => 'datetime', 'approved_at' => 'datetime', 'covers_until' => 'datetime', 'used_at' => 'datetime', 'cancelled_at' => 'datetime', 'expires_at' => 'datetime'];

    /** Still open to be answered: not run out, not cancelled, not answered. */
    public function open(): bool
    {
        return $this->approved_at === null && $this->cancelled_at === null && $this->expires_at->isFuture();
    }

    /** Answered by the first person but still waiting for the second (and not given up, declined, used or run out). */
    public function awaitingSecond(): bool
    {
        return $this->second_required && $this->approved_at !== null && $this->second_approved_at === null && $this->second_rejected_at === null && $this->cancelled_at === null && $this->used_at === null && $this->expires_at->isFuture();
    }
}

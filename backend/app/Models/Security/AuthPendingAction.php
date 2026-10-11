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

    protected $casts = ['facts' => 'array', 'strength_needed' => 'integer', 'reason_required' => 'boolean', 'needs_second_person' => 'boolean',
        'approved_at' => 'datetime', 'covers_until' => 'datetime', 'used_at' => 'datetime', 'cancelled_at' => 'datetime', 'expires_at' => 'datetime'];

    /** Still open to be answered: not run out, not cancelled, not answered. */
    public function open(): bool
    {
        return $this->approved_at === null && $this->cancelled_at === null && $this->expires_at->isFuture();
    }
}

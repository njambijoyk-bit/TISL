<?php

namespace App\Models\Security;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One person's request to get back into their account with the help of administrators, and what became of it. */
class AuthRecoveryRequest extends Model
{
    protected $table = 'auth_recovery_requests';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected $casts = ['needed' => 'integer', 'release_at' => 'datetime', 'declined_at' => 'datetime', 'cancelled_at' => 'datetime', 'used_at' => 'datetime', 'executed_at' => 'datetime', 'expires_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(AuthRecoveryApproval::class, 'request_id');
    }

    /** Where it stands: pending (waiting for approvals), cooling (the waiting day), ready (the person may start it; for a reset, it is due), or an end: used, done (a reset carried out), declined, cancelled, expired. */
    public function state(): string
    {
        return match (true) {
            $this->executed_at !== null => 'done',
            $this->used_at !== null => 'used',
            $this->cancelled_at !== null => 'cancelled',
            $this->declined_at !== null => 'declined',
            $this->expires_at->isPast() => 'expired',
            $this->release_at === null => 'pending',
            $this->release_at->isFuture() => 'cooling',
            default => 'ready',
        };
    }

    /** Still going: not ended in any way. */
    public function alive(): bool
    {
        return in_array($this->state(), ['pending', 'cooling', 'ready'], true);
    }
}

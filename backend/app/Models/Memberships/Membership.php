<?php

namespace App\Models\Memberships;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A person holding a plan. paid_until says how far the money has covered. */
class Membership extends Model
{
    public const STATUSES = ['pending' => 'Waiting for payment', 'trial' => 'On trial', 'active' => 'Active', 'past_due' => 'Payment late', 'paused' => 'Paused', 'lapsed' => 'Lapsed', 'cancelled' => 'Cancelled', 'ended' => 'Ended'];
    /** the benefits are given in these states */
    public const GOOD = ['trial', 'active', 'past_due'];
    /** these hold a place on the plan and block a second membership */
    public const LIVE = ['pending', 'trial', 'active', 'past_due', 'paused', 'lapsed'];

    protected $table = 'memberships';

    protected $guarded = [];

    protected $casts = ['started_on' => 'date', 'trial_ends_on' => 'date', 'period_from' => 'date', 'paid_until' => 'date', 'paused_from' => 'date', 'paused_until' => 'date', 'cancelled_at' => 'datetime', 'expires_at' => 'datetime', 'cancel_at_end' => 'boolean'];

    public function periods(): HasMany
    {
        return $this->hasMany(Period::class, 'membership_id')->orderBy('seq')->orderBy('id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(MembershipEvent::class, 'membership_id')->orderByDesc('id');
    }
}

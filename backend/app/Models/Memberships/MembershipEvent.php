<?php

namespace App\Models\Memberships;

use Illuminate\Database\Eloquent\Model;

/** What happened to a membership. */
class MembershipEvent extends Model
{
    public $timestamps = false;

    protected $table = 'membership_events';

    protected $guarded = [];

    protected $casts = ['created_at' => 'datetime'];
}

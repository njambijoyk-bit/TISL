<?php

namespace App\Models\Memberships;

use Illuminate\Database\Eloquent\Model;

/** One check-in at a door or desk. */
class Checkin extends Model
{
    public $timestamps = false;

    protected $table = 'membership_checkins';

    protected $guarded = [];

    protected $casts = ['created_at' => 'datetime'];
}

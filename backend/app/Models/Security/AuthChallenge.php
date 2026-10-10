<?php

namespace App\Models\Security;

use Illuminate\Database\Eloquent\Model;

/** A question the server asked a device to sign. Works once, runs out in two minutes. */
class AuthChallenge extends Model
{
    protected $table = 'auth_challenges';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $guarded = [];

    protected $casts = ['options' => 'array', 'expires_at' => 'datetime', 'used_at' => 'datetime', 'created_at' => 'datetime'];
}

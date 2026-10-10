<?php

namespace App\Models\Security;

use Illuminate\Database\Eloquent\Model;

/** One signed-in browser: the login token's companion, saying where from and what kind of browser. */
class AuthSession extends Model
{
    protected $table = 'auth_sessions';

    protected $fillable = ['token_id', 'tokenable_type', 'tokenable_id', 'method', 'ip', 'user_agent', 'device_key', 'label', 'last_seen_at', 'revoked_at', 'revoked_reason', 'credential_id', 'strength', 'last_strong_at', 'restricted'];

    protected $casts = ['last_seen_at' => 'datetime', 'revoked_at' => 'datetime', 'last_strong_at' => 'datetime', 'strength' => 'integer', 'restricted' => 'boolean'];
}

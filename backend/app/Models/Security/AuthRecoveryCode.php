<?php

namespace App\Models\Security;

use Illuminate\Database\Eloquent\Model;

/** One recovery code: kept only as a keyed fingerprint, good once. */
class AuthRecoveryCode extends Model
{
    protected $table = 'auth_recovery_codes';

    protected $guarded = [];

    protected $casts = ['used_at' => 'datetime', 'revoked_at' => 'datetime'];

    protected $hidden = ['code_hash'];

    /** Still good: not used, not replaced by a newer set. */
    public function scopeGood($q)
    {
        return $q->whereNull('used_at')->whereNull('revoked_at');
    }
}

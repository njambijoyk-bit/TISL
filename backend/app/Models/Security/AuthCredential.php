<?php

namespace App\Models\Security;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One passkey or security key a person has added: the "plank" that is replaced, never the account. */
class AuthCredential extends Model
{
    protected $table = 'auth_credentials';

    protected $guarded = [];

    protected $casts = [
        'transports' => 'array', 'counter' => 'integer', 'backup_eligible' => 'boolean', 'backup_status' => 'boolean', 'uv_initialized' => 'boolean',
        'last_used_at' => 'datetime', 'disabled_at' => 'datetime', 'revoked_at' => 'datetime',
    ];

    protected $hidden = ['public_key', 'credential_id', 'credential_hash', 'user_handle'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Can it still be used to sign in? Not removed, not switched off for looking copied. */
    public function usable(): bool
    {
        return $this->revoked_at === null && $this->disabled_at === null;
    }

    public function scopeActive($q)
    {
        return $q->whereNull('revoked_at');
    }
}

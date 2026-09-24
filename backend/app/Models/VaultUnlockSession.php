<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaultUnlockSession extends Model
{
    public $timestamps = false;

    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'target_type', 'target_id',
        'unlocked_at', 'expires_at', 'ip_address',
    ];

    protected $casts = [
        'unlocked_at' => 'datetime',
        'expires_at'  => 'datetime',
        'created_at'  => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isValid(): bool
    {
        return !$this->isExpired();
    }
}
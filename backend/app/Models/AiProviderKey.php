<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class AiProviderKey extends Model
{
    protected $fillable = [
        'provider', 'label', 'api_key',
        'is_active', 'created_by', 'last_used_at',
        'model', 'base_url', 'used_for', 'priority', 'last_error', 'last_error_at',
    ];

    protected $hidden = ['api_key']; // never serialise raw key

    protected $casts = [
        'is_active'    => 'boolean',
        'last_used_at' => 'datetime',
        'last_error_at' => 'datetime',
        'priority'     => 'integer',
    ];

    // ── Encrypt on save, decrypt on read ────────────────────────────
    public function setApiKeyAttribute(string $value): void
    {
        $this->attributes['api_key'] = Crypt::encryptString($value);
    }

    public function getDecryptedKey(): string
    {
        return Crypt::decryptString($this->attributes['api_key']);
    }

    /** The last four characters, so a key can be recognised on screen without showing it. */
    public function hint(): string
    {
        try {
            return '••••' . substr($this->getDecryptedKey(), -4);
        } catch (\Throwable) {
            return '(unreadable — enter it again)';
        }
    }

    // ── Relationships ────────────────────────────────────────────────
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function sessions()
    {
        return $this->hasMany(AiAnalyticsSession::class, 'api_key_id');
    }

    // ── Scopes ───────────────────────────────────────────────────────
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
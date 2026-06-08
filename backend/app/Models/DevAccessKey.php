<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DevAccessKey extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'key_hash',
        'key_preview',
        'raw_key',
        'is_active',
        'failed_attempts',
        'generated_at',
        'used_at',
        'invalidated_at',
        'invalidation_reason',
    ];

    protected $casts = [
        'is_active'       => 'boolean',
        'failed_attempts' => 'integer',
        'generated_at'    => 'datetime',
        'used_at'         => 'datetime',
        'invalidated_at'  => 'datetime',
    ];

    // Never expose the hash or full raw key in API responses
    protected $hidden = ['key_hash', 'raw_key'];

    // ── Relationships ─────────────────────────────────────────

    public function logs()
    {
        return $this->hasMany(DevAccessKeyLog::class)->orderBy('attempted_at', 'desc');
    }

    // ── Scopes ────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    // ── Helpers ───────────────────────────────────────────────

    public static function getActive(): ?static
    {
        return static::active()->latest('generated_at')->first();
    }

    public function isExhausted(): bool
    {
        return $this->failed_attempts >= 10;
    }
}

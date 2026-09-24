<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaultSetting extends Model
{
    public $timestamps = false;

    const UPDATED_AT = 'updated_at';
    const CREATED_AT = null;

    protected $table = 'vault_settings';

    protected $fillable = [
        'allowed_ip_ranges', 'allowed_time_start', 'allowed_time_end',
        'allowed_days', 'max_failed_unlock_attempts',
        'unlock_session_ttl_minutes', 'require_2fa_for_sensitive',
        'sensitive_threshold', 'watermark_downloads',
        'log_preview_actions', 'enforce_ip_globally', 'updated_by',
    ];

    protected $casts = [
        'allowed_ip_ranges'           => 'array',
        'allowed_days'                => 'array',
        'require_2fa_for_sensitive'   => 'boolean',
        'watermark_downloads'         => 'boolean',
        'log_preview_actions'         => 'boolean',
        'enforce_ip_globally'         => 'boolean',
        'max_failed_unlock_attempts'  => 'integer',
        'unlock_session_ttl_minutes'  => 'integer',
        'updated_at'                  => 'datetime',
    ];

    public static function current(): self
    {
        return static::firstOrFail();
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function isWithinAllowedTime(): bool
    {
        if (!$this->allowed_time_start || !$this->allowed_time_end) return true;
        $now = now()->format('H:i:s');
        return $now >= $this->allowed_time_start && $now <= $this->allowed_time_end;
    }

    public function isAllowedDay(): bool
    {
        if (!$this->allowed_days) return true;
        return in_array(strtolower(now()->format('l')), $this->allowed_days);
    }

    public function isAllowedIp(string $ip): bool
    {
        if (!$this->allowed_ip_ranges) return true;
        foreach ($this->allowed_ip_ranges as $range) {
            if ($this->ipMatchesCidr($ip, $range)) return true;
        }
        return false;
    }

    private function ipMatchesCidr(string $ip, string $cidr): bool
    {
        if (!str_contains($cidr, '/')) return $ip === $cidr;
        [$subnet, $mask] = explode('/', $cidr);
        return (ip2long($ip) & ~((1 << (32 - $mask)) - 1)) === ip2long($subnet);
    }
}
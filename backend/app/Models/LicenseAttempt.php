<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Append-only log of every key paste, ownership code and module switch.
 * Stores a fingerprint of pasted text, never the text itself.
 */
class LicenseAttempt extends Model
{
    public const UPDATED_AT = null;

    // Key pastes
    public const TYPO = 'typo';
    public const FAKE = 'fake';
    public const OTHER_CLIENT = 'other_client';
    public const ALREADY_ACTIVE = 'already_active';
    public const ACCEPTED = 'accepted';
    public const LOCKED_OUT = 'locked_out';
    // Added by 07_license_attempt_events.sql
    public const OWNERSHIP_ACCEPTED = 'ownership_accepted';
    public const OWNERSHIP_REJECTED = 'ownership_rejected';
    public const SWITCHED_ON = 'switched_on';
    public const SWITCHED_OFF = 'switched_off';

    /** Results that count towards the 10-an-hour lockout. */
    public const FAILURES = [self::TYPO, self::FAKE, self::OTHER_CLIENT, self::OWNERSHIP_REJECTED];

    protected $fillable = [
        'user_id', 'result', 'module_key', 'key_client_uuid', 'key_serial',
        'key_fingerprint', 'ip_address', 'user_agent',
    ];

    protected $casts = ['created_at' => 'datetime'];

    protected static function booted(): void
    {
        static::updating(fn () => false);
        static::deleting(fn () => false);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Single-row backup configuration (id = 1). Secrets (the backup passphrase and
 * the destination credentials) are encrypted at rest via Laravel's `encrypted`
 * casts, so the raw values never sit in the database in the clear.
 *
 * This is the feature's own config — it is itself never included in a backup.
 */
class BackupSetting extends Model
{
    protected $table = 'backup_settings';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'enabled', 'frequency', 'run_time', 'run_day', 'retention_count',
        'destination_driver', 'destination_config', 'passphrase',
        'last_run_at', 'next_run_at', 'last_status',
    ];

    protected $hidden = ['passphrase', 'destination_config'];

    protected $casts = [
        'enabled'            => 'boolean',
        'retention_count'    => 'integer',
        'run_day'            => 'integer',
        'destination_config' => 'encrypted:array',
        'passphrase'         => 'encrypted',
        'last_run_at'        => 'datetime',
        'next_run_at'        => 'datetime',
    ];

    /** The one settings row, created with defaults if it doesn't exist yet. */
    public static function current(): self
    {
        return static::query()->firstOrCreate(['id' => 1]);
    }

    public function hasPassphrase(): bool
    {
        return filled($this->passphrase);
    }
}

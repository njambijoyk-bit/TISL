<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row per backup attempt — the run history and the integrity chain.
 * `previous_run_id` points at the prior successful run so restore can fall
 * back down the chain if the latest file is corrupt.
 */
class BackupRun extends Model
{
    protected $table = 'backup_runs';

    public const RUNNING = 'running';
    public const OK = 'ok';
    public const CORRUPT = 'corrupt';
    public const FAILED = 'failed';

    protected $fillable = [
        'uuid', 'status', 'trigger', 'destination_driver', 'filename',
        'size_bytes', 'table_count', 'row_count', 'checksum',
        'previous_run_id', 'started_at', 'finished_at', 'started_by', 'error',
    ];

    protected $casts = [
        'size_bytes'  => 'integer',
        'table_count' => 'integer',
        'row_count'   => 'integer',
        'started_at'  => 'datetime',
        'finished_at' => 'datetime',
    ];

    public static function lastSuccessful(): ?self
    {
        return static::where('status', self::OK)->latest('id')->first();
    }
}

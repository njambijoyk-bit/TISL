<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaultArchiverConfig extends Model
{
    protected $fillable = [
        'archiver_type', 'table_name', 'label', 'description',
        'retention_days', 'export_format', 'destination_folder_id',
        'is_enabled', 'auto_archive_on_generate', 'generator_class',
        'last_archived_at', 'last_rows_archived', 'last_size_bytes',
    ];

    protected $casts = [
        'retention_days'           => 'integer',
        'is_enabled'               => 'boolean',
        'auto_archive_on_generate' => 'boolean',
        'last_archived_at'         => 'datetime',
        'last_rows_archived'       => 'integer',
        'last_size_bytes'          => 'integer',
    ];

    public function destinationFolder()
    {
        return $this->belongsTo(VaultFolder::class, 'destination_folder_id');
    }

    public function runs()
    {
        return $this->hasMany(VaultArchiveRun::class, 'config_id')
                    ->orderByDesc('created_at');
    }

    public function lastRun()
    {
        return $this->hasOne(VaultArchiveRun::class, 'config_id')
                    ->latestOfMany('created_at');
    }
}
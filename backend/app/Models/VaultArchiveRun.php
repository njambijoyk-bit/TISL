<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaultArchiveRun extends Model
{
    public $timestamps = false;

    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = [
        'config_id', 'table_name', 'status',
        'rows_exported', 'file_size_bytes',
        'file_path', 'vault_document_id',
        'date_range_start', 'date_range_end',
        'triggered_by', 'triggered_by_user_id',
        'error_message', 'started_at', 'completed_at',
    ];

    protected $casts = [
        'rows_exported'    => 'integer',
        'file_size_bytes'  => 'integer',
        'date_range_start' => 'datetime',
        'date_range_end'   => 'datetime',
        'started_at'       => 'datetime',
        'completed_at'     => 'datetime',
        'created_at'       => 'datetime',
    ];

    public function config()
    {
        return $this->belongsTo(VaultArchiverConfig::class, 'config_id');
    }

    public function document()
    {
        return $this->belongsTo(VaultDocument::class, 'vault_document_id');
    }

    public function triggeredBy()
    {
        return $this->belongsTo(User::class, 'triggered_by_user_id');
    }

    public function isCompleted(): bool { return $this->status === 'completed'; }
    public function isFailed(): bool    { return $this->status === 'failed';    }
    public function isRunning(): bool   { return $this->status === 'running';   }

    public function formattedSize(): string
    {
        $bytes = $this->file_size_bytes;
        if ($bytes >= 1073741824) return number_format($bytes / 1073741824, 2) . ' GB';
        if ($bytes >= 1048576)    return number_format($bytes / 1048576, 2)    . ' MB';
        if ($bytes >= 1024)       return number_format($bytes / 1024, 2)       . ' KB';
        return $bytes . ' B';
    }
}
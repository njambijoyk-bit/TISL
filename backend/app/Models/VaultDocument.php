<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class VaultDocument extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'folder_id', 'name', 'original_filename',
        'mime_type', 'extension', 'file_path', 'file_size',
        'document_type', 'sensitivity_level',
        'tags', 'metadata',
        'password_hash', 'is_locked', 'is_cold',
        'version_count', 'uploaded_by',
    ];

    protected $hidden = ['password_hash'];

    protected $casts = [
        'tags'        => 'array',
        'metadata'    => 'array',
        'is_locked'   => 'boolean',
        'is_cold'     => 'boolean',
        'file_size'   => 'integer',
        'version_count' => 'integer',
    ];

    // ── Relationships ──────────────────────────────────────────────────────

    public function folder()
    {
        return $this->belongsTo(VaultFolder::class, 'folder_id');
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function versions()
    {
        return $this->hasMany(VaultDocumentVersion::class, 'document_id')
                    ->orderByDesc('version_number');
    }

    public function latestVersion()
    {
        return $this->hasOne(VaultDocumentVersion::class, 'document_id')
                    ->latestOfMany('version_number');
    }

    public function archivedItem()
    {
        return $this->hasOne(VaultArchivedItem::class, 'vault_document_id');
    }

    public function archiveRun()
    {
        return $this->hasOne(VaultArchiveRun::class, 'vault_document_id');
    }

    public function policies()
    {
        return $this->hasMany(VaultPolicy::class, 'target_id')
                    ->where('target_type', 'document');
    }

    public function unlockSessions()
    {
        return $this->hasMany(VaultUnlockSession::class, 'target_id')
                    ->where('target_type', 'document');
    }

    public function accessLogs()
    {
        return $this->hasMany(VaultAccessLog::class, 'target_id')
                    ->where('target_type', 'document');
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    public function isPasswordProtected(): bool
    {
        return !is_null($this->password_hash);
    }

    public function formattedSize(): string
    {
        $bytes = $this->file_size;
        if ($bytes >= 1073741824) return number_format($bytes / 1073741824, 2) . ' GB';
        if ($bytes >= 1048576)    return number_format($bytes / 1048576, 2)    . ' MB';
        if ($bytes >= 1024)       return number_format($bytes / 1024, 2)       . ' KB';
        return $bytes . ' B';
    }

    public function isPreviewable(): bool
    {
        return in_array($this->extension, [
            'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp',
            'csv', 'json', 'md', 'xlsx', 'xls',
        ]);
    }
}
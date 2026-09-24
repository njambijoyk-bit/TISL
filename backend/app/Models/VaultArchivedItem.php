<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaultArchivedItem extends Model
{
    public $timestamps = false;

    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = [
        'vault_document_id', 'source_type', 'source_reference',
        'source_table', 'archived_by_user_id', 'archived_at',
        'original_location', 'is_cold', 'compressed_path', 'notes',
    ];

    protected $casts = [
        'archived_at' => 'datetime',
        'created_at'  => 'datetime',
        'is_cold'     => 'boolean',
    ];

    public function document()
    {
        return $this->belongsTo(VaultDocument::class, 'vault_document_id');
    }

    public function archivedBy()
    {
        return $this->belongsTo(User::class, 'archived_by_user_id');
    }
}
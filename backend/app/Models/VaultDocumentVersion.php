<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaultDocumentVersion extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'document_id', 'file_path', 'file_size',
        'version_number', 'change_note', 'uploaded_by',
    ];

    protected $casts = [
        'file_size'      => 'integer',
        'version_number' => 'integer',
        'created_at'     => 'datetime',
    ];

    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    public function document()
    {
        return $this->belongsTo(VaultDocument::class, 'document_id');
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
<?php

namespace App\Models\Extras;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\User;

class PrequalificationDocument extends Model
{
    use HasFactory;

    protected $fillable = [
        'prequalification_id',
        'document_type',
        'original_filename',
        'disk',
        'path',
        'mime_type',
        'size_bytes',
        'verified',
        'verified_by',
        'verified_at',
    ];

    protected $casts = [
        'size_bytes'  => 'integer',
        'verified'    => 'boolean',
        'verified_at' => 'datetime',
    ];

    public function prequalification()
    {
        return $this->belongsTo(Prequalification::class);
    }

    public function verifier()
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}

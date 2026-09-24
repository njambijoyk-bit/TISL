<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaultAccessLog extends Model
{
    public $timestamps = false;

    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = [
        'user_id', 'action', 'target_type', 'target_id',
        'ip_address', 'user_agent', 'context_snapshot',
    ];

    protected $casts = [
        'context_snapshot' => 'array',
        'created_at'       => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
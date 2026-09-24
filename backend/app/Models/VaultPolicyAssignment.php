<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaultPolicyAssignment extends Model
{
    public $timestamps = false;

    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = [
        'policy_id', 'assignee_type', 'assignee_value',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function policy()
    {
        return $this->belongsTo(VaultPolicy::class, 'policy_id');
    }
}
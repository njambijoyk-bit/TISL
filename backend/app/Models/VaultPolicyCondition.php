<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaultPolicyCondition extends Model
{
    public $timestamps = false;

    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;

    protected $fillable = [
        'policy_id', 'attribute_source', 'attribute_key',
        'operator', 'attribute_value',
    ];

    protected $casts = [
        'attribute_value' => 'array',
        'created_at'      => 'datetime',
    ];

    public function policy()
    {
        return $this->belongsTo(VaultPolicy::class, 'policy_id');
    }
}
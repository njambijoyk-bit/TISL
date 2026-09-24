<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VaultPolicy extends Model
{
    protected $fillable = [
        'name', 'description', 'target_type', 'target_id',
        'effect', 'priority', 'is_active', 'created_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'priority'  => 'integer',
        'target_id' => 'integer',
    ];

    public function conditions()
    {
        return $this->hasMany(VaultPolicyCondition::class, 'policy_id');
    }

    public function assignments()
    {
        return $this->hasMany(VaultPolicyAssignment::class, 'policy_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    public function isAllow(): bool { return $this->effect === 'allow'; }
    public function isDeny(): bool  { return $this->effect === 'deny';  }
}
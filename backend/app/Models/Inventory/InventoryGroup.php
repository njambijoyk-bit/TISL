<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};

class InventoryGroup extends Model
{
    protected $table = 'inventory_groups';

    protected $fillable = [
        'name', 'description', 'is_active', 'created_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function members(): HasMany
    {
        return $this->hasMany(InventoryGroupMember::class, 'group_id');
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(InventoryAssignment::class, 'assignee_id')
                    ->where('assignee_type', 'group');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'created_by');
    }

    public function scopeActive($q)
    {
        return $q->where('is_active', true);
    }
}

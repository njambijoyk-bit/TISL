<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryGroupMember extends Model
{
    public $timestamps = false;

    protected $table = 'inventory_group_members';

    protected $fillable = [
        'group_id', 'member_type', 'member_id', 'role_note', 'added_by',
    ];

    protected $casts = [
        'added_at' => 'datetime',
    ];

    public function group(): BelongsTo
    {
        return $this->belongsTo(InventoryGroup::class, 'group_id');
    }

    public function addedBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'added_by');
    }

    public function resolveMember(): mixed
    {
        return match ($this->member_type) {
            'employee' => \App\Models\Employee::find($this->member_id),
            'customer' => \App\Models\Customer::find($this->member_id),
            default    => null,
        };
    }

    public function scopeEmployees($q) { return $q->where('member_type', 'employee'); }
    public function scopeCustomers($q) { return $q->where('member_type', 'customer'); }
}

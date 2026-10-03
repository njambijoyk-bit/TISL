<?php

namespace App\Models\Inventory;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\{BelongsTo, HasMany};

class InventoryCategory extends Model
{
    protected $table = 'inventory_categories';

    protected $fillable = [
        'parent_id', 'name', 'slug', 'description', 'icon', 'sort_order',
        'is_active', 'created_by',
        'asset_ledger_id', 'accumulated_ledger_id', 'expense_ledger_id', 'default_method', 'default_life_years', 'default_rate',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'sort_order' => 'integer',
        'default_rate' => 'decimal:4',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(InventoryCategory::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(InventoryCategory::class, 'parent_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(InventoryItem::class, 'category_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(\App\Models\User::class, 'created_by');
    }

    public function scopeActive($q)
    {
        return $q->where('is_active', true);
    }

    public function scopeTopLevel($q)
    {
        return $q->whereNull('parent_id');
    }
}

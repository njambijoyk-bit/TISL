<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A part of the floor at a branch (Indoor, Patio, Bar). */
class Area extends Model
{
    protected $table = 'menus_areas';

    protected $fillable = ['location_id', 'name', 'sort_order', 'is_active'];

    protected $casts = ['is_active' => 'boolean', 'sort_order' => 'integer'];

    public function tables(): HasMany
    {
        return $this->hasMany(Table::class, 'area_id')->orderBy('sort_order')->orderBy('name');
    }
}

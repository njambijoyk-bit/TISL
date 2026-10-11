<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A card (Breakfast, Lunch, Bar) with the days and hours it is served. */
class Menu extends Model
{
    protected $table = 'menus_menus';

    protected $fillable = ['name', 'slug', 'description', 'days', 'starts_at', 'ends_at', 'sort_order', 'is_active'];

    protected $casts = ['days' => 'array', 'sort_order' => 'integer', 'is_active' => 'boolean'];

    public function sections(): HasMany
    {
        return $this->hasMany(MenuSection::class, 'menu_id')->orderBy('sort_order')->orderBy('id');
    }
}

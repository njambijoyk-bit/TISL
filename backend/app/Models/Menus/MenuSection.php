<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/** A heading inside a menu, with its dishes in order. */
class MenuSection extends Model
{
    protected $table = 'menus_sections';

    protected $fillable = ['menu_id', 'name', 'description', 'sort_order'];

    public function dishes(): BelongsToMany
    {
        return $this->belongsToMany(Dish::class, 'menus_section_dishes', 'section_id', 'dish_id')->withPivot('sort_order')->orderByPivot('sort_order');
    }
}

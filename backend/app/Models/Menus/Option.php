<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** One choice in an option group: a price change, and what it uses or leaves out of the recipe. */
class Option extends Model
{
    protected $table = 'menus_options';

    protected $fillable = ['group_id', 'name', 'price_delta', 'is_default', 'charge_removal', 'linked_dish_id', 'sort_order', 'is_active'];

    protected $casts = ['price_delta' => 'decimal:2', 'is_default' => 'boolean', 'charge_removal' => 'boolean', 'is_active' => 'boolean', 'sort_order' => 'integer'];

    public function group(): BelongsTo
    {
        return $this->belongsTo(OptionGroup::class, 'group_id');
    }

    public function uses(): HasMany
    {
        return $this->hasMany(OptionUse::class, 'option_id');
    }
}

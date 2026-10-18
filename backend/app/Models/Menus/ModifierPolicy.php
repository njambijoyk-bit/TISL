<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One row of a list the Menus configuration keeps (servings, audiences, modifier policies). */
class ModifierPolicy extends Model
{
    protected $table = 'menus_modifier_policies';

    protected $fillable = ['name', 'kind', 'amount', 'is_default', 'sort_order', 'is_active'];

    protected $casts = ['amount' => 'decimal:2', 'is_default' => 'boolean', 'sort_order' => 'integer', 'is_active' => 'boolean'];
}

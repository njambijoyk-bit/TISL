<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One row of a list the Menus configuration keeps (servings, audiences, modifier policies). */
class Serving extends Model
{
    protected $table = 'menus_servings';

    protected $fillable = ['name', 'sort_order', 'is_active'];

    protected $casts = ['sort_order' => 'integer', 'is_active' => 'boolean'];
}

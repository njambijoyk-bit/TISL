<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** One row of a list the Menus configuration keeps (servings, audiences, modifier policies). */
class Audience extends Model
{
    protected $table = 'menus_audiences';

    protected $fillable = ['name', 'sort_order', 'is_active'];

    protected $casts = ['sort_order' => 'integer', 'is_active' => 'boolean'];
}

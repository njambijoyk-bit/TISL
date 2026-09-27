<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A storefront navigation link the admin can show/hide per module.
 * A link is only offered to the customer when its module is active
 * (licensed AND switched on) and the admin has it visible.
 */
class NavLink extends Model
{
    protected $table = 'nav_links';

    protected $fillable = ['key', 'label', 'path', 'module_key', 'visible', 'sort_order'];

    protected $casts = [
        'visible'    => 'boolean',
        'sort_order' => 'integer',
    ];
}

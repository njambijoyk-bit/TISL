<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A chef's claim on an open shift. */
class OpenClaim extends Model
{
    protected $table = 'menus_open_claims';

    protected $guarded = [];

    protected $casts = ['decided_at' => 'datetime'];
}

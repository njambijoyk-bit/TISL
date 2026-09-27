<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Catalog of the 11 paid modules plus the client's own on/off switch.
 * Not a source of truth: `enabled` can only hide a module the handshake
 * already licenses. Ask LicenseManager, never read `enabled` directly.
 */
class Module extends Model
{
    protected $fillable = ['enabled'];

    protected $casts = [
        'number'     => 'integer',
        'enabled'    => 'boolean',
        'sort_order' => 'integer',
    ];
}

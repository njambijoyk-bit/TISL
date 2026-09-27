<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Opaque vault row: one per module per installation. Holds no module name
 * and no readable key; only LicenseManager can make sense of it.
 */
class ModuleLock extends Model
{
    protected $fillable = [
        'slot', 'lock_hash', 'sealed_key', 'key_hash',
        'used', 'activated_at', 'activated_by',
    ];

    protected $hidden = ['slot', 'lock_hash', 'sealed_key', 'key_hash'];

    protected $casts = [
        'used'         => 'boolean',
        'activated_at' => 'datetime',
    ];

    public function activator()
    {
        return $this->belongsTo(User::class, 'activated_by');
    }
}

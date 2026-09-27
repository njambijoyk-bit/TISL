<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * The single installation row (id = 1), written from the ownership code.
 * Never trusted on its own: LicenseManager re-checks its signature and hash.
 */
class Installation extends Model
{
    protected $table = 'installation';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id', 'client_uuid', 'business_name', 'purchased_at',
        'ownership_code', 'uuid_hash', 'key_version', 'installed_at',
    ];

    protected $hidden = ['ownership_code', 'uuid_hash'];

    protected $casts = [
        'purchased_at' => 'date:Y-m-d',
        'installed_at' => 'datetime',
    ];

    public static function current(): ?self
    {
        return static::query()->find(1);
    }
}

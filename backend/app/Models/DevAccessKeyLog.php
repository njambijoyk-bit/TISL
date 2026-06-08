<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DevAccessKeyLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'dev_access_key_id',
        'attempted_key',
        'result',
        'ip_address',
        'user_agent',
        'attempted_at',
    ];

    protected $casts = [
        'attempted_at' => 'datetime',
    ];

    public function accessKey()
    {
        return $this->belongsTo(DevAccessKey::class);
    }
}

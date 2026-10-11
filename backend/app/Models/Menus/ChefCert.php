<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

/** A certificate a chef holds, with the day it runs out. */
class ChefCert extends Model
{
    public const KINDS = ['food_handler' => 'Food handler', 'medical' => 'Medical', 'first_aid' => 'First aid', 'haccp' => 'HACCP', 'other' => 'Other'];

    /** Days before it runs out that the warning is sent. */
    public const WARN_DAYS = 30;

    protected $table = 'menus_chef_certs';

    protected $fillable = ['chef_id', 'kind', 'name', 'number', 'issued_on', 'expires_on', 'warned_at', 'expired_told_at', 'notes'];

    protected $casts = ['issued_on' => 'date:Y-m-d', 'expires_on' => 'date:Y-m-d', 'warned_at' => 'datetime', 'expired_told_at' => 'datetime'];

    public function chef(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Chef::class, 'chef_id');
    }

    /** valid | expiring | expired | none (never runs out) */
    public function standing(?\Illuminate\Support\Carbon $today = null): string
    {
        $today = ($today ?? today())->copy()->startOfDay();
        if (! $this->expires_on) {
            return 'none';
        }
        if ($this->expires_on->lt($today)) {
            return 'expired';
        }

        return $this->expires_on->lte($today->copy()->addDays(self::WARN_DAYS)) ? 'expiring' : 'valid';
    }
}

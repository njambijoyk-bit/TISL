<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** The shop-wide stock & expiry rules (one row, id = 1). See StockPolicy for the rules as the code reads them. */
class StockSetting extends Model
{
    protected $table = 'stock_settings';

    public $incrementing = false;

    protected $fillable = [
        'expired_on_storefront', 'show_expiry_badge', 'sell_expired', 'override_roles', 'min_days_online', 'min_days_till',
        'expiry_action', 'write_off_after_days', 'warning_days', 'notify_roles', 'pick_order', 'updated_by', 'updated_at',
    ];

    protected $casts = [
        'show_expiry_badge'    => 'boolean',
        'override_roles'       => 'array',
        'notify_roles'         => 'array',
        'warning_days'         => 'array',
        'min_days_online'      => 'integer',
        'min_days_till'        => 'integer',
        'write_off_after_days' => 'integer',
        'updated_at'           => 'datetime',
    ];

    public $timestamps = false;

    public static function current(): self
    {
        return static::find(1) ?? static::create(['id' => 1]);
    }
}

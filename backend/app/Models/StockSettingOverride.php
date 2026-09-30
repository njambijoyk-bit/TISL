<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** An exception to the stock & expiry rules for one category or one product. Only the settings named in `settings` change. */
class StockSettingOverride extends Model
{
    protected $table = 'stock_setting_overrides';

    protected $fillable = ['scope', 'scope_id', 'settings', 'updated_by'];

    protected $casts = ['settings' => 'array'];
}

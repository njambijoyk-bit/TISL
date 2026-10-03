<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One asset's depreciation for one month that has been posted (in the asset's own currency). */
class AssetDepreciation extends Model
{
    protected $table = 'asset_depreciation';

    protected $fillable = ['instance_id', 'period_end', 'amount', 'currency_id', 'voucher_id', 'created_by'];

    protected $casts = ['period_end' => 'date:Y-m-d', 'amount' => 'decimal:2'];
}

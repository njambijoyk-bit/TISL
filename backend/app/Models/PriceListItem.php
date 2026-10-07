<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One frozen priced line of a price list. Prices exclude tax and stay in the item's own currency. */
class PriceListItem extends Model
{
    public $timestamps = false;

    protected $fillable = ['price_list_id', 'position', 'item_type', 'item_id', 'code', 'name', 'variant', 'unit', 'category', 'currency_code', 'currency_symbol', 'price', 'original_price',
        'tax_account', 'tax_name', 'tax_percent', 'tax_amount', 'total'];

    protected $casts = ['price' => 'float', 'original_price' => 'float', 'tax_percent' => 'float', 'tax_amount' => 'float', 'total' => 'float', 'item_id' => 'integer'];

    public function list()
    {
        return $this->belongsTo(PriceList::class, 'price_list_id');
    }
}

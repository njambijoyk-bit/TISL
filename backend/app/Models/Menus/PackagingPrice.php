<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** The price of one unit of a packaging item (script 207). */
class PackagingPrice extends Model
{
    protected $table = 'menus_packaging_prices';

    protected $fillable = ['item_id', 'price', 'currency_id', 'ledger_id', 'is_active'];

    protected $casts = ['price' => 'decimal:2', 'is_active' => 'boolean'];

    public function item(): BelongsTo
    {
        return $this->belongsTo(IngredientItem::class, 'item_id');
    }
}

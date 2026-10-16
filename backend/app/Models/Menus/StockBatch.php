<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A received lot of an ingredient variant at a branch. Quantities are in the ingredient's base unit. */
class StockBatch extends Model
{
    protected $table = 'menus_stock_batches';

    protected $fillable = ['item_id', 'location_id', 'batch_no', 'received_on', 'expiry_date', 'unit_cost', 'qty_in', 'qty_left', 'status', 'source', 'receipt_id'];

    protected $casts = ['received_on' => 'date', 'expiry_date' => 'date', 'unit_cost' => 'decimal:6', 'qty_in' => 'decimal:4', 'qty_left' => 'decimal:4'];

    public function item(): BelongsTo
    {
        return $this->belongsTo(IngredientItem::class, 'item_id');
    }
}

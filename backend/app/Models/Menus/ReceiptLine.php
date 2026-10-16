<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;

class ReceiptLine extends Model
{
    protected $table = 'menus_receipt_lines';

    protected $fillable = ['receipt_id', 'item_id', 'input_qty', 'input_unit', 'qty_base', 'rate', 'amount', 'tax_rate_id', 'tax_amount', 'batch_id'];

    protected $casts = ['input_qty' => 'decimal:4', 'qty_base' => 'decimal:4', 'rate' => 'decimal:4', 'amount' => 'decimal:2', 'tax_amount' => 'decimal:2'];
}

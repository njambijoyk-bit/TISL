<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;

class VoucherItemTax extends Model
{
    public $timestamps = false;

    protected $table = 'voucher_item_taxes';

    protected $fillable = ['item_id', 'tax_rate_id', 'ledger_id', 'label', 'base_amount', 'tax_amount'];

    protected $casts = ['base_amount' => 'decimal:2', 'tax_amount' => 'decimal:2'];
}

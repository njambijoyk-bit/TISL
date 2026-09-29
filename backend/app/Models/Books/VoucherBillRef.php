<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;

/** Bill-by-bill tracking: a sale opens a 'new' bill; a receipt settles it ('against'). */
class VoucherBillRef extends Model
{
    public $timestamps = false;

    protected $table = 'voucher_bill_refs';

    protected $fillable = ['voucher_id', 'ledger_id', 'ref_type', 'ref_name', 'against_voucher_id', 'amount', 'due_date', 'created_at'];

    protected $casts = ['amount' => 'decimal:2', 'due_date' => 'date:Y-m-d'];
}

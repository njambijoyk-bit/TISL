<?php

namespace App\Models\Menus;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Ingredients received: a goods-received document that posted a Purchase voucher (or, for opening stock, a Journal) and made the batches. */
class Receipt extends Model
{
    protected $table = 'menus_receipts';

    protected $fillable = ['kind', 'location_id', 'supplier_ledger_id', 'supplier_invoice_no', 'receipt_date', 'voucher_id', 'status', 'narration', 'subtotal', 'tax_total', 'total', 'created_by', 'cancelled_at'];

    protected $casts = ['receipt_date' => 'date', 'cancelled_at' => 'datetime', 'subtotal' => 'decimal:2', 'tax_total' => 'decimal:2', 'total' => 'decimal:2'];

    public function lines(): HasMany
    {
        return $this->hasMany(ReceiptLine::class, 'receipt_id')->orderBy('id');
    }
}

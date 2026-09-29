<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One way a voucher was paid — a voucher can be paid by several (M-Pesa + a gift voucher). */
class VoucherTender extends Model
{
    public $timestamps = false;

    protected $table = 'voucher_tenders';

    protected $fillable = ['voucher_id', 'payment_method_id', 'amount', 'reference', 'gift_voucher_id', 'gift_amount', 'created_at'];

    protected $casts = ['amount' => 'decimal:2', 'gift_amount' => 'decimal:2', 'created_at' => 'datetime'];

    public function method(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class, 'payment_method_id');
    }
}

<?php

namespace App\Models\Books;

use Illuminate\Database\Eloquent\Model;

class GiftVoucherTransaction extends Model
{
    public $timestamps = false;

    protected $table = 'gift_voucher_transactions';

    protected $fillable = ['gift_voucher_id', 'type', 'amount', 'balance_after', 'voucher_id', 'note', 'created_by', 'created_at'];

    public function giftVoucher()
    {
        return $this->belongsTo(GiftVoucher::class);
    }

    protected $casts = ['amount' => 'decimal:2', 'balance_after' => 'decimal:2', 'created_at' => 'datetime'];
}

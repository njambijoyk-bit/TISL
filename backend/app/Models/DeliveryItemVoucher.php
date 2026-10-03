<?php

namespace App\Models;

use App\Models\Books\Voucher;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A Delivery Note on a manifest stop. A stop can carry several notes for the same customer and address. */
class DeliveryItemVoucher extends Model
{
    protected $table = 'delivery_item_vouchers';

    protected $fillable = ['delivery_item_id', 'voucher_id'];

    public function stop(): BelongsTo
    {
        return $this->belongsTo(DeliveryItem::class, 'delivery_item_id');
    }

    public function voucher(): BelongsTo
    {
        return $this->belongsTo(Voucher::class, 'voucher_id');
    }
}

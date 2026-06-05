<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuctionOrderActivityLog extends Model
{
    protected $fillable = [
        'auction_order_id',
        'auction_id',
        'action',
        'description',
        'severity',
        'performed_by',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function auctionOrder()
    {
        return $this->belongsTo(AuctionOrder::class);
    }

    public function auction()
    {
        return $this->belongsTo(Auction::class);
    }
}
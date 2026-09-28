<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Auction activity log (bids etc.). Table name kept for the vault/export tooling. */
class AuctionOrderActivityLog extends Model
{
    protected $fillable = [
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

    public function auction()
    {
        return $this->belongsTo(Auction::class);
    }
}
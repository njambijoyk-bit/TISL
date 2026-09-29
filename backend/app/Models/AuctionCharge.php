<?php

namespace App\Models;

use App\Models\Books\Ledger;
use Illuminate\Database\Eloquent\Model;

/**
 * One charge applied to one auction (buyer premium, entry fee, deposit, handling…). It points at a charge ledger,
 * which carries the tax treatment and where the money posts; amounts here are in the auction's own currency
 * and may be overridden per auction.
 */
class AuctionCharge extends Model
{
    protected $fillable = ['auction_id', 'ledger_id', 'basis', 'amount', 'min_amount', 'max_amount', 'free_days', 'timing', 'refundable', 'is_enabled', 'sort_order'];

    protected $casts = [
        'amount' => 'decimal:4', 'min_amount' => 'decimal:2', 'max_amount' => 'decimal:2',
        'free_days' => 'integer', 'refundable' => 'boolean', 'is_enabled' => 'boolean',
    ];

    public function auction() { return $this->belongsTo(Auction::class); }
    public function ledger() { return $this->belongsTo(Ledger::class, 'ledger_id'); }
}

<?php

namespace App\Models;

use App\Models\Books\Voucher;
use Illuminate\Database\Eloquent\Model;

/**
 * A bidder's registration for one auction. Where the auction takes an entry fee and / or a deposit, the bidder
 * registers first: that raises an order for those amounts; once it is paid they may bid. The deposit is held in a
 * liability ledger until the auction closes, then released to the customer's account.
 */
class AuctionRegistration extends Model
{
    public const AWAITING = 'awaiting_payment';
    public const REGISTERED = 'registered';
    public const CANCELLED = 'cancelled';

    protected $fillable = ['auction_id', 'customer_id', 'user_id', 'order_voucher_id', 'status', 'entry_amount', 'deposit_amount', 'deposit_ledger_id', 'deposit_status', 'release_voucher_id', 'released_at'];

    protected $casts = ['entry_amount' => 'decimal:2', 'deposit_amount' => 'decimal:2', 'released_at' => 'datetime'];

    public function auction() { return $this->belongsTo(Auction::class); }
    public function customer() { return $this->belongsTo(Customer::class); }
    public function order() { return $this->belongsTo(Voucher::class, 'order_voucher_id'); }
}

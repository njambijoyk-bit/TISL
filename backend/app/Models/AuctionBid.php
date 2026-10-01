<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class AuctionBid extends Model
{
    protected $fillable = ['auction_id', 'bidder_id', 'amount', 'max_bid'];
    protected $casts = ['amount' => 'decimal:10', 'max_bid' => 'decimal:10'];

    public function auction() { return $this->belongsTo(Auction::class); }
    public function bidder() { return $this->belongsTo(User::class, 'bidder_id'); }
}
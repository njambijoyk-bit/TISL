<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Auction extends Model
{
    // currency() relation. Auctions are shown and bid on in their OWN
    // currency (no display conversion): every bid, increment and reserve
    // is an amount in auction.currency.
    use \App\Traits\HasCurrencyConversion;

    use SoftDeletes;

    protected $fillable = [
        'product_id', 'variant_id', 'location_id', 'seller_id', 'currency_id', 'start_price', 'current_price',
        'reserve_price', 'bid_increment', 'start_time', 'end_time',
        'status', 'winner_id', 'max_winners', 'sales_ledger_id',
    ];

    protected $casts = [
        'start_price' => 'decimal:2', 'current_price' => 'decimal:2',
        'reserve_price' => 'decimal:2', 'bid_increment' => 'decimal:2',
        'start_time' => 'datetime', 'end_time' => 'datetime',
    ];

    protected $appends = ['tax_info'];

    /** Tax treatment of the sales account this auction is booked under. Bids are entered and shown exclusive of it. */
    public function getTaxInfoAttribute(): ?array
    {
        return \App\Services\Books\PriceTax::forAccount($this->sales_ledger_id);
    }

    public function product() { return $this->belongsTo(Product::class); }
    public function variant() { return $this->belongsTo(ProductVariant::class, 'variant_id'); }
    public function location() { return $this->belongsTo(Location::class); }
    public function seller() { return $this->belongsTo(User::class, 'seller_id'); }
    public function winner() { return $this->belongsTo(User::class, 'winner_id'); }
    public function bids() { return $this->hasMany(AuctionBid::class)->orderByDesc('amount'); }
}
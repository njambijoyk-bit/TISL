<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Auction extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'product_id', 'seller_id', 'start_price', 'current_price',
        'reserve_price', 'bid_increment', 'start_time', 'end_time',
        'status', 'winner_id'
    ];

    protected $casts = [
        'start_price' => 'decimal:2', 'current_price' => 'decimal:2',
        'reserve_price' => 'decimal:2', 'bid_increment' => 'decimal:2',
        'start_time' => 'datetime', 'end_time' => 'datetime',
    ];

    public function product() { return $this->belongsTo(Product::class); }
    public function seller() { return $this->belongsTo(User::class, 'seller_id'); }
    public function winner() { return $this->belongsTo(User::class, 'winner_id'); }
    public function bids() { return $this->hasMany(AuctionBid::class)->orderByDesc('amount'); }
}
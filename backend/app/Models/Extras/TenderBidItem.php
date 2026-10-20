<?php

namespace App\Models\Extras;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TenderBidItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'tender_bid_id',
        'description',
        'quantity',
        'unit_price',
        'line_total',
        'notes',
    ];

    protected $casts = [
        'quantity'   => 'decimal:4',
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
    ];

    public function bid()
    {
        return $this->belongsTo(TenderBid::class, 'tender_bid_id');
    }

    protected static function boot()
    {
        parent::boot();

        static::saving(function (self $item) {
            if ($item->isDirty(['quantity', 'unit_price'])) {
                $item->line_total = round($item->quantity * $item->unit_price, 2);
            }
        });
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One "tell me when it is back" request (script 112). */
class StockWatch extends Model
{
    public const WAITING = 'waiting';

    public const NOTIFIED = 'notified';

    public const STOPPED = 'stopped';

    public const EXPIRED = 'expired';

    protected $guarded = [];

    protected $casts = ['notified_at' => 'datetime', 'stopped_at' => 'datetime'];

    protected $hidden = ['token'];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    public function hamper(): BelongsTo
    {
        return $this->belongsTo(Hamper::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}

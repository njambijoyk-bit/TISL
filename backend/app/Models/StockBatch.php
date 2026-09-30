<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One arrival of stock: what came in, at what cost, and (for products that
 * track expiry) its batch number and expiry date. Quantities per branch live
 * in stock_batch_balances. Cost is per base unit in the base currency.
 */
class StockBatch extends Model
{
    public const ACTIVE = 'active';
    public const EXPIRED = 'expired';
    public const QUARANTINED = 'quarantined';
    public const RECALLED = 'recalled';

    protected $table = 'stock_batches';

    protected $fillable = [
        'variant_id', 'batch_no', 'mfg_date', 'expiry_date', 'unit_cost',
        'received_at', 'received_voucher_id', 'status', 'notes', 'clearance_percent', 'held_reason', 'last_warned_days',
    ];

    protected $casts = [
        'mfg_date'    => 'date:Y-m-d',
        'expiry_date' => 'date:Y-m-d',
        'received_at' => 'date:Y-m-d',
        'unit_cost'   => 'decimal:4',
        'clearance_percent' => 'decimal:2',
    ];

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    public function events(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(StockBatchEvent::class, 'batch_id')->orderByDesc('id');
    }

    public function scopeActive(Builder $q): Builder
    {
        return $q->where('status', self::ACTIVE);
    }
}

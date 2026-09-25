<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Audit trail: one row per tax actually calculated on an order/line item.
 * Append-only, same spirit as StoreCreditTransaction / LoyaltyPointTransaction
 * - once written, a row is never edited or deleted through Eloquent.
 * Not itself wrapped in LogsTaxActivity: this table IS the log; logging
 * changes to a log would be circular.
 */
class TaxApplication extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'tax_applications';

    protected $fillable = [
        'order_id',
        'order_item_id',
        'tax_rate_id',
        'tax_rule_id',
        'classification',
        'base_amount',
        'taxable_quantity',
        'unit_of_measure_id',
        'tax_amount',
    ];

    protected $casts = [
        'base_amount'      => 'decimal:2',
        'taxable_quantity' => 'decimal:4',
        'tax_amount'       => 'decimal:2',
        'created_at'       => 'datetime',
    ];

    protected static function booted(): void
    {
        static::updating(fn () => false);
        static::deleting(fn () => false);
    }

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }

    public function taxRate(): BelongsTo
    {
        return $this->belongsTo(TaxRate::class);
    }

    public function taxRule(): BelongsTo
    {
        return $this->belongsTo(TaxRule::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'unit_of_measure_id');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeForOrder(Builder $query, int $orderId): Builder
    {
        return $query->where('order_id', $orderId);
    }

    public function scopeForClassification(Builder $query, string $classification): Builder
    {
        return $query->where('classification', $classification);
    }

    /** Order-wide taxes (no specific line item) vs per-line-item taxes. */
    public function scopeOrderLevel(Builder $query): Builder
    {
        return $query->whereNull('order_item_id');
    }

    public function scopeLineLevel(Builder $query): Builder
    {
        return $query->whereNotNull('order_item_id');
    }

    // ========================================
    // HELPERS
    // ========================================

    public function isLineLevel(): bool
    {
        return $this->order_item_id !== null;
    }
}

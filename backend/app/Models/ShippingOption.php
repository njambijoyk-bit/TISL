<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShippingOption extends Model
{
    protected $fillable = [
        'slug',
        'name',
        'description',
        'cost',
        'free_above',
        'is_active',
        'sort_order',
        'icon',
        'currency_id',
        'income_ledger_id',
        'tax_rate_id',
    ];

    protected $casts = [
        'cost'      => 'decimal:2',
        'free_above'=> 'decimal:2',
        'is_active' => 'boolean',
        'sort_order'=> 'integer',
    ];

    protected static function booted(): void
    {
        // Every shipping option owns an income ledger under Shipping & Delivery.
        static::saved(function (self $o) {
            try {
                app(\App\Services\Books\ShippingLedgerService::class)->sync($o);
            } catch (\Throwable $e) {
                report($e);   // books not set up yet — the option itself is saved
            }
        });
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    public function taxRate(): BelongsTo
    {
        return $this->belongsTo(TaxRate::class);
    }

    /**
     * Active options ordered for checkout display.
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true)->orderBy('sort_order');
    }

    /**
     * Activity log entries for this shipping option.
     */
    public function activities(): HasMany
    {
        return $this->hasMany(ShippingActivity::class);
    }

    /**
     * Calculate shipping cost for a given subtotal.
     */
    public function costForSubtotal(float $subtotal): float
    {
        if ($this->free_above && $subtotal >= (float) $this->free_above) {
            return 0;
        }

        return (float) $this->cost;
    }
}

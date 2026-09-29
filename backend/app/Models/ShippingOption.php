<?php

namespace App\Models;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A shipping option is not a table of its own: it is a ledger (income side) in a
 * delivery-behaviour group. Its name, rate, currency, free-above and switch live on
 * the ledger, the rest (description, icon, order, tax link) in the ledger's settings.
 * This class only presents that ledger under the vocabulary the checkout uses.
 */
class ShippingOption extends Ledger
{
    protected $fillable = [
        'name', 'code', 'slug', 'group_id', 'currency_id', 'rate_type', 'rate_value', 'cost', 'free_above', 'min_amount', 'max_amount', 'transit_days',
        'valid_from', 'valid_until', 'is_active', 'is_system', 'notes', 'description', 'icon', 'sort_order', 'tax_rate_id',
    ];

    protected $appends = ['slug', 'cost', 'description', 'icon', 'sort_order', 'tax_rate_id', 'income_ledger_id'];

    protected static function booted(): void
    {
        static::addGlobalScope('delivery_income', function (Builder $q) {
            $q->where('ledgers.side', 'income')
                ->whereIn('ledgers.group_id', fn ($g) => $g->select('id')->from('ledger_groups')->where('behaviour', 'delivery'));
        });

        static::creating(function (self $o) {
            $o->side = 'income';
            $o->group_id = $o->group_id ?: LedgerGroup::where('name', 'Shipping & Delivery')->value('id');
            $o->rate_type = $o->rate_type ?: 'fixed';
            $o->opening_balance = $o->opening_balance ?? 0;
            $o->opening_side = $o->opening_side ?: 'D';
        });
    }

    // ── the ledger, in shipping vocabulary ────────────────────────────────

    private function setting(string $key, $default = null)
    {
        return ($this->settings ?? [])[$key] ?? $default;
    }

    private function putSetting(string $key, $value): void
    {
        $s = $this->settings ?? [];
        $s[$key] = $value;
        $this->settings = $s;
    }

    public function getSlugAttribute(): ?string { return $this->attributes['code'] ?? null; }
    public function setSlugAttribute($v): void { $this->attributes['code'] = $v; }

    public function getCostAttribute(): ?string { return $this->attributes['rate_value'] ?? null; }
    public function setCostAttribute($v): void { $this->attributes['rate_value'] = $v; }

    public function getDescriptionAttribute() { return $this->setting('description'); }
    public function setDescriptionAttribute($v): void { $this->putSetting('description', $v); }

    public function getIconAttribute() { return $this->setting('icon', 'Truck'); }
    public function setIconAttribute($v): void { $this->putSetting('icon', $v); }

    public function getSortOrderAttribute(): int { return (int) $this->setting('sort_order', 0); }
    public function setSortOrderAttribute($v): void { $this->putSetting('sort_order', (int) $v); }

    public function getTaxRateIdAttribute() { return $this->setting('tax_rate_id'); }
    public function setTaxRateIdAttribute($v): void { $this->putSetting('tax_rate_id', $v ? (int) $v : null); }

    /** The ledger is the income ledger: charges post to itself. */
    public function getIncomeLedgerIdAttribute(): ?int { return $this->id; }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    public function taxRate(): BelongsTo
    {
        return $this->belongsTo(TaxRate::class, 'tax_rate_id');
    }

    public function scopeActive($query)
    {
        return $query->where('ledgers.is_active', true)->ordered();
    }

    public function scopeOrdered($query)
    {
        $expr = $query->getConnection()->getDriverName() === 'sqlite'
            ? "JSON_EXTRACT(ledgers.settings, '$.sort_order')"
            : "CAST(JSON_UNQUOTE(JSON_EXTRACT(ledgers.settings, '$.sort_order')) AS UNSIGNED)";

        return $query->orderByRaw($expr)->orderBy('ledgers.name');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(ShippingActivity::class, 'shipping_option_id');
    }

    /**
     * The charge for an order of this subtotal (in this option's currency):
     * a percentage of the goods or a fixed/per-unit amount, kept between the
     * minimum and maximum, free above the threshold.
     */
    public function costForSubtotal(float $subtotal): float
    {
        if ($this->free_above && $subtotal >= (float) $this->free_above) {
            return 0;
        }
        $rate = (float) $this->rate_value;
        $cost = $this->rate_type === 'percent' ? round($subtotal * $rate / 100, 2) : $rate;
        if ($this->min_amount !== null && $cost < (float) $this->min_amount) {
            $cost = (float) $this->min_amount;
        }
        if ($this->max_amount !== null && (float) $this->max_amount > 0 && $cost > (float) $this->max_amount) {
            $cost = (float) $this->max_amount;
        }

        return $cost;
    }
}

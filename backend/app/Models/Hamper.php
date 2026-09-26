<?php

namespace App\Models;

use App\Traits\HasCurrencyConversion;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Hamper extends Model
{
    use HasCurrencyConversion;

    protected $fillable = [
        'name',
        'slug',
        'description',
        'cover_image',
        'accent_color',
        'price',
        'currency_id',
        'status',
        'apply_vat',      // kept in step with tax_rate_id (true when a tax is chosen)
        'tax_rate_id',
        'allow_promo_codes',
        'allow_store_credit',
        'earn_loyalty_points',
        'max_purchases_per_customer',
        'total_stock',
        'stock_remaining',
        'eligibility_type',
        'eligible_tiers',
        'eligible_customer_types',
        'is_visible',
        'is_sold_out',
        'valid_from',
        'valid_until',
        'created_by',
    ];

    // Price in the shopper's chosen currency, like products
    protected $appends = ['display_price', 'display_currency', 'tax_label'];

    protected $casts = [
        'price'                      => 'decimal:2',
        'apply_vat'                  => 'boolean',
        'allow_promo_codes'          => 'boolean',
        'allow_store_credit'         => 'boolean',
        'earn_loyalty_points'        => 'boolean',
        'is_visible'                 => 'boolean',
        'is_sold_out'                => 'boolean',
        'eligible_tiers'             => 'array',
        'eligible_customer_types'    => 'array',
        'valid_from'                 => 'datetime',
        'valid_until'                => 'datetime',
        'max_purchases_per_customer' => 'integer',
        'total_stock'                => 'integer',
        'stock_remaining'            => 'integer',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    /** Hamper price in the shopper's display currency. NULL currency_id = base. */
    public function getDisplayPriceAttribute(): ?float
    {
        return $this->convertAmount((float) $this->price);
    }

    /** The tax added on top at checkout. NULL = no tax. */
    public function taxRate(): BelongsTo
    {
        return $this->belongsTo(TaxRate::class);
    }

    /** e.g. "VAT 16%" — null when no tax applies. */
    public function getTaxLabelAttribute(): ?string
    {
        if (! $this->tax_rate_id) {
            return null;
        }
        $rate = $this->relationLoaded('taxRate') ? $this->taxRate : $this->taxRate()->with('taxType:id,name,code')->first();
        if (! $rate) {
            return null;
        }

        return trim(($rate->taxType?->code ?? $rate->taxType?->name ?? 'Tax') . ' ' . rtrim(rtrim((string) $rate->rate_value, '0'), '.') . '%');
    }

    /** Tax on an amount in the hamper's currency (percentage rates only). */
    public function taxOn(float $taxableAmount): float
    {
        $rate = $this->taxRate;
        if (! $rate || ! $rate->is_active || $rate->rate_type !== TaxRate::TYPE_PERCENTAGE) {
            return 0.0;
        }

        return round($taxableAmount * (float) $rate->rate_value / 100, 2);
    }

    public function items(): HasMany
    {
        return $this->hasMany(HamperItem::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(HamperOrder::class);
    }

    public function eligibility(): HasMany
    {
        return $this->hasMany(HamperCustomerEligibility::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', 'active')->where('is_visible', true);
    }

    public function scopeAvailable($query)
    {
        return $query->active()->where(function ($q) {
            $q->whereNull('valid_from')->orWhere('valid_from', '<=', now());
        })->where(function ($q) {
            $q->whereNull('valid_until')->orWhere('valid_until', '>=', now());
        });
    }

    // ── Accessors ─────────────────────────────────────────────────────────────

    public function getIsSoldOutAttribute(): bool
    {
        if (array_key_exists('is_sold_out', $this->attributes)) {
            return (bool) $this->attributes['is_sold_out'];
        }
        return $this->total_stock !== null && $this->stock_remaining <= 0;
    }

    public function getIsBackorderableAttribute(): bool
    {
        // allows up to 100 units beyond sold out
        if ($this->total_stock === null) return false;
        $ordersCount = $this->orders()->whereNotIn('status', ['cancelled', 'refunded'])->count();
        return $ordersCount < ($this->total_stock + 100);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    public function decrementStock(): void
    {
        if ($this->stock_remaining !== null && $this->stock_remaining > 0) {
            $this->decrement('stock_remaining');
        }
    }

    public function purchaseCountForCustomer(int $customerId): int
    {
        return $this->orders()
            ->where('customer_id', $customerId)
            ->whereNotIn('status', ['cancelled', 'refunded'])
            ->count();
    }
}

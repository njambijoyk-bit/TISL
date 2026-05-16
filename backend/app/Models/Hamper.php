<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Hamper extends Model
{
    protected $fillable = [
        'name',
        'slug',
        'description',
        'cover_image',
        'accent_color',
        'price',
        'status',
        'apply_vat',
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
        'valid_from',
        'valid_until',
        'created_by',
    ];

    protected $casts = [
        'price'                      => 'decimal:2',
        'apply_vat'                  => 'boolean',
        'allow_promo_codes'          => 'boolean',
        'allow_store_credit'         => 'boolean',
        'earn_loyalty_points'        => 'boolean',
        'is_visible'                 => 'boolean',
        'eligible_tiers'             => 'array',
        'eligible_customer_types'    => 'array',
        'valid_from'                 => 'datetime',
        'valid_until'                => 'datetime',
        'max_purchases_per_customer' => 'integer',
        'total_stock'                => 'integer',
        'stock_remaining'            => 'integer',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

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
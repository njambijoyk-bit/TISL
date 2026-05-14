<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerTier extends Model
{
    protected $fillable = [
        'slug',
        'name',
        'description',
        'color',
        'discount_percentage',
        'free_shipping_threshold',
        'loyalty_points_multiplier',
        'priority_support',
        'min_orders',
        'min_spent',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'discount_percentage'       => 'decimal:2',
        'free_shipping_threshold'   => 'decimal:2',
        'loyalty_points_multiplier' => 'decimal:2',
        'priority_support'          => 'boolean',
        'min_orders'                => 'integer',
        'min_spent'                 => 'decimal:2',
        'sort_order'                => 'integer',
        'is_active'                 => 'boolean',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true)->orderBy('sort_order');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(CustomerTierActivity::class, 'entity_id')
            ->where('entity_type', 'tier');
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'tier', 'slug');
    }
}

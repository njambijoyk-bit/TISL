<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
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
    ];

    protected $casts = [
        'cost'      => 'decimal:2',
        'free_above'=> 'decimal:2',
        'is_active' => 'boolean',
        'sort_order'=> 'integer',
    ];

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

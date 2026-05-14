<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerTypeDiscount extends Model
{
    protected $fillable = [
        'slug',
        'name',
        'description',
        'discount_percentage',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'discount_percentage' => 'decimal:2',
        'sort_order'          => 'integer',
        'is_active'           => 'boolean',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true)->orderBy('sort_order');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(CustomerTierActivity::class, 'entity_id')
            ->where('entity_type', 'type_discount');
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'customer_type', 'slug');
    }
}

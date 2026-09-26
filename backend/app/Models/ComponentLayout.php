<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ComponentLayout extends Model
{
    protected $fillable = [
        'component_type', 'variant_key', 'label', 'description',
        'thumbnail_url', 'is_active', 'is_default', 'sort_order',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'is_default' => 'boolean',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeForType($query, string $type)
    {
        return $query->where('component_type', $type);
    }
}

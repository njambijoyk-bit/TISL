<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IconStyle extends Model
{
    protected $fillable = [
        'name', 'slug', 'description',
        'is_active', 'is_default', 'sort_order',
    ];

    protected $casts = [
        'is_active'  => 'boolean',
        'is_default' => 'boolean',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}

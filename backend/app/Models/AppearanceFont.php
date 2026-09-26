<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AppearanceFont extends Model
{
    protected $fillable = [
        'family', 'google_slug', 'category',
        'is_active', 'is_default_heading', 'is_default_body', 'sort_order',
    ];

    protected $casts = [
        'is_active'          => 'boolean',
        'is_default_heading' => 'boolean',
        'is_default_body'    => 'boolean',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}

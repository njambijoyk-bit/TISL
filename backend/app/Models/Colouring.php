<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Colouring extends Model
{
    protected $fillable = [
        'name', 'slug', 'description',
        'light_tokens', 'dark_tokens',
        'is_active', 'is_default', 'sort_order',
    ];

    protected $casts = [
        'light_tokens' => 'array',
        'dark_tokens'  => 'array',
        'is_active'    => 'boolean',
        'is_default'   => 'boolean',
    ];

    public function userPreferences(): HasMany
    {
        return $this->hasMany(UserAppearancePreference::class);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}

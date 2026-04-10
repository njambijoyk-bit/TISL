<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ContentPage extends Model
{
    protected $fillable = [
        'slug',
        'title',
        'description',
        'page_type',
        'is_active',
        'metadata',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'metadata'  => 'array',
    ];

    // ─────────────────────────────────────────────────────────────
    // Relationships
    // ─────────────────────────────────────────────────────────────

    /**
     * All sections ordered by sort_order.
     */
    public function sections(): HasMany
    {
        return $this->hasMany(ContentSection::class, 'page_id')
            ->orderBy('sort_order');
    }

    /**
     * Only active sections — used for public-facing rendering.
     */
    public function activeSections(): HasMany
    {
        return $this->hasMany(ContentSection::class, 'page_id')
            ->where('is_active', true)
            ->orderBy('sort_order');
    }

    // ─────────────────────────────────────────────────────────────
    // Scopes
    // ─────────────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeOfType($query, string $type)
    {
        return $query->where('page_type', $type);
    }
}
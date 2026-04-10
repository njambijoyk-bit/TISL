<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Brand extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'logo_url',
        'description',
        'website',
        'is_active',
        'is_featured',
        'sort_order',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_featured' => 'boolean',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get all products for this brand.
     */
    public function products()
    {
        return $this->hasMany(Product::class);
    }

    // ========================================
    // ACCESSORS & MUTATORS
    // ========================================

    /**
     * Get the logo URL (full path).
     */
    public function getLogoUrlAttribute($value): ?string
    {
        if (!$value) {
            return null;
        }

        // If already full URL (external)
        if (str_starts_with($value, 'http')) {
            return $value;
        }

        // Local storage
        return asset('' . $value);
    }

    /**
     * Automatically generate slug from name.
     */
    public function setNameAttribute($value)
    {
        $this->attributes['name'] = $value;
        
        if (!$this->slug) {
            $this->attributes['slug'] = Str::slug($value);
        }
    }

    // ========================================
    // SCOPES
    // ========================================

    /**
     * Scope to get only active brands.
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * Scope to get featured brands.
     */
    public function scopeFeatured($query)
    {
        return $query->where('is_featured', true);
    }

    /**
     * Scope to order by sort order.
     */
    public function scopeOrdered($query)
    {
        return $query->orderBy('sort_order')->orderBy('name');
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Get product count for this brand.
     */
    public function getProductCount(): int
    {
        return $this->products()->count();
    }

    /**
     * Get active product count.
     */
    public function getActiveProductCount(): int
    {
        return $this->products()->where('status', 'active')->count();
    }
}
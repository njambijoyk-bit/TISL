<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Category extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'description',
        'image_url',
        'parent_id',
        'sort_order',
        'is_active',
        'meta_data',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'meta_data' => 'array',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the parent category.
     */
    public function parent()
    {
        return $this->belongsTo(Category::class, 'parent_id');
    }

    /**
     * Get all child categories (subcategories).
     */
    public function children()
    {
        return $this->hasMany(Category::class, 'parent_id');
    }

    /**
     * Get all child categories recursively.
     */
    public function childrenRecursive()
    {
        return $this->children()->with('childrenRecursive');
    }

    /**
     * Get all products in this category.
     */
    public function products()
    {
        return $this->hasMany(Product::class);
    }

    // ========================================
    // ACCESSORS & MUTATORS
    // ========================================

    /**
     * Get the image URL (full path).
     */
    public function getImageUrlAttribute($value): ?string
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
     * Scope to get only main categories (no parent).
     */
    public function scopeMain($query)
    {
        return $query->whereNull('parent_id');
    }

    /**
     * Scope to get only subcategories.
     */
    public function scopeSubcategories($query)
    {
        return $query->whereNotNull('parent_id');
    }

    /**
     * Scope to get active categories.
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
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
     * Check if this is a main category.
     */
    public function isMainCategory(): bool
    {
        return is_null($this->parent_id);
    }

    /**
     * Check if this category has children.
     */
    public function hasChildren(): bool
    {
        return $this->children()->count() > 0;
    }

    /**
     * Get full category path (e.g., "Hand Tools > Screwdrivers > Flat Head").
     */
    public function getFullPath(): string
    {
        $path = [$this->name];
        $parent = $this->parent;

        while ($parent) {
            array_unshift($path, $parent->name);
            $parent = $parent->parent;
        }

        return implode(' > ', $path);
    }

    /**
     * Get all parent categories as array.
     */
    public function getParents(): array
    {
        $parents = [];
        $parent = $this->parent;

        while ($parent) {
            $parents[] = $parent;
            $parent = $parent->parent;
        }

        return array_reverse($parents);
    }

    /**
     * Get category depth level (0 = main, 1 = sub, 2 = sub-sub, etc.).
     */
    public function getDepth(): int
    {
        $depth = 0;
        $parent = $this->parent;

        while ($parent) {
            $depth++;
            $parent = $parent->parent;
        }

        return $depth;
    }

    /**
     * Get product count in this category.
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

    /**
     * Get all descendant category IDs (children, grandchildren, etc.).
     */
    public function getDescendantIds(): array
    {
        $ids = [];
        
        foreach ($this->children as $child) {
            $ids[] = $child->id;
            $ids = array_merge($ids, $child->getDescendantIds());
        }

        return $ids;
    }
}
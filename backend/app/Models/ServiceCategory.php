<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class ServiceCategory extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     */
    protected $fillable = [
        'name',
        'slug',
        'parent_id',
        'description',
        'icon',
        'color',
        'display_order',
        'is_active',
        'meta_title',
        'meta_description',
    ];

    /**
     * The attributes that should be cast.
     */
    protected $casts = [
        'is_active' => 'boolean',
        'display_order' => 'integer',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /**
     * Get the parent category.
     */
    public function parent()
    {
        return $this->belongsTo(ServiceCategory::class, 'parent_id');
    }

    /**
     * Get all child categories.
     */
    public function children()
    {
        return $this->hasMany(ServiceCategory::class, 'parent_id');
    }

    /**
     * Get all services in this category.
     */
    public function services()
    {
        return $this->hasMany(Service::class, 'category_id');
    }

    // ========================================
    // SCOPES (Query Filters)
    // ========================================

    /**
     * Scope to get only active categories.
     */
    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * Scope to get only parent categories (no parent_id).
     */
    public function scopeParents($query)
    {
        return $query->whereNull('parent_id');
    }

    /**
     * Scope to get categories ordered by display_order.
     */
    public function scopeOrdered($query)
    {
        return $query->orderBy('display_order', 'asc')
                     ->orderBy('name', 'asc');
    }

    /**
     * Scope to search categories.
     */
    public function scopeSearch($query, string $search)
    {
        return $query->where(function ($q) use ($search) {
            $q->where('name', 'like', "%{$search}%")
              ->orWhere('description', 'like', "%{$search}%");
        });
    }

    // ========================================
    // ACCESSORS
    // ========================================

    /**
     * Check if this category has children.
     */
    public function hasChildren(): bool
    {
        return $this->children()->count() > 0;
    }

    /**
     * Check if this is a parent category.
     */
    public function isParent(): bool
    {
        return $this->parent_id === null;
    }

    /**
     * Get full category path (e.g., "Installation > Network Installation").
     */
    public function getFullPathAttribute(): string
    {
        if ($this->parent) {
            return $this->parent->name . ' > ' . $this->name;
        }
        return $this->name;
    }

    // ========================================
    // HELPER METHODS
    // ========================================

    /**
     * Get all descendant categories (children, grandchildren, etc.).
     */
    public function descendants()
    {
        return $this->children()->with('descendants');
    }

    /**
     * Get all ancestor categories (parent, grandparent, etc.).
     */
    public function ancestors()
    {
        $ancestors = collect([]);
        $category = $this;
        
        while ($category->parent) {
            $ancestors->push($category->parent);
            $category = $category->parent;
        }
        
        return $ancestors->reverse();
    }

    // ========================================
    // EVENTS
    // ========================================

    /**
     * Boot method for model events.
     */
    protected static function boot()
    {
        parent::boot();
        
        // Auto-generate slug before creating
        static::creating(function ($category) {
            if (!$category->slug) {
                $category->slug = Str::slug($category->name);
            }
        });

        // Update slug when name changes
        static::updating(function ($category) {
            if ($category->isDirty('name') && !$category->isDirty('slug')) {
                $category->slug = Str::slug($category->name);
            }
        });
    }
}
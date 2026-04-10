<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class ContentSection extends Model
{
    protected $fillable = [
        'page_id',
        'section_key',
        'section_type',
        'title',
        'subtitle',
        'content',
        'image_url',
        'button_text',
        'button_link',
        'items',
        'settings',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'items'      => 'array',
        'settings'   => 'array',
        'is_active'  => 'boolean',
        'sort_order' => 'integer',
    ];

    // ─────────────────────────────────────────────────────────────
    // Relationships
    // ─────────────────────────────────────────────────────────────

    public function page(): BelongsTo
    {
        return $this->belongsTo(ContentPage::class, 'page_id');
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
        return $query->where('section_type', $type);
    }

    // ─────────────────────────────────────────────────────────────
    // Accessors
    // ─────────────────────────────────────────────────────────────

    /**
     * Resolve image_url to a full public URL on read.
     *
     * - Already absolute (http/https) → return as-is (externally hosted image)
     * - Relative path (e.g. content/3/uuid.jpg) → resolve via public disk
     * - Null / empty → return null
     */
    public function getImageUrlAttribute(?string $value): ?string
    {
        if (!$value) return null;
        if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://')) {
            return $value;
        }
        return Storage::disk('public')->url($value);
    }

    /**
     * Normalise image_url on write.
     *
     * If someone accidentally saves the full public URL back into the DB
     * (e.g. from a frontend round-trip), strip the storage prefix so we
     * always store only the relative path.
     */
    public function setImageUrlAttribute(?string $value): void
    {
        if (!$value) {
            $this->attributes['image_url'] = null;
            return;
        }

        $value = preg_replace('#^(https?://[^/]+)?/storage/#', '', $value);

        $this->attributes['image_url'] = $value ?: null;
    }

    /**
     * Resolve image URLs inside the items JSON array on read.
     *
     * Each item may have an `image` or `image_url` key containing
     * either an absolute URL or a relative storage path — normalise both.
     */
    public function getItemsAttribute(mixed $value): ?array
{
    if (!$value) return null;

    // Cast may not have run — decode if still a string
    if (is_string($value)) {
        $value = json_decode($value, true) ?? [];
    }

    return array_map(function (array $item) {
        foreach (['image', 'image_url'] as $key) {
            if (!empty($item[$key])) {
                $item[$key] = $this->resolveImageUrl($item[$key]);
            }
        }
        return $item;
    }, $value);
}

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private function resolveImageUrl(string $value): string
    {
        if (str_starts_with($value, 'http://') || str_starts_with($value, 'https://')) {
            return $value;
        }
        return Storage::disk('public')->url($value);
    }
}
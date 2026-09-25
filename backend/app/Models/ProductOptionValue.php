<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductOptionValue extends Model
{
    protected $table = 'product_option_values';

    protected $fillable = [
        'option_id',
        'value',
        'meta',
        'position',
    ];

    protected $casts = [
        'meta' => 'array',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function option(): BelongsTo
    {
        return $this->belongsTo(ProductOption::class, 'option_id');
    }

    /** Images specifically for this option value (e.g. the "Blue" swatch photo). */
    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class, 'option_value_id')->orderBy('position');
    }

    // ========================================
    // HELPERS
    // ========================================

    /** Convenience accessor for meta['hex'] etc. without null-checking meta every time. */
    public function meta(string $key, mixed $default = null): mixed
    {
        return data_get($this->meta, $key, $default);
    }
}

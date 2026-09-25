<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TaxDistrict extends Model
{
    public const LEVEL_COUNTRY          = 'country';
    public const LEVEL_STATE            = 'state';
    public const LEVEL_COUNTY           = 'county';
    public const LEVEL_CITY             = 'city';
    public const LEVEL_ZIP              = 'zip';
    public const LEVEL_SPECIAL_DISTRICT = 'special_district';

    protected $table = 'tax_districts';

    protected $fillable = [
        'locale',
        'level',
        'parent_id',
        'name',
        'code',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function rules(): BelongsToMany
    {
        return $this->belongsToMany(TaxRule::class, 'tax_rule_districts', 'tax_district_id', 'tax_rule_id')
            ->using(TaxRuleDistrict::class)
            ->withPivot('id', 'created_at');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeLocale(Builder $query, string $locale): Builder
    {
        return $query->where('locale', $locale);
    }

    public function scopeLevel(Builder $query, string $level): Builder
    {
        return $query->where('level', $level);
    }

    /** Fast path for zip-based lookups (locale + level + code is indexed). */
    public function scopeByCode(Builder $query, string $locale, string $level, string $code): Builder
    {
        return $query->locale($locale)->level($level)->where('code', $code);
    }

    // ========================================
    // HELPERS
    // ========================================

    /**
     * This district plus every ancestor up to country level, as an id array.
     * Use this to build the district-id list passed to TaxRule::appliesToDistricts().
     */
    public function selfAndAncestorIds(): array
    {
        $ids  = [$this->id];
        $node = $this;

        while ($node->parent_id !== null) {
            $node = $node->parent ?? self::find($node->parent_id);

            if ($node === null) {
                break;
            }

            $ids[] = $node->id;
        }

        return $ids;
    }

    public function isCountry(): bool
    {
        return $this->level === self::LEVEL_COUNTRY;
    }
}

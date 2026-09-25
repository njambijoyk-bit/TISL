<?php

namespace App\Models;

use App\Traits\LogsTaxActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TaxType extends Model
{
    use LogsTaxActivity;

    public const MODE_ADDITIVE = 'additive'; // added on top of the price (VAT-style)
    public const MODE_WITHHELD = 'withheld'; // deducted from the amount paid out

    protected $table = 'tax_types';

    protected $fillable = [
        'name',
        'code',
        'application_mode',
        'is_compound',
        'is_active',
    ];

    protected $casts = [
        'is_compound' => 'boolean',
        'is_active'   => 'boolean',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function rates(): HasMany
    {
        return $this->hasMany(TaxRate::class);
    }

    public function rules(): HasMany
    {
        return $this->hasMany(TaxRule::class);
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeAdditive(Builder $query): Builder
    {
        return $query->where('application_mode', self::MODE_ADDITIVE);
    }

    public function scopeWithheld(Builder $query): Builder
    {
        return $query->where('application_mode', self::MODE_WITHHELD);
    }

    // ========================================
    // HELPERS
    // ========================================

    public function isAdditive(): bool
    {
        return $this->application_mode === self::MODE_ADDITIVE;
    }

    public function isWithheld(): bool
    {
        return $this->application_mode === self::MODE_WITHHELD;
    }

    public function isCompound(): bool
    {
        return (bool) $this->is_compound;
    }

    public static function findByCode(string $code): ?self
    {
        return static::where('code', $code)->first();
    }
}

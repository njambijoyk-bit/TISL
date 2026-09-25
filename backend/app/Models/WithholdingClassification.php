<?php

namespace App\Models;

use App\Traits\LogsWithholdingActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The managed dropdown a customer's withholding profile is assigned from
 * (goods, services, professional_fees, rent, commission...). Kept separate
 * from tax_rates.classification (free text) so the customer-assignment UI
 * has a finite, admin-curated list.
 */
class WithholdingClassification extends Model
{
    use LogsWithholdingActivity;

    protected $table = 'withholding_classifications';

    protected $fillable = [
        'code',
        'label',
        'default_tax_rate_id',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    /** The admin-pinned current rate for this classification. */
    public function defaultTaxRate(): BelongsTo
    {
        return $this->belongsTo(TaxRate::class, 'default_tax_rate_id');
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'withholding_classification_id');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    // ========================================
    // HELPERS
    // ========================================

    /**
     * The rate to use right now: the admin-pinned default_tax_rate_id if
     * set and still effective on the date, otherwise fall back to a live
     * lookup of a withheld-mode tax_rate matching this classification's code.
     */
    public function currentRate($on = null): ?TaxRate
    {
        $date   = $on ? \Illuminate\Support\Carbon::parse($on)->toDateString() : now()->toDateString();
        $pinned = $this->defaultTaxRate;

        if ($pinned !== null && $pinned->is_active
            && $pinned->valid_from->toDateString() <= $date
            && ($pinned->valid_until === null || $pinned->valid_until->toDateString() >= $date)
        ) {
            return $pinned;
        }

        return TaxRate::query()
            ->whereHas('taxType', fn ($q) => $q->where('application_mode', TaxType::MODE_WITHHELD))
            ->where('classification', $this->code)
            ->active()
            ->effectiveOn($on)
            ->orderByDesc('valid_from')
            ->first();
    }

    public static function findByCode(string $code): ?self
    {
        return static::where('code', $code)->first();
    }
}

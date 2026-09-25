<?php

namespace App\Models;

use App\Traits\LogsTaxActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Entity-level tax override, polymorphic across Product, Service,
 * Customer, Booking, etc. Either assigns the entity to a specific
 * tax_rule, marks it exempt, or both.
 */
class TaxApplicability extends Model
{
    use LogsTaxActivity;

    protected $table = 'tax_applicability';

    protected $fillable = [
        'taxable_type',
        'taxable_id',
        'tax_rule_id',
        'is_exempt',
        'tax_legitimacy_certificate_id',
    ];

    protected $casts = [
        'is_exempt' => 'boolean',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function taxable(): MorphTo
    {
        return $this->morphTo();
    }

    public function taxRule(): BelongsTo
    {
        return $this->belongsTo(TaxRule::class);
    }

    public function certificate(): BelongsTo
    {
        return $this->belongsTo(TaxLegitimacyCertificate::class, 'tax_legitimacy_certificate_id');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeExempt(Builder $query): Builder
    {
        return $query->where('is_exempt', true);
    }

    public function scopeForTaxable(Builder $query, Model $taxable): Builder
    {
        return $query->where('taxable_type', $taxable->getMorphClass())
            ->where('taxable_id', $taxable->getKey());
    }

    // ========================================
    // HELPERS
    // ========================================

    /**
     * Exempt AND (no certificate attached OR the attached certificate
     * is currently verified and within its validity window). An
     * is_exempt row with an invalid/unverified certificate does not count.
     */
    public function isEffectivelyExempt($on = null): bool
    {
        if (! $this->is_exempt) {
            return false;
        }

        if ($this->tax_legitimacy_certificate_id === null) {
            return true;
        }

        $certificate = $this->certificate ?? $this->certificate()->first();

        return $certificate !== null && $certificate->isValid($on);
    }
}

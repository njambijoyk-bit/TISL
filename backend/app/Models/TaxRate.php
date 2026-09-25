<?php

namespace App\Models;

use App\Traits\LogsTaxActivity;
use App\Traits\HasCurrencyConversion;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class TaxRate extends Model
{
    use LogsTaxActivity, HasCurrencyConversion;

    public const TYPE_PERCENTAGE   = 'percentage';
    public const TYPE_FIXED_AMOUNT = 'fixed_amount';

    public const BASE_PRE_DISCOUNT  = 'pre_discount';   // line amount before discounts
    public const BASE_POST_DISCOUNT = 'post_discount';  // after discounts, before other taxes
    public const BASE_TOTAL_PAYABLE = 'total_payable';  // after discounts, incl. additive taxes

    protected $table = 'tax_rates';

    protected $fillable = [
        'tax_type_id',
        'classification',
        'rate_type',
        'rate_value',
        'unit_of_measure_id',
        'currency_id',
        'calculation_base',
        'calculation_sequence',
        'requires_certificate',
        'valid_from',
        'valid_until',
        'is_active',
    ];

    protected $casts = [
        'rate_value'           => 'decimal:4',
        'calculation_sequence' => 'integer',
        'requires_certificate' => 'boolean',
        'valid_from'           => 'date',
        'valid_until'          => 'date',
        'is_active'            => 'boolean',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function taxType(): BelongsTo
    {
        return $this->belongsTo(TaxType::class);
    }

    /** The unit a fixed_amount rate is quoted per (e.g. per litre). */
    public function unit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'unit_of_measure_id');
    }

    public function applications(): HasMany
    {
        return $this->hasMany(TaxApplication::class);
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** Rates valid on a date (defaults to today). */
    public function scopeEffectiveOn(Builder $query, $date = null): Builder
    {
        $date = $date ? Carbon::parse($date)->toDateString() : now()->toDateString();

        return $query->where('valid_from', '<=', $date)
            ->where(function ($q) use ($date) {
                $q->whereNull('valid_until')->orWhere('valid_until', '>=', $date);
            });
    }

    public function scopeForClassification(Builder $query, string $classification): Builder
    {
        return $query->where('classification', $classification);
    }

    // ========================================
    // HELPERS
    // ========================================

    public function isPercentage(): bool
    {
        return $this->rate_type === self::TYPE_PERCENTAGE;
    }

    /** Fixed amount quoted per unit of measure (excise-style). */
    public function isFixedPerUnit(): bool
    {
        return $this->rate_type === self::TYPE_FIXED_AMOUNT && $this->unit_of_measure_id !== null;
    }

    /** Pick the amount this rate should be calculated on. */
    public function baseAmount(float $preDiscount, float $postDiscount, float $totalPayable): float
    {
        return match ($this->calculation_base) {
            self::BASE_PRE_DISCOUNT  => $preDiscount,
            self::BASE_TOTAL_PAYABLE => $totalPayable,
            default                  => $postDiscount,
        };
    }

    /**
     * Whether this rate may legally be applied for the given holder
     * (typically a Customer). If requires_certificate is false, the
     * rate is legitimate by default (admin override). Otherwise a
     * verified, currently-valid exemption certificate must exist for
     * that holder.
     */
    public function isLegitimateFor(Model $holder, $on = null): bool
    {
        if (! $this->requires_certificate) {
            return true;
        }

        $date = $on ? Carbon::parse($on)->toDateString() : now()->toDateString();

        return TaxLegitimacyCertificate::query()
            ->where('certificate_type', TaxLegitimacyCertificate::TYPE_EXEMPTION)
            ->where('holder_type', $holder->getMorphClass())
            ->where('holder_id', $holder->getKey())
            ->where('status', TaxLegitimacyCertificate::STATUS_VERIFIED)
            ->where('issued_at', '<=', $date)
            ->where(function ($q) use ($date) {
                $q->whereNull('valid_until')->orWhere('valid_until', '>=', $date);
            })
            ->when(
                $this->classification !== null,
                fn ($q) => $q->where(function ($q2) {
                    $q2->whereNull('classification')->orWhere('classification', $this->classification);
                })
            )
            ->exists();
    }

    /**
     * Calculate the tax.
     *
     * @param float         $base          Money base (used by percentage rates — already in the order's currency).
     * @param float         $quantity      Quantity expressed in the rate's unit (used by fixed_amount rates).
     * @param Currency|null $orderCurrency The currency being checked out in. Only matters for fixed_amount rates —
     *                                      percentage rates are currency-neutral by construction, they're a % of
     *                                      $base in whatever currency $base already is.
     */
    public function calculate(float $base, float $quantity = 1.0, ?Currency $orderCurrency = null): float
    {
        if ($this->rate_type !== self::TYPE_FIXED_AMOUNT) {
            return round($base * ((float) $this->rate_value / 100), 2);
        }

        $amount = (float) $this->rate_value * $quantity;

        // No currency on the rate, or no order currency to compare against —
        // nothing to convert, pass the raw amount through.
        if ($this->currency_id === null || $orderCurrency === null) {
            return round($amount, 2);
        }

        // Checking out in the same currency the rate was set in — passes as-is.
        if ($this->currency_id === $orderCurrency->id) {
            return round($amount, 2);
        }

        return round($this->convertAmount($amount, $orderCurrency->id), 2);
    }
}

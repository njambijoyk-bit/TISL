<?php

namespace App\Models;

use App\Models\Books\Ledger;
use App\Traits\LogsTaxActivity;
use App\Traits\HasCurrencyConversion;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use Illuminate\Database\Eloquent\Model;

/**
 * A tax rate is not a table of its own: it is a ledger (with a rate) inside a tax group
 * under Duties & Taxes. One ledger per rate, versioned by valid_from / valid_until. Output
 * (sales) and input (purchase) tax post to the same ledger, its balance being what is owed.
 * A withheld rate is a rate card: postings go to the type's receivable / payable ledgers.
 */
class TaxRate extends Ledger
{
    use LogsTaxActivity, HasCurrencyConversion;

    public const TYPE_PERCENTAGE   = 'percentage';
    public const TYPE_FIXED_AMOUNT = 'fixed_amount';

    public const BASE_PRE_DISCOUNT  = 'pre_discount';   // line amount before discounts
    public const BASE_POST_DISCOUNT = 'post_discount';  // after discounts, before other taxes
    public const BASE_TOTAL_PAYABLE = 'total_payable';  // after discounts, incl. additive taxes

    protected $fillable = [
        'name', 'group_id', 'tax_type_id', 'classification', 'rate_type', 'rate_value', 'unit_of_measure_id', 'currency_id',
        'calculation_base', 'calculation_sequence', 'requires_certificate', 'valid_from', 'valid_until', 'is_active', 'is_system',
    ];

    protected $appends = ['tax_type_id', 'ledger_output_id', 'ledger_input_id'];

    protected static function booted(): void
    {
        static::addGlobalScope('tax_rates', function (Builder $q) {
            $q->whereNotNull('ledgers.rate_type')
                ->whereIn('ledgers.group_id', fn ($g) => $g->select('id')->from('ledger_groups')->where('behaviour', 'tax'));
        });

        static::creating(function (self $r) {
            $r->opening_balance = $r->opening_balance ?? 0;
            $r->opening_side = $r->opening_side ?: 'C';
            $r->is_system = true;   // managed from the tax screens
            $r->side = null;
            if (! $r->name) {
                $r->name = app(\App\Services\Books\TaxLedgerService::class)->rateName($r);
            }
        });
    }

    // ── the ledger, in tax vocabulary ───────────────────────────────────────

    public function getTaxTypeIdAttribute(): ?int { return $this->attributes['group_id'] ?? null; }
    public function setTaxTypeIdAttribute($v): void { $this->attributes['group_id'] = $v; }

    /** Stored percent | fixed | per_unit; the tax screens speak percentage | fixed_amount. */
    public function getRateTypeAttribute(): ?string
    {
        return match ($this->attributes['rate_type'] ?? null) {
            null => null,
            'percent' => self::TYPE_PERCENTAGE,
            default => self::TYPE_FIXED_AMOUNT,
        };
    }

    public function setRateTypeAttribute($v): void
    {
        $this->attributes['rate_type'] = $v === self::TYPE_PERCENTAGE || $v === 'percent'
            ? 'percent'
            : ($v === null ? null : 'fixed');
        $this->refreshRawType();
    }

    public function setUnitOfMeasureIdAttribute($v): void
    {
        $this->attributes['unit_of_measure_id'] = $v;
        $this->refreshRawType();
    }

    private function refreshRawType(): void
    {
        if (($this->attributes['rate_type'] ?? null) === 'fixed' && ! empty($this->attributes['unit_of_measure_id'])) {
            $this->attributes['rate_type'] = 'per_unit';
        } elseif (($this->attributes['rate_type'] ?? null) === 'per_unit' && empty($this->attributes['unit_of_measure_id']) && array_key_exists('unit_of_measure_id', $this->attributes)) {
            $this->attributes['rate_type'] = 'fixed';
        }
    }

    /** Sales tax posts to the rate's ledger itself; a withheld rate posts to its type's receivable ledger. */
    public function getLedgerOutputIdAttribute(): ?int
    {
        $type = $this->taxType;

        return $type?->application_mode === TaxType::MODE_WITHHELD ? $type->receivable_ledger_id : $this->id;
    }

    /** Purchase tax posts to the same ledger; withheld from suppliers goes to the type's payable ledger. */
    public function getLedgerInputIdAttribute(): ?int
    {
        $type = $this->taxType;

        return $type?->application_mode === TaxType::MODE_WITHHELD ? $type->payable_ledger_id : $this->id;
    }

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function taxType(): BelongsTo
    {
        return $this->belongsTo(TaxType::class, 'group_id');
    }

    /** The unit a fixed_amount rate is quoted per (e.g. per litre). */
    public function unit(): BelongsTo
    {
        return $this->belongsTo(UnitOfMeasure::class, 'unit_of_measure_id');
    }

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    public function applications(): HasMany
    {
        return $this->hasMany(TaxApplication::class, 'tax_rate_id');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('ledgers.is_active', true);
    }

    /** Rates valid on a date (defaults to today). */
    public function scopeEffectiveOn(Builder $query, $date = null): Builder
    {
        $date = $date ? Carbon::parse($date)->toDateString() : now()->toDateString();

        return $query->where(function ($q) use ($date) {
            $q->whereNull('ledgers.valid_from')->orWhere('ledgers.valid_from', '<=', $date);
        })->where(function ($q) use ($date) {
            $q->whereNull('ledgers.valid_until')->orWhere('ledgers.valid_until', '>=', $date);
        });
    }

    public function scopeForClassification(Builder $query, string $classification): Builder
    {
        return $query->where('ledgers.classification', $classification);
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

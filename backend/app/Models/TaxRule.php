<?php

namespace App\Models;

use App\Traits\LogsTaxActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TaxRule extends Model
{
    use LogsTaxActivity;

    protected $table = 'tax_rules';

    protected $fillable = [
        'tax_type_id',
        'classification',
        'name',
        'applicable_module',
        'applicable_customer_types',
        'min_order_value',
        'max_order_value',
        'priority',
        'is_active',
    ];

    protected $casts = [
        'applicable_customer_types' => 'array',
        'min_order_value'           => 'decimal:2',
        'max_order_value'           => 'decimal:2',
        'priority'                  => 'integer',
        'is_active'                 => 'boolean',
    ];

    // ========================================
    // RELATIONSHIPS
    // ========================================

    public function taxType(): BelongsTo
    {
        return $this->belongsTo(TaxType::class);
    }

    public function districts(): BelongsToMany
    {
        return $this->belongsToMany(TaxDistrict::class, 'tax_rule_districts', 'tax_rule_id', 'tax_district_id')
            ->using(TaxRuleDistrict::class)
            ->withPivot('id', 'created_at');
    }

    public function applicability(): HasMany
    {
        return $this->hasMany(TaxApplicability::class, 'tax_rule_id');
    }

    public function applications(): HasMany
    {
        return $this->hasMany(TaxApplication::class, 'tax_rule_id');
    }

    // ========================================
    // SCOPES
    // ========================================

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** Rules for a module, including rules not tied to any module. */
    public function scopeForModule(Builder $query, ?string $module): Builder
    {
        return $query->where(function ($q) use ($module) {
            $q->whereNull('applicable_module');
            if ($module !== null) {
                $q->orWhere('applicable_module', $module);
            }
        });
    }

    public function scopeByPriority(Builder $query): Builder
    {
        return $query->orderByDesc('priority')->orderBy('id');
    }

    // ========================================
    // HELPERS
    // ========================================

    /** The rate this rule resolves to on a date (classification NULL = 'standard'). */
    public function resolveRate($on = null): ?TaxRate
    {
        return TaxRate::query()
            ->where('tax_type_id', $this->tax_type_id)
            ->where('classification', $this->classification ?? 'standard')
            ->active()
            ->effectiveOn($on)
            ->orderByDesc('valid_from')
            ->first();
    }

    /** Empty customer-type list means "all customer types". */
    public function appliesToCustomerType(?string $customerType): bool
    {
        $types = $this->applicable_customer_types ?? [];

        return $types === [] || ($customerType !== null && in_array($customerType, $types, true));
    }

    public function appliesToOrderValue(float $value): bool
    {
        if ($this->min_order_value !== null && $value < (float) $this->min_order_value) {
            return false;
        }

        if ($this->max_order_value !== null && $value > (float) $this->max_order_value) {
            return false;
        }

        return true;
    }

    /**
     * A rule with no districts applies everywhere; otherwise at least one of
     * the given district ids (pass the district plus its ancestors) must match.
     */
    public function appliesToDistricts(array $districtIds): bool
    {
        $ruleDistrictIds = $this->districts()->pluck('tax_districts.id')->all();

        if ($ruleDistrictIds === []) {
            return true;
        }

        return array_intersect($ruleDistrictIds, $districtIds) !== [];
    }

    /**
     * Replace this rule's districts and record the change in the tax log
     * (pivot changes do not fire model events on their own).
     */
    public function syncDistricts(array $districtIds): void
    {
        $districtIds = array_values(array_unique(array_map('intval', $districtIds)));
        $current     = array_map('intval', $this->districts()->pluck('tax_districts.id')->all());

        $toDetach = array_values(array_diff($current, $districtIds));
        $toAttach = array_values(array_diff($districtIds, $current));

        if ($toDetach === [] && $toAttach === []) {
            return;
        }

        if ($toDetach !== []) {
            $this->districts()->detach($toDetach);
        }

        if ($toAttach !== []) {
            $now = now();
            $this->districts()->attach(
                array_fill_keys($toAttach, ['created_at' => $now])
            );
        }

        $this->recordActivity(
            'districts_synced',
            ['district_ids' => $current],
            ['district_ids' => $districtIds]
        );
    }
}

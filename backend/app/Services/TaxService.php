<?php

namespace App\Services;

use App\Models\TaxApplicability;
use App\Models\TaxApplication;
use App\Models\TaxRate;
use App\Models\TaxRule;
use App\Models\TaxType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Resolves and applies additive (VAT-style) taxes for a taxable entity.
 * Withheld-mode tax is handled by WithholdingService instead — the two are
 * deliberately separate: they write to different tables and have very
 * different legitimacy/certificate requirements.
 *
 * ASSUMPTION (please confirm before relying on this for real totals):
 * TaxRate::BASE_TOTAL_PAYABLE is read as "post_discount plus every additive
 * tax already applied earlier in this same calculation" — so compounding is
 * driven purely by calculation_sequence ordering plus a rate choosing
 * BASE_TOTAL_PAYABLE as its base. TaxType::is_compound is NOT separately
 * branched on here; it's currently informational only. If is_compound is
 * meant to change behavior beyond ordering (e.g. only compounding against
 * other taxes of the same type), this needs revisiting.
 *
 * ASSUMPTION on TaxApplicability semantics (schema is genuinely ambiguous
 * here, see the model's own doc comment): a row with tax_rule_id = NULL and
 * is_exempt = true is read as a blanket exemption (no additive tax at all).
 * A row with tax_rule_id set and is_exempt = true exempts that one rule only.
 * A row with tax_rule_id set and is_exempt = false force-includes that rule
 * even if it wouldn't otherwise match via module/customer-type/district.
 */
class TaxService
{
    /**
     * Calculate every applicable additive tax for one line/entity and,
     * unless $persist is false, write a TaxApplication row per rate applied.
     *
     * @param  Model       $taxable            The Product/Customer/etc. this tax is being calculated for.
     * @param  string|null $module             Restricts to rules for this module (null-module rules always match too).
     * @param  float       $preDiscountAmount  Line/order amount before discounts.
     * @param  float       $postDiscountAmount Line/order amount after discounts.
     * @param  float       $quantity           Used by fixed_amount rates (per unit_of_measure_id).
     * @param  int|null    $unitOfMeasureId    The unit $quantity is expressed in.
     * @param  array       $districtIds        This taxable's district plus ancestors (TaxDistrict::selfAndAncestorIds()).
     * @param  string|null $customerType       For TaxRule::appliesToCustomerType().
     * @param  Model|null  $legitimacyHolder   Who a required certificate must belong to; defaults to $taxable.
     *
     * @return Collection<int, array{rule: TaxRule, rate: TaxRate, base_amount: float, tax_amount: float, application: ?TaxApplication}>
     */
    public function calculateForEntity(
        Model $taxable,
        ?string $module,
        float $preDiscountAmount,
        float $postDiscountAmount,
        float $quantity = 1.0,
        ?int $unitOfMeasureId = null,
        array $districtIds = [],
        ?string $customerType = null,
        ?int $orderId = null,
        ?int $orderItemId = null,
        $on = null,
        bool $persist = true,
        ?Model $legitimacyHolder = null,
        ?\App\Models\Currency $orderCurrency = null  
    ): Collection {
        $legitimacyHolder ??= $taxable;

        $resolved = $this->resolveApplicableRates(
            $taxable, $module, $preDiscountAmount, $districtIds, $customerType, $on
        );

        $compute = function () use (
            $resolved, $legitimacyHolder, $preDiscountAmount, $postDiscountAmount,
            $quantity, $unitOfMeasureId, $orderId, $orderItemId, $persist, $on
        ): Collection {
            $results      = collect();
            $totalPayable = $postDiscountAmount;

            foreach ($resolved as $pair) {
                /** @var TaxRule $rule */
                $rule = $pair['rule'];
                /** @var TaxRate $rate */
                $rate = $pair['rate'];

                if (!$rate->isLegitimateFor($legitimacyHolder, $on)) {
                    // Certificate required but missing/invalid/expired — skip this
                    // rate. Silently taxing (or silently not taxing) something that
                    // needs a paper trail either way is worse than just skipping it.
                    continue;
                }

                $baseAmount = $rate->baseAmount($preDiscountAmount, $postDiscountAmount, $totalPayable);
                $taxAmount = $rate->calculate($baseAmount, $quantity, $orderCurrency);
                $totalPayable = round($totalPayable + $taxAmount, 2);

                $application = null;

                if ($persist) {
                    $application = TaxApplication::create([
                        'order_id'           => $orderId,
                        'order_item_id'      => $orderItemId,
                        'tax_rate_id'        => $rate->id,
                        'tax_rule_id'        => $rule->id,
                        'classification'     => $rate->classification ?? 'standard',
                        'base_amount'        => $baseAmount,
                        'taxable_quantity'   => $rate->isFixedPerUnit() ? $quantity : null,
                        'unit_of_measure_id' => $rate->isFixedPerUnit() ? $unitOfMeasureId : null,
                        'tax_amount'         => $taxAmount,
                    ]);
                }

                $results->push([
                    'rule'        => $rule,
                    'rate'        => $rate,
                    'base_amount' => $baseAmount,
                    'tax_amount'  => $taxAmount,
                    'application' => $application,
                ]);
            }

            return $results;
        };

        // Persisting several TaxApplication rows for one line should be all-or-
        // nothing — a failure partway through must not leave a half-taxed line.
        return $persist ? DB::transaction($compute) : $compute();
    }

    /** Total additive tax across every rate that applied. */
    public function totalTax(Collection $results): float
    {
        return round((float) $results->sum('tax_amount'), 2);
    }

    /**
     * @return Collection<int, array{rule: TaxRule, rate: TaxRate}>
     */
    private function resolveApplicableRates(
        Model $taxable,
        ?string $module,
        float $orderValue,
        array $districtIds,
        ?string $customerType,
        $on
    ): Collection {
        $overrides = TaxApplicability::forTaxable($taxable)->get();

        $blanketExempt = $overrides->first(
            fn (TaxApplicability $o) => $o->tax_rule_id === null && $o->isEffectivelyExempt($on)
        );

        if ($blanketExempt) {
            return collect();
        }

        $exemptRuleIds = $overrides
            ->filter(fn (TaxApplicability $o) => $o->tax_rule_id !== null && $o->isEffectivelyExempt($on))
            ->pluck('tax_rule_id');

        $pinnedRuleIds = $overrides
            ->filter(fn (TaxApplicability $o) => $o->tax_rule_id !== null && !$o->is_exempt)
            ->pluck('tax_rule_id');

        $rules = TaxRule::query()
            ->whereHas('taxType', fn ($q) => $q->where('application_mode', TaxType::MODE_ADDITIVE)->where('is_active', true))
            ->active()
            ->where(function ($q) use ($module, $pinnedRuleIds) {
                $q->forModule($module);
                if ($pinnedRuleIds->isNotEmpty()) {
                    $q->orWhereIn('id', $pinnedRuleIds);
                }
            })
            ->whereNotIn('id', $exemptRuleIds)
            ->byPriority()
            ->get()
            ->filter(fn (TaxRule $rule) => $rule->appliesToCustomerType($customerType)
                && $rule->appliesToOrderValue($orderValue)
                && ($districtIds === [] || $rule->appliesToDistricts($districtIds)));

        // Resolve each rule to a rate up front so results can be ordered by the
        // rate's own calculation_sequence — a rule alone doesn't carry that ordering.
        return $rules
            ->map(fn (TaxRule $rule) => ['rule' => $rule, 'rate' => $rule->resolveRate($on)])
            ->filter(fn ($pair) => $pair['rate'] !== null)
            ->sortBy(fn ($pair) => $pair['rate']->calculation_sequence)
            ->values();
    }
}

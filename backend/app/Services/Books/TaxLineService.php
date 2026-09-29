<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Currency;
use App\Models\TaxApplicability;
use App\Models\Customer;
use App\Models\Location;
use App\Models\TaxDistrict;
use App\Models\TaxRate;
use App\Services\TaxService;
use Illuminate\Database\Eloquent\Model;

/**
 * Tax for one voucher line via the tax engine (rules, districts, customer type,
 * per-item overrides), each rate resolved to its ledger under Duties & Taxes.
 * One line can carry several rates (16% on one item, 8% on another, or both on one).
 */
class TaxLineService
{
    public function __construct(private TaxService $tax, private TaxLedgerService $ledgers) {}

    /**
     * @param  string  $module  product | service (the tax rule module)
     * @param  string  $side    output (sales) | input (purchases)
     * @return array<int, array{tax_rate_id:int, ledger_id:int, label:string, base_amount:float, tax_amount:float}>
     */
    public function forLine(?Model $taxable, string $module, float $pre, float $post, float $qty, ?int $unitId, string $side, ?Customer $customer, ?int $locationId, ?Currency $currency = null, ?Ledger $account = null): array
    {
        if ($account?->tax_nature) {
            return $this->fromAccount($account, $pre, $post, $qty, $side, $customer, $currency, null, $taxable);
        }
        if (! $taxable || $post == 0.0) {
            return [];
        }

        $districts = [];
        if ($locationId && ($districtId = Location::whereKey($locationId)->value('tax_district_id'))) {
            $district = TaxDistrict::find($districtId);
            $districts = $district ? $district->selfAndAncestorIds() : [];
        }

        $results = $this->tax->calculateForEntity(
            $taxable, $module, $pre, $post, $qty, $unitId, $districts, $customer?->customer_type,
            null, null, null, false, $customer, $currency
        );

        $rows = [];
        foreach ($results as $r) {
            /** @var TaxRate $rate */
            $rate = $r['rate'];
            if (! $rate->ledger_output_id || ! $rate->ledger_input_id) {
                $rate = $this->ledgers->provisionRate($rate);   // ledgers are created on first use
            }
            $ledgerId = $side === 'input' ? $rate->ledger_input_id : $rate->ledger_output_id;
            if (! $ledgerId) {
                $name = $rate->taxType?->name ?? 'Tax';
                throw new BooksException("The {$name} rate ({$rate->rate_value}" . ($rate->isPercentage() ? '%' : '') . ") has no {$side} tax ledger. Set it under Tax & Compliance.");
            }
            $rows[] = [
                'tax_rate_id' => $rate->id,
                'ledger_id'   => (int) $ledgerId,
                'label'       => trim(($rate->taxType?->code ?? $rate->taxType?->name ?? 'Tax') . ' ' . rtrim(rtrim((string) $rate->rate_value, '0'), '.') . ($rate->isPercentage() ? '%' : '')),
                'base_amount' => round((float) $r['base_amount'], 2),
                'tax_amount'  => round((float) $r['tax_amount'], 2),
                'percent'     => $rate->isPercentage() ? (float) $rate->rate_value : null,
            ];
        }

        return $rows;
    }

    /** A manually chosen percentage rate (custom lines). */
    public function manual(int $taxRateId, float $base, string $side): array
    {
        $rate = TaxRate::with('taxType')->findOrFail($taxRateId);
        if (! $rate->ledger_output_id || ! $rate->ledger_input_id) {
            $rate = $this->ledgers->provisionRate($rate);
        }
        $ledgerId = $side === 'input' ? $rate->ledger_input_id : $rate->ledger_output_id;
        if (! $ledgerId) {
            throw new BooksException('That tax rate has no ' . $side . ' tax ledger. Set it under Tax & Compliance.');
        }
        $tax = $rate->isPercentage() ? round($base * (float) $rate->rate_value / 100, 2) : 0.0;

        return [[
            'tax_rate_id' => $rate->id,
            'ledger_id'   => (int) $ledgerId,
            'label'       => trim(($rate->taxType?->code ?? 'Tax') . ' ' . rtrim(rtrim((string) $rate->rate_value, '0'), '.') . '%'),
            'base_amount' => round($base, 2),
            'tax_amount'  => $tax,
            'percent'     => (float) $rate->rate_value,
        ]];
    }

    /**
     * The tax a sales / purchase ACCOUNT carries (its tax nature), the way the books' masters say it:
     *   taxable      → the account's tax rate is charged;
     *   zero_rated   → a 0 % line is kept so the return shows the value;
     *   exempt / out_of_scope → no tax.
     * A customer holding a blanket exemption is never taxed. So one invoice can mix a VAT-able account and an
     * exempt one, each line taxed by the account it posts to.
     */
    public function fromAccount(Ledger $account, float $pre, float $post, float $qty, string $side, ?Customer $customer, ?Currency $currency = null, $on = null, ?Model $taxable = null): array
    {
        if (in_array($account->tax_nature, ['exempt', 'out_of_scope'], true) || $post == 0.0) {
            return [];
        }
        // a blanket exemption on the customer, or on the item itself (an exempt product / service), always wins
        foreach (array_filter([$customer, $taxable]) as $holder) {
            if (TaxApplicability::forTaxable($holder)->whereNull('tax_rule_id')->get()->contains(fn ($o) => $o->isEffectivelyExempt($on))) {
                return [];
            }
        }
        $rate = $this->rateFor($account, $on);
        if (! $rate) {
            if ($account->tax_nature === 'zero_rated') {
                return [];
            }
            throw new BooksException("The account \"{$account->name}\" is taxable but has no tax rate. Set it under Books → Accounts.");
        }
        $base = $rate->baseAmount($pre, $post, $post);
        $tax = $account->tax_nature === 'zero_rated' ? 0.0 : $rate->calculate($base, $qty, $currency);

        return [[
            'tax_rate_id' => $rate->id,
            'ledger_id'   => (int) ($side === 'input' ? $rate->ledger_input_id : $rate->ledger_output_id),
            'label'       => trim(($rate->taxType?->code ?? 'Tax') . ' ' . rtrim(rtrim((string) $rate->rate_value, '0'), '.') . ($rate->isPercentage() ? '%' : '')),
            'base_amount' => round($base, 2),
            'tax_amount'  => round($tax, 2),
            'percent'     => $rate->isPercentage() ? (float) $rate->rate_value : null,
        ]];
    }

    /** The rate an account charges on the given date: its own rate, or the newer one that replaced it (same type and classification). */
    public function rateFor(Ledger $account, $on = null): ?TaxRate
    {
        $rate = $account->tax_rate_ledger_id ? TaxRate::with('taxType')->find($account->tax_rate_ledger_id) : null;
        if ($rate && ! TaxRate::whereKey($rate->id)->active()->effectiveOn($on)->exists()) {
            $successor = TaxRate::where('group_id', $rate->group_id)->where('classification', $rate->classification)->active()->effectiveOn($on)->orderByDesc('valid_from')->first();
            $rate = $successor ?? $rate;
        }

        return $rate;
    }
}

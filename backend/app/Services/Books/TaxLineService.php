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
    public function __construct(private TaxService $tax, private TaxLedgerService $ledgers, private TaxResolver $resolver) {}

    /**
     * @param  string  $module  product | service (the tax rule module)
     * @param  string  $side    output (sales) | input (purchases)
     * @return array<int, array{tax_rate_id:int, ledger_id:int, label:string, base_amount:float, tax_amount:float}>
     */
    public function forLine(?Model $taxable, string $module, float $pre, float $post, float $qty, ?int $unitId, string $side, ?Customer $customer, ?int $locationId, ?Currency $currency = null, ?Ledger $account = null): array
    {
        $rows = $account?->tax_nature
            ? $this->fromAccount($account, $pre, $post, $qty, $side, $customer, $currency, null, $taxable)
            : $this->fromRules($taxable, $module, $pre, $post, $qty, $unitId, $side, $customer, $locationId, $currency);

        // the taxes that apply regardless of the item and the account (Tax control), each unless its own rule about exemptions says the line is exempt
        return $this->resolver->recovery($this->resolver->withRegardless($rows, $pre, $post, $qty, $side, $currency, null, [
            'account' => $account, 'item_exempt' => $this->blanketExempt($taxable, null), 'customer_exempt' => $this->blanketExempt($customer, null), 'opted_out' => $this->resolver->optedOut($taxable),
        ], $this), $side);
    }

    /** The item path: the tax rules that match the item, the customer and the branch, in the order of their rates' sequence. */
    private function fromRules(?Model $taxable, string $module, float $pre, float $post, float $qty, ?int $unitId, string $side, ?Customer $customer, ?int $locationId, ?Currency $currency): array
    {
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
            ] + $this->detail($rate, (int) $ledgerId, (float) $r['base_amount'], (float) $r['tax_amount'], 'item');
        }

        return $rows;
    }

    /** The type of the tax and the snapshot of how it was worked out, added to every row. */
    private function detail(TaxRate $rate, int $ledgerId, float $base, float $tax, string $source): array
    {
        return array_intersect_key(TaxResolver::rowOf($rate, $ledgerId, $base, $tax, $source), ['tax_type_id' => 1, 'snapshot' => 1]);
    }

    /** Does this holder (a customer or an item) hold a blanket tax exemption? */
    private function blanketExempt(?Model $holder, $on): bool
    {
        return $holder !== null && $holder->exists && TaxApplicability::forTaxable($holder)->whereNull('tax_rule_id')->get()->contains(fn ($o) => $o->isEffectivelyExempt($on));
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

        return $this->resolver->recovery([[
            'tax_rate_id' => $rate->id,
            'tax_type_id' => (int) $rate->group_id,
            'ledger_id'   => (int) $ledgerId,
            'label'       => trim(($rate->taxType?->code ?? 'Tax') . ' ' . rtrim(rtrim((string) $rate->rate_value, '0'), '.') . '%'),
            'base_amount' => round($base, 2),
            'tax_amount'  => $tax,
            'percent'     => (float) $rate->rate_value,
        ]], $side);
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
        return $this->resolver->recovery($this->accountTaxes($account, $pre, $post, $qty, $side, $customer, $currency, $on, $taxable), $side);
    }

    private function accountTaxes(Ledger $account, float $pre, float $post, float $qty, string $side, ?Customer $customer, ?Currency $currency, $on, ?Model $taxable): array
    {
        if ($post == 0.0) {
            return [];
        }
        // a blanket exemption on the customer, or on the item itself (an exempt product / service), always wins
        $exempt = $this->blanketExempt($customer, $on) || $this->blanketExempt($taxable, $on);
        $optedOut = $this->resolver->optedOut($taxable);

        $rows = [];
        if (! in_array($account->tax_nature, ['exempt', 'out_of_scope'], true) && ! $exempt) {
            $rate = $this->rateFor($account, $on);
            if (! $rate) {
                if ($account->tax_nature !== 'zero_rated') {
                    throw new BooksException("The account \"{$account->name}\" is taxable but has no tax rate. Set it under Books → Accounts.");
                }
            } elseif (! in_array((int) $rate->group_id, $optedOut, true)) {
                $base = $rate->baseAmount($pre, $post, $post);
                $tax = $account->tax_nature === 'zero_rated' ? 0.0 : $rate->calculate($base, $qty, $currency);
                $ledgerId = (int) ($side === 'input' ? $rate->ledger_input_id : $rate->ledger_output_id);
                $primary = [
                    'tax_rate_id' => $rate->id,
                    'ledger_id'   => $ledgerId,
                    'label'       => trim(($rate->taxType?->code ?? 'Tax') . ' ' . rtrim(rtrim((string) $rate->rate_value, '0'), '.') . ($rate->isPercentage() ? '%' : '')),
                    'base_amount' => round($base, 2),
                    'tax_amount'  => round($tax, 2),
                    'percent'     => $rate->isPercentage() ? (float) $rate->rate_value : null,
                ] + $this->detail($rate, $ledgerId, $base, $tax, 'account');
                if ($primary = TaxResolver::reverseCharged($primary, $rate, $side)) {
                    $rows[] = $primary;
                }
            }
        }
        if ($exempt) {
            return $rows;   // nothing else is charged to someone, or on something, that holds an exemption
        }

        // the other taxes the account carries, in order, each on its own base
        return array_merge($rows, $this->resolver->accountRows((int) $account->id, $pre, $post, $qty, $side, $currency, $on, $rows, $optedOut, $this));
    }

    /** The rate an account charges on the given date: its own rate, or the newer one that replaced it (same type and classification). */
    public function rateFor(Ledger $account, $on = null): ?TaxRate
    {
        $rate = $account->tax_rate_ledger_id ? TaxRate::with('taxType')->find($account->tax_rate_ledger_id) : null;

        return $rate ? $this->inForce($rate, $on) : null;
    }

    /** A rate on the given date: itself, or the newer one that replaced it (same type and classification). */
    public function inForce(TaxRate $rate, $on = null): TaxRate
    {
        if (! TaxRate::whereKey($rate->id)->active()->effectiveOn($on)->exists()) {
            $successor = TaxRate::where('group_id', $rate->group_id)->where('classification', $rate->classification)->active()->effectiveOn($on)->orderByDesc('valid_from')->first();
            $rate = $successor ?? $rate;
        }

        return $rate;
    }
}

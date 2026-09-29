<?php

namespace App\Services\Books;

use App\Models\Currency;
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
    public function __construct(private TaxService $tax) {}

    /**
     * @param  string  $module  product | service (the tax rule module)
     * @param  string  $side    output (sales) | input (purchases)
     * @return array<int, array{tax_rate_id:int, ledger_id:int, label:string, base_amount:float, tax_amount:float}>
     */
    public function forLine(?Model $taxable, string $module, float $pre, float $post, float $qty, ?int $unitId, string $side, ?Customer $customer, ?int $locationId, ?Currency $currency = null): array
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
}

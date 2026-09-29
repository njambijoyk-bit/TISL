<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\TaxRate;
use App\Models\TaxType;
use Illuminate\Support\Facades\DB;

/**
 * Keeps Duties & Taxes in step with the tax setup:
 *  - a TAX TYPE becomes a subgroup of Duties & Taxes plus a control ledger that
 *    carries the opening balance (withholding types get a payable and a receivable);
 *  - a TAX RATE gets its own Output / Input ledger under that subgroup.
 * Everything here is idempotent, so a missing ledger is created on first use.
 */
class TaxLedgerService
{
    public const KINDS = ['vat', 'excise', 'customs', 'withholding_income', 'withholding_vat', 'other'];

    public function __construct(private LedgerService $ledgers) {}

    /**
     * A tax type IS a tax group under Duties & Taxes; this gives it the ledgers that carry
     * its opening balance (control for additive types; payable + receivable for withheld).
     *
     * @param  array  $opening  ['control' => [amount, 'D'|'C'], 'payable' => [...], 'receivable' => [...]]
     */
    public function provisionType(TaxType $type, array $opening = []): TaxType
    {
        return DB::transaction(function () use ($type, $opening) {
            $mk = function (string $name, int $groupId, string $key, string $defaultSide) use ($opening): Ledger {
                [$amt, $side] = $opening[$key] ?? [0, $defaultSide];

                return $this->ledgers->ensure($name, $groupId, ['opening_balance' => max(0, (float) $amt), 'opening_side' => $side ?: $defaultSide, 'is_system' => true]);
            };

            if ($type->application_mode === TaxType::MODE_WITHHELD) {
                if (! $type->payable_ledger_id) {
                    $type->payable_ledger_id = $mk("{$type->name} Payable", $type->id, 'payable', 'C')->id;
                }
                if (! $type->receivable_ledger_id) {
                    $assets = LedgerGroup::where('name', 'Current Assets')->firstOrFail();
                    $type->receivable_ledger_id = $mk("{$type->name} Receivable", $assets->id, 'receivable', 'D')->id;
                }
            } elseif (! $type->control_ledger_id) {
                $type->control_ledger_id = $mk("{$type->name} Account", $type->id, 'control', 'C')->id;
            }
            $type->save();

            return $type->fresh();
        });
    }

    /** The group carries the type's name; keep its ledgers' names following it. */
    public function renameType(TaxType $type, string $old): void
    {
        if ($old === $type->name) {
            return;
        }
        foreach ([['control_ledger_id', 'Account'], ['payable_ledger_id', 'Payable'], ['receivable_ledger_id', 'Receivable']] as [$col, $suffix]) {
            if ($type->{$col}) {
                Ledger::whereKey($type->{$col})->where('name', "{$old} {$suffix}")->update(['name' => "{$type->name} {$suffix}"]);
            }
        }
    }

    /** A rate is its own ledger; nothing to create beyond making sure its type has its balance ledgers. */
    public function provisionRate(TaxRate $rate): TaxRate
    {
        $type = $rate->taxType ?? TaxType::findOrFail($rate->tax_type_id);
        if (! $type->control_ledger_id && ! $type->payable_ledger_id) {
            $this->provisionType($type);
        }

        return $rate;
    }

    /** "VAT 16%", "Excise KES 20/L (spirits)" — the ledger name of a rate; numbered when taken. */
    public function rateName(TaxRate $rate): string
    {
        $type = TaxType::find($rate->tax_type_id);
        $v = rtrim(rtrim((string) $rate->rate_value, '0'), '.');
        if ($rate->isPercentage()) {
            $label = $v . '%';
        } else {
            $cur = $rate->currency_id ? \App\Models\Currency::whereKey($rate->currency_id)->value('code') : '';
            $unit = $rate->unit_of_measure_id ? \App\Models\UnitOfMeasure::whereKey($rate->unit_of_measure_id)->value('code') : null;
            $label = trim("{$cur} {$v}") . ($unit ? "/{$unit}" : '');
        }
        if ($rate->classification && $rate->classification !== 'standard') {
            $label .= " ({$rate->classification})";
        }
        $base = trim(($type?->code ?? $type?->name ?? 'Tax') . ' ' . $label);
        $name = $base;
        for ($n = 2; Ledger::where('name', $name)->exists(); $n++) {
            $name = "{$base} #{$n}";
        }

        return $name;
    }

    /** Live position for a tax type, base currency (positive = owed to the authority). */
    public function position(TaxType $type): array
    {
        $bal = fn (?int $id) => $id ? $this->ledgers->balance($id) : 0.0;
        if ($type->application_mode === TaxType::MODE_WITHHELD) {
            $payable = -$bal($type->payable_ledger_id);   // credit balance = we owe
            $receivable = $bal($type->receivable_ledger_id);

            return ['kind' => 'withheld', 'payable' => round($payable, 2), 'receivable' => round($receivable, 2), 'net_owed' => round($payable - $receivable, 2)];
        }
        $control = -$bal($type->control_ledger_id);
        // output and input tax share each rate's ledger: a credit balance is tax we owe, a debit balance tax we can reclaim
        $rates = array_sum(array_map(fn ($id) => -$bal($id), TaxRate::where('group_id', $type->id)->pluck('id')->all()));

        return ['kind' => 'additive', 'brought_forward' => round($control, 2), 'rates' => round($rates, 2), 'net_owed' => round($control + $rates, 2)];
    }
}

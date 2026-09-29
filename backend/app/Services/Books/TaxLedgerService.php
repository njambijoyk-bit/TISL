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

    private function dutiesGroup(): LedgerGroup
    {
        return LedgerGroup::where('name', 'Duties & Taxes')->firstOrFail();
    }

    /**
     * @param  array  $opening  ['control' => [amount, 'D'|'C'], 'payable' => [...], 'receivable' => [...]]
     */
    public function provisionType(TaxType $type, array $opening = []): TaxType
    {
        return DB::transaction(function () use ($type, $opening) {
            $duties = $this->dutiesGroup();
            $group = $type->group_id ? LedgerGroup::find($type->group_id) : null;
            $group ??= LedgerGroup::firstOrCreate(['name' => $type->name], [
                'parent_id' => $duties->id, 'nature' => $duties->nature, 'is_primary' => false, 'is_system' => true,
                'affects_gross_profit' => false, 'sort_order' => 50,
            ]);
            $type->group_id = $group->id;

            $mk = function (string $name, int $groupId, string $key, string $defaultSide) use ($opening): Ledger {
                [$amt, $side] = $opening[$key] ?? [0, $defaultSide];

                return $this->ledgers->ensure($name, $groupId, ['opening_balance' => max(0, (float) $amt), 'opening_side' => $side ?: $defaultSide, 'is_system' => true]);
            };

            if ($type->application_mode === TaxType::MODE_WITHHELD) {
                if (! $type->payable_ledger_id) {
                    $type->payable_ledger_id = $mk("{$type->name} Payable", $group->id, 'payable', 'C')->id;
                }
                if (! $type->receivable_ledger_id) {
                    $assets = LedgerGroup::where('name', 'Current Assets')->firstOrFail();
                    $type->receivable_ledger_id = $mk("{$type->name} Receivable", $assets->id, 'receivable', 'D')->id;
                }
            } elseif (! $type->control_ledger_id) {
                $type->control_ledger_id = $mk("{$type->name} Account", $group->id, 'control', 'C')->id;
            }
            $type->save();

            return $type->fresh();
        });
    }

    /** Keep the group and its ledgers' names following the type's name. */
    public function renameType(TaxType $type, string $old): void
    {
        if ($old === $type->name) {
            return;
        }
        if ($type->group_id) {
            LedgerGroup::whereKey($type->group_id)->where('name', $old)->update(['name' => $type->name]);
        }
        foreach ([['control_ledger_id', 'Account'], ['payable_ledger_id', 'Payable'], ['receivable_ledger_id', 'Receivable']] as [$col, $suffix]) {
            if ($type->{$col}) {
                Ledger::whereKey($type->{$col})->where('name', "{$old} {$suffix}")->update(['name' => "{$type->name} {$suffix}"]);
            }
        }
    }

    /** Create / fetch the ledgers a rate posts to and store their ids on the rate. */
    public function provisionRate(TaxRate $rate): TaxRate
    {
        if ($rate->ledger_output_id && $rate->ledger_input_id) {
            return $rate;
        }
        $type = $rate->taxType ?? TaxType::findOrFail($rate->tax_type_id);
        if (! $type->group_id || (! $type->control_ledger_id && ! $type->payable_ledger_id)) {
            $type = $this->provisionType($type);
        }

        if ($type->application_mode === TaxType::MODE_WITHHELD) {
            // We are paid net of it by customers (receivable) / we hold it back from suppliers (payable).
            $rate->ledger_output_id ??= $type->receivable_ledger_id;
            $rate->ledger_input_id ??= $type->payable_ledger_id;
        } else {
            $label = $this->rateLabel($rate, $type);
            $rate->ledger_output_id ??= $this->uniqueLedger("{$type->code} Output {$label}", $type->group_id)->id;
            $rate->ledger_input_id ??= $this->uniqueLedger("{$type->code} Input {$label}", $type->group_id)->id;
        }
        $rate->save();

        return $rate;
    }

    private function rateLabel(TaxRate $rate, TaxType $type): string
    {
        $v = rtrim(rtrim((string) $rate->rate_value, '0'), '.');
        if ($rate->rate_type === TaxRate::TYPE_PERCENTAGE) {
            $label = $v . '%';
        } else {
            $cur = $rate->currency?->code ?? '';
            $label = trim("{$cur} {$v}") . ($rate->unit?->code ? "/{$rate->unit->code}" : '');
        }
        if ($rate->classification) {
            $label .= " ({$rate->classification})";
        }

        return $label;
    }

    /** Re-use a same-named ledger only if it already sits in this group; otherwise number it. */
    private function uniqueLedger(string $name, int $groupId): Ledger
    {
        $existing = Ledger::where('name', $name)->first();
        if (! $existing) {
            return Ledger::create(['group_id' => $groupId, 'name' => $name, 'is_system' => true, 'is_active' => true]);
        }
        if ($existing->group_id === $groupId || $this->belongsToTaxGroup($existing)) {
            return $existing;
        }

        return Ledger::create(['group_id' => $groupId, 'name' => "{$name} #" . (Ledger::count() + 1), 'is_system' => true, 'is_active' => true]);
    }

    private function belongsToTaxGroup(Ledger $l): bool
    {
        return in_array($l->group_id, $this->dutiesGroup()->selfAndDescendantIds(), true);
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
        $out = array_sum(array_map(fn ($id) => -$bal($id), TaxRate::where('tax_type_id', $type->id)->pluck('ledger_output_id')->filter()->unique()->all()));
        $in = array_sum(array_map(fn ($id) => $bal($id), TaxRate::where('tax_type_id', $type->id)->pluck('ledger_input_id')->filter()->unique()->all()));

        return ['kind' => 'additive', 'brought_forward' => round($control, 2), 'output' => round($out, 2), 'input' => round($in, 2), 'net_owed' => round($control + $out - $in, 2)];
    }
}

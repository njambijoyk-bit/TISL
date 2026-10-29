<?php

namespace App\Services\Books\Engine\Reports;

use App\Models\Books\Voucher;
use App\Models\TaxRate;
use App\Models\TaxType;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\RestatedBase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The tax return on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.4).
 *
 * Per tax type and rate: what we charged (output), what we can reclaim (input), the value of the sales and purchases behind them, and a proof that
 * runs from what was owed to the authority at the start of the period to what is owed at its end:
 *
 *     owed at the start + output - input - paid to the authority and other entries = owed at the end
 *
 * Both ends are worked out on their own dates, for the branches the person may see (audit E1 to E4): a return for last quarter shows last quarter's
 * closing, not today's. For a tax withheld at source the same holds: what customers held back from us (a receivable) and what we held back from
 * suppliers (a payable), with the net owed at each end.
 *
 * Below the tax types, the split a VAT return asks for: the value of what was sold and bought by the tax nature of the account each line posted to (E5).
 */
final class TaxReturnReport extends ReportDefinition
{
    /** The tax natures of an account, in the order a return lists them. */
    public const NATURES = ['taxable' => 'Standard-rated', 'zero_rated' => 'Zero-rated', 'exempt' => 'Exempt', 'out_of_scope' => 'Out of scope', 'unclassified' => 'Not classified'];

    public function key(): string
    {
        return 'tax-return';
    }

    public function title(): string
    {
        return 'Tax return';
    }

    public function filters(): array
    {
        return ['branch'];
    }

    /** A tax the buyer accounts for (tax control, T6b): owed in the rate ledgers, claimed back in the type's own input ledger. */
    private function reverseCharge(TaxType $type): bool
    {
        return $type->getAttribute('application_method') === 'reverse_charge' && $type->getAttribute('input_ledger_id');
    }

    /** Owed to the authority (positive) on a date, for one tax type, from the ledgers that carry it. */
    private function owed(TaxType $type, array $rateIds, ?string $asOf, Scope $whole): float
    {
        $bal = fn (?int $id) => $id ? app(LedgerBalances::class)->balance((int) $id, $asOf, $whole) : 0.0;
        if ($type->application_mode === TaxType::MODE_WITHHELD) {
            return round(-$bal($type->payable_ledger_id) - $bal($type->receivable_ledger_id), 2);   // a credit on the payable is owed; a debit on the receivable is credit with the authority
        }
        // output and input tax share each rate's ledger: a credit balance is tax we owe, a debit balance tax we can reclaim
        // (on a reverse charge the claim is in the type's input ledger, which takes it off what is owed)
        return round(-$bal($type->control_ledger_id) - array_sum(array_map($bal, $rateIds)) - ($this->reverseCharge($type) ? $bal((int) $type->getAttribute('input_ledger_id')) : 0), 2);
    }

    public function run(Scope $scope, array $options): array
    {
        $balances = app(LedgerBalances::class);
        $whole = Scope::fromInput(['location_id' => $scope->locationId], $scope->area);   // the same branch, no dates: the balance on a date is everything up to it
        $from = $scope->from;
        $to = $scope->to ?? today()->toDateString();
        $before = $from ? Carbon::parse($from)->subDay()->toDateString() : null;

        $types = [];
        $totals = ['output' => 0.0, 'input' => 0.0, 'net' => 0.0, 'owed' => 0.0];
        foreach (TaxType::active()->orderBy('name')->get() as $type) {
            $withheld = $type->application_mode === TaxType::MODE_WITHHELD;
            $rates = $withheld ? collect() : TaxRate::where('group_id', $type->id)->orderBy('valid_from')->orderBy('name')->get();
            $rateIds = $rates->pluck('id')->map(fn ($i) => (int) $i)->all();
            $ledgerIds = $withheld ? array_values(array_filter([$type->receivable_ledger_id, $type->payable_ledger_id])) : $rateIds;
            $reverse = ! $withheld && $this->reverseCharge($type);
            $inputLedger = $reverse ? (int) $type->getAttribute('input_ledger_id') : null;
            $mv = $ledgerIds ? $balances->movement($scope, $from, $scope->to, null, array_merge($ledgerIds, $inputLedger ? [$inputLedger] : [])) : [];

            $bf = $before ? $this->owed($type, $rateIds, $before, $whole) : 0.0;
            $closing = $this->owed($type, $rateIds, $to, $whole);

            if ($withheld) {
                $held = $mv[$type->receivable_ledger_id]['dr'] ?? 0;   // customers held back from us
                $by = $mv[$type->payable_ledger_id]['cr'] ?? 0;        // we held back from suppliers
                $rows = [
                    ['label' => 'Withheld from us by customers (receivable)', 'sales_base' => null, 'output' => round($held, 2), 'purchases_base' => null, 'input' => 0.0, 'net' => round($held, 2)],
                    ['label' => 'Withheld by us from suppliers (payable)', 'sales_base' => null, 'output' => 0.0, 'purchases_base' => null, 'input' => round($by, 2), 'net' => round(-$by, 2)],
                ];
                $movement = $by - $held;   // owed rises with what we withhold and falls with what is withheld from us
            } else {
                $bases = $this->bases($rateIds, $scope);
                $rows = [];
                foreach ($rates as $r) {
                    $out = $mv[$r->id]['cr'] ?? 0;   // tax charged on sales
                    $in = $reverse ? 0 : ($mv[$r->id]['dr'] ?? 0);    // tax paid on purchases (a reverse charge is claimed in its own ledger, below)
                    if ($out < 0.005 && $in < 0.005 && empty($bases[$r->id])) {
                        continue;
                    }
                    $rows[] = ['label' => $r->name, 'sales_base' => round($bases[$r->id]['sales'] ?? 0, 2), 'output' => round($out, 2),
                        'purchases_base' => round($bases[$r->id]['purchases'] ?? 0, 2), 'input' => round($in, 2), 'net' => round($out - $in, 2)];
                }
                if ($reverse && ($claimed = $mv[$inputLedger]['dr'] ?? 0) >= 0.005) {
                    $rows[] = ['label' => 'Claimed back (reverse charge)', 'sales_base' => null, 'output' => 0.0, 'purchases_base' => null, 'input' => round($claimed, 2), 'net' => round(-$claimed, 2)];
                }
                $movement = array_sum(array_column($rows, 'output')) - array_sum(array_column($rows, 'input'));
                $totals['output'] += array_sum(array_column($rows, 'output'));
                $totals['input'] += array_sum(array_column($rows, 'input'));
                $totals['owed'] += $closing;
            }
            $types[] = [
                'id' => (int) $type->id, 'code' => $type->code, 'name' => $type->name, 'mode' => $withheld ? 'withheld' : ($reverse ? 'reverse_charge' : 'additive'), 'category' => $type->getAttribute('tax_category'), 'rows' => $rows,
                'brought_forward' => $bf, 'net_movement' => round($movement, 2),
                // what left the amount owed in the period besides the tax itself: payments to the authority, refunds, adjustments
                'settled' => round($bf + $movement - $closing, 2), 'closing_owed' => $closing,
            ];
        }
        $totals['net'] = $totals['output'] - $totals['input'];

        return ['ready' => true, 'from' => $from, 'to' => $to, 'brought_forward_on' => $before, 'types' => $types, 'supplies' => $this->supplies($scope),
            'totals' => array_map(fn ($v) => round($v, 2), $totals), 'restated_vouchers' => RestatedBase::restatedCount()];
    }

    /** The posted vouchers of the period, for the branch chosen and the branches this person may see. */
    private function vouchers($q, Scope $scope)
    {
        $q->where('v.status', Voucher::POSTED)->whereIn('vt.base_type', ['sales', 'cash_sale', 'credit_note', 'purchase', 'debit_note'])
            ->when($scope->from, fn ($x) => $x->where('v.date', '>=', $scope->from))->when($scope->to, fn ($x) => $x->where('v.date', '<=', $scope->to))
            ->when($scope->locationId !== null, fn ($x) => $x->where('v.location_id', $scope->locationId));

        return app(BranchFilter::class)->apply($q, 'v.location_id', $scope->area, 'compliance');
    }

    /** Taxable value per tax ledger, by side, from the voucher lines (credit and debit notes reduce it). */
    private function bases(array $ledgerIds, Scope $scope): array
    {
        if (! $ledgerIds) {
            return [];
        }
        $rate = RestatedBase::rate();
        $q = RestatedBase::join(DB::table('voucher_item_taxes as t')->join('voucher_items as i', 'i.id', '=', 't.item_id')->join('vouchers as v', 'v.id', '=', 'i.voucher_id'))
            ->join('voucher_types as vt', 'vt.id', '=', 'v.voucher_type_id')->whereIn('t.ledger_id', $ledgerIds);
        $rows = $this->vouchers($q, $scope)->groupBy('t.ledger_id', 'vt.base_type')->selectRaw("t.ledger_id, vt.base_type, SUM(t.base_amount * {$rate}) AS base")->get();
        $out = [];
        foreach ($rows as $r) {
            $side = in_array($r->base_type, ['sales', 'cash_sale', 'credit_note'], true) ? 'sales' : 'purchases';
            $sign = in_array($r->base_type, ['credit_note', 'debit_note'], true) ? -1 : 1;
            $out[$r->ledger_id][$side] = ($out[$r->ledger_id][$side] ?? 0) + $sign * (float) $r->base;
        }

        return $out;
    }

    /**
     * The value of what was sold and bought, by the tax nature of the account each line posted to. Credit and debit notes reduce it; gift voucher lines
     * are not supplies.
     *
     * @return array<int, array{key: string, label: string, sales: float, purchases: float}>
     */
    private function supplies(Scope $scope): array
    {
        $rate = RestatedBase::rate();
        $q = RestatedBase::join(DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id'))->join('voucher_types as vt', 'vt.id', '=', 'v.voucher_type_id')
            ->leftJoin('ledgers as l', 'l.id', '=', 'i.ledger_id')->where('i.is_header', false)->whereNull('i.gift_meta');
        $rows = $this->vouchers($q, $scope)->groupBy('vt.base_type', 'l.tax_nature')->selectRaw("vt.base_type as base, l.tax_nature as nature, SUM(i.amount * {$rate}) as value")->get();
        $sum = ['sales' => [], 'purchases' => []];
        foreach ($rows as $r) {
            $side = in_array($r->base, ['sales', 'cash_sale', 'credit_note'], true) ? 'sales' : 'purchases';
            $sign = in_array($r->base, ['credit_note', 'debit_note'], true) ? -1 : 1;
            $nature = $r->nature ?: 'unclassified';
            $sum[$side][$nature] = ($sum[$side][$nature] ?? 0) + $sign * (float) $r->value;
        }
        $out = [];
        foreach (self::NATURES + array_fill_keys(array_diff(array_merge(array_keys($sum['sales']), array_keys($sum['purchases'])), array_keys(self::NATURES)), null) as $key => $label) {
            $s = round($sum['sales'][$key] ?? 0, 2);
            $p = round($sum['purchases'][$key] ?? 0, 2);
            if (abs($s) >= 0.005 || abs($p) >= 0.005) {
                $out[] = ['key' => $key, 'label' => $label ?? ucfirst(str_replace('_', ' ', $key)), 'sales' => $s, 'purchases' => $p];
            }
        }

        return $out;
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = [];
        foreach ($data['types'] as $t) {
            $rows[] = ['tax' => $t['name'], 'rate' => 'Owed at the start' . ($data['brought_forward_on'] ? ' (' . $data['brought_forward_on'] . ')' : ''), 'sales_base' => '', 'output' => '', 'purchases_base' => '', 'input' => '', 'net' => $t['brought_forward']];
            foreach ($t['rows'] as $x) {
                $rows[] = ['tax' => $t['name'], 'rate' => $x['label'], 'sales_base' => $x['sales_base'], 'output' => $x['output'], 'purchases_base' => $x['purchases_base'], 'input' => $x['input'], 'net' => $x['net']];
            }
            if (abs($t['settled']) >= 0.005) {
                $rows[] = ['tax' => $t['name'], 'rate' => 'Paid to the authority and other entries', 'sales_base' => '', 'output' => '', 'purchases_base' => '', 'input' => '', 'net' => -$t['settled']];
            }
            $rows[] = ['tax' => $t['name'], 'rate' => 'Owed at the end (' . $data['to'] . ')', 'sales_base' => '', 'output' => '', 'purchases_base' => '', 'input' => '', 'net' => $t['closing_owed']];
        }
        foreach ($data['supplies'] as $s) {
            $rows[] = ['tax' => 'Supplies', 'rate' => $s['label'], 'sales_base' => $s['sales'], 'output' => '', 'purchases_base' => $s['purchases'], 'input' => '', 'net' => ''];
        }

        return [
            'title' => $this->title(), 'subtitle' => $this->period($scope),
            'columns' => ['tax' => 'Tax', 'rate' => 'Rate', 'sales_base' => 'Sales value', 'output' => 'Output tax', 'purchases_base' => 'Purchases value', 'input' => 'Input tax', 'net' => 'Net'],
            'rows' => $rows, 'totals' => ['rate' => 'Total', 'output' => $data['totals']['output'], 'input' => $data['totals']['input'], 'net' => $data['totals']['owed']],
        ];
    }
}

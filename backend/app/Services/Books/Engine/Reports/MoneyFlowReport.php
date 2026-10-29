<?php

namespace App\Services\Books\Engine\Reports;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\ReportSettings;
use App\Services\Books\RestatedBase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Money flow on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.8): what came into and went out of the cash and bank accounts, and who it came from or went to.
 *
 * Each voucher's money lines are matched to its other lines in proportion, so a cash sale that is part sales and part VAT shows both, and a sale paid
 * 600 in cash and 400 on M-Pesa puts each tender against the sales and the VAT (audit M4), not under "Adjustments". A voucher whose other lines do not
 * add up to the money (a journal that also carries a fee, say) cannot be pinned on one party: it is shown as an adjustment under its own number.
 *
 * Money moved between two of our own accounts is a transfer. It is kept out of money in and money out unless "Show transfers" is ticked (decision 19,
 * audit M3), and is listed on its own either way. The money accounts are the groups chosen in the Reports settings (M1), the Bank Accounts and
 * Cash-in-hand groups when none is chosen. Amounts are in today's base currency (M2).
 */
final class MoneyFlowReport extends ReportDefinition
{
    public function key(): string
    {
        return 'money-flow';
    }

    public function title(): string
    {
        return 'Money flow';
    }

    public function filters(): array
    {
        return ['branch'];
    }

    public function options(): array
    {
        $accounts = ['' => 'All cash and bank accounts'];
        foreach ($this->moneyLedgers() as $l) {
            $accounts[(string) $l->id] = $l->name;
        }

        return [
            ['key' => 'ledger_id', 'label' => 'Account', 'choices' => $accounts, 'default' => ''],
            ['key' => 'show_transfers', 'label' => 'Show transfers', 'type' => 'checkbox', 'choices' => [], 'default' => ''],
        ];
    }

    /** The cash and bank ledgers: every ledger in the groups chosen in the settings, else the Bank Accounts and Cash-in-hand groups. */
    private function moneyLedgers()
    {
        $chosen = [];
        if (ReportSettings::ready()) {
            $chosen = array_map('intval', (array) app(ReportSettings::class)->get('money_account_groups'));
        }
        $groups = $chosen ? LedgerGroup::whereIn('id', $chosen)->get() : collect(['Bank Accounts', 'Cash-in-hand'])->map(fn ($n) => LedgerGroup::where('name', $n)->first())->filter();
        $ids = $groups->flatMap(fn ($g) => $g->selfAndDescendantIds())->unique()->values()->all();

        return Ledger::whereIn('group_id', $ids ?: [0])->orderBy('name')->get(['id', 'name', 'group_id']);
    }

    private function span(Scope $scope): array
    {
        $to = $scope->to ?: today()->toDateString();
        $from = $scope->from ?: Carbon::parse($to)->startOfYear()->toDateString();

        return [$from, $to];
    }

    public function run(Scope $scope, array $options): array
    {
        [$from, $to] = $this->span($scope);
        $showTransfers = ! empty($options['show_transfers']) && $options['show_transfers'] !== '0';
        $ledgerId = (int) ($options['ledger_id'] ?? 0) ?: null;
        $all = $this->moneyLedgers()->keyBy('id');
        $money = $ledgerId ? $all->only([$ledgerId]) : $all;
        $allMoney = $all->keys()->flip();   // a move between any two of our money accounts is a transfer, even when one account is chosen

        $amount = RestatedBase::entry();
        $q = RestatedBase::join(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id'))->join('ledgers as l', 'l.id', '=', 'e.ledger_id')
            ->leftJoin('ledger_groups as g', 'g.id', '=', 'l.group_id')
            ->where('v.status', 'posted')->whereBetween('v.date', [$from, $to])
            ->when($scope->locationId !== null, fn ($x) => $x->where('v.location_id', $scope->locationId))
            ->whereIn('e.voucher_id', fn ($s) => $s->select('voucher_id')->from('voucher_entries')->whereIn('ledger_id', $money->keys()->all() ?: [0]));
        app(BranchFilter::class)->apply($q, 'v.location_id', $scope->area, 'money_flow');
        $entries = $q->orderBy('e.voucher_id')->get(['e.voucher_id', 'e.ledger_id', 'e.side', DB::raw("{$amount} as base_amount"), 'v.date', 'l.name as ledger_name', 'g.name as group_name']);

        $vouchers = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->whereIn('v.id', $entries->pluck('voucher_id')->unique()->all() ?: [0])
            ->get(['v.id', 'v.voucher_number', 'v.narration', 't.name as type_name'])->keyBy('id');

        $days = Carbon::parse($from)->diffInDays(Carbon::parse($to));
        $bucket = $days <= 31 ? 'day' : ($days <= 183 ? 'week' : 'month');
        $key = fn ($d) => $bucket === 'day' ? Carbon::parse($d)->toDateString() : ($bucket === 'week' ? Carbon::parse($d)->startOfWeek()->toDateString() : Carbon::parse($d)->format('Y-m'));
        $sides = ['in' => [], 'out' => []];
        $flows = [];
        $series = [];
        $accounts = [];
        $transfers = [];

        foreach ($entries->groupBy('voucher_id') as $lines) {
            $others = $lines->reject(fn ($l) => isset($allMoney[$l->ledger_id]));   // the party, the sales, the tax …
            foreach ($lines->filter(fn ($l) => isset($money[$l->ledger_id])) as $m) {
                $amt = (float) $m->base_amount;
                if ($amt <= 0) {
                    continue;
                }
                $isIn = $m->side === 'D';
                $side = $isIn ? 'in' : 'out';
                $against = $others->where('side', $isIn ? 'C' : 'D');
                $transfer = $against->isEmpty();
                if ($transfer) {
                    $against = $lines->filter(fn ($l) => $l->ledger_id !== $m->ledger_id && $l->side === ($isIn ? 'C' : 'D'));   // between our own accounts
                }
                $sum = (float) $against->sum('base_amount');
                if ($sum <= 0) {
                    continue;
                }
                if ($transfer) {
                    $k = $side . '|' . $m->ledger_id . '|' . $against->pluck('ledger_id')->unique()->implode(',');
                    $transfers[$k] ??= ['direction' => $side, 'account' => $m->ledger_name, 'account_id' => (int) $m->ledger_id, 'other' => $against->pluck('ledger_name')->unique()->implode(', '), 'amount' => 0.0, 'vouchers' => []];
                    $transfers[$k]['amount'] += $amt;
                    $transfers[$k]['vouchers'][$m->voucher_id] = true;
                    if (! $showTransfers) {
                        continue;
                    }
                } else {
                    // The money may be one of several tenders, or only part of what the other lines add up to (the rest on account): it is matched to them in
                    // proportion. Only a voucher whose other lines do not add up to ALL the money and all that sits beside it on the same side cannot be pinned
                    // on one party, and is shown as an adjustment under its own number.
                    $moneyOnSide = (float) $lines->filter(fn ($l) => isset($allMoney[$l->ledger_id]) && $l->side === $m->side)->sum('base_amount');
                    $beside = (float) $others->where('side', $m->side)->sum('base_amount');
                    if ($against->pluck('ledger_id')->unique()->count() > 1 && abs($sum - ($moneyOnSide + $beside)) > 0.01) {
                        $vm = $vouchers[$m->voucher_id] ?? null;
                        $against = collect([(object) ['ledger_id' => 0, 'base_amount' => $amt, 'ledger_name' => ($vm->voucher_number ?? 'Voucher') . ' · ' . ($vm->type_name ?? ''), 'group_name' => 'Adjustments']]);
                        $sum = $amt;
                    }
                }
                $accounts[$m->ledger_id] ??= ['ledger_id' => (int) $m->ledger_id, 'name' => $m->ledger_name, 'in' => 0.0, 'out' => 0.0];
                $accounts[$m->ledger_id][$side] += $amt;
                $series[$key($m->date)][$side] = ($series[$key($m->date)][$side] ?? 0.0) + $amt;
                foreach ($against as $a) {
                    $share = $amt * (float) $a->base_amount / $sum;
                    $label = $transfer ? 'Transfers between our accounts' : ($a->group_name ?: 'Other');
                    $f = &$flows[$side . '|' . $label . '|' . $m->ledger_id];
                    $f ??= ['direction' => $side, 'group' => $label, 'account' => $m->ledger_name, 'account_id' => (int) $m->ledger_id, 'amount' => 0.0, 'ledgers' => []];
                    $f['amount'] += $share;
                    $f['ledgers'][$a->ledger_name] = ($f['ledgers'][$a->ledger_name] ?? 0.0) + $share;
                    unset($f);
                    $row = &$sides[$side][$label . '|' . $a->ledger_name];
                    $row ??= ['group' => $label, 'name' => $a->ledger_name, 'amount' => 0.0, 'vouchers' => []];
                    $row['amount'] += $share;
                    $row['vouchers'][$m->voucher_id] ??= ['amount' => 0.0, 'date' => $m->date];
                    $row['vouchers'][$m->voucher_id]['amount'] += $share;
                    unset($row);
                }
            }
        }

        $round = fn (array $rows) => array_values(array_map(function ($r) use ($vouchers) {
            $list = [];
            foreach ($r['vouchers'] as $vid => $x) {
                $list[] = ['id' => (int) $vid, 'number' => $vouchers[$vid]->voucher_number ?? '', 'type' => $vouchers[$vid]->type_name ?? '', 'date' => Carbon::parse($x['date'])->toDateString(),
                    'narration' => $vouchers[$vid]->narration ?? null, 'amount' => round($x['amount'], 2)];
            }
            usort($list, fn ($a, $b) => $b['amount'] <=> $a['amount']);
            $r['vouchers'] = array_slice($list, 0, 25);
            $r['voucher_count'] = count($list);

            return ['amount' => round($r['amount'], 2)] + $r;
        }, $rows));
        $desc = function (array $rows) { usort($rows, fn ($a, $b) => $b['amount'] <=> $a['amount']); return $rows; };
        ksort($series);
        $seriesOut = [];
        foreach ($series as $k => $v) {
            $seriesOut[] = ['bucket' => $k, 'in' => round($v['in'] ?? 0, 2), 'out' => round($v['out'] ?? 0, 2)];
        }
        $flowsOut = array_values(array_map(function ($f) {
            arsort($f['ledgers']);
            $f['ledgers'] = array_slice(array_map(fn ($x) => round($x, 2), $f['ledgers']), 0, 8, true);
            $f['amount'] = round($f['amount'], 2);

            return $f;
        }, $flows));
        $transfersOut = $desc(array_values(array_map(fn ($t) => ['amount' => round($t['amount'], 2), 'vouchers' => count($t['vouchers'])] + array_diff_key($t, ['amount' => 1, 'vouchers' => 1]), $transfers)));

        return [
            'ready' => true, 'from' => $from, 'to' => $to, 'bucket' => $bucket, 'show_transfers' => $showTransfers, 'restated_vouchers' => RestatedBase::restatedCount(),
            'accounts' => array_values(array_map(fn ($a) => ['in' => round($a['in'], 2), 'out' => round($a['out'], 2), 'net' => round($a['in'] - $a['out'], 2)] + $a, $accounts)),
            'in' => $desc($round($sides['in'])), 'out' => $desc($round($sides['out'])), 'flows' => $flowsOut, 'series' => $seriesOut, 'transfers' => $transfersOut,
            'totals' => ['in' => round(array_sum(array_column($accounts, 'in')), 2), 'out' => round(array_sum(array_column($accounts, 'out')), 2),
                'transfers_in' => round(array_sum(array_column(array_filter($transfers, fn ($t) => $t['direction'] === 'in'), 'amount')), 2),
                'transfers_out' => round(array_sum(array_column(array_filter($transfers, fn ($t) => $t['direction'] === 'out'), 'amount')), 2)],
        ];
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = [];
        foreach (['in' => 'Came from', 'out' => 'Went to'] as $side => $label) {
            foreach ($data[$side] ?? [] as $r) {
                $rows[] = ['side' => $label, 'group' => $r['group'], 'name' => $r['name'], 'vouchers' => $r['voucher_count'], 'amount' => $r['amount']];
            }
        }
        foreach ($data['transfers'] ?? [] as $t) {
            $rows[] = ['side' => $data['show_transfers'] ? 'Transfer (counted above)' : 'Transfer (not counted)', 'group' => $t['direction'] === 'in' ? 'In to ' . $t['account'] : 'Out of ' . $t['account'],
                'name' => $t['other'], 'vouchers' => $t['vouchers'], 'amount' => $t['amount']];
        }

        return ['title' => $this->title(), 'subtitle' => $this->period($scope), 'columns' => ['side' => '', 'group' => 'Group', 'name' => 'Particulars', 'vouchers' => 'Vouchers', 'amount' => 'Amount'],
            'rows' => $rows, 'totals' => ['name' => 'Money in / out', 'amount' => number_format($data['totals']['in'] ?? 0, 2) . ' / ' . number_format($data['totals']['out'] ?? 0, 2)]];
    }
}

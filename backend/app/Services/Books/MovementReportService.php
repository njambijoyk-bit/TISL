<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\VoucherType;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Two read-only views over what the books already hold (no table of its own):
 *
 *  - Stock movement: what a ledger bought from us or sold to us, item by item; every voucher behind an item; and, for one item, every ledger it moved with.
 *  - Money movement: what flowed into and out of the cash and bank accounts, and who it came from or went to.
 *
 * Figures are in the base currency (each line at its voucher's own rate). Cancelled and draft vouchers are left out. A return counts against what it returns.
 */
class MovementReportService
{
    /** base type => [kind (sale|purchase), +1 or -1]. Orders, quotes and delivery notes move no value, so they are not here. */
    private const MOVES = [
        VoucherType::SALES => ['sale', 1], VoucherType::CASH_SALE => ['sale', 1], VoucherType::CREDIT_NOTE => ['sale', -1],
        VoucherType::PURCHASE => ['purchase', 1], VoucherType::DEBIT_NOTE => ['purchase', -1],
    ];

    private function span(?string $from, ?string $to): array
    {
        $to = $to ? Carbon::parse($to)->toDateString() : today()->toDateString();
        $from = $from ? Carbon::parse($from)->toDateString() : Carbon::parse($to)->startOfYear()->toDateString();

        return [$from, $to];
    }

    /** The stock lines of posted vouchers in a window, with what kind of movement each is. */
    private function lines(string $from, string $to)
    {
        return DB::table('voucher_items as i')
            ->join('vouchers as v', 'v.id', '=', 'i.voucher_id')
            ->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('v.status', 'posted')->whereIn('t.base_type', array_keys(self::MOVES))
            ->whereNotNull('i.product_id')->where('i.item_type', '!=', 'charge')->where('i.is_header', false)
            ->whereBetween('v.date', [$from, $to]);
    }

    /** Quantity and base-currency value of one line, with its sign (a return counts negative). */
    private function figure(object $r): array
    {
        [$kind, $sign] = self::MOVES[$r->base_type];
        $qty = (float) ($r->base_quantity ?: $r->quantity);

        return [$kind, $sign * $qty, $sign * round((float) $r->amount * (float) ($r->exchange_rate ?: 1), 2)];
    }

    /**
     * Everything a ledger has been bought from or sold: one row per item, with Purchases and Sales (quantity, value, effective rate).
     *
     * @return array{ledger: array, from: string, to: string, rows: array, totals: array}
     */
    public function ledgerItems(int $ledgerId, ?string $from, ?string $to): array
    {
        [$from, $to] = $this->span($from, $to);
        $ledger = Ledger::findOrFail($ledgerId);
        $rows = [];
        $names = [];
        foreach ($this->lines($from, $to)->where('v.party_ledger_id', $ledgerId)
            ->get(['i.product_id', 'i.quantity', 'i.base_quantity', 'i.amount', 'v.exchange_rate', 't.base_type']) as $r) {
            [$kind, $qty, $val] = $this->figure($r);
            $row = &$rows[$r->product_id];
            $row ??= ['product_id' => (int) $r->product_id, 'purchase_qty' => 0.0, 'purchase_value' => 0.0, 'sale_qty' => 0.0, 'sale_value' => 0.0];
            $row[$kind . '_qty'] += $qty;
            $row[$kind . '_value'] += $val;
            unset($row);
        }
        if ($rows) {
            $names = DB::table('products as p')->leftJoin('units_of_measure as u', 'u.id', '=', 'p.default_unit_id')->whereIn('p.id', array_keys($rows))->get(['p.id', 'p.name', 'u.code as unit'])->keyBy('id');
        }
        $out = [];
        $tot = ['purchase_value' => 0.0, 'sale_value' => 0.0];
        foreach ($rows as $id => $r) {
            foreach (['purchase', 'sale'] as $k) {
                $r[$k . '_rate'] = abs($r[$k . '_qty']) > 0.00001 ? round($r[$k . '_value'] / $r[$k . '_qty'], 2) : null;   // value / quantity: the effective rate
                $r[$k . '_qty'] = round($r[$k . '_qty'], 4);
                $r[$k . '_value'] = round($r[$k . '_value'], 2);
            }
            $r['name'] = $names[$id]->name ?? "Item {$id}";
            $r['unit'] = $names[$id]->unit ?? null;
            $tot['purchase_value'] += $r['purchase_value'];
            $tot['sale_value'] += $r['sale_value'];
            $out[] = $r;
        }
        usort($out, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return ['ledger' => ['id' => $ledger->id, 'name' => $ledger->name], 'from' => $from, 'to' => $to, 'rows' => $out,
            'totals' => ['purchase_value' => round($tot['purchase_value'], 2), 'sale_value' => round($tot['sale_value'], 2), 'items' => count($out)]];
    }

    /**
     * Item voucher analysis: every voucher line of one item for one ledger (or, with no ledger, for everyone), with the voucher to open.
     *
     * @return array{item: array, ledger: ?array, from: string, to: string, groups: array, totals: array}
     */
    public function itemVouchers(int $productId, ?int $ledgerId, ?string $from, ?string $to): array
    {
        [$from, $to] = $this->span($from, $to);
        $item = DB::table('products as p')->leftJoin('units_of_measure as u', 'u.id', '=', 'p.default_unit_id')->where('p.id', $productId)->first(['p.id', 'p.name', 'u.code as unit']);
        abort_unless($item, 404);
        $q = $this->lines($from, $to)->where('i.product_id', $productId)->leftJoin('ledgers as l', 'l.id', '=', 'v.party_ledger_id')
            ->when($ledgerId, fn ($w) => $w->where('v.party_ledger_id', $ledgerId))
            ->orderBy('v.date')->orderBy('v.id');
        $groups = ['sale' => ['kind' => 'Sales', 'rows' => [], 'qty' => 0.0, 'value' => 0.0], 'purchase' => ['kind' => 'Purchases', 'rows' => [], 'qty' => 0.0, 'value' => 0.0]];
        foreach ($q->get(['i.id as item_line', 'i.quantity', 'i.base_quantity', 'i.amount', 'i.variant_label', 'v.id as voucher_id', 'v.voucher_number', 'v.date', 'v.exchange_rate', 'v.party_name',
            't.base_type', 't.name as type_name', 'l.name as ledger_name', 'v.party_ledger_id']) as $r) {
            [$kind, $qty, $val] = $this->figure($r);
            $groups[$kind]['rows'][] = ['voucher_id' => (int) $r->voucher_id, 'number' => $r->voucher_number, 'date' => Carbon::parse($r->date)->toDateString(), 'type' => $r->type_name, 'base_type' => $r->base_type,
                'party' => $r->ledger_name ?? $r->party_name, 'party_ledger_id' => $r->party_ledger_id ? (int) $r->party_ledger_id : null, 'variant' => $r->variant_label,
                'qty' => round($qty, 4), 'rate' => abs($qty) > 0.00001 ? round($val / $qty, 2) : null, 'value' => round($val, 2)];
            $groups[$kind]['qty'] += $qty;
            $groups[$kind]['value'] += $val;
        }
        $out = [];
        foreach ($groups as $g) {
            if (! $g['rows']) {
                continue;
            }
            $g['rate'] = abs($g['qty']) > 0.00001 ? round($g['value'] / $g['qty'], 2) : null;
            $g['qty'] = round($g['qty'], 4);
            $g['value'] = round($g['value'], 2);
            $out[] = $g;
        }
        $ledger = $ledgerId ? Ledger::find($ledgerId) : null;

        return ['item' => ['id' => (int) $item->id, 'name' => $item->name, 'unit' => $item->unit], 'ledger' => $ledger ? ['id' => $ledger->id, 'name' => $ledger->name] : null,
            'from' => $from, 'to' => $to, 'groups' => $out];
    }

    /**
     * Which ledgers one item moved with: bought from, sold to, in quantity and value.
     *
     * @return array{item: array, from: string, to: string, rows: array}
     */
    public function itemLedgers(int $productId, ?string $from, ?string $to): array
    {
        [$from, $to] = $this->span($from, $to);
        $item = DB::table('products as p')->leftJoin('units_of_measure as u', 'u.id', '=', 'p.default_unit_id')->where('p.id', $productId)->first(['p.id', 'p.name', 'u.code as unit']);
        abort_unless($item, 404);
        $rows = [];
        foreach ($this->lines($from, $to)->where('i.product_id', $productId)->leftJoin('ledgers as l', 'l.id', '=', 'v.party_ledger_id')
            ->get(['i.quantity', 'i.base_quantity', 'i.amount', 'v.exchange_rate', 't.base_type', 'v.party_ledger_id', 'l.name as ledger_name', 'v.party_name']) as $r) {
            [$kind, $qty, $val] = $this->figure($r);
            $key = $r->party_ledger_id ?: 'x:' . ($r->party_name ?: 'walk-in');
            $row = &$rows[$key];
            $row ??= ['ledger_id' => $r->party_ledger_id ? (int) $r->party_ledger_id : null, 'name' => $r->ledger_name ?? ($r->party_name ?: 'Walk-in / cash customers'),
                'purchase_qty' => 0.0, 'purchase_value' => 0.0, 'sale_qty' => 0.0, 'sale_value' => 0.0];
            $row[$kind . '_qty'] += $qty;
            $row[$kind . '_value'] += $val;
            unset($row);
        }
        $out = [];
        foreach ($rows as $r) {
            foreach (['purchase', 'sale'] as $k) {
                $r[$k . '_rate'] = abs($r[$k . '_qty']) > 0.00001 ? round($r[$k . '_value'] / $r[$k . '_qty'], 2) : null;
                $r[$k . '_qty'] = round($r[$k . '_qty'], 4);
                $r[$k . '_value'] = round($r[$k . '_value'], 2);
            }
            $out[] = $r;
        }
        usort($out, fn ($a, $b) => ($b['sale_value'] + $b['purchase_value']) <=> ($a['sale_value'] + $a['purchase_value']));

        return ['item' => ['id' => (int) $item->id, 'name' => $item->name, 'unit' => $item->unit], 'from' => $from, 'to' => $to, 'rows' => $out];
    }

    // ── money movement ──────────────────────────────────────────────────────

    /**
     * What moved through the cash and bank accounts in a window. Each voucher's money lines are matched to its other lines in proportion, so a cash sale
     * that is part sales and part tax shows both. Money moved between two of our own accounts is a transfer.
     *
     * @return array{from: string, to: string, accounts: array, in: array, out: array, flows: array, series: array, totals: array, bucket: string}
     */
    public function moneyFlow(?string $from, ?string $to, ?int $ledgerId = null): array
    {
        [$from, $to] = $this->span($from, $to);
        $moneyGroups = collect(['Bank Accounts', 'Cash-in-hand'])->map(fn ($n) => LedgerGroup::where('name', $n)->first())->filter()->flatMap(fn ($g) => $g->selfAndDescendantIds())->unique()->values()->all();
        $money = Ledger::whereIn('group_id', $moneyGroups ?: [0])->when($ledgerId, fn ($q) => $q->where('id', $ledgerId))->get(['id', 'name', 'group_id'])->keyBy('id');
        $allMoney = $ledgerId ? Ledger::whereIn('group_id', $moneyGroups ?: [0])->pluck('id')->flip() : $money->keys()->flip();

        $entries = DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')->join('ledgers as l', 'l.id', '=', 'e.ledger_id')
            ->leftJoin('ledger_groups as g', 'g.id', '=', 'l.group_id')
            ->where('v.status', 'posted')->whereBetween('v.date', [$from, $to])
            ->whereIn('e.voucher_id', function ($q) use ($money) {
                $q->select('voucher_id')->from('voucher_entries')->whereIn('ledger_id', $money->keys()->all() ?: [0]);
            })
            ->orderBy('e.voucher_id')->get(['e.voucher_id', 'e.ledger_id', 'e.side', 'e.base_amount', 'v.date', 'l.name as ledger_name', 'g.name as group_name']);

        $vouchers = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->whereIn('v.id', $entries->pluck('voucher_id')->unique()->all() ?: [0])
            ->get(['v.id', 'v.voucher_number', 'v.narration', 't.name as type_name'])->keyBy('id');
        $sides = ['in' => [], 'out' => []];
        $flows = [];
        $series = [];
        $accounts = [];
        $bucket = Carbon::parse($from)->diffInDays(Carbon::parse($to)) <= 31 ? 'day' : (Carbon::parse($from)->diffInDays(Carbon::parse($to)) <= 183 ? 'week' : 'month');
        $key = fn ($d) => $bucket === 'day' ? Carbon::parse($d)->toDateString() : ($bucket === 'week' ? Carbon::parse($d)->startOfWeek()->toDateString() : Carbon::parse($d)->format('Y-m'));

        foreach ($entries->groupBy('voucher_id') as $lines) {
            $moneyLines = $lines->filter(fn ($l) => isset($money[$l->ledger_id]));
            $others = $lines->reject(fn ($l) => isset($allMoney[$l->ledger_id]));          // the party, the sales, the tax …
            foreach ($moneyLines as $m) {
                $amount = (float) $m->base_amount;
                if ($amount <= 0) {
                    continue;
                }
                $isIn = $m->side === 'D';
                $against = $others->where('side', $isIn ? 'C' : 'D');
                if ($against->isEmpty()) {
                    $against = $lines->filter(fn ($l) => $l->ledger_id !== $m->ledger_id && $l->side === ($isIn ? 'C' : 'D'));   // transfers between our own accounts
                }
                $sum = (float) $against->sum('base_amount');
                if ($sum <= 0) {
                    continue;
                }
                // A voucher whose other lines do not add up to the money (a journal that also carries a fee, say) cannot be pinned on one party: it is shown as an
                // adjustment under its own number rather than guessed at. A clean one (receipt, payment, sale) is split exactly.
                $ambiguous = $against->pluck('ledger_id')->unique()->count() > 1 && abs($sum - $amount) > 0.01;
                if ($ambiguous) {
                    $vm = $vouchers[$m->voucher_id] ?? null;
                    $against = collect([(object) ['ledger_id' => 0, 'base_amount' => $amount, 'ledger_name' => ($vm->voucher_number ?? 'Voucher') . ' · ' . ($vm->type_name ?? ''), 'group_name' => 'Adjustments']]);
                    $sum = $amount;
                }
                $accounts[$m->ledger_id] ??= ['ledger_id' => (int) $m->ledger_id, 'name' => $m->ledger_name, 'in' => 0.0, 'out' => 0.0];
                $accounts[$m->ledger_id][$isIn ? 'in' : 'out'] += $amount;
                $series[$key($m->date)][$isIn ? 'in' : 'out'] = ($series[$key($m->date)][$isIn ? 'in' : 'out'] ?? 0.0) + $amount;
                foreach ($against as $a) {
                    $share = $amount * (float) $a->base_amount / $sum;
                    $label = $a->group_name ?: 'Other';
                    $bucketArr = &$flows[($isIn ? 'in|' : 'out|') . $label . '|' . $m->ledger_id];
                    $bucketArr ??= ['direction' => $isIn ? 'in' : 'out', 'group' => $label, 'account' => $m->ledger_name, 'account_id' => (int) $m->ledger_id, 'amount' => 0.0, 'ledgers' => []];
                    $bucketArr['amount'] += $share;
                    $bucketArr['ledgers'][$a->ledger_name] = ($bucketArr['ledgers'][$a->ledger_name] ?? 0.0) + $share;
                    unset($bucketArr);
                    $side = $isIn ? 'in' : 'out';
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
        $sortDesc = function (array $rows) { usort($rows, fn ($a, $b) => $b['amount'] <=> $a['amount']); return $rows; };
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

        return [
            'from' => $from, 'to' => $to, 'bucket' => $bucket,
            'accounts' => array_values(array_map(fn ($a) => ['in' => round($a['in'], 2), 'out' => round($a['out'], 2), 'net' => round($a['in'] - $a['out'], 2)] + $a, $accounts)),
            'in' => $sortDesc($round($sides['in'])), 'out' => $sortDesc($round($sides['out'])), 'flows' => $flowsOut, 'series' => $seriesOut,
            'totals' => ['in' => round(array_sum(array_column($accounts, 'in')), 2), 'out' => round(array_sum(array_column($accounts, 'out')), 2)],
        ];
    }
}

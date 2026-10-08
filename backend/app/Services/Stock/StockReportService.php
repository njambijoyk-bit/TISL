<?php

namespace App\Services\Stock;

use App\Models\Books\StockMovement;
use App\Services\Stock\Items\StockItemRegistry;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Stock reports built from the movements: Summary (and Location Summary — the same thing for one branch),
 * an item's month-by-month movement, and the Stock Query card. Works for every kind of stocked item: a movement
 * names its item by item_type + item_id and StockItemRegistry says what that item is.
 *
 * A value is quantity × the cost the movement carried, so a figure can be asked for at any past date. Nothing is hidden:
 * a negative balance (which should not exist) is shown and flagged, and stock at no cost is flagged too.
 */
class StockReportService
{
    /** Moves of stock between branches net to nothing across the whole business, so they are not "inwards" or "outwards" there. */
    private const TRANSFERS = ['transfer_in', 'transfer_out'];

    private const SALE_TYPES = ['sales', 'cash_sale'];

    private function cols(): array
    {
        return StockMovement::hasItemColumns('stock_movements') ? ['m.item_type', 'm.item_id'] : ["'product_variant'", 'm.variant_id'];
    }

    private function d(?string $date, string $fallback): string
    {
        return Carbon::parse($date ?: $fallback)->toDateString();
    }

    /** Stock Summary / Location Summary. @param array{from?:string,to?:string,location_id?:int,item_type?:string,q?:string} $f */
    public function summary(array $f): array
    {
        $to = $this->d($f['to'] ?? null, 'today');
        $from = $this->d($f['from'] ?? null, Carbon::parse($to)->startOfYear()->toDateString());
        $loc = ! empty($f['location_id']) ? (int) $f['location_id'] : null;
        [$t, $i] = $this->cols();

        $q = DB::table('stock_movements as m')->where('m.reversed', false)->where('m.movement_date', '<=', $to)
            ->when($loc, fn ($s) => $s->where('m.location_id', $loc))
            ->when(true, fn ($s) => app(\App\Services\Access\BranchFilter::class)->apply($s, 'm.location_id', 'stock', 'reports'))
            ->when(! empty($f['item_type']), fn ($s) => $s->whereRaw("{$t} = ?", [$f['item_type']]));
        if (! empty($f['q'])) {
            $ids = [];
            foreach (StockItemRegistry::all() as $type => $src) {
                if (empty($f['item_type']) || $f['item_type'] === $type) {
                    foreach ($src->search($f['q']) as $id) {
                        $ids[$type][] = $id;
                    }
                }
            }
            $q->where(function ($w) use ($ids, $t, $i) {
                $w->whereRaw('1 = 0');
                foreach ($ids as $type => $list) {
                    $w->orWhere(fn ($x) => $x->whereRaw("{$t} = ?", [$type])->whereRaw("{$i} IN (" . implode(',', array_map('intval', $list)) . ')'));
                }
            });
        }
        $skip = $loc ? '' : "AND m.movement_type NOT IN ('transfer_in','transfer_out')";
        $cost = 'm.quantity * COALESCE(m.unit_cost, 0)';
        $rows = $q->groupBy(DB::raw($t), DB::raw($i))->selectRaw(
            "{$t} AS t, {$i} AS i,
             SUM(CASE WHEN m.movement_date < '{$from}' THEN m.quantity ELSE 0 END) AS oq, SUM(CASE WHEN m.movement_date < '{$from}' THEN {$cost} ELSE 0 END) AS ov,
             SUM(CASE WHEN m.movement_date >= '{$from}' AND m.quantity > 0 {$skip} THEN m.quantity ELSE 0 END) AS iq, SUM(CASE WHEN m.movement_date >= '{$from}' AND m.quantity > 0 {$skip} THEN {$cost} ELSE 0 END) AS iv,
             SUM(CASE WHEN m.movement_date >= '{$from}' AND m.quantity < 0 {$skip} THEN -m.quantity ELSE 0 END) AS xq, SUM(CASE WHEN m.movement_date >= '{$from}' AND m.quantity < 0 {$skip} THEN -({$cost}) ELSE 0 END) AS xv"
        )->get();

        $byType = [];
        foreach ($rows as $r) {
            $byType[$r->t][] = (int) $r->i;
        }
        $info = [];
        foreach ($byType as $type => $ids) {
            $src = StockItemRegistry::get($type);
            $found = $src ? $src->describe($ids) : [];
            foreach ($ids as $id) {
                $info["{$type}:{$id}"] = $found[$id] ?? StockItemRegistry::unknown($type, $id);
            }
        }

        $groups = [];
        $sum = fn () => ['qty' => 0.0, 'value' => 0.0];
        $total = ['opening' => $sum(), 'inward' => $sum(), 'outward' => $sum(), 'closing' => $sum()];
        foreach ($rows as $r) {
            $oq = (float) $r->oq; $ov = (float) $r->ov; $iq = (float) $r->iq; $iv = (float) $r->iv; $xq = (float) $r->xq; $xv = (float) $r->xv;
            if (abs($oq) < 0.00005 && abs($iq) < 0.00005 && abs($xq) < 0.00005 && abs($ov) < 0.005 && abs($iv) < 0.005 && abs($xv) < 0.005) {
                continue;
            }
            $cq = round($oq + $iq - $xq, 4);
            $cv = round($ov + $iv - $xv, 2);
            $d = $info["{$r->t}:{$r->i}"];
            $g = $d['group'] ?: 'Other';
            $groups[$g]['name'] = $g;
            $groups[$g]['items'][] = [
                'item_type' => $r->t, 'item_id' => (int) $r->i, 'name' => $d['name'], 'sku' => $d['sku'], 'unit' => $d['unit'], 'url' => $d['url'],
                'opening' => ['qty' => round($oq, 4), 'value' => round($ov, 2)], 'inward' => ['qty' => round($iq, 4), 'value' => round($iv, 2)],
                'outward' => ['qty' => round($xq, 4), 'value' => round($xv, 2)], 'closing' => ['qty' => $cq, 'value' => $cv],
                'rate' => abs($cq) > 0.00005 ? round($cv / $cq, 2) : null,
                'negative' => $cq < -0.00005 || $cv < -0.005, 'no_cost' => $cq > 0.00005 && abs($cv) < 0.005,
            ];
        }
        ksort($groups, SORT_NATURAL | SORT_FLAG_CASE);
        $out = [];
        foreach ($groups as $g) {
            usort($g['items'], fn ($a, $b) => strcasecmp($a['name'], $b['name']));
            $row = ['name' => $g['name'], 'items' => $g['items'], 'opening' => $sum(), 'inward' => $sum(), 'outward' => $sum(), 'closing' => $sum(), 'negative' => false, 'no_cost' => false];
            $units = [];
            foreach ($g['items'] as $it) {
                foreach (['opening', 'inward', 'outward', 'closing'] as $k) {
                    $row[$k]['qty'] += $it[$k]['qty'];
                    $row[$k]['value'] += $it[$k]['value'];
                    $total[$k]['value'] += $it[$k]['value'];
                }
                $units[$it['unit'] ?? ''] = true;
                $row['negative'] = $row['negative'] || $it['negative'];
                $row['no_cost'] = $row['no_cost'] || $it['no_cost'];
            }
            foreach (['opening', 'inward', 'outward', 'closing'] as $k) {
                $row[$k] = ['qty' => round($row[$k]['qty'], 4), 'value' => round($row[$k]['value'], 2)];
            }
            // a group has one quantity only when all its items are counted in the same unit
            $row['unit'] = count($units) === 1 ? (array_key_first($units) ?: null) : null;
            $row['rate'] = $row['unit'] && abs($row['closing']['qty']) > 0.00005 ? round($row['closing']['value'] / $row['closing']['qty'], 2) : null;
            $row['item_count'] = count($g['items']);
            $out[] = $row;
        }
        foreach ($total as $k => $v) {
            $total[$k] = ['qty' => null, 'value' => round($v['value'], 2)];
        }

        return [
            'from' => $from, 'to' => $to, 'location_id' => $loc, 'groups' => $out, 'total' => $total,
            'item_types' => $this->typesPresent(), 'locations' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name'])->all(),
            'negative_items' => collect($out)->sum(fn ($g) => collect($g['items'])->where('negative', true)->count()),
            'no_cost_items' => collect($out)->sum(fn ($g) => collect($g['items'])->where('no_cost', true)->count()),
        ];
    }

    /** The kinds of item that have stock movements, for the report's filter. */
    private function typesPresent(): array
    {
        [$t] = $this->cols();
        $present = DB::table('stock_movements as m')->selectRaw("DISTINCT {$t} AS t")->pluck('t')->all();
        $out = [];
        foreach ($present as $type) {
            $out[] = ['type' => $type, 'label' => StockItemRegistry::get($type)?->label() ?? ucfirst(str_replace('_', ' ', $type))];
        }

        return $out;
    }

    private function itemMovements(string $type, int $id, ?int $loc)
    {
        [$t, $i] = $this->cols();

        return DB::table('stock_movements as m')->where('m.reversed', false)->whereRaw("{$t} = ?", [$type])->whereRaw("{$i} = ?", [$id])
            ->when($loc, fn ($s) => $s->where('m.location_id', $loc))
            ->when(true, fn ($s) => app(\App\Services\Access\BranchFilter::class)->apply($s, 'm.location_id', 'stock', 'reports'));
    }

    private function describeOne(string $type, int $id): array
    {
        $src = StockItemRegistry::get($type);

        return ($src ? ($src->describe([$id])[$id] ?? null) : null) ?? StockItemRegistry::unknown($type, $id);
    }

    /** One item's month-by-month movement: opening, inwards, outwards, closing for each month. */
    public function monthly(string $type, int $id, array $f): array
    {
        $to = $this->d($f['to'] ?? null, 'today');
        $from = $this->d($f['from'] ?? null, Carbon::parse($to)->startOfYear()->toDateString());
        $loc = ! empty($f['location_id']) ? (int) $f['location_id'] : null;
        $rows = $this->itemMovements($type, $id, $loc)->where('m.movement_date', '<=', $to)->orderBy('m.movement_date')
            ->get(['m.movement_date', 'm.quantity', 'm.unit_cost', 'm.movement_type']);
        $oq = 0.0; $ov = 0.0;
        $months = [];
        foreach ($rows as $r) {
            $date = Carbon::parse($r->movement_date)->toDateString();
            $qty = (float) $r->quantity; $val = $qty * (float) ($r->unit_cost ?? 0);
            if ($date < $from) {
                $oq += $qty; $ov += $val;
                continue;
            }
            if (! $loc && in_array($r->movement_type, self::TRANSFERS, true)) {
                continue;
            }
            $m = substr($date, 0, 7);
            $months[$m] ??= ['month' => $m, 'inward' => ['qty' => 0.0, 'value' => 0.0], 'outward' => ['qty' => 0.0, 'value' => 0.0]];
            $k = $qty >= 0 ? 'inward' : 'outward';
            $months[$m][$k]['qty'] += abs($qty);
            $months[$m][$k]['value'] += abs($val);
        }
        ksort($months);
        $run = ['qty' => $oq, 'value' => $ov];
        $out = [];
        foreach ($months as $m) {
            $open = $run;
            $run = ['qty' => $run['qty'] + $m['inward']['qty'] - $m['outward']['qty'], 'value' => $run['value'] + $m['inward']['value'] - $m['outward']['value']];
            $r2 = fn ($x) => ['qty' => round($x['qty'], 4), 'value' => round($x['value'], 2)];
            $out[] = ['month' => $m['month'], 'opening' => $r2($open), 'inward' => $r2($m['inward']), 'outward' => $r2($m['outward']), 'closing' => $r2($run)];
        }

        return ['item' => ['item_type' => $type, 'item_id' => $id] + $this->describeOne($type, $id), 'from' => $from, 'to' => $to, 'opening' => ['qty' => round($oq, 4), 'value' => round($ov, 2)], 'months' => $out, 'closing' => ['qty' => round($run['qty'], 4), 'value' => round($run['value'], 2)]];
    }

    /** The vouchers behind one item's movement in a period (one month when drilling in). */
    public function movements(string $type, int $id, array $f): array
    {
        $to = $this->d($f['to'] ?? null, 'today');
        $from = $this->d($f['from'] ?? null, Carbon::parse($to)->startOfYear()->toDateString());
        $loc = ! empty($f['location_id']) ? (int) $f['location_id'] : null;
        $labels = $this->movementLabels();
        $rows = $this->itemMovements($type, $id, $loc)->whereBetween('m.movement_date', [$from, $to])
            ->leftJoin('vouchers as v', 'v.id', '=', 'm.voucher_id')->leftJoin('ledgers as l', 'l.id', '=', 'v.party_ledger_id')
            ->leftJoin('locations as lo', 'lo.id', '=', 'm.location_id')->leftJoin('stock_batches as sb', 'sb.id', '=', 'm.batch_id')
            ->orderBy('m.movement_date')->orderBy('m.id')
            ->get(['m.id', 'm.movement_date', 'm.movement_type', 'm.quantity', 'm.unit_cost', 'v.id as voucher_id', 'v.voucher_number', 'v.party_name', 'l.name as ledger', 'lo.name as location', 'sb.batch_no']);

        return ['rows' => $rows->map(fn ($r) => [
            'id' => (int) $r->id, 'date' => Carbon::parse($r->movement_date)->toDateString(), 'type' => $r->movement_type, 'label' => $labels[$r->movement_type] ?? ucfirst(str_replace('_', ' ', (string) $r->movement_type)),
            'party' => $r->party_name ?: $r->ledger, 'voucher_id' => $r->voucher_id ? (int) $r->voucher_id : null, 'voucher_number' => $r->voucher_number,
            'location' => $r->location, 'batch_no' => $r->batch_no, 'quantity' => (float) $r->quantity, 'rate' => $r->unit_cost !== null ? (float) $r->unit_cost : null,
            'value' => round((float) $r->quantity * (float) ($r->unit_cost ?? 0), 2),
        ])->values()->all()];
    }

    private function movementLabels(): array
    {
        return ['sales' => 'Sale', 'cash_sale' => 'Cash sale', 'delivery_note' => 'Delivery note', 'credit_note' => 'Customer return', 'purchase' => 'Purchase', 'receipt_note' => 'Goods received',
            'debit_note' => 'Returned to supplier', 'opening_stock' => 'Opening stock', 'write_off' => 'Write-off', 'transfer_out' => 'Transfer out', 'transfer_in' => 'Transfer in',
            'count_loss' => 'Count shortage', 'count_gain' => 'Count surplus', 'production_use' => 'Used in production', 'production_out' => 'Produced', 'job_issue' => 'Issued to a job', 'job_return' => 'Returned from a job'];
    }

    /** The Stock Query card for one item. */
    public function query(string $type, int $id, array $f = []): array
    {
        $loc = ! empty($f['location_id']) ? (int) $f['location_id'] : null;
        $item = ['item_type' => $type, 'item_id' => $id] + $this->describeOne($type, $id);
        $tot = $this->itemMovements($type, $id, $loc)->selectRaw('COALESCE(SUM(m.quantity),0) q, COALESCE(SUM(m.quantity * COALESCE(m.unit_cost,0)),0) v')->first();
        $qty = round((float) $tot->q, 4);
        $val = round((float) $tot->v, 2);
        [$t, $i] = $this->cols();
        $batchTbl = StockMovement::hasItemColumns('stock_batches');
        $lastCost = DB::table('stock_batches as sb')->when($batchTbl, fn ($s) => $s->where('sb.item_type', $type)->where('sb.item_id', $id), fn ($s) => $s->where('sb.variant_id', $id))
            ->orderByDesc('sb.id')->value('sb.unit_cost');
        $cost = abs($qty) > 0.00005 ? round($val / $qty, 4) : ($lastCost !== null ? round((float) $lastCost, 4) : null);

        $party = fn ($r) => $r->party_name ?: $r->ledger;
        $base = fn (array $types, string $sign) => $this->itemMovements($type, $id, $loc)->whereIn('m.movement_type', $types)->where('m.quantity', $sign, 0)
            ->leftJoin('vouchers as v', 'v.id', '=', 'm.voucher_id')->leftJoin('ledgers as l', 'l.id', '=', 'v.party_ledger_id')
            ->orderByDesc('m.movement_date')->orderByDesc('m.id')->limit(15);
        $purchases = $base(['purchase'], '>')->get(['m.movement_date', 'm.quantity', 'm.unit_cost', 'v.id as voucher_id', 'v.voucher_number', 'v.party_name', 'l.name as ledger'])
            ->map(fn ($r) => ['date' => Carbon::parse($r->movement_date)->toDateString(), 'party' => $party($r), 'quantity' => (float) $r->quantity, 'rate' => (float) ($r->unit_cost ?? 0),
                'amount' => round((float) $r->quantity * (float) ($r->unit_cost ?? 0), 2), 'voucher_id' => $r->voucher_id ? (int) $r->voucher_id : null, 'voucher_number' => $r->voucher_number])->values()->all();
        $sales = $base(self::SALE_TYPES, '<')->get(['m.movement_date', 'm.quantity', 'm.variant_id', 'v.id as voucher_id', 'v.voucher_number', 'v.exchange_rate', 'v.party_name', 'l.name as ledger'])
            ->map(function ($r) {
                $qty = abs((float) $r->quantity);
                // what it was sold for, in the base currency, from the invoice's own line (product lines only)
                $amount = $r->variant_id && $r->voucher_id
                    ? (float) DB::table('voucher_items')->where('voucher_id', $r->voucher_id)->where('variant_id', $r->variant_id)->sum('amount') * (float) ($r->exchange_rate ?: 1)
                    : null;

                return ['date' => Carbon::parse($r->movement_date)->toDateString(), 'party' => $r->party_name ?: $r->ledger, 'quantity' => $qty, 'rate' => $amount !== null && $qty > 0 ? round($amount / $qty, 2) : null,
                    'amount' => $amount !== null ? round($amount, 2) : null, 'voucher_id' => $r->voucher_id ? (int) $r->voucher_id : null, 'voucher_number' => $r->voucher_number];
            })->values()->all();

        $places = DB::table('stock_batch_balances as b')->join('stock_batches as sb', 'sb.id', '=', 'b.batch_id')->join('locations as lo', 'lo.id', '=', 'b.location_id')
            ->when($batchTbl, fn ($s) => $s->where('sb.item_type', $type)->where('sb.item_id', $id), fn ($s) => $s->where('sb.variant_id', $id))
            ->when($loc, fn ($s) => $s->where('b.location_id', $loc))->when(true, fn ($s) => app(\App\Services\Access\BranchFilter::class)->apply($s, 'b.location_id', 'stock', 'reports'))->where('b.quantity', '!=', 0)->orderBy('lo.name')->orderBy('sb.received_at')
            ->get(['lo.name as location', 'sb.batch_no', 'sb.expiry_date', 'sb.status', 'b.quantity'])
            ->map(fn ($r) => ['location' => $r->location, 'batch_no' => $r->batch_no, 'expiry_date' => $r->expiry_date ? Carbon::parse($r->expiry_date)->toDateString() : null, 'status' => $r->status, 'quantity' => (float) $r->quantity])->values()->all();

        $same = [];
        if ($item['group']) {
            $all = $this->summary(['to' => Carbon::today()->toDateString(), 'from' => Carbon::today()->toDateString(), 'item_type' => $type, 'location_id' => $loc]);
            foreach ($all['groups'] as $g) {
                if ($g['name'] === $item['group']) {
                    foreach ($g['items'] as $it) {
                        if ($it['item_id'] !== $id) {
                            $src = StockItemRegistry::get($type);
                            $same[] = ['item_type' => $type, 'item_id' => $it['item_id'], 'name' => $it['name'], 'quantity' => $it['closing']['qty'], 'unit' => $it['unit'], 'cost' => $it['rate'],
                                'sale_price' => ($src?->describe([$it['item_id']])[$it['item_id']]['sale_price'] ?? null)];
                        }
                    }
                }
            }
            $same = array_slice($same, 0, 40);
        }

        $costing = app(StockPolicy::class)->costingMethod() === 'average' ? 'Average cost' : 'Lot cost (each batch keeps its own)';
        $lastBuy = $purchases[0] ?? null;
        $lastSale = $sales[0] ?? null;

        return [
            'item' => $item, 'closing' => ['qty' => $qty, 'value' => $val], 'cost_price' => $cost, 'costing_method' => $costing, 'sale_price' => $item['sale_price'],
            'negative' => $qty < -0.00005, 'no_cost' => $qty > 0.00005 && abs($val) < 0.005,
            'last_purchase' => $lastBuy, 'last_sale' => $lastSale, 'purchases' => $purchases, 'sales' => $sales, 'places' => $places, 'same_group' => $same,
            'location_id' => $loc,
        ];
    }

    /** The dashboard's Stock tab: what stock is worth, how it moved month by month, where the value sits, and what needs a look. */
    public function dashboard(array $f): array
    {
        $sum = $this->summary($f);
        $from = $sum['from'];
        $to = $sum['to'];
        $loc = $sum['location_id'];
        $items = collect($sum['groups'])->flatMap(fn ($g) => $g['items']);

        // month by month: stock in, stock out and what the stock was worth at each month end
        [$t] = $this->cols();
        $skip = $loc ? '' : "AND m.movement_type NOT IN ('transfer_in','transfer_out')";
        $rows = DB::table('stock_movements as m')->where('m.reversed', false)->where('m.movement_date', '<=', $to)->when($loc, fn ($q) => $q->where('m.location_id', $loc))->when(true, fn ($q) => app(\App\Services\Access\BranchFilter::class)->apply($q, 'm.location_id', 'stock', 'reports'))
            ->when(! empty($f['item_type']), fn ($q) => $q->whereRaw("{$t} = ?", [$f['item_type']]))
            ->get(['m.movement_date', 'm.quantity', 'm.unit_cost', 'm.movement_type']);
        $open = 0.0;
        $by = [];
        foreach ($rows as $r) {
            $date = Carbon::parse($r->movement_date)->toDateString();
            $isTransfer = in_array($r->movement_type, self::TRANSFERS, true);
            $val = (float) $r->quantity * (float) ($r->unit_cost ?? 0);
            if ($date < $from) {
                $open += $isTransfer && ! $loc ? 0 : $val;
                continue;
            }
            if ($isTransfer && ! $loc) {
                continue;
            }
            $m = substr($date, 0, 7);
            $by[$m] ??= ['in' => 0.0, 'out' => 0.0];
            $by[$m][$val >= 0 ? 'in' : 'out'] += abs($val);
        }
        $points = ['in' => [], 'out' => [], 'closing' => []];
        $cursor = Carbon::parse($from)->startOfMonth();
        $run = $open;
        while ($cursor->lte(Carbon::parse($to))) {
            $m = $cursor->format('Y-m');
            $run += ($by[$m]['in'] ?? 0) - ($by[$m]['out'] ?? 0);
            $label = $cursor->format('M y');
            $points['in'][] = ['label' => $label, 'value' => round($by[$m]['in'] ?? 0, 2)];
            $points['out'][] = ['label' => $label, 'value' => round($by[$m]['out'] ?? 0, 2)];
            $points['closing'][] = ['label' => $label, 'value' => round($run, 2)];
            $cursor->addMonth();
        }

        // what the movement was made of: purchases, sales, write-offs, counts…
        $labels = $this->movementLabels();
        $kinds = DB::table('stock_movements as m')->where('m.reversed', false)->whereBetween('m.movement_date', [$from, $to])->when($loc, fn ($q) => $q->where('m.location_id', $loc))->when(true, fn ($q) => app(\App\Services\Access\BranchFilter::class)->apply($q, 'm.location_id', 'stock', 'reports'))
            ->when(! $loc, fn ($q) => $q->whereNotIn('m.movement_type', self::TRANSFERS))
            ->when(! empty($f['item_type']), fn ($q) => $q->whereRaw("{$t} = ?", [$f['item_type']]))
            ->groupBy('m.movement_type')->selectRaw('m.movement_type AS k, SUM(m.quantity) AS q, SUM(m.quantity * COALESCE(m.unit_cost,0)) AS v, COUNT(*) AS n')->get()
            ->map(fn ($r) => ['label' => $labels[$r->k] ?? ucfirst(str_replace('_', ' ', (string) $r->k)), 'movements' => (int) $r->n, 'quantity' => round((float) $r->q, 4), 'value' => round((float) $r->v, 2)])
            ->sortByDesc(fn ($r) => abs($r['value']))->values()->all();

        $attention = $items->filter(fn ($i) => $i['negative'] || $i['no_cost'])->map(fn ($i) => ['item' => $i['name'], 'issue' => $i['negative'] ? 'Below zero' : 'No cost', 'quantity' => $i['closing']['qty'], 'unit' => $i['unit']])->take(12)->values()->all();

        return [
            'from' => $from, 'to' => $to, 'location_id' => $loc, 'locations' => $sum['locations'],
            'totals' => ['opening' => $sum['total']['opening']['value'], 'inward' => $sum['total']['inward']['value'], 'outward' => $sum['total']['outward']['value'], 'closing' => $sum['total']['closing']['value']],
            'counts' => ['items' => $items->count(), 'in_stock' => $items->where('closing.qty', '>', 0)->count(), 'negative' => $sum['negative_items'], 'no_cost' => $sum['no_cost_items']],
            'trend' => [['name' => 'Stock in', 'points' => $points['in']], ['name' => 'Stock out', 'points' => $points['out']], ['name' => 'Stock value', 'points' => $points['closing']]],
            'groups' => collect($sum['groups'])->map(fn ($g) => ['name' => $g['name'], 'value' => $g['closing']['value'], 'items' => $g['item_count']])->sortByDesc('value')->take(10)->values()->all(),
            'top_items' => $items->sortByDesc(fn ($i) => $i['closing']['value'])->take(10)->map(fn ($i) => ['item' => $i['name'], 'quantity' => $i['closing']['qty'], 'unit' => $i['unit'], 'value' => $i['closing']['value']])->values()->all(),
            'kinds' => $kinds, 'attention' => $attention,
        ];
    }
}

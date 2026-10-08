<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Figures for the dashboard tabs (sales, purchases, pending documents, funnels), all in today's base currency.
 * Everything is read from posted vouchers and the existing report services; nothing is written.
 */
class DashboardService
{
    public function __construct(private BooksReportService $reports, private LedgerService $ledgers) {}

    /** Sales / purchases base types and how each counts towards the trend. */
    private const SIDES = [
        'sales' => ['plus' => ['sales', 'cash_sale'], 'minus' => ['credit_note'], 'order' => 'sales_order', 'note' => 'delivery_note', 'ageing' => 'receivables', 'move' => 'outwards'],
        'purchases' => ['plus' => ['purchase'], 'minus' => ['debit_note'], 'order' => 'purchase_order', 'note' => 'receipt_note', 'ageing' => 'payables', 'move' => 'inwards'],
    ];

    private function range(?string $from, ?string $to): array
    {
        $to = $to ?: today()->toDateString();
        $from = $from ?: Carbon::parse($to)->startOfYear()->toDateString();

        return [$from, $to];
    }

    /** Posted vouchers of some base types in a range: [date, base type, total in today's base], optionally for one branch. */
    private function vouchers(array $types, string $from, string $to, ?int $locationId = null)
    {
        return RestatedBase::join(DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id'))
            ->where('v.status', Voucher::POSTED)->whereIn('t.base_type', $types)->whereBetween('v.date', [$from, $to])
            ->when($locationId, fn ($q) => $q->where('v.location_id', $locationId))
            ->when(true, fn ($q) => app(\App\Services\Access\BranchFilter::class)->apply($q, 'v.location_id', 'books', 'dashboard'));
    }

    /** @return array<int, array{month: string, label: string, value: float}> one point per month of the range */
    private function months(string $from, string $to, array $byDate): array
    {
        $out = [];
        for ($d = Carbon::parse($from)->startOfMonth(); $d->lte(Carbon::parse($to)); $d->addMonth()) {
            $out[$d->format('Y-m')] = ['month' => $d->format('Y-m'), 'label' => $d->format('M-y'), 'value' => 0.0];
        }
        foreach ($byDate as $date => $v) {
            $k = substr((string) $date, 0, 7);
            if (isset($out[$k])) {
                $out[$k]['value'] = round($out[$k]['value'] + $v, 2);
            }
        }

        return array_values($out);
    }

    private function dailyTotals(array $plus, array $minus, string $from, string $to, ?int $loc): array
    {
        $tot = RestatedBase::total();
        $rows = $this->vouchers(array_merge($plus, $minus), $from, $to, $loc)->groupBy('v.date', 't.base_type')
            ->selectRaw("v.date as d, t.base_type as b, SUM({$tot}) as s")->get();
        $out = [];
        foreach ($rows as $r) {
            $out[$r->d] = ($out[$r->d] ?? 0) + (in_array($r->b, $minus, true) ? -1 : 1) * (float) $r->s;
        }

        return $out;
    }

    public function side(string $side, ?string $from, ?string $to, ?int $loc): array
    {
        [$from, $to] = $this->range($from, $to);
        $c = self::SIDES[$side];
        $pl = $this->reports->profitLoss($from, $to);
        $direct = $side === 'sales' ? 'income_direct' : 'expense_direct';
        $indirect = $side === 'sales' ? 'income_indirect' : 'expense_indirect';
        $register = array_sum($this->dailyTotals($c['plus'], $c['minus'], $from, $to, $loc));

        // group trend: the top few ledgers of the trading group, month by month
        $top = collect($pl['sections'][$direct])->sortByDesc('amount')->take(4)->values();
        $series = [];
        if ($top->isNotEmpty()) {
            $sideCol = $side === 'sales' ? 'C' : 'D';
            $b = RestatedBase::entry();
            $rows = RestatedBase::join(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id'))
                ->where('v.status', Voucher::POSTED)->whereBetween('v.date', [$from, $to])->whereIn('e.ledger_id', $top->pluck('ledger_id')->all())
                ->when($loc, fn ($q) => $q->where('v.location_id', $loc))
                ->when(true, fn ($q) => app(\App\Services\Access\BranchFilter::class)->apply($q, 'v.location_id', 'books', 'dashboard'))->groupBy('e.ledger_id', 'v.date')
                ->selectRaw("e.ledger_id as l, v.date as d, SUM(CASE WHEN e.side = '{$sideCol}' THEN {$b} ELSE -{$b} END) as s")->get();
            foreach ($top as $l) {
                $by = [];
                foreach ($rows->where('l', $l['ledger_id']) as $r) {
                    $by[$r->d] = ($by[$r->d] ?? 0) + (float) $r->s;
                }
                $series[] = ['ledger' => $l['ledger'], 'points' => $this->months($from, $to, $by)];
            }
        }

        $ageing = $this->reports->ageing($c['ageing'], $to);
        $open = (float) $ageing['totals']['total'];
        $days = max(1, Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1);
        $s = AccountingSetting::current();
        $cogs = $s->cogs_ledger_id ? $this->ledgers->balance((int) $s->cogs_ledger_id, $to) - $this->ledgers->balance((int) $s->cogs_ledger_id, Carbon::parse($from)->subDay()->toDateString()) : 0.0;
        $stock = $s->stock_ledger_id ? $this->ledgers->balance((int) $s->stock_ledger_id, $to) : 0.0;
        $turnover = $side === 'sales' ? [
            ['label' => 'Inventory turnover', 'value' => $stock > 0 ? round($cogs / $stock, 2) : null, 'unit' => ''],
            ['label' => 'Receivable turnover in days', 'value' => $register > 0 ? round($open / $register * $days, 2) : null, 'unit' => 'days'],
        ] : [
            ['label' => 'Payable turnover in days', 'value' => $register > 0 ? round($open / $register * $days, 2) : null, 'unit' => 'days'],
        ];

        return [
            'from' => $from, 'to' => $to, 'side' => $side, 'restated_vouchers' => RestatedBase::restatedCount(),
            'trend' => $this->months($from, $to, $this->dailyTotals($c['plus'], $c['minus'], $from, $to, $loc)),
            'group_trend' => $series,
            'trading' => [
                ['label' => $side === 'sales' ? 'Sales accounts' : 'Purchase accounts', 'value' => $pl['totals'][$side === 'sales' ? 'direct_income' : 'direct_expense']],
                ['label' => $side === 'sales' ? 'Sales amount - sales register' : 'Purchase amount - purchase register', 'value' => round($register, 2)],
                ['label' => 'Gross profit', 'value' => $pl['totals']['gross_profit']],
                ['label' => $side === 'sales' ? 'Indirect incomes' : 'Indirect expenses', 'value' => $pl['totals'][$side === 'sales' ? 'indirect_income' : 'indirect_expense']],
            ],
            'cash_bank' => $this->cashBank($to),
            'top_orders' => $this->topPendingOrders($c['order'], $loc),
            'top_items' => $this->topItems($c['plus'], $c['minus'], $from, $to, $loc),
            'top_items_label' => $c['move'],
            'open' => ['label' => ucfirst($c['ageing']), 'total' => $open, 'overdue' => round($open - (float) $ageing['totals']['current'], 2)],
            'ratios' => $turnover,
        ];
    }

    private function cashBank(string $to): array
    {
        $out = [];
        foreach (['Cash-in-hand' => 'Cash-in-hand', 'Bank Accounts' => 'Bank accounts'] as $name => $label) {
            $g = LedgerGroup::where('name', $name)->first();
            $ids = $g ? Ledger::whereIn('group_id', $g->selfAndDescendantIds())->pluck('id') : collect();
            $out[] = ['label' => $label, 'value' => round($ids->sum(fn ($id) => $this->ledgers->balance((int) $id, $to)), 2)];
        }

        return $out;
    }

    /** What is still to be billed on open orders or notes, by item: ordered less invoiced, with its tax (the amount a bill will carry). */
    private function pendingOrderLines(string $orderBase, ?int $loc)
    {
        $rate = RestatedBase::rate();

        return RestatedBase::join(DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id'))
            ->where('v.status', Voucher::POSTED)->where('t.base_type', $orderBase)->where('i.is_header', false)->whereNull('i.parent_item_id')
            ->whereRaw('i.quantity > COALESCE(i.invoiced_quantity, 0)')
            ->when($loc, fn ($q) => $q->where('v.location_id', $loc))
            ->when(true, fn ($q) => app(\App\Services\Access\BranchFilter::class)->apply($q, 'v.location_id', 'books', 'dashboard'))
            ->selectRaw("v.id as vid, i.description as item, (i.quantity - COALESCE(i.invoiced_quantity, 0)) as pending, "
                . "(i.quantity - COALESCE(i.invoiced_quantity, 0)) * ((i.amount + COALESCE(i.tax_amount, 0)) / NULLIF(i.quantity, 0)) * {$rate} as value");
    }

    private function topPendingOrders(string $orderBase, ?int $loc): array
    {
        return $this->pendingOrderLines($orderBase, $loc)->get()->groupBy('item')
            ->map(fn ($g, $item) => ['item' => $item, 'quantity' => round($g->sum('pending'), 2)])
            ->sortByDesc('quantity')->take(5)->values()->all();
    }

    private function topItems(array $plus, array $minus, string $from, string $to, ?int $loc): array
    {
        $rate = RestatedBase::rate();
        $rows = $this->vouchers(array_merge($plus, $minus), $from, $to, $loc)->join('voucher_items as i', 'i.voucher_id', '=', 'v.id')
            ->where('i.is_header', false)->whereNull('i.gift_meta')->groupBy('i.description', 't.base_type')
            ->selectRaw("i.description as item, t.base_type as b, SUM(i.amount * {$rate}) as value")->get();
        $by = [];
        foreach ($rows as $r) {
            $by[$r->item] = ($by[$r->item] ?? 0) + (in_array($r->b, $minus, true) ? -1 : 1) * (float) $r->value;
        }
        arsort($by);

        return array_map(fn ($k, $v) => ['item' => $k, 'value' => round($v, 2)], array_slice(array_keys($by), 0, 5), array_slice(array_values($by), 0, 5));
    }

    /** Documents that are still open: orders not yet billed, notes not yet invoiced, bills not yet paid. */
    public function pending(?int $loc): array
    {
        $orders = [];
        foreach (['purchase_order' => 'Purchase orders', 'sales_order' => 'Sales orders'] as $base => $label) {
            $rows = $this->pendingOrderLines($base, $loc)->get();
            $orders[] = ['key' => $base, 'label' => $label, 'count' => $rows->pluck('vid')->unique()->count(), 'amount' => round($rows->sum('value'), 2)];
        }
        // delivery / receipt notes are judged like orders: what is still not invoiced, line by line (the same test as the "Open" badge on the voucher)
        $notes = [];
        foreach (['receipt_note' => 'Goods received but bills not received', 'delivery_note' => 'Goods delivered but bills not made'] as $base => $label) {
            $rows = $this->pendingOrderLines($base, $loc)->get();
            $notes[] = ['key' => $base, 'label' => $label, 'count' => $rows->pluck('vid')->unique()->count(), 'amount' => round($rows->sum('value'), 2)];
        }
        $out = [];
        foreach (['receivables' => 'Net pending receivables', 'payables' => 'Net pending payables'] as $kind => $label) {
            $a = $this->reports->ageing($kind, today()->toDateString());
            $out[] = ['key' => $kind, 'label' => $label, 'count' => array_sum(array_map(fn ($r) => count($r['bills']), $a['rows'])), 'amount' => (float) $a['totals']['total'], 'side' => $kind === 'receivables' ? 'Dr' : 'Cr'];
        }

        return ['restated_vouchers' => RestatedBase::restatedCount(), 'orders' => $orders, 'notes' => $notes, 'outstanding' => $out];
    }

    /**
     * How far documents travel. Each funnel starts from every document of its first type in the range; a later stage counts
     * the starters that have reached it — a document made from them (or from what they became), or a receipt / payment against it.
     */
    private const FUNNELS = [
        'quote' => ['title' => 'Quotations to sales orders and invoices', 'stages' => [
            ['Quotations', ['quotation']], ['Priced and sent', ['quotation'], 'priced'], ['Sales order created', ['sales_order']], ['Invoiced or cash sale', ['sales', 'cash_sale']], ['Paid', ['receipt', 'cash_sale']]]],
        'order' => ['title' => 'Sales orders to receipts', 'stages' => [
            ['Sales orders', ['sales_order']], ['Delivered', ['delivery_note']], ['Invoiced or cash sale', ['sales', 'cash_sale']], ['Receipt received', ['receipt', 'cash_sale']]]],
        'dnote' => ['title' => 'Delivery notes to invoices', 'stages' => [
            ['Delivery notes', ['delivery_note']], ['Invoiced or cash sale', ['sales', 'cash_sale']], ['Receipt received', ['receipt', 'cash_sale']], ['Credit note raised', ['credit_note']]]],
        'purchase' => ['title' => 'Purchase orders to payment', 'stages' => [
            ['Purchase orders', ['purchase_order']], ['Goods received', ['receipt_note']], ['Billed', ['purchase']], ['Paid', ['payment']]]],
    ];

    public function funnels(?string $from, ?string $to, ?int $loc): array
    {
        [$from, $to] = $this->range($from, $to);
        $tot = RestatedBase::total();
        $out = [];
        foreach (self::FUNNELS as $key => $f) {
            $roots = $this->vouchers($f['stages'][0][1], $from, $to, $loc)
                ->selectRaw("v.id as id, v.sent_at as sent_at, {$tot} as total")->get()->keyBy('id');
            $reach = $this->reach($roots->keys()->map(fn ($x) => (int) $x)->all());   // root id → base types reached below it
            $stages = [];
            foreach ($f['stages'] as $i => $st) {
                [$label, $types] = $st;
                $special = $st[2] ?? null;
                $ids = $roots->filter(function ($r) use ($i, $types, $special, $reach) {
                    if ($i === 0) {
                        return true;
                    }
                    if ($special === 'priced') {
                        return $r->sent_at !== null;
                    }

                    return (bool) array_intersect($types, $reach[$r->id] ?? []);
                });
                $stages[] = ['label' => $label, 'count' => $ids->count(), 'value' => round($ids->sum('total'), 2)];
            }
            $first = max(1, $stages[0]['count']);
            foreach ($stages as $i => &$s) {
                $s['percent'] = round($s['count'] / $first * 100, 1);
                $s['dropped'] = $i === 0 ? 0 : $stages[$i - 1]['count'] - $s['count'];
            }
            unset($s);
            $out[] = ['key' => $key, 'title' => $f['title'], 'stages' => $stages];
        }

        return ['from' => $from, 'to' => $to, 'restated_vouchers' => RestatedBase::restatedCount(), 'funnels' => $out];
    }

    /** For each starting voucher, the base types of everything made from it, level by level (documents made from documents; receipts and payments against bills). */
    private function reach(array $rootIds): array
    {
        $reach = [];
        $frontier = array_fill_keys($rootIds, null);   // node → root
        foreach ($rootIds as $id) {
            $frontier[$id] = $id;
        }
        $seen = array_fill_keys($rootIds, true);
        for ($level = 0; $level < 6 && $frontier; $level++) {
            $next = [];
            foreach (array_chunk(array_keys($frontier), 500) as $chunk) {
                $kids = DB::table('vouchers as c')->join('voucher_types as t', 't.id', '=', 'c.voucher_type_id')->whereIn('c.source_voucher_id', $chunk)
                    ->where('c.status', Voucher::POSTED)->get(['c.id', 'c.source_voucher_id as parent', 't.base_type']);
                $paid = DB::table('voucher_bill_refs as b')->join('vouchers as c', 'c.id', '=', 'b.voucher_id')->join('voucher_types as t', 't.id', '=', 'c.voucher_type_id')
                    ->where('b.ref_type', 'against')->whereIn('b.against_voucher_id', $chunk)->where('c.status', Voucher::POSTED)
                    ->get(['c.id', 'b.against_voucher_id as parent', 't.base_type']);
                foreach ($kids->concat($paid) as $k) {
                    $root = $frontier[$k->parent] ?? null;
                    if ($root === null) {
                        continue;
                    }
                    $reach[$root][$k->base_type] = $k->base_type;
                    if (! isset($seen[$k->id])) {
                        $seen[$k->id] = true;
                        $next[$k->id] = $root;
                    }
                }
            }
            $frontier = $next;
        }

        return array_map('array_values', $reach);
    }
}

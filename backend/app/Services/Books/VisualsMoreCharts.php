<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Services\Books\Engine\Figures;
use App\Services\Books\Engine\Reports\MoneyFlowReport;
use App\Services\Books\Engine\Reports\ProfitLossReport;
use App\Services\Books\Engine\Reports\TaxReturnReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The second wave of Visual report charts (docs/BOOKS_REPORTS_PLAN.md, section 11): scorecard, sales and margins over time, what sells, who the sales depend on, collection
 * speed, tax charged against paid, stock value and turnover, what is due, and reconciliation by area. Every figure comes from the engine's own pieces (LedgerBalances,
 * the P&L, the ageing, the tax return), and one that needs a setting nobody has chosen says so instead of guessing.
 */
trait VisualsMoreCharts
{
    /** @var array<string, array> */
    private array $plCache = [];

    /** Every month in a period as 'YYYY-MM', first to last. @return string[] */
    private function monthKeys(string $from, string $to): array
    {
        $out = [];
        for ($d = Carbon::parse($from)->startOfMonth(); $d->lte(Carbon::parse($to)); $d->addMonth()) {
            $out[] = $d->format('Y-m');
        }

        return $out;
    }

    /** The profit and loss for a period, run once: its totals and the ledgers behind each section. */
    private function pl(Scope $scope, string $from, string $to): array
    {
        return $this->plCache["{$from}|{$to}|" . json_encode([$scope->costCentreIds, $scope->locationId])] ??= app(ProfitLossReport::class)->run($scope->between($from, $to), []);
    }

    /** @return int[] the ledgers of one P&L section (income_direct, expense_direct, income_indirect, expense_indirect) */
    private function sectionIds(array $pl, array $sections): array
    {
        $ids = [];
        foreach ($sections as $s) {
            $ids = array_merge($ids, array_column($pl['sections'][$s] ?? [], 'ledger_id'));
        }

        return array_values(array_unique(array_map('intval', $ids)));
    }

    /**
     * What a set of ledgers moved in each month, one way: 'credit' is credits less debits (income), 'debit' debits less credits (expense).
     *
     * @param  int[]  $ids
     * @return array<string, float> by 'YYYY-MM', every month of the period
     */
    private function monthly(Scope $scope, string $from, string $to, array $ids, string $side): array
    {
        $out = array_fill_keys($this->monthKeys($from, $to), 0.0);
        if (! $ids) {
            return $out;
        }
        foreach ($this->b->movementByMonth($scope, $from, $to, $ids) as $byMonth) {
            foreach ($byMonth as $ym => $m) {
                if (isset($out[$ym])) {
                    $out[$ym] += $side === 'credit' ? $m['cr'] - $m['dr'] : $m['dr'] - $m['cr'];
                }
            }
        }

        return array_map(fn ($v) => round($v, 2), $out);
    }

    /**
     * A set of ledgers' balance at the end of each month (debit positive): what they held the day before the period, plus each month's movement.
     *
     * @param  int[]  $ids
     * @return array<string, float>
     */
    private function monthEnd(Scope $scope, string $from, string $to, array $ids): array
    {
        $whole = Scope::dates(null, null, $scope->area);
        $run = $scope->dimensional() ? 0.0 : array_sum(array_map(fn ($id) => $this->b->balance($id, Carbon::parse($from)->subDay()->toDateString(), $whole), $ids));
        $out = [];
        $mv = $ids ? $this->b->movementByMonth($scope, $from, $to, $ids) : [];
        foreach ($this->monthKeys($from, $to) as $ym) {
            foreach ($ids as $id) {
                $run += ($mv[$id][$ym]['dr'] ?? 0) - ($mv[$id][$ym]['cr'] ?? 0);
            }
            $out[$ym] = round($run, 2);
        }

        return $out;
    }

    private function settingIds(string $input): ?array
    {
        return ReportSettings::ready() ? app(ReportSettings::class)->ratioLedgerIds($input) : null;
    }

    /** Revenue, profit, cash, receivables and payables for the period, each with a month by month line. */
    private function chartScorecard(Scope $scope, string $from, string $to): array
    {
        $pl = $this->pl($scope, $from, $to);
        if (empty($pl['ready'])) {
            throw new \RuntimeException($pl['message'] ?? 'The statements are not set up.');
        }
        $months = $this->monthKeys($from, $to);
        $income = $this->monthly($scope, $from, $to, $this->sectionIds($pl, ['income_direct', 'income_indirect']), 'credit');
        $expense = $this->monthly($scope, $from, $to, $this->sectionIds($pl, ['expense_direct', 'expense_indirect']), 'debit');
        $revenue = $this->monthly($scope, $from, $to, $this->sectionIds($pl, ['income_direct']), 'credit');
        $cashIds = app(MoneyFlowReport::class)->moneyLedgerIds();
        $cash = $this->monthEnd($scope, $from, $to, $cashIds);
        $cards = [
            ['key' => 'revenue', 'label' => 'Revenue', 'value' => $pl['totals']['direct_income'], 'series' => array_values($revenue), 'good' => 'up'],
            ['key' => 'profit', 'label' => 'Net profit', 'value' => $pl['totals']['net_profit'], 'series' => array_values(array_map(fn ($m) => round($income[$m] - $expense[$m], 2), $months)), 'good' => 'up'],
            ['key' => 'cash', 'label' => 'Cash and bank', 'value' => end($cash) ?: 0.0, 'series' => array_values($cash), 'good' => 'up'],
        ];
        foreach (['debtors' => ['receivables', 'Customers owe us', 1, 'down'], 'creditors' => ['payables', 'We owe suppliers', -1, 'down']] as $input => [$key, $label, $sign, $good]) {
            $ids = $this->settingIds($input);
            if ($ids === null) {
                $cards[] = ['key' => $key, 'label' => $label, 'value' => null, 'series' => [], 'good' => $good, 'note' => 'Not set up: choose the group in Reports settings → Ratio analysis inputs.'];
                continue;
            }
            $series = array_map(fn ($v) => round($sign * $v, 2), $this->monthEnd($scope, $from, $to, $ids));
            $cards[] = ['key' => $key, 'label' => $label, 'value' => end($series) ?: 0.0, 'series' => array_values($series), 'good' => $good];
        }

        return ['cards' => $cards, 'months' => $months];
    }

    /** Revenue by month (for setting this period's against another's). */
    private function chartSalesYear(Scope $scope, string $from, string $to): array
    {
        $pl = $this->pl($scope, $from, $to);
        $m = $this->monthly($scope, $from, $to, $this->sectionIds($pl, ['income_direct']), 'credit');

        return ['months' => array_map(fn ($ym) => ['month' => $ym, 'revenue' => $m[$ym]], array_keys($m)), 'total' => round(array_sum($m), 2)];
    }

    /** The lines sold in the period: products and kitchen stock, by name. */
    private function chartTopItems(Scope $scope, string $from, string $to): array
    {
        if (! Schema::hasTable('voucher_items')) {
            throw new \RuntimeException('There are no voucher lines yet.');
        }
        $rate = RestatedBase::rate();
        $rows = $this->vouchers($scope, $from, $to, ['sales', 'cash_sale', 'credit_note'])->join('voucher_items as i', 'i.voucher_id', '=', 'v.id')
            ->where('i.is_header', false)->where('i.item_type', '!=', 'charge')
            ->selectRaw("COALESCE(NULLIF(i.description, ''), 'Unnamed item') as item_name, SUM(CASE WHEN t.base_type = 'credit_note' THEN -1 ELSE 1 END * i.amount * {$rate}) as value, SUM(CASE WHEN t.base_type = 'credit_note' THEN -1 ELSE 1 END * i.quantity) as qty")
            ->groupByRaw("COALESCE(NULLIF(i.description, ''), 'Unnamed item')")->orderByDesc('value')->limit(10)->get();

        return ['rows' => $rows->map(fn ($r) => ['name' => $r->item_name, 'value' => round((float) $r->value, 2), 'qty' => round((float) $r->qty, 2)])->all()];
    }

    /** How much of the sales the biggest customers make up. */
    private function chartConcentration(Scope $scope, string $from, string $to): array
    {
        $rows = $this->vouchers($scope, $from, $to, ['sales', 'cash_sale'])->leftJoin('ledgers as l', 'l.id', '=', 'v.party_ledger_id')
            ->selectRaw('COALESCE(l.name, ?) as party, SUM(' . RestatedBase::total() . ') as total', ['Walk-in / cash customers'])->groupBy('party')->orderByDesc('total')->get();
        $total = (float) $rows->sum('total');
        $run = 0.0;
        $out = [];
        foreach ($rows->take(10) as $i => $r) {
            $run += (float) $r->total;
            $out[] = ['rank' => $i + 1, 'name' => $r->party, 'value' => round((float) $r->total, 2), 'share' => $total > 0 ? round($r->total / $total * 100, 1) : 0.0, 'cumulative' => $total > 0 ? round($run / $total * 100, 1) : 0.0];
        }
        $share = fn (int $n) => $total > 0 ? round($rows->take($n)->sum('total') / $total * 100, 1) : 0.0;

        return ['rows' => $out, 'total' => round($total, 2), 'customers' => $rows->count(), 'top1' => $share(1), 'top5' => $share(5), 'top10' => $share(10)];
    }

    /** Gross and net profit as a share of revenue, month by month. */
    private function chartMargins(Scope $scope, string $from, string $to): array
    {
        $pl = $this->pl($scope, $from, $to);
        $dir = $this->monthly($scope, $from, $to, $this->sectionIds($pl, ['income_direct']), 'credit');
        $cost = $this->monthly($scope, $from, $to, $this->sectionIds($pl, ['expense_direct']), 'debit');
        $other = $this->monthly($scope, $from, $to, $this->sectionIds($pl, ['income_indirect']), 'credit');
        $exp = $this->monthly($scope, $from, $to, $this->sectionIds($pl, ['expense_indirect']), 'debit');
        $rows = [];
        foreach (array_keys($dir) as $ym) {
            $rev = $dir[$ym];
            $rows[] = ['month' => $ym, 'revenue' => $rev, 'gross_pct' => $rev > 0.005 ? round(($rev - $cost[$ym]) / $rev * 100, 1) : null, 'net_pct' => $rev > 0.005 ? round(($rev - $cost[$ym] + $other[$ym] - $exp[$ym]) / $rev * 100, 1) : null];
        }

        return ['months' => $rows, 'gross_pct' => $pl['margins']['gross']['total'] ?? null, 'net_pct' => $pl['margins']['net']['total'] ?? null];
    }

    /** Expenses by group, stacked by month: the six biggest groups and the rest together. */
    private function chartExpensesStacked(Scope $scope, string $from, string $to): array
    {
        $ledgers = array_filter($this->b->ledgers(), fn ($l) => $l->nature === 'expense');
        $mv = $this->b->movementByMonth($scope, $from, $to, array_map(fn ($l) => (int) $l->id, $ledgers) ?: [0]);
        $by = [];
        foreach ($ledgers as $l) {
            foreach ($mv[$l->id] ?? [] as $ym => $m) {
                $by[$l->group_name][$ym] = ($by[$l->group_name][$ym] ?? 0) + $m['dr'] - $m['cr'];
            }
        }
        $totals = array_map('array_sum', $by);
        arsort($totals);
        $groups = array_slice(array_keys($totals), 0, 6);
        $rows = [];
        foreach ($this->monthKeys($from, $to) as $ym) {
            $row = ['month' => $ym];
            $rest = 0.0;
            foreach ($by as $g => $months) {
                if (in_array($g, $groups, true)) {
                    $row[$g] = round($months[$ym] ?? 0, 2);
                } else {
                    $rest += $months[$ym] ?? 0;
                }
            }
            if (count($by) > count($groups)) {
                $row['Everything else'] = round($rest, 2);
            }
            $rows[] = $row;
        }

        return ['groups' => count($by) > count($groups) ? array_merge($groups, ['Everything else']) : $groups, 'months' => $rows];
    }

    /** How many days of sales customers owe at the end of each month: the receivables balance over that month's revenue, times the days in it. */
    private function chartCollection(Scope $scope, string $from, string $to): array
    {
        $ids = $this->settingIds('debtors');
        if ($ids === null) {
            throw new \RuntimeException('Choose the Debtors group in Reports settings → Ratio analysis inputs.');
        }
        $pl = $this->pl($scope, $from, $to);
        $rev = $this->monthly($scope, $from, $to, $this->sectionIds($pl, ['income_direct']), 'credit');
        $owed = $this->monthEnd($scope, $from, $to, $ids);
        $rows = [];
        foreach ($rev as $ym => $r) {
            $days = Carbon::parse("{$ym}-01")->daysInMonth;
            $rows[] = ['month' => $ym, 'owed' => $owed[$ym], 'revenue' => $r, 'days' => $r > 0.005 ? round($owed[$ym] / $r * $days, 1) : null];
        }
        $valid = array_values(array_filter(array_column($rows, 'days'), fn ($v) => $v !== null));

        return ['months' => $rows, 'average' => $valid ? round(array_sum($valid) / count($valid), 1) : null];
    }

    /** Tax charged on sales against tax paid on purchases, month by month, from the tax return itself. */
    private function chartVatFlow(Scope $scope, string $from, string $to): array
    {
        $months = $this->monthKeys($from, $to);
        if (count($months) > 24) {
            throw new \RuntimeException('Choose a period of 24 months or less.');
        }
        $rows = [];
        foreach ($months as $ym) {
            $s = max($from, "{$ym}-01");
            $e = min($to, Carbon::parse("{$ym}-01")->endOfMonth()->toDateString());
            $r = app(TaxReturnReport::class)->run(Scope::dates($s, $e, $scope->area), []);
            $rows[] = ['month' => $ym, 'output' => round((float) ($r['totals']['output'] ?? 0), 2), 'input' => round((float) ($r['totals']['input'] ?? 0), 2), 'net' => round((float) ($r['totals']['output'] ?? 0) - (float) ($r['totals']['input'] ?? 0), 2)];
        }

        return ['months' => $rows, 'output' => round(array_sum(array_column($rows, 'output')), 2), 'input' => round(array_sum(array_column($rows, 'input')), 2)];
    }

    /** What the stock ledgers hold at the end of each month. */
    private function chartStockValue(Scope $scope, string $from, string $to): array
    {
        $ids = $this->settingIds('stock');
        if ($ids === null) {
            throw new \RuntimeException('Choose the stock groups in Reports settings → Ratio analysis inputs.');
        }
        $end = $this->monthEnd($scope, $from, $to, $ids);

        return ['months' => array_map(fn ($ym, $v) => ['month' => $ym, 'value' => $v], array_keys($end), $end), 'closing' => end($end) ?: 0.0];
    }

    /** How fast stock turns over: cost of sales against the stock held, per month and over the period. */
    private function chartTurnover(Scope $scope, string $from, string $to): array
    {
        $s = AccountingSetting::current();
        $stockIds = $this->settingIds('stock') ?? ($s->stock_ledger_id ? [(int) $s->stock_ledger_id] : null);
        if ($stockIds === null || ! $s->cogs_ledger_id) {
            throw new \RuntimeException('Needs the stock groups (Reports settings) and the cost of goods sold ledger (Books defaults).');
        }
        $cogs = $this->monthly($scope, $from, $to, [(int) $s->cogs_ledger_id], 'debit');
        $stock = $this->monthEnd($scope, $from, $to, $stockIds);
        $before = $scope->dimensional() ? 0.0 : array_sum(array_map(fn ($id) => $this->b->balance($id, Carbon::parse($from)->subDay()->toDateString(), Scope::dates(null, null, $scope->area)), $stockIds));
        $rows = [];
        $prev = $before;
        foreach ($cogs as $ym => $c) {
            $avg = ($prev + $stock[$ym]) / 2;
            $days = Carbon::parse("{$ym}-01")->daysInMonth;
            $rows[] = ['month' => $ym, 'cogs' => $c, 'stock' => $stock[$ym], 'turns' => $avg > 0.005 ? round($c * 12 / $avg, 2) : null, 'days_of_stock' => $c > 0.005 ? round($avg / $c * $days, 1) : null];
            $prev = $stock[$ym];
        }
        $avgAll = ($before + array_sum($stock)) / (count($stock) + 1);
        $total = array_sum($cogs);
        $span = max(1, Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1);

        return ['months' => $rows, 'turns' => $avgAll > 0.005 ? round($total / $avgAll * (365 / $span), 2) : null, 'days_of_stock' => $total > 0.005 ? round($avgAll / $total * $span, 1) : null, 'cogs' => round($total, 2)];
    }

    /** Stock on hand that has not gone out for a while: the items tying up cash. */
    private function chartSlowMovers(Scope $scope, string $from, string $to): array
    {
        foreach (['variant_location_stock', 'product_variants', 'stock_movements'] as $t) {
            if (! Schema::hasTable($t)) {
                throw new \RuntimeException('Stock is not set up yet.');
            }
        }
        $cost = Schema::hasTable('stock_batches') && Schema::hasTable('stock_batch_balances')
            ? DB::table('stock_batch_balances as bb')->join('stock_batches as sb', 'sb.id', '=', 'bb.batch_id')->selectRaw('sb.variant_id, SUM(bb.quantity * sb.unit_cost) as value')->groupBy('sb.variant_id')->pluck('value', 'variant_id') : collect();
        $last = DB::table('stock_movements')->where('quantity', '<', 0)->where('movement_date', '<=', $to)->selectRaw('variant_id, MAX(movement_date) as last_out')->groupBy('variant_id')->pluck('last_out', 'variant_id');
        $on = DB::table('variant_location_stock as s')->join('product_variants as v', 'v.id', '=', 's.product_variant_id')->leftJoin('products as p', 'p.id', '=', 'v.product_id')
            ->groupBy('s.product_variant_id', 'v.name', 'p.name')->havingRaw('SUM(s.quantity) > 0')->selectRaw('s.product_variant_id as id, COALESCE(p.name, v.name) as name, v.name as variant, SUM(s.quantity) as qty')->get();
        $rows = $on->map(function ($r) use ($last, $cost, $to) {
            $out = $last[$r->id] ?? null;

            return ['name' => $r->variant && $r->variant !== $r->name ? "{$r->name} — {$r->variant}" : $r->name, 'qty' => round((float) $r->qty, 2), 'value' => round((float) ($cost[$r->id] ?? 0), 2),
                'days' => $out ? (int) Carbon::parse(substr((string) $out, 0, 10))->diffInDays(Carbon::parse($to)) : null];
        })->sortByDesc(fn ($r) => $r['days'] ?? PHP_INT_MAX)->values();

        return ['rows' => $rows->take(15)->all(), 'count' => $rows->count(), 'never_sold' => $rows->whereNull('days')->count(), 'tied_up' => round((float) $rows->filter(fn ($r) => $r['days'] === null || $r['days'] > 90)->sum('value'), 2)];
    }

    /** What customers owe us against what we owe suppliers, by when it falls due: overdue now, then week by week for 13 weeks. */
    private function chartDue(Scope $scope, string $from, string $to): array
    {
        $today = Carbon::parse($to)->startOfDay();
        $buckets = [['label' => 'Overdue', 'receivables' => 0.0, 'payables' => 0.0]];
        for ($w = 1; $w <= 13; $w++) {
            $buckets[] = ['label' => $w === 1 ? 'This week' : "Week {$w}", 'receivables' => 0.0, 'payables' => 0.0];
        }
        $later = ['receivables' => 0.0, 'payables' => 0.0];
        foreach (['receivables', 'payables'] as $side) {
            foreach (app(Figures::class)->ageing($side, $today->toDateString())['rows'] as $p) {
                foreach ($p['bills'] as $b) {
                    $days = (int) $today->diffInDays(Carbon::parse($b['due_date'])->startOfDay(), false);
                    if ($days < 0) {
                        $buckets[0][$side] += $b['open'];
                    } elseif ($days < 91) {
                        $buckets[1 + intdiv($days, 7)][$side] += $b['open'];
                    } else {
                        $later[$side] += $b['open'];
                    }
                }
            }
        }
        $buckets = array_map(fn ($b) => ['label' => $b['label'], 'receivables' => round($b['receivables'], 2), 'payables' => round($b['payables'], 2)], $buckets);

        return ['buckets' => $buckets, 'later' => array_map(fn ($v) => round($v, 2), $later), 'receivables' => round(array_sum(array_column($buckets, 'receivables')) + $later['receivables'], 2), 'payables' => round(array_sum(array_column($buckets, 'payables')) + $later['payables'], 2)];
    }

    /** What customers owe that is late, by how late, and who it is. The buckets are the ones in the Reports settings (30, 60, 90 days by default). */
    private function chartOverdue(Scope $scope, string $from, string $to): array
    {
        $a = app(Figures::class)->ageing('receivables', $to);
        $rows = [];
        foreach ($a['buckets'] as $i => $b) {
            $parties = array_filter($a['rows'], fn ($p) => abs($p['buckets'][$b['key']] ?? 0) > 0.005);
            $rows[] = ['bucket' => $b['label'], 'amount' => round((float) ($a['totals'][$b['key']] ?? 0), 2), 'customers' => count($parties), 'late' => $i > 0];
        }
        $late = array_sum(array_map(fn ($r) => $r['late'] ? $r['amount'] : 0, $rows));
        $total = (float) ($a['totals']['total'] ?? 0);
        $worst = [];
        foreach ($a['rows'] as $p) {
            $over = array_filter($p['bills'], fn ($b) => $b['days_late'] > 0);
            if ($over) {
                $worst[] = ['name' => $p['party'], 'overdue' => round(array_sum(array_column($over, 'open')), 2), 'days' => max(array_column($over, 'days_late'))];
            }
        }
        usort($worst, fn ($x, $y) => $y['overdue'] <=> $x['overdue']);

        return ['buckets' => array_map(fn ($r) => $r + ['share' => $total > 0 ? round($r['amount'] / $total * 100, 1) : 0.0], $rows), 'total' => round($total, 2), 'late' => round($late, 2), 'late_share' => $total > 0 ? round($late / $total * 100, 1) : 0.0, 'worst' => array_slice($worst, 0, 5)];
    }

    /**
     * Reconciliation by area: for bank and mobile money, cash, debtors, creditors and tax, how much is matched, how much is unmatched and how much is unresolved.
     * Bank, mobile money and cash come from the latest reconciliation of each account (statement lines matched and not, and the proof's difference); debtors and creditors
     * from the control checks (the ledgers against the open bills); tax from the withholding credits check.
     */
    private function chartReconAreas(Scope $scope, string $from, string $to): array
    {
        $areas = ['bank' => 'Bank and mobile money', 'cash' => 'Cash', 'debtors' => 'Debtors', 'creditors' => 'Creditors', 'tax' => 'Tax'];
        $out = array_map(fn ($label) => ['area' => $label, 'matched' => 0.0, 'unmatched' => 0.0, 'unresolved' => 0.0, 'accounts' => 0, 'reconciled' => 0], $areas);
        if (ReconService::ready()) {
            $recon = app(ReconService::class);
            $nature = collect($this->b->ledgers())->pluck('nature', 'id');
            $latest = DB::table('recon_sessions')->where('statement_to', '<=', $to)->orderByDesc('statement_to')->orderByDesc('id')->get()->unique('ledger_id');
            foreach ($latest as $s) {
                $area = in_array($s->kind, ['bank', 'mobile_money'], true) ? 'bank' : ($s->kind === 'cash' ? 'cash' : ($s->kind === 'counterparty' ? (($nature[$s->ledger_id] ?? '') === 'liability' ? 'creditors' : 'debtors') : null));
                if (! $area) {
                    continue;
                }
                $lines = DB::table('recon_statement_lines')->where('session_id', $s->id)->selectRaw('SUM(CASE WHEN matched_entry_id IS NOT NULL THEN ABS(amount) ELSE 0 END) as m, SUM(CASE WHEN matched_entry_id IS NULL THEN ABS(amount) ELSE 0 END) as u')->first();
                $proof = $recon->proof($s);
                $out[$area]['matched'] += (float) $lines->m;
                $out[$area]['unmatched'] += (float) $lines->u;
                $out[$area]['unresolved'] += abs($proof['difference']);
                $out[$area]['accounts']++;
                $out[$area]['reconciled'] += $s->status === 'locked' ? 1 : 0;
            }
        }
        $checks = collect(app(ControlAccountChecks::class)->checks($to)['checks'])->keyBy('key');
        foreach (['debtors' => 'receivables', 'creditors' => 'payables', 'tax' => 'withholding-credits'] as $area => $check) {
            if ($c = $checks[$check] ?? null) {
                $out[$area]['matched'] += min(abs($c['book']), abs($c['register']));
                $out[$area]['unresolved'] += abs($c['difference'] - $c['explained']);
                $out[$area]['accounts']++;
                $out[$area]['reconciled'] += $c['ok'] ? 1 : 0;
            }
        }

        return ['areas' => array_values(array_map(fn ($a) => array_map(fn ($v) => is_float($v) ? round($v, 2) : $v, $a), $out))];
    }

    /** Each budgeted expense against what was spent in the same months, the biggest overspend first. */
    private function chartBudget(Scope $scope, string $from, string $to): array
    {
        $r = app(BudgetService::class)->against($scope, $from, $to, ['expense']);
        if (! $r['rows']) {
            throw new \RuntimeException('No budget is set for this period yet. Set one under Books → Budgets.');
        }

        return $r;
    }

    /** Cash for the next 90 days from today: what is owed in and out, confirmed apart from estimated, with the assumptions it runs on. The period chosen on the page does not move it. */
    private function chartCashForecast(Scope $scope, string $from, string $to): array
    {
        return app(ForecastService::class)->build($scope, today()->toDateString(), 90);
    }
}

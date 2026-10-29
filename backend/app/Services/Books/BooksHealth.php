<?php

namespace App\Services\Books;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\BalanceSheetReport;
use App\Services\Books\Engine\Reports\MoneyFlowReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The Books health panel (docs/BOOKS_REPORTS_PLAN.md, section 8): pass/fail checks on the books, each saying what is wrong and listing where, so it can be put right.
 * Read-only; it changes nothing. A check whose set-up is missing (no stock group chosen, script not run) says "not set up" instead of guessing from a name.
 *
 * A check is: key, section, title, status (pass, warn, fail, setup), summary, count, items (at most ITEMS of them), and optionally `report` (the report that shows more).
 * An item is: label, detail, amount, and `to` (a voucher, or a ledger's statement) so the screen can open it.
 */
class BooksHealth
{
    private const ITEMS = 25;

    private array $checks = [];

    /** @return array{from: string, to: string, checks: array<int, array>, totals: array<string, int>} */
    public function run(Scope $scope): array
    {
        $to = $scope->to ?: today()->toDateString();
        $from = $scope->from ?: app(LedgerBalances::class)->yearStart($to);
        $this->checks = [];

        $this->trialBalance($to);
        $this->balanceSheet($to);
        $this->openingDifference();
        $this->drafts($from, $to);
        $this->backdated();
        $this->negative('negative_money', 'Cash and bank accounts not overdrawn', fn () => app(MoneyFlowReport::class)->moneyLedgerIds() ?: null, 'Choose the cash and bank groups in Reports settings → Cash and bank accounts.', $to, 'a cash or bank account is below zero');
        $this->negative('negative_stock', 'Stock not below zero', fn () => app(ReportSettings::class)->ratioLedgerIds('stock'), 'Choose the stock groups in Reports settings → Ratio analysis inputs.', $to, 'a stock account is below zero');
        $this->noStatementLine($from, $to);
        $this->suspense($to);
        $this->duplicates();
        $this->restated();
        $this->unreconciled();
        $this->kindsConfirmed();
        $this->controlGroups();
        $this->tax();

        $totals = array_count_values(array_column($this->checks, 'status')) + ['pass' => 0, 'warn' => 0, 'fail' => 0, 'setup' => 0];

        return ['from' => $from, 'to' => $to, 'checks' => $this->checks, 'totals' => $totals];
    }

    private function add(string $key, string $section, string $title, string $status, string $summary, array $items = [], ?int $count = null, ?string $report = null): void
    {
        $this->checks[] = ['key' => $key, 'section' => $section, 'title' => $title, 'status' => $status, 'summary' => $summary, 'count' => $count ?? count($items),
            'items' => array_slice($items, 0, self::ITEMS), 'report' => $report];
    }

    private function money(float $v): string
    {
        return number_format($v, 2);
    }

    private function voucherItem(object $v, string $detail): array
    {
        return ['label' => "{$v->voucher_number} · {$v->date}", 'detail' => $detail, 'amount' => round((float) ($v->base_total ?? $v->total_amount ?? 0), 2), 'to' => ['voucher' => (int) $v->id]];
    }

    private function trialBalance(string $to): void
    {
        $t = app(LedgerBalances::class)->trial(Scope::dates(null, $to));
        $diff = round($t['total_debit'] - $t['total_credit'], 2);
        $ok = abs($diff) < 0.01;
        $this->add('trial_balance', 'Balance', 'Trial balance agrees', $ok ? 'pass' : 'fail',
            $ok ? 'Debits and credits are equal.' : 'Debits ' . ($diff > 0 ? 'exceed' : 'fall short of') . ' credits by ' . $this->money(abs($diff)) . '. Opening balances that do not net to nothing are the usual cause (see below).', [], null, 'trial-balance');
    }

    private function balanceSheet(string $to): void
    {
        $r = app(BalanceSheetReport::class)->run(Scope::dates(null, $to), []);
        if (empty($r['ready'])) {
            $this->add('balance_sheet', 'Balance', 'Balance sheet balances', 'setup', $r['message'] ?? 'The statements are not set up.');

            return;
        }
        $diff = round($r['total_assets'] - $r['total_liabilities'], 2);
        $this->add('balance_sheet', 'Balance', 'Balance sheet balances', $r['balanced'] ? 'pass' : 'fail',
            $r['balanced'] ? 'Assets equal liabilities and equity.' : 'Assets are ' . $this->money($r['total_assets']) . ' and liabilities with equity ' . $this->money($r['total_liabilities']) . ' (' . $this->money(abs($diff)) . ' apart).', [], null, 'balance-sheet');
    }

    private function openingDifference(): void
    {
        $o = app(LedgerBalances::class)->openings();
        $net = round($o['net'], 2);
        $ok = abs($net) < 0.01;
        $items = $ok ? [] : array_map(fn ($r) => ['label' => $r['ledger'], 'detail' => $r['group'] . ' · ' . $r['side'], 'amount' => $r['amount'], 'to' => ['ledger' => $r['ledger_id']]], $o['rows']);
        $this->add('opening_difference', 'Balance', 'Opening balances net to nothing', $ok ? 'pass' : 'fail',
            $ok ? 'The opening balances balance.' : 'The opening balances are out by ' . $this->money(abs($net)) . ' on the ' . ($net > 0 ? 'debit' : 'credit') . ' side. The books cannot balance until this is put right.', $items, count($o['rows']));
    }

    private function drafts(string $from, string $to): void
    {
        $rows = DB::table('vouchers')->where('status', 'draft')->whereBetween('date', [$from, $to])->orderBy('date')->get(['id', 'voucher_number', 'date', 'total_amount', 'base_total']);
        $this->add('drafts', 'Postings', 'No draft vouchers in the period', $rows->isEmpty() ? 'pass' : 'warn',
            $rows->isEmpty() ? "No drafts between {$from} and {$to}." : $rows->count() . " draft voucher(s) between {$from} and {$to} are not in any report until they are posted.",
            $rows->map(fn ($v) => $this->voucherItem($v, 'Draft'))->all(), $rows->count());
    }

    /** Vouchers dated inside a financial year that was closed before the voucher was entered. */
    private function backdated(): void
    {
        if (! Schema::hasColumn('financial_years', 'closed_at')) {
            return;
        }
        $rows = DB::table('vouchers as v')->join('financial_years as y', function ($j) {
            $j->on('v.date', '>=', 'y.start_date')->on('v.date', '<=', 'y.end_date');
        })->where('y.is_closed', 1)->whereNotNull('y.closed_at')->where('v.status', 'posted')->whereColumn('v.created_at', '>', 'y.closed_at')
            ->orderBy('v.date')->get(['v.id', 'v.voucher_number', 'v.date', 'v.total_amount', 'v.base_total', 'y.name as year_name']);
        $this->add('backdated', 'Postings', 'Nothing back-dated into a closed year', $rows->isEmpty() ? 'pass' : 'fail',
            $rows->isEmpty() ? 'No voucher was entered into a year after it was closed.' : $rows->count() . ' voucher(s) were entered after their financial year was closed.',
            $rows->map(fn ($v) => $this->voucherItem($v, "Closed year {$v->year_name}"))->all(), $rows->count());
    }

    /** A group of ledgers that should never be below zero (cash, bank, stock). */
    private function negative(string $key, string $title, callable $ids, string $setup, string $to, string $what): void
    {
        $ids = $ids();
        if ($ids === null) {
            $this->add($key, 'Accounts', $title, 'setup', $setup);

            return;
        }
        $b = app(LedgerBalances::class);
        $names = DB::table('ledgers')->whereIn('id', $ids)->pluck('name', 'id');
        $items = [];
        foreach ($ids as $id) {
            $bal = $b->balance((int) $id, $to);
            if ($bal < -0.005) {
                $items[] = ['label' => $names[$id] ?? "#{$id}", 'detail' => 'Credit balance', 'amount' => round(-$bal, 2), 'to' => ['ledger' => (int) $id]];
            }
        }
        $this->add($key, 'Accounts', $title, $items ? 'warn' : 'pass', $items ? count($items) . " account(s) where {$what} on {$to}." : "None is below zero on {$to}.", $items);
    }

    private function noStatementLine(string $from, string $to): void
    {
        if (! LedgerBalances::hasColumn('ledger_groups', 'statement_id')) {
            $this->add('no_statement_line', 'Accounts', 'Every ledger is on a statement line', 'setup', 'Run database script 227_statements.sql.');

            return;
        }
        $rows = array_values(array_filter(app(LedgerBalances::class)->trial(Scope::dates($from, $to))['rows'], fn ($r) => ! $r['statement_id']));
        $this->add('no_statement_line', 'Accounts', 'Every ledger is on a statement line', $rows ? 'warn' : 'pass',
            $rows ? count($rows) . ' ledger(s) with a balance or movement are on no statement line, so they are missing from the financial statements.' : 'Every ledger in use is on a statement line.',
            array_map(fn ($r) => ['label' => $r['ledger'], 'detail' => $r['group'], 'amount' => abs($r['closing']), 'to' => ['ledger' => $r['ledger_id']]], $rows), count($rows));
    }

    private function suspense(string $to): void
    {
        $groups = ReportSettings::ready() ? (array) app(ReportSettings::class)->get('suspense_groups') : [];
        if (! $groups) {
            $this->add('suspense', 'Accounts', 'Nothing left in suspense', 'setup', 'Choose the suspense groups in Reports settings → Books health.');

            return;
        }
        $ids = [];
        foreach ($groups as $g) {
            $ids = array_merge($ids, app(ReportSettings::class)->withDescendants((int) $g));
        }
        $b = app(LedgerBalances::class);
        $names = DB::table('ledgers')->whereIn('group_id', $ids)->pluck('name', 'id');
        $items = [];
        foreach ($names as $id => $name) {
            $bal = $b->balance((int) $id, $to);
            if (abs($bal) >= 0.005) {
                $items[] = ['label' => $name, 'detail' => $bal > 0 ? 'Debit balance' : 'Credit balance', 'amount' => round(abs($bal), 2), 'to' => ['ledger' => (int) $id]];
            }
        }
        $this->add('suspense', 'Accounts', 'Nothing left in suspense', $items ? 'fail' : 'pass', $items ? count($items) . ' suspense account(s) still hold a balance: it belongs somewhere else.' : 'The suspense accounts are empty.', $items);
    }

    /** Ledgers whose names are the same once case, spaces and punctuation are ignored, or one letter apart. */
    private function duplicates(): void
    {
        $ledgers = DB::table('ledgers')->where('is_active', 1)->orderBy('name')->get(['id', 'name', 'group_id']);
        $key = fn ($n) => preg_replace('/[^a-z0-9]+/', '', mb_strtolower((string) $n));
        $by = [];
        foreach ($ledgers as $l) {
            $by[$key($l->name)][] = $l;
        }
        $pairs = [];
        foreach ($by as $group) {
            if (count($group) > 1) {
                $pairs[] = $group;
            }
        }
        // one letter apart: only names of 6+ letters starting alike, so "Rent 1" and "Rent 2" are not flagged
        $keys = array_keys($by);
        sort($keys);
        $n = count($keys);
        for ($i = 0; $i < $n && $n <= 3000; $i++) {
            for ($j = $i + 1; $j < $n && $j < $i + 40; $j++) {
                if (strlen($keys[$i]) >= 6 && substr($keys[$i], 0, 3) === substr($keys[$j], 0, 3) && abs(strlen($keys[$i]) - strlen($keys[$j])) <= 1 && levenshtein($keys[$i], $keys[$j]) === 1
                    && ! (ctype_digit(substr($keys[$i], -1)) && ctype_digit(substr($keys[$j], -1)))) {
                    $pairs[] = array_merge($by[$keys[$i]], $by[$keys[$j]]);
                }
            }
        }
        $items = array_map(fn ($g) => ['label' => implode('  ≈  ', array_map(fn ($l) => $l->name, $g)), 'detail' => 'Possible duplicate', 'amount' => null, 'to' => ['ledger' => (int) $g[0]->id]], $pairs);
        $this->add('duplicates', 'Accounts', 'No near-duplicate ledgers', $items ? 'warn' : 'pass', $items ? count($items) . ' set(s) of ledgers have almost the same name: one may be a mistake.' : 'No two ledgers have near-identical names.', $items, count($items));
    }

    private function restated(): void
    {
        $n = RestatedBase::restatedCount();
        $this->add('restated', 'Postings', 'No vouchers shown at a changed currency rate', $n ? 'warn' : 'pass',
            $n ? "{$n} voucher(s) were posted when the base currency was different and are shown at today's rate; the reports say so." : 'Every voucher is shown as it was posted.', [], $n);
    }

    private function unreconciled(): void
    {
        if (! ReconService::ready()) {
            $this->add('unreconciled', 'Reconciliation', 'Statement lines all matched', 'setup', 'Run database script 233_reconciliation.sql.');

            return;
        }
        $rows = DB::table('recon_statement_lines as l')->join('recon_sessions as s', 's.id', '=', 'l.session_id')->join('ledgers as g', 'g.id', '=', 's.ledger_id')
            ->whereNull('l.matched_entry_id')->whereNotIn('s.status', ['locked', 'superseded', 'reopened'])
            ->groupBy('s.ledger_id', 'g.name')->get(['s.ledger_id', 'g.name', DB::raw('COUNT(*) as n'), DB::raw('SUM(ABS(l.amount)) as total')]);
        $this->add('unreconciled', 'Reconciliation', 'Statement lines all matched', $rows->isEmpty() ? 'pass' : 'warn',
            $rows->isEmpty() ? 'No statement line is waiting to be matched.' : $rows->sum('n') . ' statement line(s) are still unmatched in a reconciliation that is not locked.',
            $rows->map(fn ($r) => ['label' => $r->name, 'detail' => $r->n . ' unmatched line(s)', 'amount' => round((float) $r->total, 2), 'to' => ['recon' => (int) $r->ledger_id]])->all(), (int) $rows->sum('n'));
    }

    private function kindsConfirmed(): void
    {
        $rows = array_filter(ReportSettings::ready() ? app(ReportSettings::class)->reconcilableLedgers() : [], fn ($l) => ! $l['disabled'] && ! $l['kind']);
        $labels = ReportSettingDefinitions::LEDGER_KINDS;
        $this->add('kinds', 'Reconciliation', 'Every reconcilable account has its kind confirmed', $rows ? 'warn' : 'pass',
            $rows ? count($rows) . ' account(s) can be reconciled but nobody has confirmed what kind they are (Reports settings → Reconciliation).' : 'Every reconcilable account has a confirmed kind.',
            array_map(fn ($l) => ['label' => $l['name'], 'detail' => $l['group'] . ' · looks like: ' . ($labels[$l['suggested_kind']] ?? $l['suggested_kind']), 'amount' => null, 'to' => ['ledger' => $l['id']]], array_values($rows)), count($rows));
    }

    private function controlGroups(): void
    {
        $s = app(ReportSettings::class);
        $missing = array_filter(['debtors' => 'receivables', 'creditors' => 'payables'], fn ($label, $input) => $s->ratioLedgerIds($input) === null, ARRAY_FILTER_USE_BOTH);
        $this->add('control_groups', 'Set-up', 'Receivables and payables groups are chosen', $missing ? 'warn' : 'pass',
            $missing ? 'The ' . implode(' and ', $missing) . ' control check is not done until the groups are chosen in Reports settings → Ratio analysis inputs (Debtors, Creditors).' : 'The control-account checks use the groups chosen in the settings.');
    }

    private function tax(): void
    {
        $found = app(TaxHealth::class)->checks();
        if ($found && $found[0]['code'] === 'script_229') {
            $this->add('tax', 'Tax', 'Tax set-up is sound', 'setup', $found[0]['message']);

            return;
        }
        $level = $found ? (in_array('error', array_column($found, 'level'), true) ? 'fail' : 'warn') : 'pass';
        $this->add('tax', 'Tax', 'Tax set-up is sound', $level, $found ? count($found) . ' problem(s) in the tax set-up. The Tax control tab shows them with what to do.' : 'No problem found in the tax set-up.',
            array_map(fn ($c) => ['label' => $c['message'], 'detail' => $c['level'] === 'error' ? 'Error' : 'Warning', 'amount' => null, 'to' => null], $found), count($found));
    }
}

<?php

namespace App\Services\Insight\Packs;

use App\Models\User;
use App\Services\Books\BooksReportService;
use App\Services\Books\RatioAnalysisService;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use App\Services\Insight\LoyaltyData;
use Carbon\Carbon;

/**
 * The books' three main reports, read in plain terms: the profit and loss against the period before it, the balance sheet with its ratios,
 * and the trial balance with the balances that look wrong. It uses the report's own period (the dates on the page), not the look-back choice.
 */
class ReportPack implements InsightPack
{
    public function key(): string { return 'report.books'; }

    public function title(): string { return 'What does this report say?'; }

    public function module(): ?string { return null; }

    public function roles(): array { return ['finance', 'manager', 'admin', 'super_admin']; }   // who may open the reports

    public function contexts(): array { return ['report']; }

    public function applies(array $context): bool
    {
        return in_array($context['report'] ?? '', ['profit-loss', 'balance-sheet', 'trial-balance'], true);
    }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        $reports = app(BooksReportService::class);
        $b = LoyaltyData::baseCode();
        $to = ! empty($context['to']) ? Carbon::parse($context['to']) : Carbon::today();
        $from = ! empty($context['from']) ? Carbon::parse($context['from']) : $to->copy()->startOfMonth();

        return match ($context['report']) {
            'profit-loss' => $this->pl($reports, $from, $to, $b),
            'balance-sheet' => $this->bs($reports, $to, $b),
            default => $this->tb($reports, $from, $to, $b),
        };
    }

    private function pl(BooksReportService $r, Carbon $from, Carbon $to, string $b): array
    {
        $now = $r->profitLoss($from->toDateString(), $to->toDateString());
        $days = max(1, (int) $from->diffInDays($to) + 1);
        $pf = $from->copy()->subDays($days); $pt = $from->copy()->subDay();
        $prev = $r->profitLoss($pf->toDateString(), $pt->toDateString());
        $t = $now['totals']; $p = $prev['totals'];
        $inc = $t['direct_income'] + $t['indirect_income']; $pInc = $p['direct_income'] + $p['indirect_income'];
        $chg = fn ($a, $c) => abs($c) > 0.005 ? ($a >= $c ? '+' : '') . number_format(($a - $c) / abs($c) * 100, 1) . '%' : '—';
        $m = fn ($np, $i) => $i > 0 ? number_format($np / $i * 100, 1) . '%' : '—';

        $rows = [
            ['Income', number_format($inc, 2), number_format($pInc, 2), $chg($inc, $pInc)],
            ['Direct expenses', number_format($t['direct_expense'], 2), number_format($p['direct_expense'], 2), $chg($t['direct_expense'], $p['direct_expense'])],
            ['Gross profit', number_format($t['gross_profit'], 2), number_format($p['gross_profit'], 2), $chg($t['gross_profit'], $p['gross_profit'])],
            ['Indirect expenses', number_format($t['indirect_expense'], 2), number_format($p['indirect_expense'], 2), $chg($t['indirect_expense'], $p['indirect_expense'])],
            ['Net profit', number_format($t['net_profit'], 2), number_format($p['net_profit'], 2), $chg($t['net_profit'], $p['net_profit'])],
        ];
        $blocks = [['type' => 'table', 'title' => $from->toDateString() . ' to ' . $to->toDateString() . ' against the ' . $days . ' days before (' . $pf->toDateString() . ' to ' . $pt->toDateString() . ')', 'columns' => ['', 'This period', 'Before', 'Change'], 'rows' => $rows]];
        $top = function (array $sec, string $label) use ($b) {
            $rows = collect($sec)->sortByDesc('amount')->take(5)->map(fn ($x) => [$x['ledger'], number_format((float) $x['amount'], 2)])->values()->all();

            return $rows ? ['type' => 'table', 'title' => $label, 'columns' => ['Ledger', $b], 'rows' => $rows] : null;
        };
        foreach ([[$now['sections']['income_direct'], 'Biggest sources of sales'], [array_merge($now['sections']['expense_direct'], $now['sections']['expense_indirect']), 'Biggest costs']] as [$sec, $label]) {
            if ($x = $top($sec, $label)) { $blocks[] = $x; }
        }
        $blocks[] = ['type' => 'facts', 'title' => 'Margins', 'rows' => [['Gross margin', $inc > 0 ? number_format($t['gross_profit'] / $inc * 100, 1) . '%' : '—', 'before: ' . $m($p['gross_profit'], $pInc)], ['Net margin', $m($t['net_profit'], $inc), 'before: ' . $m($p['net_profit'], $pInc)]]];

        $expGrew = ($t['direct_expense'] + $t['indirect_expense']) - ($p['direct_expense'] + $p['indirect_expense']);
        $incGrew = $inc - $pInc;
        $tone = $t['net_profit'] < 0 ? 'bad' : ($t['net_profit'] < $p['net_profit'] ? 'warn' : 'good');
        $blocks[] = ['type' => 'verdict', 'tone' => $tone, 'text' => ($t['net_profit'] < 0 ? 'A loss of ' . $b . ' ' . number_format(-$t['net_profit'], 2) : 'A profit of ' . $b . ' ' . number_format($t['net_profit'], 2)) . ' in this period, '
            . (abs($p['net_profit']) > 0.005 ? ($t['net_profit'] >= $p['net_profit'] ? 'up' : 'down') . ' ' . number_format(abs($t['net_profit'] - $p['net_profit']), 2) . ' on the period before' : 'with nothing to compare against before')
            . ($incGrew > 0 && $expGrew > $incGrew ? '. Costs grew by ' . number_format($expGrew, 2) . ' while income grew by ' . number_format($incGrew, 2) . ': costs are growing faster than sales.' : ($incGrew < 0 && $expGrew > 0 ? '. Income fell while costs rose.' : '.'))];

        return ['title' => 'Profit and loss', 'blocks' => $blocks, 'basis' => 'Read from posted vouchers for the report\'s own dates and the period of equal length before.'];
    }

    private function bs(BooksReportService $r, Carbon $to, string $b): array
    {
        $bs = $r->balanceSheet($to->toDateString());
        $blocks = [['type' => 'facts', 'title' => 'As at ' . $to->toDateString(), 'rows' => [['Total assets', $b . ' ' . number_format($bs['total_assets'], 2)], ['Liabilities and capital', $b . ' ' . number_format($bs['total_liabilities'], 2)], ['Balanced', $bs['balanced'] ? 'yes' : 'no']]]];
        $big = fn (array $rows, string $label) => ['type' => 'table', 'title' => $label, 'columns' => ['Ledger', $b], 'rows' => collect($rows)->sortByDesc('amount')->take(5)->map(fn ($x) => [$x['ledger'], number_format((float) $x['amount'], 2)])->values()->all()];
        $blocks[] = $big($bs['assets'], 'Biggest assets');
        $blocks[] = $big($bs['liabilities'], 'Biggest liabilities and capital');
        $ratios = app(RatioAnalysisService::class)->compute(null, $to->toDateString());
        $rr = collect($ratios['ratios'])->filter(fn ($x) => $x['value'] !== null);
        if ($rr->isNotEmpty()) {
            $blocks[] = ['type' => 'table', 'title' => 'The ratios', 'columns' => ['Ratio', 'Value', 'Meaning'], 'rows' => $rr->map(fn ($x) => [$x['label'], ($x['kind'] === 'pct' ? number_format($x['value'], 1) . '%' : number_format($x['value'], 2)), $x['note'] ?? ''])->values()->all()];
        }
        $cur = collect($ratios['ratios'])->firstWhere('key', 'current')['value'] ?? null;
        $de = collect($ratios['ratios'])->firstWhere('key', 'debt_equity')['value'] ?? null;
        $notes = [];
        if ($cur !== null) { $notes[] = $cur < 1 ? 'Current ratio ' . number_format($cur, 2) . ' is under 1: short-term debts are more than short-term assets.' : ($cur < 1.5 ? 'Current ratio ' . number_format($cur, 2) . ' is thin but covers short-term debts.' : 'Current ratio ' . number_format($cur, 2) . ' comfortably covers short-term debts.'); }
        if ($de !== null && $de > 2) { $notes[] = 'Borrowing is more than twice the owners\' funds (' . number_format($de, 2) . ').'; }
        $blocks[] = ['type' => 'verdict', 'tone' => ! $bs['balanced'] ? 'bad' : (($cur !== null && $cur < 1) ? 'warn' : 'good'), 'text' => ($bs['balanced'] ? '' : 'The two sides do not match; check the opening balances first. ') . implode(' ', $notes) ?: 'The sheet balances.'];

        return ['title' => 'Balance sheet', 'blocks' => $blocks, 'basis' => 'Read from posted vouchers and opening balances up to the date.'];
    }

    private function tb(BooksReportService $r, Carbon $from, Carbon $to, string $b): array
    {
        $tb = $r->trialBalance($from->toDateString(), $to->toDateString());
        $blocks = [['type' => 'facts', 'title' => 'Closing totals', 'rows' => [['Debits', $b . ' ' . number_format($tb['total_debit'], 2)], ['Credits', $b . ' ' . number_format($tb['total_credit'], 2)], ['Balanced', $tb['balanced'] ? 'yes' : 'no']]]];
        if (! empty($tb['opening_difference'])) {
            $blocks[] = ['type' => 'note', 'text' => 'The opening balances are out by ' . $b . ' ' . number_format(abs($tb['opening_difference']), 2) . ' (' . ($tb['opening_difference'] > 0 ? 'heavy on the debit side' : 'heavy on the credit side') . '); it is held on the "Difference in opening balances" line until the opposite opening balance is entered.'];
        }
        // balances on the wrong side for what they are
        $odd = collect($tb['rows'])->filter(fn ($x) => (($x['nature'] ?? '') === 'asset' && $x['closing'] < -0.005 && ! str_contains(strtolower($x['group'] ?? ''), 'depreciation')) || (($x['nature'] ?? '') === 'liability' && $x['closing'] > 0.005) || (($x['nature'] ?? '') === 'income' && $x['closing'] > 0.005) || (($x['nature'] ?? '') === 'expense' && $x['closing'] < -0.005))->take(8);
        if ($odd->isNotEmpty()) {
            $blocks[] = ['type' => 'table', 'title' => 'Balances on the unusual side (worth a look)', 'columns' => ['Ledger', 'Group', 'Closing (Dr +)'], 'rows' => $odd->map(fn ($x) => [$x['ledger'], $x['group'], number_format($x['closing'], 2)])->values()->all()];
        }
        $moves = collect($tb['rows'])->sortByDesc(fn ($x) => $x['debit'] + $x['credit'])->take(5);
        $blocks[] = ['type' => 'table', 'title' => 'Busiest ledgers in the period', 'columns' => ['Ledger', 'Debit', 'Credit'], 'rows' => $moves->map(fn ($x) => [$x['ledger'], number_format($x['debit'], 2), number_format($x['credit'], 2)])->values()->all()];
        $blocks[] = ['type' => 'verdict', 'tone' => $tb['balanced'] ? ($odd->isNotEmpty() ? 'warn' : 'good') : 'bad', 'text' => $tb['balanced'] ? 'The trial balance balances' . ($odd->isNotEmpty() ? ', but ' . $odd->count() . ' ledger(s) sit on the opposite side from what they normally do.' : '.') : 'It does not balance: debits are ' . number_format(abs($tb['total_debit'] - $tb['total_credit']), 2) . ($tb['total_debit'] > $tb['total_credit'] ? ' more' : ' less') . ' than credits.'];

        return ['title' => 'Trial balance', 'blocks' => $blocks, 'basis' => 'Read from posted vouchers and opening balances.'];
    }
}

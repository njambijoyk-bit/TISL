<?php

namespace App\Services\Books\Engine\Reports;

use App\Models\Books\Voucher;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\Identifiers;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\RestatedBase;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Ledger statement: one ledger's postings in a period with a running balance (docs/BOOKS_REPORTS_PLAN.md, step 6.2).
 *
 * It starts from the ledger's balance at the start date, worked out in one sum (not by loading the history), and comes a page at a time, each page
 * knowing the balance it begins with. Every row says who the other side was (the particulars), keeps the narration, and carries the numbers that
 * identify the transaction: cheque number and dates, transfer reference, M-Pesa code. Balances read "1,000.00 Dr" / "1,000.00 Cr".
 *
 * Amounts are in today's base currency; a foreign-currency row also shows what was posted in its own currency, and what each currency moved is
 * summed apart.
 */
final class LedgerStatementReport extends ReportDefinition
{
    public const PER_PAGE = 200;

    public function key(): string
    {
        return 'ledger-statement';
    }

    public function title(): string
    {
        return 'Ledger statement';
    }

    public function options(): array
    {
        return [['key' => 'ledger_id', 'label' => 'Ledger', 'type' => 'ledger', 'choices' => [], 'default' => '']];
    }

    /** The posted entries of one ledger in the period, narrowed by the filters and the person's branches. */
    private function entries(Scope $scope, int $ledgerId, bool $withFrom): Builder
    {
        $q = RestatedBase::join(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id'))
            ->leftJoin('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('e.ledger_id', $ledgerId)->where('v.status', Voucher::POSTED);
        if ($withFrom && $scope->from) {
            $q->where('v.date', '>=', $scope->from);
        }
        if ($scope->to) {
            $q->where('v.date', '<=', $scope->to);
        }
        if ($scope->costCentreIds !== null) {
            $q->whereIn('e.cost_centre_id', $scope->costCentreIds);
        }
        if ($scope->locationId !== null) {
            $q->where('e.location_id', $scope->locationId);
        }
        app(BranchFilter::class)->apply($q, 'v.location_id', $scope->area, 'ledger');

        return $q;
    }

    public function run(Scope $scope, array $options): array
    {
        $ledgerId = (int) ($options['ledger_id'] ?? 0);
        if (! $ledgerId) {
            return ['ready' => false, 'needs' => 'ledger', 'message' => 'Choose a ledger to see its statement.', 'rows' => []];
        }
        $ledger = DB::table('ledgers as l')->leftJoin('ledger_groups as g', 'g.id', '=', 'l.group_id')->where('l.id', $ledgerId)
            ->first(['l.id', 'l.name', 'l.opening_balance', 'l.opening_side', 'g.name as group_name']);
        abort_unless($ledger, 404, 'Ledger not found.');

        $balances = app(LedgerBalances::class);
        $opening = $balances->opening($ledger, $scope);
        if ($scope->from) {
            $before = $balances->movement($scope, null, null, $scope->from, [$ledgerId])[$ledgerId] ?? ['dr' => 0.0, 'cr' => 0.0];
            $opening += $before['dr'] - $before['cr'];
        }

        $entry = RestatedBase::entry();
        $net = "(CASE WHEN e.side = 'D' THEN {$entry} ELSE -{$entry} END)";
        $sums = (clone $this->entries($scope, $ledgerId, true))->selectRaw("COUNT(*) AS n, SUM(CASE WHEN e.side = 'D' THEN {$entry} ELSE 0 END) AS dr, SUM(CASE WHEN e.side = 'C' THEN {$entry} ELSE 0 END) AS cr")->first();
        $count = (int) $sums->n;
        $dr = (float) $sums->dr;
        $cr = (float) $sums->cr;

        $export = ! empty($options['_export']);
        $size = $export ? max(1, $count) : self::PER_PAGE;
        $pages = max(1, (int) ceil($count / $size));
        $page = min(max(1, (int) ($options['page'] ?? 1)), $pages);
        $offset = ($page - 1) * $size;

        $ordered = fn () => $this->entries($scope, $ledgerId, true)->orderBy('v.date')->orderBy('v.id')->orderBy('e.line_no')->orderBy('e.id');
        $pageOpening = $opening;
        if ($offset > 0) {   // the balance this page begins with: the opening plus everything on the pages before it
            $before = DB::query()->fromSub($ordered()->selectRaw("{$net} AS n")->limit($offset), 'x')->sum('n');
            $pageOpening += (float) $before;
        }
        $found = $ordered()->select('v.id as voucher_id', 'v.date', 'v.voucher_number', 't.name as type', 'e.side', 'e.amount', 'e.base_amount', 'e.narration', 'v.narration as voucher_narration',
            'v.currency_id', 'v.total_amount as v_total', 'v.base_total as v_base');
        $found = $export ? $found->get() : $found->limit($size)->offset($offset)->get();

        $cur = DB::table('currencies')->get(['id', 'code', 'is_base', 'conversion_rate'])->keyBy('id')->all();
        $baseCode = (string) (collect($cur)->firstWhere('is_base', 1)->code ?? '');
        $voucherIds = $found->pluck('voucher_id')->unique()->all();
        $other = $this->otherSides($voucherIds, $ledgerId);
        $ids = (new Identifiers())->forVouchers($voucherIds);

        $balance = $pageOpening;
        $rows = [];
        $restated = $foreign = false;
        foreach ($found as $r) {
            [$amt, $re] = RestatedBase::amount((float) $r->amount, (float) $r->base_amount, $r->currency_id, $cur, (float) $r->v_total, (float) $r->v_base);
            $balance += $r->side === 'D' ? $amt : -$amt;
            $c = $r->currency_id !== null ? ($cur[$r->currency_id] ?? null) : null;
            $isForeign = $c && (int) $c->is_base !== 1;
            $fc = (float) $r->amount;
            $restated = $restated || $re;
            $foreign = $foreign || $isForeign;
            $rows[] = [
                'voucher_id' => (int) $r->voucher_id, 'date' => substr((string) $r->date, 0, 10), 'voucher_number' => $r->voucher_number, 'type' => $r->type,
                'particulars' => $this->particulars($other[$r->voucher_id][$r->side] ?? []), 'narration' => $r->narration ?: $r->voucher_narration,
                'identifiers' => isset($ids[$r->voucher_id]) ? Identifiers::labels($ids[$r->voucher_id]) : [],
                'currency' => $c->code ?? $baseCode, 'foreign' => (bool) $isForeign, 'amount_fc' => round($fc, 2), 'rate' => $fc > 0 ? round($amt / $fc, 6) : 1.0, 'restated' => $re,
                'in_currency' => $isForeign ? $c->code . ' ' . number_format($fc, 2) . ($r->side === 'D' ? ' Dr' : ' Cr') : '',
                'debit' => $r->side === 'D' ? round($amt, 2) : 0, 'credit' => $r->side === 'C' ? round($amt, 2) : 0, 'balance' => round($balance, 2),
            ];
        }

        return [
            'ready' => true, 'ledger' => ['id' => (int) $ledger->id, 'name' => $ledger->name, 'group' => $ledger->group_name], 'base_currency' => $baseCode,
            'opening' => round($opening, 2), 'page_opening' => round($pageOpening, 2), 'debit' => round($dr, 2), 'credit' => round($cr, 2), 'closing' => round($opening + $dr - $cr, 2),
            'rows' => $rows, 'by_currency' => $this->byCurrency($scope, $ledgerId, $cur, $baseCode), 'has_foreign' => $foreign || $this->anyForeign($scope, $ledgerId), 'restated' => $restated,
            'opening_note' => $scope->dimensional() ? 'filtered' : (app(BranchFilter::class)->enforcing($this->area()) ? 'branch_limited' : null),
            'paging' => ['page' => $page, 'per_page' => $export ? $count : $size, 'pages' => $pages, 'total' => $count],
        ];
    }

    /**
     * The other ledgers of each voucher, by the side of the entry they answer: for a debit row, the ledgers credited, and the other way round. A voucher
     * with only one side besides this ledger answers with the ledgers on that side.
     *
     * @param  int[]  $voucherIds
     * @return array<int, array<string, string[]>> voucher id => side of THIS entry => names
     */
    private function otherSides(array $voucherIds, int $ledgerId): array
    {
        if (! $voucherIds) {
            return [];
        }
        $by = [];
        foreach (DB::table('voucher_entries as e')->join('ledgers as l', 'l.id', '=', 'e.ledger_id')->whereIn('e.voucher_id', $voucherIds)->where('e.ledger_id', '!=', $ledgerId)
            ->orderBy('e.line_no')->orderBy('e.id')->get(['e.voucher_id', 'e.side', 'l.name']) as $r) {
            $mine = $r->side === 'D' ? 'C' : 'D';   // a debit here is answered by credits there
            $by[(int) $r->voucher_id][$mine][] = $r->name;
        }
        foreach ($by as &$sides) {
            foreach (['D', 'C'] as $s) {
                $sides[$s] = array_values(array_unique($sides[$s] ?? ($sides[$s === 'D' ? 'C' : 'D'] ?? [])));
            }
        }
        unset($sides);

        return $by;
    }

    /** @param string[] $names */
    private function particulars(array $names): string
    {
        return count($names) > 1 ? 'Various: ' . implode(', ', array_slice($names, 0, 3)) . (count($names) > 3 ? ' and ' . (count($names) - 3) . ' more' : '') : ($names[0] ?? '');
    }

    /** What each currency moved over the whole period, in that currency. */
    private function byCurrency(Scope $scope, int $ledgerId, array $cur, string $baseCode): array
    {
        $out = [];
        foreach ((clone $this->entries($scope, $ledgerId, true))->groupBy('v.currency_id', 'e.side')->selectRaw('v.currency_id, e.side, SUM(e.amount) AS fc')->get() as $r) {
            $code = $r->currency_id !== null ? ($cur[$r->currency_id]->code ?? $baseCode) : $baseCode;
            $out[$code] ??= ['currency' => $code, 'debit' => 0.0, 'credit' => 0.0, 'net' => 0.0];
            $out[$code][$r->side === 'D' ? 'debit' : 'credit'] += (float) $r->fc;
            $out[$code]['net'] += ($r->side === 'D' ? 1 : -1) * (float) $r->fc;
        }

        uksort($out, fn ($a, $b) => [$a !== $baseCode, $a] <=> [$b !== $baseCode, $b]);   // the base currency first, then the others by code

        return array_map(fn ($x) => array_map(fn ($v) => is_float($v) ? round($v, 2) : $v, $x), array_values($out));
    }

    private function anyForeign(Scope $scope, int $ledgerId): bool
    {
        return (clone $this->entries($scope, $ledgerId, true))->whereNotNull('cu.id')->where('cu.is_base', '!=', 1)->exists();
    }

    public function table(array $data, Scope $scope): array
    {
        if (($data['ready'] ?? false) !== true) {
            return ['title' => $this->title(), 'subtitle' => $this->period($scope), 'columns' => ['message' => 'Note'], 'rows' => [['message' => $data['message'] ?? 'Choose a ledger.']]];
        }
        $side = fn (float $v) => number_format(abs($v), 2) . ($v < 0 ? ' Cr' : ' Dr');
        $rows = [['date' => $scope->from, 'voucher_number' => '', 'type' => 'Opening balance', 'particulars' => '', 'identifiers' => '', 'narration' => '', 'debit' => '', 'credit' => '', 'balance' => $side($data['opening'])]];
        foreach ($data['rows'] as $r) {
            $rows[] = ['date' => $r['date'], 'voucher_number' => $r['voucher_number'], 'type' => $r['type'], 'particulars' => $r['particulars'], 'identifiers' => implode('; ', $r['identifiers']),
                'narration' => $r['narration'], 'debit' => $r['debit'] ?: '', 'credit' => $r['credit'] ?: '', 'balance' => $side($r['balance'])];
        }

        return [
            'title' => 'Ledger: ' . $data['ledger']['name'], 'subtitle' => $this->period($scope),
            'columns' => ['date' => 'Date', 'voucher_number' => 'Number', 'type' => 'Type', 'particulars' => 'Particulars', 'identifiers' => 'Identifiers', 'narration' => 'Narration',
                'debit' => 'Debit (' . $data['base_currency'] . ')', 'credit' => 'Credit (' . $data['base_currency'] . ')', 'balance' => 'Balance'],
            'rows' => $rows, 'totals' => ['type' => 'Totals', 'debit' => $data['debit'], 'credit' => $data['credit'], 'balance' => $side($data['closing'])],
        ];
    }
}

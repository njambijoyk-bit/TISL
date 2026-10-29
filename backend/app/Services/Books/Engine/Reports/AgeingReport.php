<?php

namespace App\Services\Books\Engine\Reports;

use App\Models\Books\Voucher;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\ReportSettings;
use App\Services\Books\RestatedBase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Receivables and payables ageing on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.3).
 *
 * What it shows, from the bill references of posted vouchers:
 *  - Outstanding bills per party, in buckets whose boundaries and basis (due date or bill date) come from the Reports settings (audit D1, D4). Each party
 *    lists its bills, and a bill opens its voucher (D5).
 *  - Unapplied credits, kept apart from the bills (decision 13, D2, D3): money or credit held on account that no bill has used yet. On the receivables
 *    side that is a customer's receipt that exceeded the invoice, an advance, or a credit note with no invoice left to offset; on the payables side it is
 *    what we prepaid a supplier or a debit note nothing offsets. A credit that is later applied to a bill leaves this list and reduces the bill by the
 *    same amount, so it is never counted twice.
 *  - A net line (bills less credits), compared with the ledger balance of the debtors or creditors chosen in the Reports settings.
 *
 * The direction of notes, settled by a test of what the books really do: a credit note (a sales return) credits the customer, a debit note (a purchase
 * return) debits the supplier, and neither ever opens a bill of its own: it settles its invoice, and what is left becomes an unapplied credit.
 */
abstract class AgeingReport extends ReportDefinition
{
    /** 'receivables' or 'payables'. */
    abstract protected function side(): string;

    public function kind(): string
    {
        return 'asof';
    }

    public function filters(): array
    {
        return ['branch'];
    }

    public function options(): array
    {
        $basis = $this->setting('ageing_basis', 'due_date');

        return [['key' => 'basis', 'label' => 'Count days from', 'choices' => ['due_date' => 'The due date', 'bill_date' => 'The bill date'], 'default' => $basis]];
    }

    private function setting(string $key, mixed $default): mixed
    {
        try {
            return app(ReportSettings::class)->get($key) ?? $default;
        } catch (\Throwable) {
            return $default;
        }
    }

    /** The voucher kinds that open a bill here, and the kinds whose unapplied credit belongs on this side. */
    private function billBases(): array
    {
        return $this->side() === 'payables' ? ['purchase'] : ['sales', 'journal'];   // a journal only opens a bill for a bounced-cheque fee
    }

    private function creditBases(): array
    {
        return $this->side() === 'payables' ? ['payment', 'debit_note'] : ['receipt', 'credit_note'];
    }

    /**
     * The buckets: [key, label, from day, to day (null = no end)]. By due date the first is "Not yet due" (nothing late) and the rest count days late; by
     * bill date they count days since the bill, from day 0.
     */
    public static function buckets(array $boundaries, string $basis): array
    {
        $b = array_values($boundaries);
        $out = [];
        if ($basis === 'due_date') {
            $out[] = ['key' => 'b0', 'label' => 'Not yet due', 'from' => 0, 'to' => 0];
            $lo = 1;
        } else {
            $lo = 0;
        }
        foreach ($b as $hi) {
            $out[] = ['key' => 'b' . count($out), 'label' => $lo . '–' . $hi, 'from' => $lo, 'to' => $hi];
            $lo = $hi + 1;
        }
        $out[] = ['key' => 'b' . count($out), 'label' => 'Over ' . ($b ? end($b) : 0), 'from' => $lo, 'to' => null];

        return $out;
    }

    private static function bucketOf(array $buckets, int $days): string
    {
        foreach ($buckets as $x) {
            if ($days >= $x['from'] && ($x['to'] === null || $days <= $x['to'])) {
                return $x['key'];
            }
        }

        return end($buckets)['key'];
    }

    /** Narrow a voucher query to the person's branches and the branch chosen. */
    private function narrow($q, Scope $scope)
    {
        if ($scope->locationId !== null) {
            $q->where('v.location_id', $scope->locationId);
        }

        return app(BranchFilter::class)->apply($q, 'v.location_id', $scope->area, 'ageing');
    }

    public function run(Scope $scope, array $options): array
    {
        $asOf = Carbon::parse($scope->to ?? today());
        $basis = in_array($options['basis'] ?? null, ['due_date', 'bill_date'], true) ? $options['basis'] : $this->setting('ageing_basis', 'due_date');
        $boundaries = array_map('intval', (array) $this->setting('ageing_buckets', [30, 60, 90]));
        $buckets = self::buckets($boundaries, $basis);
        $zero = array_fill_keys(array_column($buckets, 'key'), 0.0);

        $cur = DB::table('currencies')->get(['id', 'code', 'is_base', 'conversion_rate'])->keyBy('id')->all();
        $baseCode = (string) (collect($cur)->firstWhere('is_base', 1)->code ?? '');
        $inBase = function (float $amountFc, $b) use ($cur) {   // a figure in the voucher's own currency, in today's base
            [$whole] = RestatedBase::amount((float) $b->total_amount, (float) $b->base_total, $b->currency_id, $cur, (float) $b->total_amount, (float) $b->base_total);

            return (float) $b->total_amount > 0 ? round($amountFc * $whole / (float) $b->total_amount, 2) : $amountFc;
        };
        $code = fn ($b) => ($b->currency_id !== null ? ($cur[$b->currency_id]->code ?? null) : null) ?? $baseCode;

        // ── outstanding bills ──
        $bills = $this->narrow(DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
            ->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->join('ledgers as l', 'l.id', '=', 'b.ledger_id')
            ->where('b.ref_type', 'new')->where('v.status', Voucher::POSTED)->whereIn('t.base_type', $this->billBases())->where('v.date', '<=', $asOf->toDateString())
            ->when(! empty($options['ledger_id']), fn ($q) => $q->where('b.ledger_id', (int) $options['ledger_id'])), $scope)
            ->get(['b.voucher_id', 'b.ledger_id', 'l.name as party', 'v.voucher_number', 'v.date', 'b.due_date', 'b.amount', 'v.total_amount', 'v.base_total', 'v.currency_id']);
        $paid = DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')   // the payments that settle them count wherever they were taken
            ->where('b.ref_type', 'against')->where('v.status', Voucher::POSTED)->where('v.date', '<=', $asOf->toDateString())
            ->groupBy('b.against_voucher_id')->selectRaw('b.against_voucher_id as id, SUM(b.amount) as paid')->pluck('paid', 'id');

        $parties = [];
        $newParty = fn ($id, $name) => ['ledger_id' => (int) $id, 'party' => $name, 'buckets' => $zero, 'total' => 0.0, 'bills' => [], 'credits' => [], 'credit_total' => 0.0, 'net' => 0.0, 'by_currency' => []];
        foreach ($bills as $b) {
            $openFc = round((float) $b->amount - (float) ($paid[$b->voucher_id] ?? 0), 2);
            if ($openFc <= 0.005) {
                continue;
            }
            $open = $inBase($openFc, $b);
            $date = Carbon::parse($b->date);
            $due = Carbon::parse($b->due_date ?? $b->date);
            $days = max(0, (int) ($basis === 'due_date' ? $due : $date)->diffInDays($asOf, false));
            $key = self::bucketOf($buckets, $days);
            $c = $code($b);
            $p = &$parties[$b->ledger_id];
            $p ??= $newParty($b->ledger_id, $b->party);
            $p['buckets'][$key] = round($p['buckets'][$key] + $open, 2);
            $p['total'] = round($p['total'] + $open, 2);
            $p['by_currency'][$c] = round(($p['by_currency'][$c] ?? 0) + $openFc, 2);
            $p['bills'][] = ['voucher_id' => (int) $b->voucher_id, 'voucher_number' => $b->voucher_number, 'date' => $date->toDateString(), 'due_date' => $due->toDateString(), 'open' => $open,
                'currency' => $c, 'open_fc' => $openFc, 'foreign' => $c !== $baseCode, 'days' => $days, 'days_late' => max(0, (int) $due->diffInDays($asOf, false)), 'bucket' => $key];
            unset($p);
        }

        // ── unapplied credits ──
        $refunded = DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')   // handed back by a refund payment
            ->where('b.ref_type', 'against')->where('v.status', Voucher::POSTED)->where('v.date', '<=', $asOf->toDateString())
            ->groupBy('b.against_voucher_id')->selectRaw('b.against_voucher_id as id, SUM(b.amount) as amt')->pluck('amt', 'id');
        $credits = $this->narrow(DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
            ->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->join('ledgers as l', 'l.id', '=', 'b.ledger_id')
            ->where('b.ref_type', 'advance')->where('v.status', Voucher::POSTED)->whereIn('t.base_type', $this->creditBases())->where('v.date', '<=', $asOf->toDateString())
            ->when(! empty($options['ledger_id']), fn ($q) => $q->where('b.ledger_id', (int) $options['ledger_id'])), $scope)
            ->orderBy('v.date')->orderBy('v.id')
            ->get(['b.voucher_id', 'b.ledger_id', 'l.name as party', 'v.voucher_number', 'v.date', 'v.meta', 'b.amount', 't.base_type', 't.name as type_name', 'v.total_amount', 'v.base_total', 'v.currency_id']);
        foreach ($credits as $c) {
            $leftFc = round((float) $c->amount - (float) ($refunded[$c->voucher_id] ?? 0), 2);
            if ($leftFc <= 0.005) {
                continue;
            }
            $meta = is_string($c->meta) ? (json_decode($c->meta, true) ?: []) : (array) $c->meta;
            $amount = $inBase($leftFc, $c);
            $p = &$parties[$c->ledger_id];
            $p ??= $newParty($c->ledger_id, $c->party);
            $p['credits'][] = ['voucher_id' => (int) $c->voucher_id, 'voucher_number' => $c->voucher_number, 'type' => $c->base_type, 'type_name' => $c->type_name, 'date' => Carbon::parse($c->date)->toDateString(),
                'nature' => in_array($c->base_type, ['credit_note', 'debit_note'], true) ? 'note' : (array_key_exists('advance', $meta) ? 'advance' : ($c->base_type === 'payment' ? 'prepayment' : 'overpayment')), 'for' => $meta['advance']['for'] ?? null,
                'amount' => $amount, 'currency' => $code($c), 'amount_fc' => $leftFc, 'foreign' => $code($c) !== $baseCode];
            $p['credit_total'] = round($p['credit_total'] + $amount, 2);
            unset($p);
        }

        $rows = array_values($parties);
        $totals = $zero + ['total' => 0.0];
        $creditTotal = 0.0;
        foreach ($rows as &$r) {
            $r['net'] = round($r['total'] - $r['credit_total'], 2);
            $r['currencies'] = implode('; ', array_map(fn ($c, $v) => $c . ' ' . number_format($v, 2), array_keys($r['by_currency']), $r['by_currency']));
            $r['has_foreign'] = (bool) array_diff(array_keys($r['by_currency']), [$baseCode]);
            usort($r['bills'], fn ($a, $b) => [$a['due_date'], $a['voucher_id']] <=> [$b['due_date'], $b['voucher_id']]);
            foreach ($buckets as $x) {
                $totals[$x['key']] = round($totals[$x['key']] + $r['buckets'][$x['key']], 2);
            }
            $totals['total'] = round($totals['total'] + $r['total'], 2);
            $creditTotal = round($creditTotal + $r['credit_total'], 2);
        }
        unset($r);
        usort($rows, fn ($a, $b) => [$b['total'], $a['party']] <=> [$a['total'], $b['party']]);

        $net = round($totals['total'] - $creditTotal, 2);

        return [
            'ready' => true, 'kind' => $this->side(), 'as_of' => $asOf->toDateString(), 'basis' => $basis, 'base_currency' => $baseCode, 'buckets' => $buckets,
            'rows' => $rows, 'totals' => $totals, 'credit_total' => $creditTotal, 'net' => $net, 'control' => $this->control($scope, $asOf->toDateString(), $net, empty($options['ledger_id'])),
        ];
    }

    /**
     * The net of bills and credits against the ledger balance of the debtors or creditors chosen in the Reports settings. The difference is what sits on
     * the ledgers outside any bill: opening balances, journals, entries made on account. Null when the group is not chosen, or a branch is picked
     * (ledger balances are not kept by a voucher's branch).
     */
    private function control(Scope $scope, string $asOf, float $net, bool $wholeBook): ?array
    {
        $ids = app(ReportSettings::class)->ratioLedgerIds($this->side() === 'payables' ? 'creditors' : 'debtors');
        if ($ids === null || $scope->locationId !== null || ! $wholeBook) {
            return null;
        }
        $balances = app(LedgerBalances::class)->balances(Scope::dates(null, $asOf, $scope->area), $asOf);
        $signed = array_sum(array_map(fn ($id) => $balances[$id] ?? 0.0, $ids));
        $book = round($this->side() === 'payables' ? -$signed : $signed, 2);

        return ['ledger_balance' => $book, 'net' => $net, 'difference' => round($book - $net, 2)];
    }

    public function table(array $data, Scope $scope): array
    {
        $cols = ['party' => 'Party', 'document' => 'Bill or credit', 'date' => 'Date', 'due' => 'Due'];
        foreach ($data['buckets'] as $x) {
            $cols[$x['key']] = $x['label'];
        }
        $cols += ['total' => 'Total', 'credit' => 'Unapplied credit', 'net' => 'Net'];
        $rows = [];
        foreach ($data['rows'] as $r) {
            $rows[] = ['party' => $r['party'], 'document' => '', 'date' => '', 'due' => ''] + $r['buckets'] + ['total' => $r['total'], 'credit' => $r['credit_total'] ?: '', 'net' => $r['net']];
            foreach ($r['bills'] as $b) {
                $rows[] = ['party' => '', 'document' => $b['voucher_number'] . ($b['foreign'] ? ' (' . $b['currency'] . ' ' . number_format($b['open_fc'], 2) . ')' : ''), 'date' => $b['date'], 'due' => $b['due_date']]
                    + array_fill_keys(array_column($data['buckets'], 'key'), '') + [$b['bucket'] => $b['open'], 'total' => $b['open'], 'credit' => '', 'net' => ''];
            }
            foreach ($r['credits'] as $c) {
                $rows[] = ['party' => '', 'document' => $c['voucher_number'] . ' (' . $c['type_name'] . ')', 'date' => $c['date'], 'due' => ''] + array_fill_keys(array_column($data['buckets'], 'key'), '') + ['total' => '', 'credit' => $c['amount'], 'net' => ''];
            }
        }

        return [
            'title' => ucfirst($data['kind']) . ' ageing', 'subtitle' => $this->period($scope), 'columns' => $cols, 'rows' => $rows,
            'totals' => ['party' => 'Total'] + $data['totals'] + ['credit' => $data['credit_total'], 'net' => $data['net']],
        ];
    }
}

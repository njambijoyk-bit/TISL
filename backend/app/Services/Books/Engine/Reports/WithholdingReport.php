<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\Identifiers;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\RestatedBase;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * The withholding certificate register on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.5): every certificate raised by a receipt or payment in the
 * period, a page at a time.
 *
 * Each row shows the amounts in the currency of the voucher with its code, and in the base currency beside them, so a column always adds up to the total
 * under it (audit F4). The numbers that identify the payment (cheque number, M-Pesa code) are on the row (F3). "Awaiting certificate" counts every
 * certificate still outstanding, whenever it was raised, and the period's own are shown separately (decision 20, F2).
 */
final class WithholdingReport extends ReportDefinition
{
    public const PER_PAGE = 200;

    public function key(): string
    {
        return 'withholding';
    }

    public function title(): string
    {
        return 'Withholding certificates';
    }

    public function filters(): array
    {
        return ['branch'];
    }

    /** The certificates that are not void, narrowed to the branch chosen and the branches this person may see. */
    private function certificates(Scope $scope): Builder
    {
        $q = RestatedBase::join(DB::table('withholding_certificates as c')->join('vouchers as v', 'v.id', '=', 'c.voucher_id'))
            ->where('c.status', '<>', 'void')
            ->when($scope->locationId !== null, fn ($x) => $x->where('v.location_id', $scope->locationId));
        app(BranchFilter::class)->apply($q, 'v.location_id', $scope->area, 'compliance');

        return $q;
    }

    private function inPeriod(Builder $q, Scope $scope): Builder
    {
        return $q->when($scope->from, fn ($x) => $x->where('v.date', '>=', $scope->from))->when($scope->to, fn ($x) => $x->where('v.date', '<=', $scope->to));
    }

    public function run(Scope $scope, array $options): array
    {
        $rate = RestatedBase::rate();
        $period = fn () => $this->inPeriod($this->certificates($scope), $scope);

        $sums = $period()->selectRaw("COUNT(*) AS n, SUM(CASE WHEN c.direction = 'receivable' THEN c.withheld_amount * {$rate} ELSE 0 END) AS receivable, "
            . "SUM(CASE WHEN c.direction = 'payable' THEN c.withheld_amount * {$rate} ELSE 0 END) AS payable, SUM(CASE WHEN c.status = 'pending' THEN 1 ELSE 0 END) AS awaiting_here")->first();
        $outstanding = $this->certificates($scope)->where('c.status', 'pending')->selectRaw("COUNT(*) AS n, SUM(c.withheld_amount * {$rate}) AS amount")->first();

        $count = (int) $sums->n;
        $export = ! empty($options['_export']);
        $size = $export ? max(1, $count) : self::PER_PAGE;
        $pages = max(1, (int) ceil($count / $size));
        $page = min(max(1, (int) ($options['page'] ?? 1)), $pages);

        $q = $period()->leftJoin('ledgers as p', 'p.id', '=', 'c.party_ledger_id')->leftJoin('ledgers as r', 'r.id', '=', 'c.tax_rate_id')->leftJoin('ledger_groups as g', 'g.id', '=', 'r.group_id')
            ->orderBy('v.date')->orderBy('c.id')
            ->select('c.id', 'v.date', 'v.voucher_number', 'v.id as voucher_id', 'c.certificate_number', 'c.direction', 'p.name as party', 'g.name as tax', 'r.name as rate_name',
                'c.gross_amount', 'c.withheld_amount', 'c.net_amount', 'c.status', 'c.credit_status', 'c.cleared_amount', 'cu.code as currency', 'cu.is_base', DB::raw("{$rate} as exchange_rate"));
        $found = $export ? $q->get() : $q->forPage($page, $size)->get();
        $baseCode = (string) (DB::table('currencies')->where('is_base', 1)->value('code') ?? '');
        $ids = (new Identifiers())->forVouchers($found->pluck('voucher_id')->all());

        $rows = $found->map(function ($x) use ($ids, $baseCode) {
            $ex = (float) ($x->exchange_rate ?: 1);
            $code = $x->currency ?: $baseCode;

            return [
                'id' => (int) $x->id, 'date' => substr((string) $x->date, 0, 10), 'voucher_id' => (int) $x->voucher_id, 'voucher_number' => $x->voucher_number, 'certificate_number' => $x->certificate_number,
                'direction' => $x->direction, 'party' => $x->party, 'tax' => $x->tax, 'rate' => $x->rate_name, 'currency' => $code, 'foreign' => $code !== $baseCode,
                'gross_amount' => round((float) $x->gross_amount, 2), 'withheld_amount' => round((float) $x->withheld_amount, 2), 'net_amount' => round((float) $x->net_amount, 2),
                'gross_base' => round((float) $x->gross_amount * $ex, 2), 'withheld_base' => round((float) $x->withheld_amount * $ex, 2),
                'status' => $x->status, 'credit_status' => $x->credit_status, 'cleared_amount' => round((float) $x->cleared_amount, 2),
                'identifiers' => isset($ids[$x->voucher_id]) ? Identifiers::labels($ids[$x->voucher_id]) : [],
            ];
        })->all();

        return [
            'ready' => true, 'from' => $scope->from, 'to' => $scope->to, 'base_currency' => $baseCode, 'rows' => $rows,
            'totals' => [
                'receivable' => round((float) $sums->receivable, 2), 'payable' => round((float) $sums->payable, 2),
                'awaiting_certificate' => (int) $outstanding->n, 'awaiting_amount' => round((float) $outstanding->amount, 2), 'awaiting_in_period' => (int) $sums->awaiting_here,
            ],
            'paging' => ['page' => $page, 'per_page' => $export ? $count : $size, 'pages' => $pages, 'total' => $count],
        ];
    }

    public function table(array $data, Scope $scope): array
    {
        $b = $data['base_currency'];
        $rows = array_map(fn ($r) => [
            'date' => $r['date'], 'certificate_number' => $r['certificate_number'], 'voucher_number' => $r['voucher_number'], 'identifiers' => implode('; ', $r['identifiers']), 'direction' => $r['direction'],
            'party' => $r['party'], 'tax' => $r['tax'], 'currency' => $r['currency'], 'gross_amount' => $r['gross_amount'], 'withheld_amount' => $r['withheld_amount'], 'withheld_base' => $r['withheld_base'],
            'status' => $r['status'], 'credit_status' => $r['credit_status'],
        ], $data['rows']);

        return [
            'title' => $this->title(), 'subtitle' => $this->period($scope),
            'columns' => ['date' => 'Date', 'certificate_number' => 'Certificate', 'voucher_number' => 'Voucher', 'identifiers' => 'Identifiers', 'direction' => 'Direction', 'party' => 'Party', 'tax' => 'Tax',
                'currency' => 'Currency', 'gross_amount' => 'Gross', 'withheld_amount' => 'Withheld', 'withheld_base' => "Withheld ({$b})", 'status' => 'Certificate', 'credit_status' => 'Credit'],
            'rows' => $rows,
            'totals' => ['party' => "Totals ({$b})", 'direction' => 'Receivable ' . number_format($data['totals']['receivable'], 2) . ' · Payable ' . number_format($data['totals']['payable'], 2)],
        ];
    }
}

<?php

namespace App\Services\Books\Engine\Reports;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\Identifiers;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\RestatedBase;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Day book: every voucher in the period, in date order, a page at a time (docs/BOOKS_REPORTS_PLAN.md, step 6.1, decision 12).
 *
 *  - General view: each voucher once, with its whole amount. A voucher spread over cost centres opens to show the split.
 *  - Cost-centre view: each allocation under its own cost centre (one voucher number, several rows). The amount of an allocation is what its
 *    debit lines carry, so the rows of a voucher add up to the voucher and a voucher is never counted once per cost centre.
 *
 * A cost centre or branch narrows the entry lines like every other report (audit A1): a voucher shows when it has a line there. Drafts and cancelled
 * vouchers are listed and marked but never counted in the posted total. A memorandum is a note, not a transaction, and is left out.
 */
final class DayBookReport extends ReportDefinition
{
    public const PER_PAGE = 200;

    public function key(): string
    {
        return 'day-book';
    }

    public function title(): string
    {
        return 'Day book';
    }

    public function options(): array
    {
        $types = ['' => 'All voucher types'];
        if (Schema::hasTable('voucher_types')) {
            foreach (DB::table('voucher_types')->where('base_type', '!=', VoucherType::MEMORANDUM)->orderBy('name')->get(['id', 'name']) as $t) {
                $types[(string) $t->id] = $t->name;
            }
        }

        return [
            ['key' => 'view', 'label' => 'View', 'choices' => ['general' => 'Each voucher once', 'cost_centre' => 'By cost centre'], 'default' => 'general'],
            ['key' => 'type', 'label' => 'Voucher type', 'choices' => $types, 'default' => ''],
        ];
    }

    /** The vouchers that count: the period, the type, the cost centre or branch (on the lines), the branches this person may see. */
    private function vouchers(Scope $scope, int $typeId, bool $lines): Builder
    {
        $q = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('t.base_type', '!=', VoucherType::MEMORANDUM)
            ->leftJoin('ledgers as p', 'p.id', '=', 'v.party_ledger_id');
        RestatedBase::join($q);
        if ($scope->from) {
            $q->where('v.date', '>=', $scope->from);
        }
        if ($scope->to) {
            $q->where('v.date', '<=', $scope->to);
        }
        if ($typeId) {
            $q->where('v.voucher_type_id', $typeId);
        }
        $narrow = function ($e) use ($scope) {
            if ($scope->costCentreIds !== null) {
                $e->whereIn('e.cost_centre_id', $scope->costCentreIds);
            }
            if ($scope->initiativeIds !== null) {
                $e->whereIn('e.initiative_id', $scope->initiativeIds);
            }
            if ($scope->locationId !== null) {
                $e->where('e.location_id', $scope->locationId);
            }
        };
        if ($scope->dimensional() && ! $lines) {
            $q->whereExists(function ($x) use ($narrow) {
                $x->select(DB::raw(1))->from('voucher_entries as e')->whereColumn('e.voucher_id', 'v.id');
                $narrow($x);
            });
        }
        app(BranchFilter::class)->apply($q, 'v.location_id', $scope->area, 'day_book');

        return $q;
    }

    public function run(Scope $scope, array $options): array
    {
        $byCostCentre = ($options['view'] ?? 'general') === 'cost_centre';
        $typeId = (int) ($options['type'] ?? 0);
        $export = ! empty($options['_export']);
        $page = max(1, (int) ($options['page'] ?? 1));

        return $byCostCentre ? $this->allocations($scope, $typeId, $page, $export) : $this->general($scope, $typeId, $page, $export);
    }

    private function general(Scope $scope, int $typeId, int $page, bool $export): array
    {
        $count = (clone $this->vouchers($scope, $typeId, false))->count();
        $total = (float) (clone $this->vouchers($scope, $typeId, false))->where('v.status', Voucher::POSTED)->selectRaw('SUM(' . RestatedBase::total() . ') AS s')->value('s');
        [$page, $pages, $size] = $this->paging($count, $page, $export);

        $q = $this->vouchers($scope, $typeId, false)->orderBy('v.date')->orderBy('v.id')
            ->select('v.id', 'v.date', 'v.voucher_number', 't.name as type', 't.base_type', 'p.name as party', 'v.status', 'v.narration', 'v.reference_no', DB::raw(RestatedBase::total() . ' AS total'));
        $found = $export ? $q->get() : $q->forPage($page, $size)->get();
        $ids = $found->pluck('id')->all();
        $split = $this->split($ids);
        $identifiers = $this->identifiers($ids);

        $rows = $found->map(fn ($r) => [
            'id' => (int) $r->id, 'date' => substr((string) $r->date, 0, 10), 'voucher_number' => $r->voucher_number, 'type' => $r->type, 'base_type' => $r->base_type, 'party' => $r->party,
            'status' => $r->status, 'narration' => $r->narration, 'identifiers' => $identifiers[$r->id] ?? [], 'total' => round((float) $r->total, 2), 'split' => $split[$r->id] ?? [],
        ])->all();

        return ['ready' => true, 'view' => 'general', 'rows' => $rows, 'total' => round($total, 2), 'paging' => $this->pagingInfo($count, $page, $size, $export)];
    }

    private function allocations(Scope $scope, int $typeId, int $page, bool $export): array
    {
        $names = $this->costCentreNames();
        $base = function () use ($scope, $typeId) {
            $q = $this->vouchers($scope, $typeId, true)->join('voucher_entries as e', 'e.voucher_id', '=', 'v.id')->where('e.side', 'D');
            if ($scope->costCentreIds !== null) {
                $q->whereIn('e.cost_centre_id', $scope->costCentreIds);
            }
            if ($scope->initiativeIds !== null) {
                $q->whereIn('e.initiative_id', $scope->initiativeIds);
            }
            if ($scope->locationId !== null) {
                $q->where('e.location_id', $scope->locationId);
            }

            return $q;
        };
        $group = ['v.id', 'v.date', 'v.voucher_number', 't.name', 't.base_type', 'p.name', 'v.status', 'v.narration', 'e.cost_centre_id'];
        $grouped = fn () => $base()->groupBy(...$group)->select('v.id', 'v.date', 'v.voucher_number', 't.name as type', 't.base_type', 'p.name as party', 'v.status', 'v.narration', 'e.cost_centre_id', DB::raw('SUM(' . RestatedBase::entry() . ') AS total'));

        $count = DB::query()->fromSub($grouped(), 'g')->count();
        $total = (float) $base()->where('v.status', Voucher::POSTED)->selectRaw('SUM(' . RestatedBase::entry() . ') AS s')->value('s');
        [$page, $pages, $size] = $this->paging($count, $page, $export);
        $q = $grouped()->orderBy('v.date')->orderBy('v.id')->orderBy('e.cost_centre_id');
        $found = $export ? $q->get() : $q->forPage($page, $size)->get();
        $identifiers = $this->identifiers($found->pluck('id')->unique()->all());

        $rows = $found->map(fn ($r) => [
            'id' => (int) $r->id, 'date' => substr((string) $r->date, 0, 10), 'voucher_number' => $r->voucher_number, 'type' => $r->type, 'base_type' => $r->base_type, 'party' => $r->party,
            'status' => $r->status, 'narration' => $r->narration, 'identifiers' => $identifiers[$r->id] ?? [], 'cost_centre_id' => $r->cost_centre_id ? (int) $r->cost_centre_id : null,
            'cost_centre' => $r->cost_centre_id ? ($names[(int) $r->cost_centre_id] ?? 'Cost centre ' . $r->cost_centre_id) : 'Not allocated', 'total' => round((float) $r->total, 2),
        ])->all();

        return ['ready' => true, 'view' => 'cost_centre', 'rows' => $rows, 'total' => round($total, 2), 'paging' => $this->pagingInfo($count, $page, $size, $export)];
    }

    /** @return array{0: int, 1: int, 2: int} the page (kept inside the pages that exist), how many pages, the page size */
    private function paging(int $count, int $page, bool $export): array
    {
        $size = $export ? max(1, $count) : self::PER_PAGE;
        $pages = max(1, (int) ceil($count / $size));

        return [min($page, $pages), $pages, $size];
    }

    private function pagingInfo(int $count, int $page, int $size, bool $export): array
    {
        return ['page' => $page, 'per_page' => $export ? $count : $size, 'pages' => max(1, (int) ceil($count / max(1, $size))), 'total' => $count];
    }

    /** @return array<int, string> cost centre names by id */
    private function costCentreNames(): array
    {
        return Schema::hasTable('cost_centres') ? DB::table('cost_centres')->pluck('name', 'id')->map(fn ($n) => (string) $n)->all() : [];
    }

    /**
     * How each voucher divides across cost centres (its debit lines): only vouchers on more than one are given a split.
     *
     * @param  int[]  $ids
     * @return array<int, array[]>
     */
    private function split(array $ids): array
    {
        if (! $ids || ! LedgerBalances::hasColumn('voucher_entries', 'cost_centre_id')) {
            return [];
        }
        $names = $this->costCentreNames();
        $q = RestatedBase::join(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id'))
            ->whereIn('e.voucher_id', $ids)->where('e.side', 'D')->groupBy('e.voucher_id', 'e.cost_centre_id')
            ->selectRaw('e.voucher_id, e.cost_centre_id, SUM(' . RestatedBase::entry() . ') AS amount')->orderBy('e.voucher_id')->orderBy('e.cost_centre_id');
        $by = [];
        foreach ($q->get() as $r) {
            $by[(int) $r->voucher_id][] = ['cost_centre_id' => $r->cost_centre_id ? (int) $r->cost_centre_id : null, 'cost_centre' => $r->cost_centre_id ? ($names[(int) $r->cost_centre_id] ?? 'Cost centre ' . $r->cost_centre_id) : 'Not allocated', 'amount' => round((float) $r->amount, 2)];
        }

        return array_filter($by, fn ($parts) => count($parts) > 1);
    }

    /**
     * What identifies each voucher's payment: cheque number and date, transfer or slip number, the reference a tender carries (an M-Pesa code).
     *
     * @param  int[]  $ids
     * @return array<int, string[]>
     */
    private function identifiers(array $ids): array
    {
        return array_map(fn ($e) => Identifiers::labels($e), (new Identifiers())->forVouchers($ids));
    }

    public function table(array $data, Scope $scope): array
    {
        $cc = ($data['view'] ?? 'general') === 'cost_centre';
        $columns = ['date' => 'Date', 'voucher_number' => 'Number', 'type' => 'Type', 'party' => 'Party', 'status' => 'Status']
            + ($cc ? ['cost_centre' => 'Cost centre'] : []) + ['identifiers' => 'Identifiers', 'narration' => 'Narration', 'total' => 'Total'];

        return [
            'title' => $this->title(), 'subtitle' => $this->period($scope), 'columns' => $columns,
            'rows' => array_map(fn ($r) => array_intersect_key(['identifiers' => implode('; ', $r['identifiers']), 'party' => $r['party'] ?? ''] + $r, $columns), $data['rows']),
            'totals' => ['narration' => 'Posted total', 'total' => $data['total']],
        ];
    }
}

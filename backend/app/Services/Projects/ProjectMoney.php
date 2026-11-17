<?php

namespace App\Services\Projects;

use App\Services\Books\BudgetCommitments;
use App\Services\Books\BudgetService;
use App\Services\Books\BudgetTransferService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A project's money, read from the books (docs/PROJECTS_STAGE4_SPEC.md, build 4.2). Nothing here is typed in or stored: every figure is worked
 * out from posted Books entries on the project's cost centre and every cost centre under it (its phases), in the base currency.
 *
 *   agreed     the linked sales orders, or failing those the linked quotations
 *   billed     posted sales invoices and cash sales, less credit notes, on the project's cost centres
 *   owed       what is still open on those invoices, from Books' receivables ageing; paid is billed less owed
 *   income     income accounts on the project's cost centres (credits less debits)
 *   spent      expense accounts on the project's cost centres (debits less credits)
 *   committed  open purchase orders on them, as Books' budget control counts them
 *   budget     expense budget rows on them in each active budget's current version, with approved transfers
 *   profit     income less spent
 */
class ProjectMoney
{
    /** @return array<string, mixed> */
    public function for(object $project): array
    {
        $tree = $this->tree($project->cost_centre_id ? (int) $project->cost_centre_id : null);
        $books = Schema::hasTable('vouchers') && Schema::hasTable('voucher_entries') && Schema::hasTable('ledgers') && Schema::hasTable('ledger_groups');
        if (! $tree || ! $books) {
            return ['ready' => false, 'why' => ! $tree ? 'This piece of work has no cost centre in the books.' : 'The books are not set up.'];
        }
        $all = array_merge(...array_values($tree));
        $billedIds = $this->salesVoucherIds($all);
        $billed = $this->billed($all);
        $open = app(ProjectReceivables::class)->open($billedIds);
        $income = $this->sum($all, 'income');
        $spent = $this->sum($all, 'expense');
        $phases = [];
        foreach (DB::table('project_phases')->where('project_id', $project->id)->whereNull('deleted_at')->whereNotNull('cost_centre_id')->orderBy('sort_order')->orderBy('id')->get(['id', 'name', 'cost_centre_id']) as $ph) {
            $ids = $tree[(int) $ph->cost_centre_id] ?? [(int) $ph->cost_centre_id];
            $phases[] = ['id' => (int) $ph->id, 'name' => $ph->name, 'budget' => $this->budget($ids), 'spent' => $this->sum($ids, 'expense'), 'billed' => $this->billed($ids)];
        }

        return [
            'ready' => true, 'currency' => $this->currency(),
            'agreed' => $this->agreed((int) $project->id),
            'billed' => $billed, 'owed' => $open['owed'] ?? null, 'days_late' => $open['days_late'] ?? 0, 'paid' => $open === null ? null : round($billed - $open['owed'], 2),
            'income' => $income, 'spent' => $spent, 'profit' => round($income - $spent, 2),
            'committed' => $this->committed($all), 'budget' => $this->budget($all),
            'phases' => $phases, 'cost_centres' => count($all),
        ];
    }

    // ------------------------------------------------------------------ inside

    /** The project's cost centre and every one under it, grouped by each phase's own. @return array<int, int[]> cost centre id => itself and all under it */
    private function tree(?int $root): array
    {
        if (! $root || ! Schema::hasTable('cost_centres')) {
            return [];
        }
        $children = DB::table('cost_centres')->whereNotNull('parent_id')->get(['id', 'parent_id'])->groupBy('parent_id');
        $under = function (int $id) use (&$under, $children): array {
            $out = [$id];
            foreach ($children[$id] ?? [] as $c) {
                $out = array_merge($out, $under((int) $c->id));
            }

            return $out;
        };
        $out = [$root => $under($root)];
        foreach ($out[$root] as $id) {
            if ($id !== $root) {
                $out[$id] = $under($id);
            }
        }

        return $out;
    }

    /** Debits less credits (expense) or credits less debits (income) on accounts of that nature, on these cost centres, posted only. */
    private function sum(array $cc, string $nature): float
    {
        $lineCc = Schema::hasColumn('voucher_entries', 'cost_centre_id');
        $q = DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')->join('ledgers as l', 'l.id', '=', 'e.ledger_id')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')
            ->where('v.status', 'posted')->where('g.nature', $nature)
            ->whereIn($lineCc ? DB::raw('COALESCE(e.cost_centre_id, v.cost_centre_id)') : 'v.cost_centre_id', $cc);
        $amount = Schema::hasColumn('voucher_entries', 'base_amount') ? 'COALESCE(e.base_amount, e.amount)' : 'e.amount';
        $r = $q->selectRaw("SUM(CASE WHEN e.side = 'D' THEN {$amount} ELSE 0 END) as dr, SUM(CASE WHEN e.side = 'C' THEN {$amount} ELSE 0 END) as cr")->first();
        $dr = (float) ($r->dr ?? 0);
        $cr = (float) ($r->cr ?? 0);

        return round($nature === 'expense' ? $dr - $cr : $cr - $dr, 2);
    }

    /** @return int[] posted sales invoices and cash sales on these cost centres */
    private function salesVoucherIds(array $cc): array
    {
        return DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->where('v.status', 'posted')->whereIn('t.base_type', ['sales', 'cash_sale'])->whereIn('v.cost_centre_id', $cc)
            ->pluck('v.id')->map(fn ($v) => (int) $v)->all();
    }

    private function billed(array $cc): float
    {
        $total = Schema::hasColumn('vouchers', 'base_total') ? 'COALESCE(v.base_total, v.total_amount)' : 'v.total_amount';
        $r = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->where('v.status', 'posted')->whereIn('v.cost_centre_id', $cc)->whereIn('t.base_type', ['sales', 'cash_sale', 'credit_note'])
            ->selectRaw("SUM(CASE WHEN t.base_type = 'credit_note' THEN -{$total} ELSE {$total} END) as n")->first();

        return round((float) ($r->n ?? 0), 2);
    }

    /** The linked sales orders, or failing those the linked quotations. @return array{amount: float, from: string, count: int}|null */
    private function agreed(int $projectId): ?array
    {
        if (! Schema::hasTable('voucher_types')) {
            return null;
        }
        $total = Schema::hasColumn('vouchers', 'base_total') ? 'COALESCE(v.base_total, v.total_amount)' : 'v.total_amount';
        $rows = DB::table('project_links as l')->join('vouchers as v', 'v.id', '=', 'l.linked_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('l.project_id', $projectId)->where('l.module', 'books')->where('l.link_type', 'voucher')->whereNull('l.deleted_at')->where('v.status', '!=', 'cancelled')
            ->whereIn('t.base_type', ['sales_order', 'quotation'])->get(['t.base_type', DB::raw("{$total} as amount")]);
        foreach (['sales_order' => 'sales orders', 'quotation' => 'quotations'] as $base => $words) {
            $these = $rows->where('base_type', $base);
            if ($these->isNotEmpty()) {
                return ['amount' => round((float) $these->sum('amount'), 2), 'from' => $words, 'count' => $these->count()];
            }
        }

        return null;
    }

    private function committed(array $cc): ?float
    {
        try {
            $wanted = array_flip($cc);

            return round(array_sum(array_map(fn ($o) => isset($wanted[(int) ($o['cost_centre_id'] ?? 0)]) ? (float) $o['amount'] : 0.0, app(BudgetCommitments::class)->open('1900-01-01', '2999-12-31'))), 2);
        } catch (\Throwable) {
            return null;
        }
    }

    /** Expense budget on these cost centres: each active budget's current version, with approved transfers. Null when Books has no budgets. */
    private function budget(array $cc): ?float
    {
        if (! BudgetService::ready() || ! Schema::hasColumn('budget_rows', 'version_id')) {
            return null;
        }
        $service = app(BudgetService::class);
        $total = 0.0;
        $any = false;
        foreach (DB::table('budgets')->where('is_active', 1)->pluck('id') as $budgetId) {
            $version = $service->currentVersion((int) $budgetId);
            if (! $version) {
                continue;
            }
            $rows = DB::table('budget_rows')->where('version_id', $version)->whereIn('cost_centre_id', $cc)->get(['id', 'target_type', 'target_id', 'is_recovery']);
            $expense = $rows->filter(fn ($r) => $this->nature($r->target_type, (int) $r->target_id) === 'expense');
            if ($expense->isEmpty()) {
                continue;
            }
            $any = true;
            $lines = DB::table('budget_lines')->whereIn('row_id', $expense->pluck('id'))->groupBy('row_id')->selectRaw('row_id, SUM(amount) as n')->pluck('n', 'row_id');
            $moved = BudgetTransferService::ready() ? app(BudgetTransferService::class)->adjustments($version) : [];
            foreach ($expense as $r) {
                $n = (float) ($lines[$r->id] ?? 0) + array_sum($moved[(int) $r->id] ?? []);
                $total += $r->is_recovery ? -$n : $n;   // a recovery row lowers the net spend
            }
        }

        return $any ? round($total, 2) : null;
    }

    private function nature(string $type, int $id): ?string
    {
        return $type === 'group' ? DB::table('ledger_groups')->where('id', $id)->value('nature')
            : DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->where('l.id', $id)->value('g.nature');
    }

    private function currency(): ?string
    {
        try {
            return app(\App\Services\CurrencyConversionService::class)->getBaseCurrency()->code ?? null;
        } catch (\Throwable) {
            return null;
        }
    }
}

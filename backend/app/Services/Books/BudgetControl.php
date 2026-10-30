<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\CostCentres\CostCentreService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Budget controls (database script 242): what happens when a purchase, payment or journal would take an expense past its budget. The check reads the same budget rows and the
 * same actuals as the Budget against actual report, for the voucher's own cost centre and branch: the budget up to the voucher's date (or the month, or the whole budget, as
 * chosen) against what the books already show plus this voucher. Only expense debits are counted; sales, receipts and stock entries made by sales are never held up.
 *
 * What follows an overspend is the choice in force for the line (an exception for its account, department or cost centre, else the company-wide choice): warn and post, post and
 * wait for an approver, or block. A person who holds books.budget.exceed is never stopped or held; they are told. Approving a waiting overspend needs books.budget.approve.
 */
class BudgetControl
{
    public const MODES = ['off', 'warn', 'approval', 'block'];

    /** Voucher types whose expense debits are checked. */
    private const CONTROLLED = [VoucherType::PURCHASE, VoucherType::PAYMENT, VoucherType::JOURNAL];

    private const ORDER = ['none' => 0, 'warn' => 1, 'allowed' => 2, 'approval' => 3, 'block' => 4];

    public function __construct(private BudgetService $budgets) {}

    public static function ready(): bool
    {
        return Schema::hasTable('budget_control_rules') && Schema::hasTable('budget_overrides');
    }

    /** @return array{mode: string, basis: string, alert: int} */
    public function settings(): array
    {
        $v = ReportSettings::ready() ? app(ReportSettings::class)->values() : [];
        $mode = (string) ($v['budget_control_mode'] ?? 'off');
        $basis = (string) ($v['budget_control_basis'] ?? 'ytd');

        return ['mode' => in_array($mode, self::MODES, true) ? $mode : 'off', 'basis' => in_array($basis, ['ytd', 'month', 'year'], true) ? $basis : 'ytd', 'alert' => max(0, min(100, (int) ($v['budget_alert_percent'] ?? 80)))];
    }

    // ------------------------------------------------------------ the check

    /**
     * Check what a voucher is about to post. Returns the lines that would be over budget (or near it) and what follows for this person:
     * action is none, warn, allowed (over, but the person may exceed budgets), approval (it posts and waits) or block.
     *
     * @param  array<string, mixed>  $plan  the voucher plan (date, entries, location_id, rate)
     * @return array{action: string, mode: string, can_exceed: bool, breaches: array<int, array<string, mixed>>}
     */
    public function assess(array $plan, VoucherType $type, array $data, ?User $user): array
    {
        $s = $this->settings();
        $none = ['action' => 'none', 'mode' => $s['mode'], 'can_exceed' => false, 'breaches' => []];
        if (! in_array($type->base_type, self::CONTROLLED, true) || ! BudgetService::ready() || ! self::ready()) {
            return $none;
        }
        $rules = DB::table('budget_control_rules')->get()->mapWithKeys(fn ($r) => ["{$r->scope_type}:{$r->scope_id}" => $r->mode])->all();
        if ($s['mode'] === 'off' && ! array_filter($rules, fn ($m) => $m !== 'off')) {
            return $none;
        }
        $date = $plan['date']->toDateString();
        $version = $this->budgets->currentVersionFor($date, $date);
        if (! $version) {
            return $none;
        }
        $lines = $this->expenseLines($plan, $type, $data);
        if (! $lines) {
            return $none;
        }
        [$from, $to] = $this->range($version, $date, $s['basis']);
        $can = $user && app(Authorizer::class)->allows($user, 'books.budget.exceed');
        $ledgerGroup = collect(app(\App\Services\Books\Engine\LedgerBalances::class)->ledgers())->pluck('group_id', 'id');
        $cc = app(CostCentreService::class);

        // the budget lines, an expense and its recovery on the same account and dimensions counting as one
        $net = [];
        $onBooks = \App\Observers\VoucherDimensionsObserver::initiativesReady();
        $carry = $s['basis'] === 'month' && $this->budgets->carriesForward();
        $seriesFrom = $carry ? $this->range($version, $date, 'ytd')[0] : $from;   // with carry-forward the months before this one matter
        foreach ($this->budgets->lines($seriesFrom, $to, $version, true) as $r) {
            if ($r['section'] !== 'expense' || ($r['initiative_id'] !== null && ! $onBooks)) {
                continue;   // an initiative's budget can only be checked once the books carry the initiative
            }
            $k = implode('|', [$r['type'], $r['target_id'], $r['cost_centre_id'], $r['department_id'], $r['location_id'], $r['initiative_id']]);
            $net[$k] ??= $r + ['budget' => 0.0, 'series' => []];
            $sign = $r['is_recovery'] ? -1 : 1;
            $thisMonth = substr($date, 0, 7);
            foreach ($r['months'] as $ym => $amt) {
                $net[$k]['series'][$ym] = ($net[$k]['series'][$ym] ?? 0) + $sign * $amt;
                if ($carry ? $ym === $thisMonth : true) {
                    $net[$k]['budget'] += $sign * $amt;
                }
            }
        }
        $breaches = [];
        $worst = 'none';
        foreach ($net as $row) {
            $ids = $this->budgets->ledgerIds($row['type'], (int) $row['target_id'], $ledgerGroup);
            $ccs = null;
            $depCc = $row['department_id'] ? DB::table('departments')->where('id', $row['department_id'])->value('cost_centre_id') : null;
            $ccRoot = $depCc ?? $row['cost_centre_id'];
            if ($ccRoot && $cc->booksReady()) {
                $ccs = $cc->withDescendants((int) $ccRoot);
            }
            $inis = $row['initiative_id'] !== null ? $this->budgets->initiativeWithDescendants((int) $row['initiative_id']) : null;
            $mine = array_filter($lines, fn ($l) => in_array($l['ledger_id'], $ids, true) && ($ccs === null || in_array($l['cost_centre_id'], $ccs, true)) && ($row['location_id'] === null || $l['location_id'] === $row['location_id'])
                && ($inis === null || in_array($l['initiative_id'], $inis, true)));
            if (! $mine) {
                continue;
            }
            $amount = round(array_sum(array_column($mine, 'amount')), 2);
            $mode = $this->modeFor($row, $depCc, $rules, $s['mode']);
            $actualMonths = $this->budgets->actuals($row + ['nature' => 'expense'], $carry ? $seriesFrom : $from, $date)['months'];
            if ($carry) {
                $thisMonth = substr($date, 0, 7);
                $before = fn (array $by) => array_filter($by, fn ($x, $ym) => $ym < $thisMonth, ARRAY_FILTER_USE_BOTH);
                $row['budget'] += BudgetService::carriedInto($before($row['series']), $before($actualMonths));   // last month's leftover is this month's room
                $actualMonths = [$thisMonth => $actualMonths[$thisMonth] ?? 0.0];
            }
            $actual = round(array_sum($actualMonths), 2);
            $after = round($actual + $amount, 2);
            $budget = round($row['budget'], 2);
            $over = $after > $budget + 0.005;
            $used = $budget > 0.005 ? round($after / $budget * 100, 1) : null;
            $near = ! $over && $s['alert'] > 0 && $used !== null && $used >= $s['alert'];
            if ((! $over && ! $near) || ($over && $mode === 'off')) {
                continue;
            }
            $action = $near ? 'warn' : ($can ? 'allowed' : $mode);
            $worst = self::ORDER[$action] > self::ORDER[$worst] ? $action : $worst;
            $breaches[] = ['line' => $row['name'] . ($row['dimensions'] ? ', ' . implode(' › ', $row['dimensions']) : ''), 'budget_row_id' => $row['id'], 'level' => $near ? 'near' : 'over', 'budget' => $budget, 'spent_before' => $actual, 'amount' => $amount,
                'after' => $after, 'over_by' => $over ? round($after - $budget, 2) : 0.0, 'used_pct' => $used, 'mode' => $mode, 'action' => $action, 'period' => "{$from} to {$date}"];
        }

        return ['action' => $worst, 'mode' => $s['mode'], 'can_exceed' => (bool) $can, 'breaches' => $breaches];
    }

    /** Expense debits of a plan, each with the cost centre and branch it will carry. @return array<int, array{ledger_id: int, amount: float, cost_centre_id: ?int, location_id: ?int, initiative_id: ?int}> */
    private function expenseLines(array $plan, VoucherType $type, array $data): array
    {
        $entries = array_filter($plan['entries'] ?? [], fn ($e) => ($e['side'] ?? '') === 'D' && empty($e['is_tax']) && empty($e['is_party']));
        if (! $entries) {
            return [];
        }
        $expense = DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->whereIn('l.id', array_column($entries, 'ledger_id'))->where('g.nature', 'expense')->pluck('l.id')->map(fn ($i) => (int) $i)->flip();
        $cc = app(CostCentreService::class);
        $default = false;   // the voucher's own cost centre, looked up only when a line does not carry one
        $out = [];
        foreach ($entries as $e) {
            if (! isset($expense[(int) $e['ledger_id']])) {
                continue;
            }
            if (empty($e['cost_centre_id']) && $default === false) {
                $default = $cc->booksReady() ? ($data['cost_centre_id'] ?? $cc->forVoucher($type->base_type, $plan['location_id'] ?? null)) : null;
            }
            $lineCc = ! empty($e['cost_centre_id']) ? $e['cost_centre_id'] : ($default ?: null);
            $out[] = ['ledger_id' => (int) $e['ledger_id'], 'amount' => (float) ($e['base_amount'] ?? $e['amount'] ?? 0), 'cost_centre_id' => $lineCc ? (int) $lineCc : null,
                'location_id' => ($e['location_id'] ?? $plan['location_id'] ?? null) ? (int) ($e['location_id'] ?? $plan['location_id']) : null,
                'initiative_id' => ($e['initiative_id'] ?? $data['initiative_id'] ?? null) ? (int) ($e['initiative_id'] ?? $data['initiative_id']) : null];
        }

        return $out;
    }

    /** The months a check covers: from the budget's start (or the month's) to the end of the voucher's month, or the whole budget. @return array{0: string, 1: string} */
    private function range(int $version, string $date, string $basis): array
    {
        $b = DB::table('budget_versions as v')->join('budgets as b', 'b.id', '=', 'v.budget_id')->where('v.id', $version)->first(['b.from_month', 'b.to_month']);
        $monthStart = substr($date, 0, 7) . '-01';
        if ($basis === 'month') {
            return [$monthStart, \Illuminate\Support\Carbon::parse($monthStart)->endOfMonth()->toDateString()];
        }
        if ($basis === 'year') {
            return [$b->from_month . '-01', \Illuminate\Support\Carbon::parse($b->to_month . '-01')->endOfMonth()->toDateString()];
        }

        return [$b->from_month . '-01', \Illuminate\Support\Carbon::parse($monthStart)->endOfMonth()->toDateString()];
    }

    /** The choice for a budget line: an exception for its account, then its department, then its cost centre, else the company-wide choice. */
    private function modeFor(array $row, $deptCc, array $rules, string $default): string
    {
        foreach ([$row['type'] . ':' . $row['target_id'], $row['department_id'] ? 'department:' . $row['department_id'] : null, $row['cost_centre_id'] ? 'cost_centre:' . $row['cost_centre_id'] : null] as $k) {
            if ($k && isset($rules[$k])) {
                return $rules[$k];
            }
        }

        return $default;
    }

    /** What to tell the person when a voucher is stopped. */
    public function message(array $check): string
    {
        $b = collect($check['breaches'])->firstWhere('action', 'block') ?? $check['breaches'][0];

        return sprintf('This would take %s over its budget: %s budgeted for %s, %s already spent and %s on this voucher (over by %s). It is blocked; ask someone who may exceed budgets, or have the budget raised.',
            $b['line'], number_format($b['budget'], 2), $b['period'], number_format($b['spent_before'], 2), number_format($b['amount'], 2), number_format($b['over_by'], 2));
    }

    // ------------------------------------------------------------ what was done about it

    /** Keep a record of every line a posted voucher took over budget; one waiting for approval is pending. Whatever an edited voucher recorded before is replaced. */
    public function record(Voucher $voucher, array $check, ?User $by): void
    {
        if (! self::ready()) {
            return;
        }
        DB::table('budget_overrides')->where('voucher_id', $voucher->id)->whereIn('status', ['noted', 'pending'])->update(['status' => 'withdrawn', 'updated_at' => now()]);
        foreach ($check['breaches'] as $b) {
            if ($b['level'] !== 'over') {
                continue;
            }
            DB::table('budget_overrides')->insert(['voucher_id' => $voucher->id, 'line_label' => mb_substr($b['line'], 0, 255), 'budget' => $b['budget'], 'spent_before' => $b['spent_before'], 'amount' => $b['amount'], 'over_by' => $b['over_by'], 'mode' => $b['mode'],
                'permitted' => $b['action'] === 'allowed' ? 1 : 0, 'status' => $b['action'] === 'approval' ? 'pending' : 'noted', 'requested_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    /** A cancelled voucher no longer needs anyone's approval. */
    public function withdraw(int $voucherId): void
    {
        if (self::ready()) {
            DB::table('budget_overrides')->where('voucher_id', $voucherId)->whereIn('status', ['noted', 'pending'])->update(['status' => 'withdrawn', 'updated_at' => now()]);
        }
    }

    /** @return array<int, array<string, mixed>> overspends, the ones waiting first */
    public function overrides(?string $status = null, int $limit = 100): array
    {
        if (! self::ready()) {
            return [];
        }
        $q = DB::table('budget_overrides as o')->leftJoin('vouchers as v', 'v.id', '=', 'o.voucher_id')->leftJoin('users as r', 'r.id', '=', 'o.requested_by')->leftJoin('users as d', 'd.id', '=', 'o.decided_by')
            ->where('o.status', '!=', 'withdrawn')->orderByRaw("CASE o.status WHEN 'pending' THEN 0 ELSE 1 END")->orderByDesc('o.id')->limit($limit);
        if ($status) {
            $q->where('o.status', $status);
        }

        return $q->get(['o.id', 'o.voucher_id', 'v.voucher_number', 'v.date', 'o.line_label', 'o.budget', 'o.spent_before', 'o.amount', 'o.over_by', 'o.mode', 'o.permitted', 'o.status', 'o.note', 'o.created_at', 'o.decided_at', 'r.name as requested_by', 'd.name as decided_by'])
            ->map(fn ($r) => (array) $r)->all();
    }

    /** Accept or turn down an overspend that is waiting. A turned-down one stays on the record: the voucher is for its author to cancel or change. */
    public function decide(int $id, string $action, ?User $by, ?string $note): string
    {
        $o = DB::table('budget_overrides')->where('id', $id)->first();
        abort_unless($o, 404, 'That overspend does not exist.');
        if ($o->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'That overspend is not waiting for approval.']);
        }
        if ($action === 'reject' && ($note === null || $note === '')) {
            throw ValidationException::withMessages(['note' => 'Say why it is turned down.']);
        }
        if ($action === 'approve' && $by && (int) $o->requested_by === (int) $by->id && (ReportSettings::ready() ? (bool) (app(ReportSettings::class)->values()['second_approver_budget'] ?? true) : true)) {
            throw ValidationException::withMessages(['status' => 'A second person must accept an overspend: the one who posted the voucher cannot. (This rule is in Reports settings, Approvals.)']);
        }
        $status = $action === 'approve' ? 'approved' : 'rejected';
        DB::table('budget_overrides')->where('id', $id)->update(['status' => $status, 'decided_by' => $by?->id, 'decided_at' => now(), 'note' => $note !== null && $note !== '' ? mb_substr($note, 0, 255) : null, 'updated_at' => now()]);

        return $status;
    }

    // ------------------------------------------------------------ exceptions

    /** @return array<int, array<string, mixed>> */
    public function rules(): array
    {
        if (! self::ready()) {
            return [];
        }
        $names = ['ledger' => DB::table('ledgers')->pluck('name', 'id'), 'group' => DB::table('ledger_groups')->pluck('name', 'id'),
            'department' => Schema::hasTable('departments') ? DB::table('departments')->pluck('name', 'id') : collect(), 'cost_centre' => Schema::hasTable('cost_centres') ? DB::table('cost_centres')->pluck('name', 'id') : collect()];

        return DB::table('budget_control_rules')->orderBy('scope_type')->orderBy('id')->get()->map(fn ($r) => ['id' => (int) $r->id, 'scope_type' => $r->scope_type, 'scope_id' => (int) $r->scope_id, 'name' => $names[$r->scope_type][$r->scope_id] ?? "#{$r->scope_id} (gone)", 'mode' => $r->mode])->all();
    }

    public function saveRule(array $in, ?User $by): int
    {
        abort_unless(self::ready(), 409, 'Run database script 242_budget_controls.sql first.');
        $type = (string) ($in['scope_type'] ?? '');
        $id = (int) ($in['scope_id'] ?? 0);
        $mode = (string) ($in['mode'] ?? '');
        $table = ['ledger' => 'ledgers', 'group' => 'ledger_groups', 'department' => 'departments', 'cost_centre' => 'cost_centres'][$type] ?? null;
        $errors = [];
        if (! $table || ! Schema::hasTable($table) || ! DB::table($table)->where('id', $id)->exists()) {
            $errors['scope_id'] = 'Choose an account, department or cost centre that exists.';
        }
        if (! in_array($mode, self::MODES, true)) {
            $errors['mode'] = 'Choose what happens: not checked, warn, wait for approval or block.';
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
        $where = ['scope_type' => $type, 'scope_id' => $id];
        if ($row = DB::table('budget_control_rules')->where($where)->first()) {
            DB::table('budget_control_rules')->where('id', $row->id)->update(['mode' => $mode, 'updated_at' => now()]);

            return (int) $row->id;
        }

        return (int) DB::table('budget_control_rules')->insertGetId($where + ['mode' => $mode, 'created_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function removeRule(int $id): void
    {
        abort_unless(DB::table('budget_control_rules')->where('id', $id)->delete(), 404, 'That exception does not exist.');
    }
}

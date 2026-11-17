<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Billing time (docs/PROJECTS_STAGE5_SPEC.md, build 5.8).
 *
 * Unbilled time is approved, billable time not yet on a bill (or on one that was cancelled), less what was written off. Each entry is priced by
 * the rate card (a Books service package); what it comes to is read from Books' price each time, never stored.
 *
 * Billing time up to a day makes one Books sales invoice with a service line per package (quantity = hours), on the work's cost centre, as the
 * Stage 4 setting says: posted from here (the bill permission, then the serious-action rules), or drafted (Books' sales form opens filled in,
 * and the saved invoice is tied back). Either way the bill is a row of the billing table (kind "time") so retention and advances come off it
 * exactly as they do a staged bill. Each entry remembers its bill; a cancelled invoice frees them; a drafted bill can be dropped.
 *
 * Writing off time (a whole entry or some minutes, with a reason, before it is billed) needs `projects.money.writeoff` and follows the
 * serious-action rules ("time.writeoff"); written-off time stays on the timesheet, marked.
 */
class ProjectTimeBilling
{
    public function __construct(private ProjectAccess $access, private ProjectRates $rates) {}

    /** @return array<string, mixed> */
    public function unbilled(object $project, User $user, ?string $upTo = null): array
    {
        $this->needReady();
        $rows = $this->open($project, $upTo);
        $drafts = $this->drafts($project);
        $groups = [];
        $missing = [];
        foreach ($rows as $e) {
            $hours = ((int) $e->minutes - (int) $e->written_off_minutes) / 60;
            $pkg = $this->rates->for($e);
            if (! $pkg) {
                $missing[$e->person] = true;
            }
            $k = $e->user_id . '|' . ($pkg['id'] ?? 0);
            $groups[$k] ??= ['person' => $e->person, 'package' => $pkg, 'hours' => 0.0, 'amount' => null, 'entries' => []];
            $groups[$k]['hours'] += $hours;
            $groups[$k]['entries'][] = ['id' => (int) $e->id, 'work_date' => $e->work_date, 'minutes' => (int) $e->minutes, 'written_off_minutes' => (int) $e->written_off_minutes, 'note' => $e->note,
                'task' => $e->task_number ? "{$project->number}-T{$e->task_number} {$e->task_title}" : null];
        }
        foreach ($groups as &$g) {
            $g['hours'] = round($g['hours'], 2);
            $g['amount'] = $g['package'] && $g['package']['price'] !== null ? round($g['hours'] * $g['package']['price'], 2) : null;
        }
        unset($g);
        $mode = app(ProjectSettings::class)->get('money')['bill_mode'];
        $money = $this->access->decide($user, 'money', $project)['allowed'];

        return [
            'ready' => true,
            'groups' => array_values($groups),
            'hours' => round(array_sum(array_column($groups, 'hours')), 2),
            'amount' => round(array_sum(array_map(fn ($g) => $g['amount'] ?? 0, $groups)), 2),
            'no_rate' => array_keys($missing),
            'drafts' => $drafts,
            'disbursements' => app(ProjectDisbursements::class)->open($project, $upTo),
            'mode' => $mode,
            'can' => ['bill' => $money && $user->hasPermission('projects.money.bill') && ($mode === 'post' || $user->hasPermission('books.post')),
                'writeoff' => $money && $user->hasPermission('projects.money.writeoff')],
        ];
    }

    /**
     * Bill time (and costs marked to bill back) up to a day. @param int[]|null $ids only these entries
     * @return array{mode: string, stage_id: int, voucher?: array{id: int, number: string}, form?: array<string, mixed>}
     */
    public function bill(object $project, User $by, ?string $upTo = null, ?array $ids = null): array
    {
        $this->needReady();
        $this->needBill($project, $by);
        $rows = $this->open($project, $upTo);
        if ($ids !== null) {
            $rows = $rows->whereIn('id', array_map('intval', $ids))->values();
        }
        $costs = app(ProjectDisbursements::class)->openRows($project, $upTo);
        if ($rows->isEmpty() && $costs->isEmpty()) {
            throw new ProjectException('There is no approved, billable time or cost to bill' . ($upTo ? ' up to that day.' : '.'));
        }
        $priced = $rows->map(fn ($e) => [$e, $this->rates->for($e)]);
        if ($bad = $priced->filter(fn ($x) => ! $x[1])->map(fn ($x) => $x[0]->person)->unique()->values()->all()) {
            throw new ProjectException('No rate covers the time of ' . implode(', ', $bad) . '. Add them to the rate card first.');
        }
        if (! $project->customer_id || ! $project->cost_centre_id) {
            throw new ProjectException('This work needs its client and its cost centre in the books first.');
        }
        $label = 'Time' . ($costs->isNotEmpty() ? ' and costs' : '') . ' to ' . Carbon::parse($upTo ?: now())->format('j M Y');
        $lines = $this->lines($priced, $costs, $upTo);
        $net = round(array_sum(array_map(fn ($l) => ($l['quantity'] ?? 1) * ($l['_price'] ?? 0), $lines)), 2);
        $mode = app(ProjectSettings::class)->get('money')['bill_mode'];

        return DB::transaction(function () use ($project, $by, $priced, $costs, $label, $lines, $net, $mode) {
            $stage = DB::table('project_billing_stages')->insertGetId(['project_id' => $project->id, 'name' => mb_substr($label, 0, 120), 'kind' => 'time', 'share' => 0, 'due_kind' => 'manual',
                'sort_order' => 0, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($priced as [$e, $pkg]) {
                DB::table('project_time')->where('id', $e->id)->update(['bill_stage_id' => $stage, 'rate_package_id' => $pkg['id'], 'updated_at' => now()]);
            }
            DB::table('project_disbursements')->whereIn('id', $costs->pluck('id')->all() ?: [0])->update(['bill_stage_id' => $stage]);
            $clean = array_map(fn ($l) => array_diff_key($l, ['_price' => 1]), $lines);
            if ($mode !== 'post') {
                ProjectLog::record((int) $project->id, $by, 'billing.time_drafted', 'billing_stage', $stage, null, ['entries' => $priced->count(), 'costs' => $costs->count()]);

                return ['mode' => 'draft', 'stage_id' => $stage, 'form' => $this->formFor($project, $stage, $clean, $label)];
            }
            $v = app(ProjectVoucherPoster::class)->sales(now()->toDateString(), (int) $project->customer_id, $clean, (int) $project->cost_centre_id, "{$project->number} {$project->title}: {$label}", mb_substr($project->number, 0, 60), $by);
            DB::table('project_billing_stages')->where('id', $stage)->update(['voucher_id' => $v['id'], 'updated_at' => now()]);
            $this->billed($stage, $v['id']);
            ProjectLog::record((int) $project->id, $by, 'billing.time_billed', 'billing_stage', $stage, null, ['voucher' => $v['number'], 'entries' => $priced->count(), 'costs' => $costs->count()]);
            $taken = app(ProjectTerms::class)->deduct($project, $stage, $by, $net);

            return ['mode' => 'post', 'stage_id' => $stage, 'voucher' => $v, 'taken' => $taken];
        });
    }

    /** For the Books sales form opened from a drafted time bill. @return array<string, mixed> */
    public function form(object $project, int $stageId): array
    {
        $s = DB::table('project_billing_stages')->where('id', $stageId)->where('project_id', $project->id)->where('kind', 'time')->first() ?? throw new ProjectException('Not found.', 404);
        if ($s->voucher_id && DB::table('vouchers')->where('id', $s->voucher_id)->where('status', '!=', 'cancelled')->exists()) {
            throw new ProjectException('This bill is already in the books.');
        }
        $rows = $this->rowsQuery()->where('t.bill_stage_id', $stageId)->get();
        $priced = $rows->map(fn ($e) => [$e, ['id' => (int) $e->rate_package_id] + (collect($this->rates->packages())->firstWhere('id', (int) $e->rate_package_id) ?? [])]);
        $costs = app(ProjectDisbursements::class)->rowsOnBill($stageId);

        return $this->formFor($project, $stageId, array_map(fn ($l) => array_diff_key($l, ['_price' => 1]), $this->lines($priced, $costs, null)), $s->name);
    }

    /** A drafted time bill is dropped: its time and costs are free to bill again. */
    public function drop(object $project, int $stageId, User $by): void
    {
        $this->needBill($project, $by);
        $s = DB::table('project_billing_stages')->where('id', $stageId)->where('project_id', $project->id)->where('kind', 'time')->first() ?? throw new ProjectException('Not found.', 404);
        if ($s->voucher_id) {
            throw new ProjectException('This bill is in the books. Cancel it there, and its time is free again.');
        }
        DB::transaction(function () use ($s, $project, $by) {
            DB::table('project_time')->where('bill_stage_id', $s->id)->whereNull('billed_voucher_id')->update(['bill_stage_id' => null, 'rate_package_id' => null, 'updated_at' => now()]);
            DB::table('project_disbursements')->where('bill_stage_id', $s->id)->whereNull('billed_voucher_id')->update(['bill_stage_id' => null]);
            DB::table('project_billing_stages')->where('id', $s->id)->delete();
            ProjectLog::record((int) $project->id, $by, 'billing.time_dropped', 'billing_stage', (int) $s->id, ['name' => $s->name], null);
        });
    }

    /** A time bill is in the books: its entries and costs remember the invoice. */
    public function billed(int $stageId, int $voucherId): void
    {
        DB::table('project_time')->where('bill_stage_id', $stageId)->update(['billed_voucher_id' => $voucherId, 'updated_at' => now()]);
        DB::table('project_disbursements')->where('bill_stage_id', $stageId)->update(['billed_voucher_id' => $voucherId]);
    }

    /** What an invoice's lines come to before tax, as Books has them. */
    public function netOf(int $voucherId): float
    {
        return Schema::hasTable('voucher_items') ? round((float) DB::table('voucher_items')->where('voucher_id', $voucherId)->where(fn ($q) => $q->whereNull('is_header')->orWhere('is_header', 0))->sum('amount'), 2) : 0.0;
    }

    /** Write off a whole entry or some of its minutes, before it is billed. The caller has asked the serious-action rules. */
    public function writeOff(int $entryId, int $minutes, string $reason, User $by): void
    {
        $this->needReady();
        $e = DB::table('project_time')->where('id', $entryId)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
        $project = app(ProjectService::class)->findFor($by, (int) $e->project_id, 'money');
        if (! $by->hasPermission('projects.money.writeoff')) {
            throw new ProjectException('Writing off time needs its own permission.', 403);
        }
        if ($e->state !== 'approved') {
            throw new ProjectException('Time is written off once it is approved.');
        }
        if ($this->isBilled($e)) {
            throw new ProjectException('This time is on a bill. Credit it in Books instead.');
        }
        if ($minutes < 0 || $minutes > (int) $e->minutes) {
            throw new ProjectException('Write off from nothing up to the ' . (int) $e->minutes . ' minutes logged.');
        }
        $reason = trim($reason);
        if ($reason === '' && $minutes > 0) {
            throw new ProjectException('Say why it is written off.');
        }
        DB::table('project_time')->where('id', $e->id)->update(['written_off_minutes' => $minutes, 'write_off_reason' => $minutes ? mb_substr($reason, 0, 300) : null, 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'time.written_off', 'time', (int) $e->id, ['written_off_minutes' => (int) $e->written_off_minutes], ['written_off_minutes' => $minutes], ProjectLog::DONE, $reason ?: null);
    }

    // ------------------------------------------------------------------ inside

    /** The service lines (one per package, hours) and the cost lines of a bill. @return array<int, array<string, mixed>> */
    private function lines(Collection $priced, Collection $costs, ?string $upTo): array
    {
        $lines = [];
        foreach ($priced->groupBy(fn ($x) => $x[1]['id']) as $pkgId => $g) {
            $pkg = $g->first()[1];
            $hours = round($g->sum(fn ($x) => ((int) $x[0]->minutes - (int) $x[0]->written_off_minutes) / 60), 2);
            if ($hours <= 0) {
                continue;
            }
            $lines[] = ['type' => 'service', 'service_id' => $pkg['service_id'] ?? null, 'service_variant_id' => (int) $pkgId, 'quantity' => $hours,
                'label' => trim(($pkg['service'] ?? '') . ' · ' . ($pkg['name'] ?? '')), 'notes' => 'Time to ' . Carbon::parse($upTo ?: now())->format('j M Y'), '_price' => $pkg['price'] ?? 0];
        }
        foreach (app(ProjectDisbursements::class)->linesFor($costs) as $l) {
            $lines[] = $l;
        }

        return $lines;
    }

    /** @return array<string, mixed> */
    private function formFor(object $project, int $stageId, array $lines, string $label): array
    {
        return ['stage_id' => $stageId, 'stage' => $label, 'project_id' => (int) $project->id, 'customer_id' => (int) $project->customer_id, 'cost_centre_id' => (int) $project->cost_centre_id,
            'customer_name' => ($c = DB::table('customers')->where('id', $project->customer_id)->first()) ? ProjectService::customerName($c) : null,
            'voucher_type_id' => ($t = DB::table('voucher_types')->where('base_type', 'sales')->where('is_active', 1)->orderBy('id')->value('id')) ? (int) $t : null,
            'narration' => "{$project->number} {$project->title}: {$label}", 'reference_no' => mb_substr($project->number, 0, 60), 'lines' => $lines];
    }

    /** Drafted time bills not yet in the books. @return array<int, array<string, mixed>> */
    private function drafts(object $project): array
    {
        return DB::table('project_billing_stages')->where('project_id', $project->id)->where('kind', 'time')->whereNull('voucher_id')->orderBy('id')->get()
            ->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->name, 'entries' => DB::table('project_time')->where('bill_stage_id', $s->id)->count(),
                'voucher_type_id' => ($t = DB::table('voucher_types')->where('base_type', 'sales')->where('is_active', 1)->orderBy('id')->value('id')) ? (int) $t : null])->all();
    }

    /** Approved, billable time with minutes left after write-offs, not on a standing bill nor in a drafted one. */
    private function open(object $project, ?string $upTo): Collection
    {
        $standing = DB::table('project_billing_stages as s')->leftJoin('vouchers as v', 'v.id', '=', 's.voucher_id')->where('s.project_id', $project->id)->where('s.kind', 'time')
            ->where(fn ($q) => $q->whereNull('s.voucher_id')->orWhere('v.status', '!=', 'cancelled'))->pluck('s.id')->all();

        return $this->rowsQuery()->where('t.project_id', $project->id)->where('t.state', 'approved')->where('t.billable', 1)
            ->whereRaw('t.minutes > t.written_off_minutes')->when($upTo, fn ($q) => $q->where('t.work_date', '<=', Carbon::parse($upTo)->toDateString()))
            ->where(fn ($q) => $q->whereNull('t.bill_stage_id')->orWhereNotIn('t.bill_stage_id', $standing ?: [0]))
            ->orderBy('u.name')->orderBy('t.work_date')->get();
    }

    private function rowsQuery()
    {
        return DB::table('project_time as t')->join('users as u', 'u.id', '=', 't.user_id')->leftJoin('project_work_tasks as k', 'k.id', '=', 't.task_id')->whereNull('t.deleted_at')
            ->select(['t.*', 'u.name as person', 'k.number as task_number', 'k.title as task_title']);
    }

    private function isBilled(object $e): bool
    {
        return $e->billed_voucher_id && DB::table('vouchers')->where('id', $e->billed_voucher_id)->where('status', '!=', 'cancelled')->exists();
    }

    private function needBill(object $project, User $by): void
    {
        $this->access->authorize($by, 'money', $project);
        if (! $by->hasPermission('projects.money.bill')) {
            throw new ProjectException('Billing needs the permission to bill.', 403);
        }
        if (app(ProjectSettings::class)->get('money')['bill_mode'] !== 'post' && ! $by->hasPermission('books.post')) {
            throw new ProjectException('A drafted bill is finished and posted on the Books sales form, which needs the permission to post in Books.', 403);
        }
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::work() || ! ProjectsSetup::money() || ! Schema::hasTable('vouchers')) {
            throw new ProjectException('Billing time needs database scripts 260 and 261, and Books.', 409);
        }
    }
}

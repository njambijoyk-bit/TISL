<?php

namespace App\Services\Projects;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The measure library (docs/PROJECTS_STAGE12_SPEC.md, build 12.1): everything Projects can work out by itself from what it already holds.
 * A KPI picks one of these and gives it targets. Nothing here is typed in. Money measures are ratios read from Books when asked; Projects
 * keeps no amount. A measure that has nothing to work from answers null ("not measured yet"), never zero.
 */
class ProjectMeasures
{
    /** key => [what it is called, unit (pct|count|days|hours), about (work|person|company), higher is better, from Books, how it is worked out] */
    public const MEASURES = [
        'tasks_on_time' => ['Tasks done on time', 'pct', 'work', true, false, 'Tasks done by their due day, of the done tasks that had one'],
        'tasks_overdue' => ['Tasks overdue', 'count', 'work', false, false, 'Open tasks past their due day'],
        'dates_met' => ['Key dates met', 'pct', 'work', true, false, 'Key dates done on or before their day, of those whose day has come'],
        'days_behind' => ['Days behind the expected end', 'days', 'work', false, false, 'When the work will likely end at its pace, against its expected end'],
        'scope_done' => ['Scope done', 'pct', 'work', true, false, 'How far the scope lines are done, on average'],
        'changes_raised' => ['Changes raised', 'count', 'work', false, false, 'Changes raised on the work'],
        'snags_open' => ['Snags open', 'count', 'work', false, false, 'Snags not yet closed'],
        'snags_on_time' => ['Snags closed on time', 'pct', 'work', true, false, 'Snags fixed by their day, of those with a day that are fixed or late'],
        'inspections_passed' => ['Inspections passed', 'pct', 'work', true, false, 'Finished inspections that passed'],
        'daily_signed' => ['Daily record signed', 'pct', 'work', true, false, 'Working days in the last four weeks with a signed daily record'],
        'hours_logged' => ['Hours logged (4 weeks)', 'hours', 'work', true, false, 'Hours logged on the work in the last four weeks'],
        'billable_pct' => ['Billable hours', 'pct', 'work', true, false, 'Billable hours of all hours logged on the work'],
        'unbilled_hours' => ['Unbilled hours', 'hours', 'work', false, false, 'Approved billable hours not yet on a bill'],
        'budget_used' => ['Budget used', 'pct', 'work', false, true, 'Costs on the work\'s cost centre against its budget, from Books'],
        'margin_pct' => ['Margin', 'pct', 'work', true, true, 'Income less costs, of income, on the work\'s cost centre, from Books'],
        'billed_pct' => ['Billed of the agreed value', 'pct', 'work', true, true, 'Invoiced on the work against its linked quotations or sales orders, from Books'],
        'client_reply_hours' => ['First reply to the client', 'hours', 'work', false, false, 'Average hours from a client\'s message to the team\'s next one, last four weeks'],
        'requests_on_time' => ['Requests answered on time', 'pct', 'work', true, false, 'Files and sign-offs asked for that came back by their day'],
        'utilisation' => ['Utilisation', 'pct', 'person', true, false, 'Hours logged in the last four weeks, of working hours less leave'],
        'person_billable_pct' => ['Billable hours', 'pct', 'person', true, false, 'Billable hours of all hours logged, last four weeks'],
        'person_tasks_on_time' => ['Tasks done on time', 'pct', 'person', true, false, 'Their tasks done by the due day, last twelve weeks'],
        'timesheets_on_time' => ['Timesheets in on time', 'pct', 'person', true, false, 'Weeks with time sent in by the following Tuesday, last eight weeks'],
        'person_hours_logged' => ['Hours logged (4 weeks)', 'hours', 'person', true, false, 'Hours logged in the last four weeks'],
        'win_rate' => ['Win rate', 'pct', 'company', true, false, 'Opportunities won, of those won or lost in the last year'],
        'days_to_win' => ['Days from lead to win', 'days', 'company', false, false, 'Average days from an opportunity starting to being won, last year'],
        'opps_open' => ['Opportunities open', 'count', 'company', true, false, 'Opportunities still open'],
    ];

    public const UNITS = ['pct' => '%', 'count' => '', 'days' => 'days', 'hours' => 'h'];

    /** @return array{value: ?float, detail: string} */
    public function work(string $measure, object $project, ?Carbon $now = null): array
    {
        $now ??= now();
        $p = (int) $project->id;
        $tasks = fn () => DB::table('project_work_tasks')->where('project_id', $p)->whereNull('deleted_at');

        return $this->safe(fn () => match ($measure) {
            'tasks_on_time' => $this->share($tasks()->where('status', 'done')->whereNotNull('due_date')->get(['due_date', 'completed_at']), fn ($t) => $t->completed_at && substr($t->completed_at, 0, 10) <= $t->due_date, 'done tasks with a due day'),
            'tasks_overdue' => $this->count($tasks()->whereNotIn('status', ['done', 'cancelled'])->whereNotNull('due_date')->where('due_date', '<', $now->toDateString())->count(), 'open tasks past their day'),
            'dates_met' => $this->share(DB::table('project_key_dates')->where('project_id', $p)->whereNull('deleted_at')->where('starts_at', '<', $now->copy()->startOfDay()->addDay())->whereIn('state', ['done', 'missed', 'open'])->get(['state', 'starts_at', 'done_at']),
                fn ($k) => $k->state === 'done' && $k->done_at && substr($k->done_at, 0, 10) <= substr($k->starts_at, 0, 10), 'key dates whose day has come'),
            'days_behind' => $this->behind($project, $now),
            'scope_done' => $this->scope($p),
            'changes_raised' => $this->count(Schema::hasTable('project_changes') ? DB::table('project_changes')->where('project_id', $p)->whereNull('deleted_at')->count() : 0, 'changes'),
            'snags_open' => $this->count(ProjectsSetup::site() ? DB::table('project_snags')->where('project_id', $p)->whereNull('deleted_at')->where('state', '!=', 'closed')->count() : 0, 'snags not closed'),
            'snags_on_time' => ProjectsSetup::site() ? $this->share(DB::table('project_snags')->where('project_id', $p)->whereNull('deleted_at')->whereNotNull('due_on')
                ->where(fn ($q) => $q->whereNotNull('fixed_at')->orWhere('due_on', '<', $now->toDateString()))->get(['due_on', 'fixed_at']), fn ($s) => $s->fixed_at && substr($s->fixed_at, 0, 10) <= $s->due_on, 'snags due') : $this->none(),
            'inspections_passed' => ProjectsSetup::site() ? $this->share(DB::table('project_inspections')->where('project_id', $p)->where('state', 'done')->get(['outcome']), fn ($i) => $i->outcome === 'passed', 'finished inspections') : $this->none(),
            'daily_signed' => $this->daily($p, $now),
            'hours_logged' => ['value' => round($this->minutes(DB::table('project_time')->where('project_id', $p), $now) / 60, 1), 'detail' => 'last four weeks'],
            'billable_pct' => $this->billable(DB::table('project_time')->where('project_id', $p)->whereNull('deleted_at')),
            'unbilled_hours' => ['value' => round((float) DB::table('project_time')->where('project_id', $p)->whereNull('deleted_at')->where('state', 'approved')->where('billable', 1)->whereNull('billed_voucher_id')->whereNull('bill_stage_id')
                ->sum(DB::raw('minutes - written_off_minutes')) / 60, 1), 'detail' => 'approved, billable, not on a bill'],
            'budget_used', 'margin_pct', 'billed_pct' => $this->money($measure, $project),
            'client_reply_hours' => $this->reply($p, $now),
            'requests_on_time' => ProjectsSetup::documents() ? $this->share(DB::table('project_file_requests')->where('project_id', $p)->whereNotNull('due_on')->where(fn ($q) => $q->whereNotNull('answered_at')->orWhere('due_on', '<', $now->toDateString()))->where('state', '!=', 'cancelled')->get(['due_on', 'answered_at']),
                fn ($r) => $r->answered_at && substr($r->answered_at, 0, 10) <= $r->due_on, 'requests due') : $this->none(),
            default => $this->none(),
        });
    }

    /** @return array{value: ?float, detail: string} */
    public function person(string $measure, int $userId, ?Carbon $now = null): array
    {
        $now ??= now();

        return $this->safe(fn () => match ($measure) {
            'utilisation' => $this->utilisation($userId, $now),
            'person_billable_pct' => $this->billable(DB::table('project_time')->where('user_id', $userId)->whereNull('deleted_at')->where('work_date', '>=', $now->copy()->subDays(28)->toDateString())),
            'person_tasks_on_time' => $this->share(DB::table('project_work_tasks as t')->join('project_task_people as tp', 'tp.task_id', '=', 't.id')->where('tp.user_id', $userId)->whereNull('t.deleted_at')->where('t.status', 'done')
                ->whereNotNull('t.due_date')->where('t.completed_at', '>=', $now->copy()->subWeeks(12))->get(['t.due_date', 't.completed_at']), fn ($t) => substr((string) $t->completed_at, 0, 10) <= $t->due_date, 'tasks done'),
            'timesheets_on_time' => $this->timesheets($userId, $now),
            'person_hours_logged' => ['value' => round($this->minutes(DB::table('project_time')->where('user_id', $userId), $now) / 60, 1), 'detail' => 'last four weeks'],
            default => $this->none(),
        });
    }

    /** @return array{value: ?float, detail: string} */
    public function company(string $measure, ?Carbon $now = null): array
    {
        $now ??= now();
        if (! Schema::hasTable('project_opportunities')) {
            return $this->none();
        }
        $kinds = DB::table('project_pipeline_stages')->pluck('kind', 'id');
        $closed = fn () => DB::table('project_opportunities')->whereNull('deleted_at')->whereNotNull('closed_at')->where('closed_at', '>=', $now->copy()->subYear());

        return $this->safe(fn () => match ($measure) {
            'win_rate' => $this->share($closed()->get(['stage_id'])->filter(fn ($o) => in_array($kinds[$o->stage_id] ?? '', ['won', 'lost'], true)), fn ($o) => ($kinds[$o->stage_id] ?? '') === 'won', 'opportunities closed in the last year'),
            'days_to_win' => ($won = $closed()->get(['stage_id', 'created_at', 'closed_at'])->filter(fn ($o) => ($kinds[$o->stage_id] ?? '') === 'won'))->isEmpty() ? $this->none()
                : ['value' => round($won->avg(fn ($o) => Carbon::parse($o->created_at)->diffInDays(Carbon::parse($o->closed_at))), 1), 'detail' => $won->count() . ' won'],
            'opps_open' => $this->count(DB::table('project_opportunities')->whereNull('deleted_at')->whereNull('closed_at')->count(), 'open'),
            default => $this->none(),
        });
    }

    /** When the work will likely end at its pace: the day, how many tasks are left, and the pace. @return ?array{day: string, left: int, per_week: float} */
    public function finish(object $project, ?Carbon $now = null): ?array
    {
        $now ??= now();
        $tasks = DB::table('project_work_tasks')->where('project_id', $project->id)->whereNull('deleted_at');
        $left = (clone $tasks)->whereNotIn('status', ['done', 'cancelled'])->count();
        if ($left === 0) {
            return (clone $tasks)->count() ? ['day' => $now->toDateString(), 'left' => 0, 'per_week' => 0.0] : null;
        }
        $done = (clone $tasks)->where('status', 'done')->where('completed_at', '>=', $now->copy()->subDays(28))->count();
        if ($done === 0) {
            return null;   // no pace yet
        }
        $perDay = $done / 28;

        return ['day' => $now->copy()->addDays((int) ceil($left / $perDay))->toDateString(), 'left' => $left, 'per_week' => round($perDay * 7, 1)];
    }

    /** Working minutes a person has between two days: company hours on working days, less their leave and days off. */
    public function workingMinutes(int $userId, Carbon $from, Carbon $to): int
    {
        [$perDay, $days] = $this->companyDay();
        $away = Schema::hasTable('attendance_days') ? DB::table('attendance_days')->where('user_id', $userId)->whereIn('status', ['leave', 'off', 'holiday'])
            ->whereBetween('date', [$from->toDateString(), $to->toDateString()])->pluck('date')->map(fn ($d) => substr((string) $d, 0, 10))->flip() : collect();
        $total = 0;
        for ($d = $from->copy()->startOfDay(); $d->lte($to); $d->addDay()) {
            if (in_array($d->dayOfWeek, $days, true) && ! isset($away[$d->toDateString()])) {
                $total += $perDay;
            }
        }

        return $total;
    }

    // ------------------------------------------------------------------ inside

    private function behind(object $project, Carbon $now): array
    {
        if (! $project->due_date) {
            return ['value' => null, 'detail' => 'no expected end'];
        }
        $f = $this->finish($project, $now);
        if (! $f) {
            return ['value' => null, 'detail' => 'no pace yet'];
        }
        $days = (int) Carbon::parse($project->due_date)->startOfDay()->diffInDays(Carbon::parse($f['day']), false);

        return ['value' => (float) $days, 'detail' => $f['left'] ? "likely {$f['day']}: {$f['left']} tasks left at {$f['per_week']} a week" : 'all tasks done'];
    }

    private function scope(int $p): array
    {
        $lines = Schema::hasTable('project_scope_lines') ? DB::table('project_scope_lines')->where('project_id', $p)->whereNull('deleted_at')->get(['unit', 'quantity', 'done_quantity', 'done_percent']) : collect();
        if ($lines->isEmpty()) {
            return $this->none();
        }
        $avg = $lines->avg(fn ($l) => $l->unit && (float) $l->quantity > 0 ? min(100, (float) $l->done_quantity / (float) $l->quantity * 100) : (float) ($l->done_percent ?? 0));

        return ['value' => round($avg, 1), 'detail' => $lines->count() . ' scope lines'];
    }

    private function daily(int $p, Carbon $now): array
    {
        if (! ProjectsSetup::site()) {
            return $this->none();
        }
        $keeps = (bool) DB::table('project_site')->where('project_id', $p)->value('keeps_daily');
        if (! $keeps && ! DB::table('project_daily_records')->where('project_id', $p)->exists()) {
            return ['value' => null, 'detail' => 'no daily record kept'];
        }
        [, $days] = $this->companyDay();
        $working = [];
        for ($d = $now->copy()->subDays(27)->startOfDay(); $d->lte($now); $d->addDay()) {
            if (in_array($d->dayOfWeek, $days, true)) {
                $working[] = $d->toDateString();
            }
        }
        if (! $working) {
            return $this->none();
        }
        $signed = DB::table('project_daily_records')->where('project_id', $p)->where('state', 'signed')->whereIn('day', $working)->count();

        return ['value' => round($signed / count($working) * 100, 1), 'detail' => "{$signed} of " . count($working) . ' working days'];
    }

    private function billable($q): array
    {
        $all = (clone $q)->sum('minutes');
        if ((int) $all === 0) {
            return $this->none();
        }

        return ['value' => round((clone $q)->where('billable', 1)->sum('minutes') / $all * 100, 1), 'detail' => round($all / 60, 1) . ' hours logged'];
    }

    private function minutes($q, Carbon $now): int
    {
        return (int) $q->whereNull('deleted_at')->where('work_date', '>=', $now->copy()->subDays(28)->toDateString())->sum('minutes');
    }

    private function money(string $measure, object $project): array
    {
        $m = app(ProjectMoney::class)->for($project);
        if (empty($m['ready'])) {
            return ['value' => null, 'detail' => $m['why'] ?? 'the books are not ready'];
        }
        if ($measure === 'billed_pct') {
            $agreed = (float) ($m['agreed']['amount'] ?? 0);

            return $agreed > 0 ? ['value' => round((float) $m['billed'] / $agreed * 100, 1), 'detail' => 'invoiced against the agreed ' . ($m['agreed']['from'] ?? 'value') . ', from Books'] : ['value' => null, 'detail' => 'no agreed value linked'];
        }
        if ($measure === 'budget_used') {
            $budget = (float) ($m['budget'] ?? 0);

            return $budget > 0 ? ['value' => round((float) $m['spent'] / $budget * 100, 1), 'detail' => 'costs against the budget, from Books'] : ['value' => null, 'detail' => 'no budget in Books'];
        }
        $income = (float) ($m['income'] ?? 0);

        return $income > 0 ? ['value' => round(($income - (float) $m['spent']) / $income * 100, 1), 'detail' => 'income less costs, from Books'] : ['value' => null, 'detail' => 'no income in Books yet'];
    }

    private function reply(int $p, Carbon $now): array
    {
        if (! Schema::hasTable('project_thread_messages')) {
            return $this->none();
        }
        $threads = DB::table('project_threads')->where('project_id', $p)->where('audience', 'client')->pluck('id');
        $waits = [];
        foreach ($threads as $t) {
            $msgs = DB::table('project_thread_messages')->where('thread_id', $t)->whereNull('removed_at')->where('created_at', '>=', $now->copy()->subDays(28))->orderBy('created_at')->get(['user_id', 'contact_id', 'created_at']);
            $asked = null;
            foreach ($msgs as $m) {
                if ($m->contact_id && ! $asked) {
                    $asked = Carbon::parse($m->created_at);
                } elseif ($m->user_id && $asked) {
                    $waits[] = $asked->diffInMinutes(Carbon::parse($m->created_at)) / 60;
                    $asked = null;
                }
            }
        }

        return $waits ? ['value' => round(array_sum($waits) / count($waits), 1), 'detail' => count($waits) . ' client messages answered'] : $this->none();
    }

    private function utilisation(int $userId, Carbon $now): array
    {
        $from = $now->copy()->subDays(27)->startOfDay();
        $can = $this->workingMinutes($userId, $from, $now->copy()->startOfDay());
        if ($can === 0) {
            return $this->none();
        }
        $logged = (int) DB::table('project_time')->where('user_id', $userId)->whereNull('deleted_at')->whereBetween('work_date', [$from->toDateString(), $now->toDateString()])->sum('minutes');

        return ['value' => round($logged / $can * 100, 1), 'detail' => round($logged / 60, 1) . ' of ' . round($can / 60) . ' working hours'];
    }

    private function timesheets(int $userId, Carbon $now): array
    {
        $weeks = [];
        for ($w = $now->copy()->startOfWeek()->subWeeks(8); $w->lt($now->copy()->startOfWeek()); $w->addWeek()) {
            $rows = DB::table('project_time')->where('user_id', $userId)->whereNull('deleted_at')->whereBetween('work_date', [$w->toDateString(), $w->copy()->addDays(6)->toDateString()])->get(['state', 'submitted_at']);
            if ($rows->isEmpty()) {
                continue;
            }
            $by = $w->copy()->addDays(8)->endOfDay();   // the following Tuesday
            $weeks[] = $rows->every(fn ($r) => $r->state !== 'draft' && $r->submitted_at && Carbon::parse($r->submitted_at)->lte($by));
        }

        return $weeks ? ['value' => round(count(array_filter($weeks)) / count($weeks) * 100, 1), 'detail' => count($weeks) . ' weeks with time'] : $this->none();
    }

    /** @return array{0: int, 1: int[]} working minutes a day, the working days (0 = Sunday) */
    private function companyDay(): array
    {
        try {
            $s = \App\Models\AttendanceSetting::current();
            $minutes = max(0, Carbon::parse($s->work_end)->diffInMinutes(Carbon::parse($s->work_start), true));

            return [$minutes ?: 480, $s->days() ?: [1, 2, 3, 4, 5]];
        } catch (\Throwable) {
            return [480, [1, 2, 3, 4, 5]];   // Attendance not set up: an eight-hour day, Monday to Friday
        }
    }

    private function share($rows, callable $good, string $of): array
    {
        $n = count($rows);
        if ($n === 0) {
            return ['value' => null, 'detail' => "no {$of} yet"];
        }
        $yes = count(array_filter(is_array($rows) ? $rows : $rows->all(), $good));

        return ['value' => round($yes / $n * 100, 1), 'detail' => "{$yes} of {$n} {$of}"];
    }

    private function count(int $n, string $what): array
    {
        return ['value' => (float) $n, 'detail' => "{$n} {$what}"];
    }

    private function none(): array
    {
        return ['value' => null, 'detail' => 'not measured yet'];
    }

    private function safe(callable $fn): array
    {
        try {
            return $fn();
        } catch (\Throwable $e) {
            report($e);

            return ['value' => null, 'detail' => 'could not be worked out'];
        }
    }
}

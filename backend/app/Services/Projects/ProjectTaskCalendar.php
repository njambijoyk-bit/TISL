<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Calendar\CalendarService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks on people's calendars (build 5.2), through Core's CalendarService. A task with a due date is an all-day entry on its due day for each
 * person on it (source `project_task`; the old module's `task` entries are swept away by Core). A finished task stays on its day, marked done, as
 * a record; a cancelled or deleted one, or one with no due date, comes off. Nothing here stops the work that caused it.
 */
class ProjectTaskCalendar
{
    public const SOURCE = 'project_task';

    public static function ready(): bool
    {
        return ProjectsSetup::work() && Schema::hasTable('calendar_entries');
    }

    public function sync(int $taskId): void
    {
        if (! self::ready()) {
            return;
        }
        try {
            $t = DB::table('project_work_tasks as t')->join('projects as p', 'p.id', '=', 't.project_id')->where('t.id', $taskId)
                ->first(['t.*', 'p.number as project_number', 'p.deleted_at as project_deleted']);
            $people = $t ? DB::table('project_task_people')->where('task_id', $taskId)->pluck('user_id')->map(fn ($v) => (int) $v)->all() : [];
            $gone = ! $t || $t->deleted_at || $t->project_deleted || ! $t->due_date || $t->status === 'cancelled';
            $q = DB::table('calendar_entries')->where('source_type', self::SOURCE)->where('source_id', $taskId);
            ($gone ? $q : $q->whereNotIn('user_id', $people ?: [0]))->delete();
            if ($gone) {
                return;
            }
            foreach ($people as $u) {
                app(CalendarService::class)->put($this->entry($t, $u));
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** For Core's refresh of one person's calendar: their tasks due in the window. @return int[] the task ids put */
    public function refreshFor(User $user, Carbon $from, Carbon $to): array
    {
        if (! self::ready()) {
            return [];
        }
        $rows = DB::table('project_work_tasks as t')->join('project_task_people as tp', 'tp.task_id', '=', 't.id')->join('projects as p', 'p.id', '=', 't.project_id')
            ->where('tp.user_id', $user->id)->whereNull('t.deleted_at')->whereNull('p.deleted_at')->where('t.status', '!=', 'cancelled')
            ->whereBetween('t.due_date', [$from->toDateString(), $to->toDateString()])->get(['t.*', 'p.number as project_number']);
        foreach ($rows as $t) {
            app(CalendarService::class)->put($this->entry($t, (int) $user->id));
        }

        return $rows->pluck('id')->map(fn ($v) => (int) $v)->all();
    }

    /** @return array<string, mixed> */
    private function entry(object $t, int $userId): array
    {
        return ['user_id' => $userId, 'source_type' => self::SOURCE, 'source_id' => (int) $t->id, 'kind' => 'task', 'title' => "{$t->project_number}-T{$t->number} · {$t->title}",
            'starts_at' => Carbon::parse($t->due_date)->startOfDay(), 'ends_at' => null, 'all_day' => true, 'status' => $t->status, 'visibility' => 'team',
            'url' => "/admin/projects/{$t->project_id}?tab=work&task={$t->id}", 'meta' => ['priority' => $t->priority]];
    }
}

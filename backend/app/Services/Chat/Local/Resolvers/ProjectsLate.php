<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;
use Illuminate\Support\Facades\DB;

/** "What is late on my work?": the caller's overdue tasks, then missed key dates on work they are on. */
final class ProjectsLate extends ProjectsBase
{
    public function run(CallerContext $c, array $slots): ResolverResult
    {
        return $this->guarded(function () use ($c) {
            if (! $this->ready($c)) {
                return ResolverResult::empty();
            }
            $works = $this->works($c, true);
            $today = now()->toDateString();
            $tasks = DB::table('project_work_tasks as t')->join('projects as p', 'p.id', '=', 't.project_id')->join('project_task_people as tp', 'tp.task_id', '=', 't.id')
                ->whereIn('t.project_id', $works ?: [0])->where('tp.user_id', $c->user->id)->whereNull('t.deleted_at')->whereNotIn('t.status', ['done', 'cancelled'])->where('t.due_date', '<', $today)
                ->orderBy('t.due_date')->limit(8)->get(['p.number', 't.number as n', 't.title', 't.due_date']);
            $lines = $tasks->map(fn ($t) => "{$t->number}-T{$t->n} {$t->title} · was due {$this->day($t->due_date)}")->all();
            $dates = DB::table('project_key_dates as k')->join('projects as p', 'p.id', '=', 'k.project_id')->whereIn('k.project_id', $works ?: [0])->whereNull('k.deleted_at')->where('k.state', 'missed')
                ->where('k.starts_at', '>=', now()->subDays(30))->orderBy('k.starts_at')->limit(5)->get(['p.number', 'k.title', 'k.starts_at']);
            foreach ($dates as $k) {
                $lines[] = "{$k->number} key date missed: {$k->title} · {$this->day($k->starts_at)}";
            }

            return $lines ? ResolverResult::ok($lines) : ResolverResult::empty();
        });
    }
}

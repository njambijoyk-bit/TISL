<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;
use Illuminate\Support\Facades\DB;

/** "What is due this week?": the caller's open tasks due by Sunday and the key dates they answer for this week. */
final class ProjectsDue extends ProjectsBase
{
    public function run(CallerContext $c, array $slots): ResolverResult
    {
        return $this->guarded(function () use ($c) {
            if (! $this->ready($c)) {
                return ResolverResult::empty();
            }
            $works = $this->works($c, true);
            $from = now()->toDateString();
            $to = now()->endOfWeek()->toDateString();
            $lines = DB::table('project_work_tasks as t')->join('projects as p', 'p.id', '=', 't.project_id')->join('project_task_people as tp', 'tp.task_id', '=', 't.id')
                ->whereIn('t.project_id', $works ?: [0])->where('tp.user_id', $c->user->id)->whereNull('t.deleted_at')->whereNotIn('t.status', ['done', 'cancelled'])->whereBetween('t.due_date', [$from, $to])
                ->orderBy('t.due_date')->limit(10)->get(['p.number', 't.number as n', 't.title', 't.due_date'])->map(fn ($t) => "{$t->number}-T{$t->n} {$t->title} · due {$this->day($t->due_date)}")->all();
            foreach (DB::table('project_key_dates as k')->join('projects as p', 'p.id', '=', 'k.project_id')->whereIn('k.project_id', $works ?: [0])->whereNull('k.deleted_at')->where('k.state', 'open')
                ->where('k.responsible_id', $c->user->id)->whereBetween('k.starts_at', [$from . ' 00:00:00', $to . ' 23:59:59'])->orderBy('k.starts_at')->limit(5)->get(['p.number', 'k.title', 'k.starts_at']) as $k) {
                $lines[] = "{$k->number} key date: {$k->title} · {$this->day($k->starts_at)}";
            }

            return $lines ? ResolverResult::ok($lines) : ResolverResult::empty();
        });
    }
}

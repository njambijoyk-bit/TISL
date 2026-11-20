<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;
use App\Services\Projects\ProjectKpis;
use Illuminate\Support\Facades\DB;

/** "How is M-0413?": stage, health, expected end, tasks open and late, the next key date. Work the caller may not open looks the same as none. */
final class ProjectsStatus extends ProjectsBase
{
    private const HEALTH = ['good' => 'on track', 'warn' => 'needs watching', 'bad' => 'off track'];

    public function needs(): array
    {
        return ['projref'];
    }

    public function run(CallerContext $c, array $slots): ResolverResult
    {
        return $this->guarded(function () use ($c, $slots) {
            if (! $this->ready($c)) {
                return ResolverResult::empty();
            }
            $p = app(\App\Services\Projects\ProjectAccess::class)->visible(DB::table('projects as p'), $c->user)->whereRaw('UPPER(p.number) = ?', [strtoupper((string) $slots['projref'])])->first(['p.*']);
            if (! $p) {
                return ResolverResult::empty();
            }
            $stage = DB::table('project_stages')->where('id', $p->stage_id)->value('name');
            $health = app(ProjectKpis::class)->healthOf([(int) $p->id])[(int) $p->id] ?? null;
            $tasks = DB::table('project_work_tasks')->where('project_id', $p->id)->whereNull('deleted_at')->whereNotIn('status', ['done', 'cancelled']);
            $open = (clone $tasks)->count();
            $late = (clone $tasks)->where('due_date', '<', now()->toDateString())->count();
            $next = DB::table('project_key_dates')->where('project_id', $p->id)->whereNull('deleted_at')->where('state', 'open')->orderBy('starts_at')->first(['title', 'starts_at']);
            $lines = [trim("{$p->number} {$p->title} · {$stage}" . ($p->state === 'on_hold' ? ' (on hold)' : '') . ($health ? ' · ' . self::HEALTH[$health] : ''))];
            $lines[] = "{$open} tasks open, {$late} late" . ($p->due_date ? " · expected to end {$this->day($p->due_date)}" : '');
            if ($next) {
                $lines[] = "Next key date: {$next->title} · {$this->day($next->starts_at)}";
            }

            return ResolverResult::ok($lines);
        });
    }
}

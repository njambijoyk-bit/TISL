<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverResult;
use App\Services\Projects\ProjectPeopleInsights;

/** "Who has room next week?": the people the caller plans, most free hours first (from capacity, build 12.3). */
final class ProjectsRoom extends ProjectsBase
{
    public function requires(): array
    {
        return ['projects.use', 'projects.capacity'];
    }

    public function sensitive(): bool
    {
        return false;
    }

    public function run(CallerContext $c, array $slots): ResolverResult
    {
        return $this->guarded(function () use ($c) {
            if (! $this->ready($c)) {
                return ResolverResult::empty();
            }
            $rows = array_slice(array_filter(app(ProjectPeopleInsights::class)->room($c->user), fn ($r) => $r['free_hours'] > 0), 0, 6);

            return $rows ? ResolverResult::ok(array_map(fn ($r) => "{$r['name']} · {$r['free_hours']} hours free", $rows)) : ResolverResult::empty();
        });
    }
}

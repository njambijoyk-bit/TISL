<?php

namespace App\Services\Chat\Local\Resolvers;

use App\Services\Chat\Local\CallerContext;
use App\Services\Projects\ProjectAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What Projects resolvers share (docs/PROJECTS_STAGE12_SPEC.md, build 12.6): they read only work the caller may open (the same rule as the
 * projects list), answer with a few plain lines, and never a money figure or an extra field.
 */
abstract class ProjectsBase extends BaseResolver
{
    public function requires(): array
    {
        return ['projects.use'];
    }

    public function kinds(): array
    {
        return ['staff'];
    }

    protected function ready(CallerContext $c): bool
    {
        return $c->user !== null && Schema::hasTable('projects') && Schema::hasTable('project_work_tasks');
    }

    /** The ids of open work the caller may open; with $mine only work they are on. @return int[] */
    protected function works(CallerContext $c, bool $mine = false): array
    {
        return app(ProjectAccess::class)->visible(DB::table('projects as p'), $c->user, $mine)->whereIn('p.state', ['open', 'on_hold'])->pluck('p.id')->map(fn ($i) => (int) $i)->all();
    }

    protected function day($d): string
    {
        return $d ? date('j M', strtotime((string) $d)) : '';
    }
}

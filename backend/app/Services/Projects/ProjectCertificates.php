<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Certificates running out (docs/PROJECTS_STAGE8_SPEC.md, build 8.2). Certificates live on HR's employee record; each may now carry the day it
 * runs out. Once a day, the person and their manager (HR's line) are told when one has 60, 30 or 7 days left, and on the day it runs out.
 * The days are exact, so each warning goes once.
 */
class ProjectCertificates
{
    public const WARN_AT = [60, 30, 7, 0];

    /** @return int how many people were told */
    public function warn(?Carbon $today = null): int
    {
        if (! Schema::hasTable('employees') || ! Schema::hasColumn('employees', 'certifications')) {
            return 0;
        }
        $today = ($today ?? now())->copy()->startOfDay();
        $told = 0;
        $q = DB::table('employees')->whereNotNull('user_id')->whereNotNull('certifications');
        if (Schema::hasColumn('employees', 'deleted_at')) {
            $q->whereNull('deleted_at');
        }
        foreach ($q->get(['id', 'user_id', 'manager_id', 'certifications']) as $e) {
            foreach ((array) (json_decode((string) $e->certifications, true) ?: []) as $c) {
                if (! is_array($c) || empty($c['expires_on']) || ! strtotime((string) $c['expires_on'])) {
                    continue;
                }
                $left = (int) $today->diffInDays(Carbon::parse($c['expires_on'])->startOfDay(), false);
                if (! in_array($left, self::WARN_AT, true)) {
                    continue;
                }
                $person = User::find($e->user_id);
                if (! $person) {
                    continue;
                }
                $name = (string) ($c['name'] ?? 'A certificate');
                $when = Carbon::parse($c['expires_on'])->format('j M Y');
                $title = $left === 0 ? "{$name} runs out today" : "{$name} runs out in {$left} days";
                ProjectNotices::tell($person, ProjectNotices::PEOPLE, $title, "Your {$name} runs out on {$when}. Renew it and update your HR record.", "/admin/projects/team/{$person->id}", 'Open your page');
                $managerUser = $e->manager_id ? DB::table('employees')->where('id', $e->manager_id)->value('user_id') : null;
                if ($managerUser && ($manager = User::find($managerUser))) {
                    ProjectNotices::tell($manager, ProjectNotices::PEOPLE, "{$person->name}: {$title}", "{$person->name}'s {$name} runs out on {$when}.", "/admin/projects/team/{$person->id}", 'Open their page');
                }
                $told++;
            }
        }

        return $told;
    }
}

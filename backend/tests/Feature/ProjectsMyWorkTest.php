<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 5.10 (docs/PROJECTS_STAGE5_SPEC.md): My Work, each person's home in Projects. */
class ProjectsMyWorkTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    public function test_my_work_gathers_my_tasks_by_when_key_dates_my_week_and_what_waits_for_me(): void
    {
        Carbon::setTestNow('2026-11-18 09:00:00');   // a Wednesday
        $this->createProjectsWorld();
        $kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.tasks', 'projects.dates', 'projects.time.log', 'projects.time.approve', 'projects.changes', 'projects.changes.approve']);
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.time.log', 'projects.changes']);
        Sanctum::actingAs($kamau, ['*']);
        $p = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Stock system', 'customer_id' => 1])->json('project.id');
        $number = DB::table('projects')->where('id', $p)->value('number');
        DB::table('project_members')->insert(['project_id' => $p, 'user_id' => $njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        foreach ([['Late one', '2026-11-16'], ['Today one', '2026-11-18'], ['This week', '2026-11-21'], ['Next month', '2026-12-20'], ['No date', null]] as [$t, $d]) {
            $this->postJson("/api/admin/projects/{$p}/tasks", ['title' => $t, 'due_date' => $d, 'people' => [$kamau->id]])->assertCreated();
        }
        $done = $this->postJson("/api/admin/projects/{$p}/tasks", ['title' => 'Finished', 'due_date' => '2026-11-17', 'people' => [$kamau->id]])->json('task.id');
        $this->postJson("/api/admin/projects/{$p}/tasks/{$done}/status", ['status' => 'done'])->assertOk();
        $this->postJson("/api/admin/projects/{$p}/tasks", ['title' => 'Njeri\'s', 'due_date' => '2026-11-18', 'people' => [$njeri->id]])->assertCreated();
        $this->postJson("/api/admin/projects/{$p}/key-dates", ['title' => 'Site inspection', 'date' => '2026-11-22', 'responsible_id' => $kamau->id])->assertCreated();
        $this->postJson("/api/admin/projects/{$p}/key-dates", ['title' => 'Far away', 'date' => '2027-03-01'])->assertCreated();
        $this->postJson('/api/admin/projects/time', ['project_id' => $p, 'minutes' => 90])->assertCreated();
        $this->postJson('/api/admin/projects/timer', ['project_id' => $p])->assertCreated();

        Sanctum::actingAs($njeri, ['*']);
        $this->postJson('/api/admin/projects/time', ['project_id' => $p, 'minutes' => 120, 'work_date' => '2026-11-17'])->assertCreated();
        $this->postJson('/api/admin/projects/timesheet/submit', ['week' => '2026-11-18'])->assertOk();
        $c = $this->postJson("/api/admin/projects/{$p}/changes", ['title' => 'Add a report', 'changes_price' => true])->json('changes.0.id');
        $this->postJson("/api/admin/projects/{$p}/changes/{$c}/submit")->assertOk();

        Sanctum::actingAs($kamau, ['*']);
        $m = $this->getJson('/api/admin/projects/my-work')->assertOk()->json();
        $this->assertSame([['Late one'], ['Today one'], ['This week'], ['Next month', 'No date']], array_map(fn ($k) => array_column($m['tasks'][$k], 'title'), ['late', 'today', 'week', 'later']));
        $this->assertSame(["{$number}-T1", 'To do'], [$m['tasks']['late'][0]['ref'], $m['tasks']['late'][0]['status_name']]);
        $this->assertSame([['Site inspection', 4, true]], array_map(fn ($d) => [$d['title'], $d['days'], $d['mine']], $m['dates']), 'within 30 days only');
        $this->assertSame([90, 'open', true], [$m['week']['minutes'], $m['week']['state'], $m['week']['can_submit']]);
        $this->assertSame(['time' => 1, 'changes' => 1, 'approvals' => 0], $m['waiting']);
        $this->assertSame($p, $m['timer']['project_id']);

        // work in the trash drops out
        DB::table('projects')->where('id', $p)->update(['deleted_at' => now()]);
        $m = $this->getJson('/api/admin/projects/my-work')->assertOk()->json();
        $this->assertSame([[], [], [], []], array_values($m['tasks']));
        $this->assertSame('M', \App\Services\Projects\ProjectKeys::defaults()['go_mywork']);
    }
}

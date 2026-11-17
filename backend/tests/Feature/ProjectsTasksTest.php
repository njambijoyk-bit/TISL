<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 5.1 (docs/PROJECTS_STAGE5_SPEC.md): tasks, subtasks, people, checklist, statuses and "starts when that is done". */
class ProjectsTasksTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private int $project;
    private string $number;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.phases', 'projects.tasks', 'projects.freeze']);
        $this->njeri = $this->staff('Njeri', ['projects.use']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Stock system', 'customer_id' => 1])->json('project.id');
        $this->number = (string) DB::table('projects')->where('id', $this->project)->value('number');
        $this->member($this->njeri, 'member');
    }

    private function member(User $u, string $role): void
    {
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $u->id, 'project_role_id' => DB::table('project_roles')->where('key', $role)->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function task(array $d): array
    {
        return $this->postJson("/api/admin/projects/{$this->project}/tasks", $d)->assertCreated()->json('task');
    }

    private function list(array $q = []): array
    {
        return $this->getJson("/api/admin/projects/{$this->project}/tasks?" . http_build_query($q))->assertOk()->json();
    }

    public function test_tasks_are_numbered_per_work_and_listed_with_subtasks_under_their_parent(): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Design'])->assertCreated();
        $phase = (int) DB::table('project_phases')->value('id');
        $a = $this->task(['title' => 'Draft the plan', 'phase_id' => $phase, 'people' => [$this->kamau->id, $this->njeri->id], 'estimate_hours' => 1.5, 'due_date' => '2026-11-20', 'priority' => 'high']);
        $b = $this->task(['title' => 'Check the numbers', 'parent_id' => $a['id']]);
        $c = $this->task(['title' => '  Order   parts ', 'parent_id' => $b['id']]);
        $this->assertSame(["{$this->number}-T1", "{$this->number}-T2", "{$this->number}-T3"], [$a['ref'], $b['ref'], $c['ref']]);
        $this->assertSame(['Draft the plan', 90, 'high', ['Kamau', 'Njeri'], 'todo'], [$a['title'], $a['estimate_minutes'], $a['priority'], array_column($a['people'], 'name'), $a['status']]);
        $this->assertSame('Order parts', $c['title']);

        $l = $this->list();
        $this->assertSame([['T1', 0], ['T2', 1], ['T3', 2]], array_map(fn ($t) => ['T' . $t['number'], $t['depth']], $l['tasks']));
        $this->assertSame(['To do', 'Doing', 'Waiting', 'Done', 'Cancelled'], array_values($l['statuses']));
        $this->assertSame(['Design'], array_column($l['phases'], 'name'));
        $this->assertTrue($l['can']['manage']);
        $this->assertSame('task.created', DB::table('project_log')->orderByDesc('id')->value('action'));

        // a filter keeps a match's parents, so it shows where it belongs
        $mine = $this->list(['q' => 'order']);
        $this->assertSame([[1, false], [2, false], [3, true]], array_map(fn ($t) => [$t['number'], $t['matches']], $mine['tasks']));
        Sanctum::actingAs($this->njeri, ['*']);
        $this->assertSame([1], array_column($this->list(['mine' => 1])['tasks'], 'number'));
    }

    public function test_what_a_task_holds_is_checked(): void
    {
        $a = $this->task(['title' => 'A']);
        $p = "/api/admin/projects/{$this->project}/tasks";
        $this->postJson($p, ['title' => ''])->assertStatus(422)->assertJson(['message' => 'Give the task a title.']);
        $this->postJson($p, ['title' => 'X', 'start_date' => '2026-12-01', 'due_date' => '2026-11-01'])->assertStatus(422)->assertJson(['message' => 'It cannot be due before it starts.']);
        $this->postJson($p, ['title' => 'X', 'people' => [$this->staff('Stranger', ['projects.use'])->id]])->assertStatus(422)->assertJson(['message' => 'A task can only be given to people on this work.']);
        $this->postJson($p, ['title' => 'X', 'status' => 'done'])->assertStatus(422);
        $this->postJson($p, ['title' => 'X', 'priority' => 'whenever'])->assertStatus(422);
        $this->postJson($p, ['title' => 'X', 'phase_id' => 999])->assertStatus(422);
        $b = $this->task(['title' => 'B', 'parent_id' => $a['id']]);
        $this->putJson("{$p}/{$a['id']}", ['parent_id' => $b['id']])->assertStatus(422)->assertJson(['message' => 'A task cannot go under itself or one of its own subtasks.']);
        $this->putJson("{$p}/{$a['id']}", ['title' => 'A, renamed', 'billable' => false, 'estimate_hours' => ''])->assertOk()->assertJsonPath('task.title', 'A, renamed')->assertJsonPath('task.billable', false);
    }

    public function test_starting_a_task_before_what_it_waits_for_is_done_needs_a_reason_and_circles_are_refused(): void
    {
        $a = $this->task(['title' => 'Survey']);
        $b = $this->task(['title' => 'Design', 'waits_for' => [$a['id']]]);
        $this->assertSame([["{$this->number}-T1", true]], array_map(fn ($w) => [$w['ref'], $w['open']], $b['waits_for']));
        $p = "/api/admin/projects/{$this->project}/tasks";

        $this->putJson("{$p}/{$a['id']}", ['waits_for' => [$b['id']]])->assertStatus(422)->assertJson(['message' => 'That would make tasks wait for each other in a circle, so none could start.']);
        $this->putJson("{$p}/{$a['id']}", ['waits_for' => [$a['id']]])->assertStatus(422);

        $this->postJson("{$p}/{$b['id']}/status", ['status' => 'doing'])->assertStatus(422)->assertJson(['needs_reason' => true, 'message' => "This waits for {$this->number}-T1, which is not done yet. Say why it goes ahead anyway."]);
        $this->postJson("{$p}/{$b['id']}/status", ['status' => 'doing', 'reason' => 'The client agreed the layout by phone'])->assertOk()->assertJsonPath('task.status', 'doing');
        $this->assertSame('The client agreed the layout by phone', DB::table('project_log')->where('action', 'task.moved')->value('reason'));

        $this->postJson("{$p}/{$a['id']}/status", ['status' => 'done'])->assertOk();
        $this->postJson("{$p}/{$b['id']}/status", ['status' => 'waiting'])->assertOk();
        $this->postJson("{$p}/{$b['id']}/status", ['status' => 'doing'])->assertOk()->assertJsonPath('task.waits_for.0.open', false);
        $this->postJson("{$p}/{$b['id']}/status", ['status' => 'sideways'])->assertStatus(422);
    }

    public function test_a_task_is_finished_only_once_its_subtasks_are_and_someone_on_it_can_move_it_and_tick_its_checklist(): void
    {
        $a = $this->task(['title' => 'Handover', 'people' => [$this->njeri->id]]);
        $sub = $this->task(['title' => 'Keys', 'parent_id' => $a['id']]);
        $p = "/api/admin/projects/{$this->project}/tasks";
        $this->postJson("{$p}/{$a['id']}/checks", ['text' => 'Manuals in the box'])->assertCreated();

        Sanctum::actingAs($this->njeri, ['*']);   // on the task, without projects.tasks
        $t = $this->getJson("{$p}/{$a['id']}")->assertOk()->json('task');
        $this->assertSame([false, true, 'Manuals in the box'], [$t['can']['manage'], $t['can']['work'], $t['checklist'][0]['text']]);
        $this->putJson("{$p}/{$a['id']}/checks/{$t['checklist'][0]['id']}", ['done' => true])->assertOk()->assertJsonPath('task.checks', ['total' => 1, 'done' => 1]);
        $this->postJson("{$p}/{$a['id']}/status", ['status' => 'done'])->assertStatus(422)->assertJson(['message' => 'Finish or cancel its subtasks first.']);
        $this->postJson("{$p}/{$sub['id']}/status", ['status' => 'cancelled'])->assertForbidden();   // not on the subtask
        $this->postJson($p, ['title' => 'Mine'])->assertForbidden();
        $this->putJson("{$p}/{$a['id']}", ['title' => 'Renamed'])->assertForbidden();

        Sanctum::actingAs($this->kamau, ['*']);
        $this->postJson("{$p}/{$sub['id']}/status", ['status' => 'cancelled'])->assertOk();
        Sanctum::actingAs($this->njeri, ['*']);
        $done = $this->postJson("{$p}/{$a['id']}/status", ['status' => 'done'])->assertOk()->json('task');
        $this->assertNotNull($done['completed_at']);
    }

    public function test_frozen_work_changes_nothing_and_a_deleted_task_takes_its_subtasks_unless_time_is_logged(): void
    {
        $a = $this->task(['title' => 'A']);
        $b = $this->task(['title' => 'B', 'parent_id' => $a['id']]);
        $c = $this->task(['title' => 'C', 'waits_for' => [$b['id']]]);
        $p = "/api/admin/projects/{$this->project}/tasks";

        DB::table('projects')->where('id', $this->project)->update(['frozen_at' => now()]);
        $this->postJson("{$p}/{$a['id']}/status", ['status' => 'doing'])->assertForbidden();
        $this->postJson($p, ['title' => 'D'])->assertForbidden();
        DB::table('projects')->where('id', $this->project)->update(['frozen_at' => null]);

        DB::table('project_time')->insert(['user_id' => $this->kamau->id, 'project_id' => $this->project, 'task_id' => $b['id'], 'work_date' => '2026-11-17', 'minutes' => 30, 'created_at' => now()]);
        $this->deleteJson("{$p}/{$a['id']}")->assertStatus(422)->assertJson(['message' => 'Time is logged on this task (or one under it), so it stays. Cancel it instead.']);
        DB::table('project_time')->delete();
        $this->deleteJson("{$p}/{$a['id']}")->assertOk()->assertJson(['deleted' => 2]);
        $this->assertSame([$c['id']], array_column($this->list()['tasks'], 'id'));
        $this->assertSame([], $this->getJson("{$p}/{$c['id']}")->json('task.waits_for'), 'it no longer waits for a deleted task');
        $this->assertSame("{$this->number}-T4", $this->task(['title' => 'D'])['ref'], 'numbers are not reused');
    }

    public function test_status_words_follow_the_industry_and_settings_are_checked(): void
    {
        DB::table('projects')->where('id', $this->project)->update(['industry_key' => 'legal']);
        $this->assertSame('Awaiting client', $this->list()['statuses']['waiting']);

        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.config.view', 'projects.config.manage']);
        $w = $this->getJson('/api/admin/projects/configuration/work')->assertOk()->json('work');
        $this->assertSame([6, 10, 'warn', 'lead', '14,7,1', false], [$w['rounding'], $w['timer_cap_hours'], $w['attendance_check'], $w['approve_by'], $w['warn_days'], $w['payroll_split']]);
        $this->putJson('/api/admin/projects/configuration/work', ['rounding' => 7])->assertStatus(422);
        $this->putJson('/api/admin/projects/configuration/work', ['warn_days' => '1, 30,7,x,7', 'rounding' => 15])->assertOk()->assertJsonPath('work.warn_days', '30,7,1')->assertJsonPath('work.rounding', 15);
    }
}

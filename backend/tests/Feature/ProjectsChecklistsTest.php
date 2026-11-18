<?php

namespace Tests\Feature;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

/** Projects, build 8.4 (docs/PROJECTS_STAGE8_SPEC.md): joining and leaving checklists. */
class ProjectsChecklistsTest extends ProjectsTeamTest
{
    private function templates(): array
    {
        $this->grant($this->wanjiru, ['admin.access', 'projects.use', 'projects.create', 'projects.tasks', 'projects.team.view', 'projects.team.manage', 'projects.team.checklists', 'projects.config.view', 'projects.config.manage']);
        $this->postJson('/api/admin/projects/configuration/checklists', ['kind' => 'leaving', 'name' => 'Leaving', 'steps' => [
            ['text' => 'Submit the last timesheet', 'who' => 'person', 'day_offset' => -1],
            ['text' => 'Collect the laptop', 'who' => 'permission', 'who_permission' => 'projects.config.manage', 'day_offset' => 0],
        ]])->assertOk();

        return $this->getJson('/api/admin/projects/configuration/checklists')->assertOk()->json('templates');
    }

    public function test_a_leaving_template_always_hands_over_and_ends_places(): void
    {
        $t = collect($this->templates())->firstWhere('name', 'Leaving');
        $this->assertSame(['Submit the last timesheet', 'Collect the laptop', 'Hand over their work', 'Take them off their work on the leaving date'], array_column($t['steps'], 'text'));
        $this->assertSame([null, null, 'handover', 'end_places'], array_column($t['steps'], 'action'));
        $this->postJson('/api/admin/projects/configuration/checklists', ['kind' => 'leaving', 'name' => 'x', 'steps' => [['text' => 'Ask', 'who' => 'named']]])->assertStatus(422);
    }

    public function test_running_a_checklist_gives_each_step_to_whoever_does_it_and_ticking_the_last_finishes_it(): void
    {
        $t = collect($this->templates())->firstWhere('name', 'Leaving');
        $this->postJson("/api/admin/projects/team/{$this->njeri->id}/checklists", ['template_id' => $t['id'], 'on_date' => '2026-11-30'])->assertOk();
        $this->postJson("/api/admin/projects/team/{$this->njeri->id}/checklists", ['template_id' => $t['id'], 'on_date' => '2026-11-30'])->assertStatus(422);
        $c = $this->getJson("/api/admin/projects/team/{$this->njeri->id}/checklists")->json('checklists.0');
        $this->assertSame([['Submit the last timesheet', 'Njeri', '2026-11-29'], ['Collect the laptop', 'anyone with projects.config.manage', '2026-11-30'], ['Hand over their work', 'Kamau', '2026-11-23'], ['Take them off their work on the leaving date', 'Kamau', '2026-11-30']],
            array_map(fn ($i) => [$i['text'], $i['who'], $i['due_on']], $c['items']), 'her manager in HR is Kamau');

        Sanctum::actingAs($this->njeri, ['*']);
        $mine = $this->getJson('/api/admin/projects/my-work')->json('checklist');
        $this->assertSame(['Submit the last timesheet'], array_column($mine, 'text'));
        $items = collect($c['items'])->keyBy('text');
        $this->putJson("/api/admin/projects/checklist-items/{$items['Collect the laptop']['id']}", ['done' => true])->assertForbidden();
        $this->putJson("/api/admin/projects/checklist-items/{$items['Submit the last timesheet']['id']}", ['done' => true])->assertOk();

        Sanctum::actingAs($this->kamau, ['*']);
        $this->putJson("/api/admin/projects/checklist-items/{$items['Hand over their work']['id']}", ['done' => true])->assertOk();
        $r = $this->putJson("/api/admin/projects/checklist-items/{$items['Take them off their work on the leaving date']['id']}", ['done' => true])->assertOk()->json();
        $this->assertSame('Saved', $r['message']);
        $this->assertSame('2026-11-30 23:59:59', (string) DB::table('project_members')->where(['project_id' => $this->project, 'user_id' => $this->njeri->id])->value('ends_at'), 'her place ends on the leaving day');
        Sanctum::actingAs($this->wanjiru, ['*']);
        $this->putJson("/api/admin/projects/checklist-items/{$items['Collect the laptop']['id']}", ['done' => true])->assertOk();
        $this->assertSame('done', DB::table('project_checklists')->value('state'));
    }

    public function test_steps_due_are_reminded_once_a_day_and_someone_does_not_run_their_own(): void
    {
        $t = collect($this->templates())->firstWhere('name', 'Leaving');
        $this->postJson("/api/admin/projects/team/{$this->wanjiru->id}/checklists", ['template_id' => $t['id'], 'on_date' => '2026-11-30'])->assertForbidden();
        $this->postJson("/api/admin/projects/team/{$this->njeri->id}/checklists", ['template_id' => $t['id'], 'on_date' => '2026-11-30'])->assertOk();
        $svc = app(\App\Services\Projects\ProjectChecklists::class);
        $this->assertSame(0, $svc->remind(Carbon::parse('2026-11-20')));
        $this->assertSame(1, $svc->remind(Carbon::parse('2026-11-23')), 'the hand-over is due');
        $this->assertSame(0, $svc->remind(Carbon::parse('2026-11-23')), 'once a day');
        $this->assertSame(1, $svc->remind(Carbon::parse('2026-11-24')), 'and again the next day while it is late');
    }
}

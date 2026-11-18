<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

class ProjectsTeamViewTest extends ProjectsTeamTest
{
    public function test_a_manager_sees_everyone_below_them_with_what_they_carry_this_week(): void
    {
        $this->task('Draft the defence', $this->kamau, '2026-11-16');
        $this->task('File the bundle', $this->njeri, '2026-11-25');
        DB::table('project_time')->insert(['user_id' => $this->kamau->id, 'project_id' => $this->project, 'work_date' => '2026-11-17', 'minutes' => 300, 'billable' => 1, 'state' => 'open', 'source' => 'manual', 'created_at' => now()]);
        DB::table('attendance_days')->insert(['user_id' => $this->njeri->id, 'work_date' => '2026-11-20', 'status' => 'leave', 'created_at' => now(), 'updated_at' => now()]);

        $r = $this->getJson('/api/admin/projects/team')->assertOk()->json();
        $this->assertSame(['Kamau', 'Njeri', 'Wanjiru'], array_column($r['people'], 'name'), 'herself and the whole line below her; not Otieno in Finance');
        $k = collect($r['people'])->firstWhere('name', 'Kamau');
        $this->assertSame([['open' => 1, 'late' => 1], 300, 2400, 'Associate', ['Drafting', 'Court work']], [$k['tasks'], $k['week']['minutes'], $k['week']['capacity'], $k['job_title'], $k['skills']], 'five days of eight hours less an hour each');
        $n = collect($r['people'])->firstWhere('name', 'Njeri');
        $this->assertSame([['2026-11-20'], 1920, 1], [$n['away'], $n['week']['capacity'], $n['expiring']]);
        $this->assertSame(['week' => ['from' => '2026-11-16', 'to' => '2026-11-22']], ['week' => $r['week']]);
        $this->assertSame(['Court work', 'Drafting', 'Filing'], $r['skills']);

        $this->assertSame(['Kamau'], array_column($this->getJson('/api/admin/projects/team?late=1')->json('people'), 'name'));
        $this->assertSame(['Kamau'], array_column($this->getJson('/api/admin/projects/team?skill=drafting')->json('people'), 'name'));
        $this->assertSame(['Kamau', 'Njeri', 'Wanjiru'], array_column($this->getJson("/api/admin/projects/team?project_id={$this->project}")->json('people'), 'name'));
    }

    public function test_a_persons_page_and_who_may_open_it(): void
    {
        $this->task('Draft the defence', $this->kamau, '2026-11-16');
        $p = $this->getJson("/api/admin/projects/team/{$this->njeri->id}")->assertOk()->json('person');
        $this->assertSame([['name' => 'First aid', 'issuer' => 'Red Cross', 'date' => '2024-12-01', 'expires_on' => '2026-12-01']], $p['certificates']);
        $this->assertSame(7, count($p['days']));
        $this->assertTrue($p['can']['manage']);
        $this->assertSame(["Draft the defence"], array_column($this->getJson("/api/admin/projects/team/{$this->kamau->id}")->json('person.task_list'), 'title'));
        $this->getJson("/api/admin/projects/team/{$this->otieno->id}")->assertNotFound();

        Sanctum::actingAs($this->kamau, ['*']);
        $this->assertSame(['Kamau', 'Njeri'], array_column($this->getJson('/api/admin/projects/team')->json('people'), 'name'), 'his own line only, not his manager');
        $this->getJson("/api/admin/projects/team/{$this->wanjiru->id}")->assertNotFound();
        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson('/api/admin/projects/team')->assertForbidden();
    }
}

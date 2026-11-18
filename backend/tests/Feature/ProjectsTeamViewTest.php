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

    public function test_certificates_running_out_tell_the_person_and_their_manager_once_at_each_mark(): void
    {
        $told = [];
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($told) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$told) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->told[] = [$to->name, $type, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $c = app(\App\Services\Projects\ProjectCertificates::class);
        $this->assertSame(0, $c->warn(\Carbon\Carbon::parse('2026-11-18')), '13 days left: no mark');
        $this->assertSame(1, $c->warn(\Carbon\Carbon::parse('2026-11-24')));
        $this->assertSame([['Njeri', 'project_people', 'First aid runs out in 7 days'], ['Kamau', 'project_people', 'Njeri: First aid runs out in 7 days']], $told, 'her manager is Kamau');
        $told = [];
        $c->warn(\Carbon\Carbon::parse('2026-12-01'));
        $this->assertSame('First aid runs out today', $told[0][2]);
        $this->assertSame('projects', \App\Services\Notify\NotificationTypes::groupOf('project_people'));
    }

    public function test_the_invite_list_shows_each_persons_skills(): void
    {
        $p = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Another'])->json('project.id');
        $this->grant($this->wanjiru, ['admin.access', 'projects.use', 'projects.create', 'projects.tasks', 'projects.team.view', 'projects.team.manage', 'projects.members.view', 'projects.members.manage']);
        $c = collect($this->getJson("/api/admin/projects/{$p}/members")->assertOk()->json('candidates'));
        $this->assertSame(['Drafting', 'Court work'], $c->firstWhere('name', 'Kamau')['skills']);
    }
}

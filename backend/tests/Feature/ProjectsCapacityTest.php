<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 12.3 (docs/PROJECTS_STAGE12_SPEC.md): a person's scorecard, seen by them and their managers; eight weeks of capacity. */
class ProjectsCapacityTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $wanjiru;
    private User $otieno;
    private User $njeri;
    private int $work;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-16 09:00:00');   // a Monday
        $this->createProjectsWorld();
        $this->wanjiru = $this->staff('Wanjiru', ['projects.use', 'projects.create', 'projects.insights.team', 'projects.capacity']);
        $this->otieno = $this->staff('Otieno', ['projects.use']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.insights.team']);
        Schema::hasTable('employees') || Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->unsignedBigInteger('manager_id')->nullable(); $t->string('status')->default('active'); $t->timestamps(); });
        $wa = DB::table('employees')->insertGetId(['user_id' => $this->wanjiru->id, 'status' => 'active']);
        DB::table('employees')->insert(['user_id' => $this->otieno->id, 'manager_id' => $wa, 'status' => 'active']);
        DB::table('employees')->insert(['user_id' => $this->njeri->id, 'status' => 'active']);
        Sanctum::actingAs($this->wanjiru, ['*']);
        $type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
        $this->work = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Imara website', 'template_id' => 0])->assertCreated()->json('project.id');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function task(int $n, string $due, ?int $minutes, array $people): void
    {
        $id = DB::table('project_work_tasks')->insertGetId(['project_id' => $this->work, 'number' => $n, 'title' => "Task {$n}", 'status' => 'todo', 'priority' => 'medium', 'due_date' => $due, 'estimate_minutes' => $minutes, 'sort_order' => $n, 'created_at' => now()]);
        foreach ($people as $u) {
            DB::table('project_task_people')->insert(['task_id' => $id, 'user_id' => $u]);
        }
    }

    public function test_capacity_sets_the_hours_due_each_week_against_working_hours_less_leave(): void
    {
        $this->task(1, '2026-11-10', 600, [$this->otieno->id]);                       // already late: counts in this week
        $this->task(2, '2026-11-19', 1800, [$this->otieno->id]);
        $this->task(3, '2026-11-26', 1200, [$this->otieno->id, $this->wanjiru->id]);  // shared: 10 hours each
        $this->task(4, '2026-11-27', null, [$this->otieno->id]);                      // no estimate: counted as such
        $c = $this->getJson('/api/admin/projects/insights/capacity')->assertOk()->json();
        $this->assertCount(8, $c['weeks']);
        $ot = collect($c['people'])->firstWhere('name', 'Otieno');
        $this->assertEquals([40, 10], [$ot['weeks'][0]['due_hours'], $ot['weeks'][1]['due_hours']]);
        $this->assertSame(1, $ot['no_estimate']);
        $this->assertGreaterThan(0, $ot['weeks'][0]['can_hours']);
        $this->assertSame($ot['weeks'][0]['due_hours'] > $ot['weeks'][0]['can_hours'] ? 'over' : ($ot['weeks'][0]['due_hours'] > $ot['weeks'][0]['can_hours'] * 0.9 ? 'near' : 'ok'), $ot['weeks'][0]['state']);
        $this->assertEquals(10, collect($c['people'])->firstWhere('name', 'Wanjiru')['weeks'][1]['due_hours']);
        $this->assertNull(collect($c['people'])->firstWhere('name', 'Njeri'), 'not in Wanjiru\'s line, and she cannot see work she is not on');

        Schema::hasTable('attendance_days') || Schema::create('attendance_days', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->date('date'); $t->string('status'); $t->timestamps(); });
        foreach (['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'] as $d) {
            DB::table('attendance_days')->insert(['user_id' => $this->otieno->id, 'date' => $d, 'status' => 'leave']);
        }
        $ot = collect($this->getJson('/api/admin/projects/insights/capacity')->json('people'))->firstWhere('name', 'Otieno');
        $this->assertEquals([0, 'over'], [$ot['weeks'][1]['can_hours'], $ot['weeks'][1]['state']], 'a week of leave with work due');

        Sanctum::actingAs($this->otieno, ['*']);
        $this->assertSame(['Otieno'], array_column($this->getJson('/api/admin/projects/insights/capacity')->json('people'), 'name'), 'without the capacity permission, only yourself');
    }

    public function test_a_persons_scorecard_is_theirs_and_their_managers(): void
    {
        $this->getJson("/api/admin/projects/insights/people/{$this->otieno->id}")->assertOk()->assertJsonPath('person.name', 'Otieno');
        $this->assertSame(['Utilisation', 'My tasks done on time', 'Timesheets in on time'], array_column($this->getJson("/api/admin/projects/insights/people/{$this->otieno->id}")->json('kpis'), 'name'));
        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson("/api/admin/projects/insights/people/{$this->otieno->id}")->assertForbidden();   // the team permission, but not above him
        $this->getJson("/api/admin/projects/insights/people/{$this->njeri->id}")->assertOk();
        Sanctum::actingAs($this->otieno, ['*']);
        $this->getJson("/api/admin/projects/insights/people/{$this->wanjiru->id}")->assertForbidden();
    }
}

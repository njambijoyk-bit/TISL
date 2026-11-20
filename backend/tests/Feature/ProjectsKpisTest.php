<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Projects\ProjectKpis;
use App\Services\Projects\ProjectMeasures;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 12.1 (docs/PROJECTS_STAGE12_SPEC.md): the measure library, KPIs with targets, and starter KPIs per industry. */
class ProjectsKpisTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private object $work;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-20 10:00:00');
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.config.view', 'projects.kpis']);
        Sanctum::actingAs($this->kamau, ['*']);
        $type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
        $this->work = DB::table('projects')->find((int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Imara website', 'due_date' => '2026-12-31', 'template_id' => 0])->assertCreated()->json('project.id'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function task(int $n, string $status, ?string $due, ?string $done = null): void
    {
        DB::table('project_work_tasks')->insert(['project_id' => $this->work->id, 'number' => $n, 'title' => "Task {$n}", 'status' => $status, 'priority' => 'medium', 'due_date' => $due, 'completed_at' => $done, 'sort_order' => $n, 'created_at' => now()]);
    }

    public function test_the_starter_kpis_use_known_measures_and_are_listed_in_configuration(): void
    {
        foreach (DB::table('project_kpis')->get() as $k) {
            $m = ProjectMeasures::MEASURES[$k->measure] ?? null;
            $this->assertNotNull($m, "{$k->key}: unknown measure {$k->measure}");
            if ($k->industry_key) {
                $this->assertSame('work', $m[2], "{$k->key}: only measures about a work belong to one industry");
                $this->assertTrue(DB::table('project_industries')->where('key', $k->industry_key)->exists());
            }
            $this->assertSame((int) ($m[3] ? $k->target_warn <= $k->target_good : $k->target_warn >= $k->target_good), 1, "{$k->key}: amber is on the wrong side of green");
        }
        $page = $this->getJson('/api/admin/projects/configuration/kpis')->assertOk()->json();
        $this->assertTrue($page['can']['change']);
        $this->assertContains('Inspections passed', array_column($page['kpis'], 'name'));
        $this->assertCount(count(ProjectMeasures::MEASURES), $page['measures']);
    }

    public function test_kpis_are_checked_when_saved(): void
    {
        $bad = fn (array $d) => $this->postJson('/api/admin/projects/configuration/kpis', $d + ['name' => 'X'])->assertStatus(422)->json('message');
        $this->assertSame('Choose what it measures from the list.', $bad(['measure' => 'profit_in_kes', 'target_good' => 1, 'target_warn' => 0]));
        $this->assertSame('Higher is better here, so amber must start at or below green.', $bad(['measure' => 'tasks_on_time', 'target_good' => 80, 'target_warn' => 90]));
        $this->assertSame('Lower is better here, so amber must start at or above green.', $bad(['measure' => 'tasks_overdue', 'target_good' => 5, 'target_warn' => 0]));
        $this->assertSame('A measure about people or the company applies everywhere, not to one industry.', $bad(['measure' => 'utilisation', 'industry_key' => 'legal', 'target_good' => 80, 'target_warn' => 60]));
        $id = $this->postJson('/api/admin/projects/configuration/kpis', ['measure' => 'snags_open', 'name' => 'Open snags', 'industry_key' => 'general', 'target_good' => 0, 'target_warn' => 3, 'client_sees' => true])->assertCreated()->json('kpis');
        $this->assertTrue(collect($id)->firstWhere('name', 'Open snags')['client_sees']);
        Sanctum::actingAs($this->staff('Njeri', ['projects.use', 'projects.config.view']), ['*']);
        $this->postJson('/api/admin/projects/configuration/kpis', ['measure' => 'snags_open', 'target_good' => 0, 'target_warn' => 3])->assertForbidden();
    }

    public function test_measures_are_worked_out_from_the_work_and_the_status_follows_the_targets(): void
    {
        $this->task(1, 'done', '2026-11-10', '2026-11-09 12:00:00');   // on time
        $this->task(2, 'done', '2026-11-12', '2026-11-15 12:00:00');   // late
        $this->task(3, 'done', '2026-11-14', '2026-11-14 09:00:00');   // on time
        $this->task(4, 'todo', '2026-11-18');                           // overdue
        $this->task(5, 'todo', '2026-12-10');
        DB::table('project_key_dates')->insert([
            ['project_id' => $this->work->id, 'title' => 'Kick-off', 'starts_at' => '2026-11-05 00:00:00', 'state' => 'done', 'done_at' => '2026-11-05 10:00:00', 'all_day' => 1, 'created_at' => now()],
            ['project_id' => $this->work->id, 'title' => 'Design review', 'starts_at' => '2026-11-12 00:00:00', 'state' => 'missed', 'done_at' => null, 'all_day' => 1, 'created_at' => now()],
            ['project_id' => $this->work->id, 'title' => 'Handover', 'starts_at' => '2027-01-10 00:00:00', 'state' => 'open', 'done_at' => null, 'all_day' => 1, 'created_at' => now()],
        ]);
        DB::table('project_time')->insert([['user_id' => $this->kamau->id, 'project_id' => $this->work->id, 'work_date' => '2026-11-18', 'minutes' => 360, 'billable' => 1, 'state' => 'approved', 'created_at' => now()],
            ['user_id' => $this->kamau->id, 'project_id' => $this->work->id, 'work_date' => '2026-11-19', 'minutes' => 120, 'billable' => 0, 'state' => 'draft', 'created_at' => now()]]);
        $m = app(ProjectMeasures::class);
        $this->assertSame([66.7, '2 of 3 done tasks with a due day'], array_values($m->work('tasks_on_time', $this->work)));
        $this->assertSame(1.0, $m->work('tasks_overdue', $this->work)['value']);
        $this->assertSame(50.0, $m->work('dates_met', $this->work)['value'], 'the handover has not come yet');
        $this->assertSame(75.0, $m->work('billable_pct', $this->work)['value']);
        $this->assertSame(6.0, $m->work('unbilled_hours', $this->work)['value']);
        $behind = $m->work('days_behind', $this->work);
        $this->assertSame(-22.0, $behind['value'], '3 done in four weeks, 2 left: 19 days, so 9 Dec against 31 Dec');
        $this->assertNull($m->work('inspections_passed', $this->work)['value'], 'nothing to measure is not zero');
        $this->assertNull($m->work('budget_used', $this->work)['value'], 'no books here: not measured');

        $kpis = app(ProjectKpis::class);
        $onTime = DB::table('project_kpis')->where('key', 'all_tasks_on_time')->first();
        $this->assertSame('bad', $kpis->evaluate($onTime, 'work', $this->work)['status'], '66.7% against 90 green, 75 amber');
        $this->assertSame('good', $kpis->evaluate(DB::table('project_kpis')->where('key', 'all_days_behind')->first(), 'work', $this->work)['status']);
        $this->assertSame('bad', ProjectKpis::worst(['good', 'none', 'bad', 'warn']));
        $this->assertSame('none', ProjectKpis::worst(['none']));
        $can = $m->workingMinutes($this->kamau->id, now()->subDays(27)->startOfDay(), now()->startOfDay());
        $this->assertGreaterThan(0, $can, 'company hours on working days, from Attendance');
        $this->assertSame(round(480 / $can * 100, 1), $m->person('utilisation', $this->kamau->id)['value'], '8 hours logged of the working hours in four weeks');
        \Illuminate\Support\Facades\Schema::hasTable('attendance_days') || \Illuminate\Support\Facades\Schema::create('attendance_days', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->date('date'); $t->string('status'); $t->timestamps(); });
        DB::table('attendance_days')->insert(['user_id' => $this->kamau->id, 'date' => '2026-11-19', 'status' => 'leave', 'created_at' => now()]);
        $this->assertLessThan($can, $m->workingMinutes($this->kamau->id, now()->subDays(27)->startOfDay(), now()->startOfDay()), 'a day of leave is not a working day');
    }
}

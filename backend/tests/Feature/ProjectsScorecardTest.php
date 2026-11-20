<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Projects\ProjectKpis;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 12.2 (docs/PROJECTS_STAGE12_SPEC.md): the scorecard on a work, its health in the list, the snapshot, the lead told once, the client's scorecard. */
class ProjectsScorecardTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private object $work;
    private array $told = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-20 10:00:00');
        $this->createProjectsWorld();
        $told = &$this->told;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($told) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$told) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->told[] = [$to->name, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.insights', 'projects.money.view']);
        Sanctum::actingAs($this->kamau, ['*']);
        $type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
        $this->work = DB::table('projects')->find((int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Imara website', 'customer_id' => 1, 'due_date' => '2026-12-31', 'template_id' => 0])->assertCreated()->json('project.id'));
        DB::table('project_kpis')->insert(['key' => 'gen_budget', 'measure' => 'budget_used', 'name' => 'Budget used', 'industry_key' => 'general', 'target_good' => 100, 'target_warn' => 110, 'client_sees' => 1, 'is_active' => 1, 'sort_order' => 5, 'created_at' => now()]);
        foreach ([['done', '2026-11-10', '2026-11-15 10:00:00'], ['done', '2026-11-12', '2026-11-16 10:00:00'], ['todo', '2026-12-10', null]] as $n => [$status, $due, $done]) {
            DB::table('project_work_tasks')->insert(['project_id' => $this->work->id, 'number' => $n + 1, 'title' => "Task {$n}", 'status' => $status, 'priority' => 'medium', 'due_date' => $due, 'completed_at' => $done, 'sort_order' => $n, 'created_at' => now()]);
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_the_scorecard_shows_each_kpi_its_status_and_the_health_is_the_worst(): void
    {
        $card = $this->getJson("/api/admin/projects/{$this->work->id}/scorecard")->assertOk()->json();
        $by = collect($card['kpis'])->keyBy('key');
        $this->assertSame(['bad', 0.0], [$by['all_tasks_on_time']['status'], (float) $by['all_tasks_on_time']['value']], 'both done tasks were late');
        $this->assertSame('none', $by['gen_budget']['status'], 'no books: not measured');
        $this->assertSame('bad', $card['health']);
        $this->assertCount(8, $card['weeks']);

        Sanctum::actingAs($this->staff('Njeri', ['projects.use', 'projects.insights', 'projects.view_all']), ['*']);
        $card = $this->getJson("/api/admin/projects/{$this->work->id}/scorecard")->assertOk()->json();
        $this->assertSame([null, "The figure is for those who see the work's money."], [collect($card['kpis'])->firstWhere('key', 'gen_budget')['value'], collect($card['kpis'])->firstWhere('key', 'gen_budget')['detail']]);
        Sanctum::actingAs($this->staff('Otieno', ['projects.use', 'projects.view_all']), ['*']);
        $this->getJson("/api/admin/projects/{$this->work->id}/scorecard")->assertForbidden();
    }

    public function test_the_morning_snapshot_keeps_the_week_tells_the_lead_once_and_feeds_the_list(): void
    {
        $kpis = app(ProjectKpis::class);
        $r = $kpis->snapshot();
        $this->assertSame([1, 1], [$r['works'], $r['turned_red']]);
        $this->assertSame(['Kamau', "{$this->work->number} has turned red"], end($this->told));
        $this->assertNull(DB::table('project_kpi_snapshots')->where('kpi_id', DB::table('project_kpis')->where('key', 'gen_budget')->value('id'))->value('value'), 'a money figure is never kept');
        $this->assertSame(0, $kpis->snapshot()['turned_red'], 'told once');
        $this->assertSame(1, DB::table('project_kpi_snapshots')->where('subject_type', 'work')->where('kpi_id', DB::table('project_kpis')->where('key', 'all_tasks_on_time')->value('id'))->count(), 'one row per week, kept up to date');

        $list = $this->getJson('/api/admin/projects?scope=all')->assertOk()->json('data');
        $this->assertSame('bad', $list[0]['health']);
        $this->assertCount(1, $this->getJson('/api/admin/projects?scope=all&health=bad')->json('data'));
        $this->assertCount(0, $this->getJson('/api/admin/projects?scope=all&health=good')->json('data'));
        $this->assertSame(8, count($this->getJson("/api/admin/projects/{$this->work->id}/scorecard")->json('kpis.0.weeks')));
        $this->assertSame('bad', collect($this->getJson("/api/admin/projects/{$this->work->id}/scorecard")->json('kpis'))->firstWhere('key', 'all_tasks_on_time')['weeks'][7], 'this week is on the history');
    }

    public function test_the_client_sees_only_the_kpis_marked_for_them_and_never_a_money_one(): void
    {
        $names = array_column(app(ProjectKpis::class)->forClient($this->work), 'name');
        $this->assertSame(['Key dates met', 'Days behind the expected end'], $names, 'marked for the client in script 269; the budget is marked too but is money');
    }
}

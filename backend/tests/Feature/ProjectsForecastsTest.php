<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 12.4 (docs/PROJECTS_STAGE12_SPEC.md): the pipeline by month at each stage's chance, when works will end, what will be billed. */
class ProjectsForecastsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-20 10:00:00');
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.pipeline', 'projects.leads.view', 'projects.kpis']);
        Sanctum::actingAs($this->kamau, ['*']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function opp(string $stageKind, ?string $expected, ?float $estimate, ?string $closed = null, ?string $created = null): void
    {
        $stage = DB::table('project_pipeline_stages')->where('kind', $stageKind)->orderBy('sort_order')->value('id');
        DB::table('project_opportunities')->insert(['title' => 'Opp', 'stage_id' => $stage, 'owner_id' => $this->kamau->id, 'expected_on' => $expected, 'estimate' => $estimate, 'closed_at' => $closed, 'created_at' => $created ?? now()]);
    }

    public function test_the_pipeline_counts_each_opportunity_in_its_month_at_its_stage_chance(): void
    {
        $this->opp('won', null, 100, '2026-10-01 00:00:00', '2026-09-01 00:00:00');
        $this->opp('lost', null, 100, '2026-10-02 00:00:00');
        $this->opp('lost', null, 100, '2026-10-03 00:00:00');
        $this->opp('lost', null, 100, '2026-10-04 00:00:00');   // win rate 25%
        $this->opp('open', '2026-12-15', 2000000);
        $this->opp('open', '2026-10-28', 400000);                 // expected last month and still open: counts this month
        $this->opp('open', '2027-08-01', 999999);                 // beyond six months: left out
        $p = $this->getJson('/api/admin/projects/insights/forecasts')->assertOk()->json('pipeline');
        $this->assertSame(25.0, (float) $p['win_rate']);
        $by = collect($p['months'])->keyBy('month');
        $this->assertSame([400000.0, 100000.0, 1], [(float) $by['2026-11']['estimated'], (float) $by['2026-11']['weighted'], $by['2026-11']['count']], 'at the company win rate when no chance is set');
        $this->assertSame(500000.0, (float) $by['2026-12']['weighted']);
        $this->assertSame(1, $p['late']);
        $this->assertCount(6, $p['months']);

        $first = $p['stages'][0]['id'];
        $this->putJson("/api/admin/projects/insights/odds/{$first}", ['chance' => 60])->assertOk();
        $by = collect($this->getJson('/api/admin/projects/insights/forecasts')->json('pipeline.months'))->keyBy('month');
        $this->assertSame(1200000.0, (float) $by['2026-12']['weighted'], 'a chance set by hand wins');
        $this->putJson("/api/admin/projects/insights/odds/{$first}", ['chance' => 120])->assertStatus(422);

        Sanctum::actingAs($this->staff('Njeri', ['projects.use']), ['*']);
        $this->assertFalse($this->getJson('/api/admin/projects/insights/forecasts')->json('pipeline.ready'), 'no pipeline permission, no pipeline');
    }

    public function test_finish_sets_each_works_likely_end_against_its_expected_end(): void
    {
        $type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
        $id = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Imara website', 'due_date' => '2026-11-30', 'template_id' => 0])->assertCreated()->json('project.id');
        foreach ([['done', '2026-11-10 10:00:00'], ['todo', null], ['todo', null], ['todo', null], ['todo', null]] as $n => [$s, $done]) {
            DB::table('project_work_tasks')->insert(['project_id' => $id, 'number' => $n + 1, 'title' => "T{$n}", 'status' => $s, 'priority' => 'medium', 'completed_at' => $done, 'sort_order' => $n, 'created_at' => now()]);
        }
        $f = $this->getJson('/api/admin/projects/insights/forecasts')->json('finish');
        $this->assertSame(['2026-11-30', '2027-03-12', 102, 4, 'bad'], [$f[0]['due'], $f[0]['likely'], $f[0]['days'], $f[0]['left'], $f[0]['state']], 'one task in four weeks, four left: 112 days');
        $this->assertFalse($this->getJson('/api/admin/projects/insights/forecasts')->json('billing.ready'), 'no money permission, no billing forecast');
    }
}

<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** HR stage 1b (docs/HR_STAGE1B_SPEC.md), build D.3: who a project belongs to, and its cost centre filed under the lead owner. */
class ProjectsOwnersTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private int $westlands;
    private int $mombasa;
    private array $construction = [];
    private int $type;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('departments', function ($t) { $t->id(); $t->unsignedBigInteger('location_id'); $t->string('name'); $t->string('code')->nullable(); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->unsignedBigInteger('manager_employee_id')->nullable(); $t->boolean('is_active')->default(true); $t->timestamps(); });
        $this->runSqlScripts('272_departments_link.sql');
        foreach (['Westlands' => 'WL', 'Mombasa' => 'MB'] as $name => $code) {
            $cc = DB::table('cost_centres')->insertGetId(['name' => $name, 'code' => $code, 'type' => 'branch']);
            $loc = DB::table('locations')->insertGetId(['name' => $name, 'code' => $code, 'cost_centre_id' => $cc]);
            DB::table('cost_centres')->where('id', $cc)->update(['location_id' => $loc]);
            $depCc = DB::table('cost_centres')->insertGetId(['name' => 'Construction', 'code' => "{$code}-CON", 'parent_id' => $cc, 'location_id' => $loc, 'purpose' => 'department']);
            $this->construction[$code] = DB::table('departments')->insertGetId(['location_id' => $loc, 'name' => 'Construction', 'cost_centre_id' => $depCc]);
            $code === 'WL' ? $this->westlands = $loc : $this->mombasa = $loc;
        }
        $this->type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
        Sanctum::actingAs($this->staff('Kamau', ['projects.use', 'projects.create', 'projects.edit']), ['*']);
    }

    private function parentOf(int $projectId): ?string
    {
        $cc = DB::table('projects')->where('id', $projectId)->value('cost_centre_id');

        return DB::table('cost_centres')->where('id', DB::table('cost_centres')->where('id', $cc)->value('parent_id'))->value('code');
    }

    public function test_a_project_belongs_to_its_branch_and_optionally_departments_and_files_its_costs_under_the_lead(): void
    {
        // the branch alone: under the branch's Projects, as before
        $plain = (int) $this->postJson('/api/admin/projects', ['type_id' => $this->type, 'title' => 'Office move', 'location_id' => $this->westlands, 'template_id' => 0])->assertCreated()->json('project.id');
        $this->assertSame([['Westlands', true]], array_map(fn ($o) => [$o['label'], $o['is_lead']], $this->getJson("/api/admin/projects/{$plain}")->json('project.owners')));
        $this->assertSame('PRJ-WL', $this->parentOf($plain));

        // a department in two branches: the lead's department files the costs, the branch follows the lead
        $id = (int) $this->postJson('/api/admin/projects', ['type_id' => $this->type, 'title' => 'Coast road', 'location_id' => $this->westlands, 'template_id' => 0,
            'owners' => [['location_id' => $this->mombasa, 'department_id' => $this->construction['MB'], 'is_lead' => true], ['location_id' => $this->westlands, 'department_id' => $this->construction['WL']]]])->assertCreated()->json('project.id');
        $p = $this->getJson("/api/admin/projects/{$id}")->assertOk()->json('project');
        $this->assertSame(['Mombasa › Construction', 'Westlands › Construction'], array_column($p['owners'], 'label'));
        $this->assertSame([$this->mombasa, 'MB-CON'], [(int) DB::table('projects')->where('id', $id)->value('location_id'), $this->parentOf($id)]);
        $this->assertStringContainsString('Mombasa › Construction', (string) $p['cost_centre_path']);

        // the lead changes: the cost centre moves under the new lead
        $this->putJson("/api/admin/projects/{$id}/owners", ['owners' => [['location_id' => $this->westlands, 'department_id' => $this->construction['WL'], 'is_lead' => true], ['location_id' => $this->mombasa]]])->assertOk()
            ->assertJsonPath('owners.0.label', 'Westlands › Construction');
        $this->assertSame([$this->westlands, 'WL-CON'], [(int) DB::table('projects')->where('id', $id)->value('location_id'), $this->parentOf($id)]);
        $this->assertTrue(DB::table('project_log')->where('project_id', $id)->where('action', 'owners.changed')->exists());

        // a department always with its own branch; one lead only
        $this->putJson("/api/admin/projects/{$id}/owners", ['owners' => [['location_id' => $this->westlands, 'department_id' => $this->construction['MB'], 'is_lead' => true]]])->assertStatus(422)->assertJsonPath('message', 'Construction is not a department of that branch.');
        $this->putJson("/api/admin/projects/{$id}/owners", ['owners' => [['location_id' => $this->westlands, 'is_lead' => true], ['location_id' => $this->mombasa, 'is_lead' => true]]])->assertStatus(422)->assertJsonPath('message', 'Mark one owner as the lead.');
        $this->putJson("/api/admin/projects/{$id}/owners", ['owners' => [['department_id' => $this->construction['WL'], 'is_lead' => true]]])->assertStatus(422);

        // the list filters by department (lead or sharing) and by branch
        $numbers = fn (string $q) => collect($this->getJson("/api/admin/projects?{$q}")->assertOk()->json('data'))->pluck('title')->sort()->values()->all();
        $this->assertSame(['Coast road'], $numbers("department_id={$this->construction['WL']}"));
        $this->assertSame(['Coast road', 'Office move'], $numbers("location_id={$this->westlands}"));
        $this->assertSame([$this->westlands => [['id' => $this->construction['WL'], 'name' => 'Construction']]], array_intersect_key($this->getJson('/api/admin/projects/options')->json('departments'), [$this->westlands => 1]));

        Sanctum::actingAs($this->staff('Njeri', ['projects.use']), ['*']);
        $this->putJson("/api/admin/projects/{$id}/owners", ['owners' => [['location_id' => $this->westlands, 'is_lead' => true]]])->assertForbidden();
    }
}

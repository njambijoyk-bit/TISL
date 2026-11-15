<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Projects, build 1.4 (docs/PROJECTS_STAGE1_SPEC.md): phases as a tree to any depth, each with a cost centre of its own in the books or using
 * the one above it.
 */
class ProjectsPhasesTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.edit', 'projects.stage', 'projects.close', 'projects.freeze', 'projects.phases', 'projects.delete']);
        Sanctum::actingAs($this->kamau, ['*']);
        $type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Lodge wing', 'location_id' => 1])->assertCreated()->json('project.id');
    }

    private function add(array $d): array
    {
        return $this->postJson("/api/admin/projects/{$this->project}/phases", $d)->assertCreated()->json('phases');
    }

    private function idOf(array $phases, string $name): int
    {
        return (int) collect($phases)->firstWhere('name', $name)['id'];
    }

    public function test_phases_nest_and_each_uses_its_own_cost_centre_or_the_one_above_it(): void
    {
        $projectCc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
        $a = $this->add(['code' => '1', 'name' => 'Substructure', 'own_cost_centre' => true]);
        $sub = $this->idOf($a, 'Substructure');
        $b = $this->add(['code' => '1.1', 'name' => 'Excavation', 'parent_id' => $sub]);                               // uses Substructure's
        $c = $this->add(['code' => '1.2', 'name' => 'Foundations', 'parent_id' => $sub, 'own_cost_centre' => true]);   // its own, under Substructure's
        $all = $this->add(['code' => '2', 'name' => 'Roofing']);                                                       // uses the project's
        $this->assertSame(['Substructure', 'Excavation', 'Foundations', 'Roofing'], array_column($all, 'name'));
        $this->assertSame([0, 1, 1, 0], array_column($all, 'depth'));
        $this->assertSame([true, false, true, false], array_column($all, 'has_own_cost_centre'));
        $this->assertSame(2, $all[0]['children']);

        $subCc = (int) DB::table('project_phases')->where('id', $sub)->value('cost_centre_id');
        $this->assertSame($projectCc, (int) DB::table('cost_centres')->where('id', $subCc)->value('parent_id'));
        $this->assertSame($subCc, $all[1]['cost_centre_id'], 'a phase without its own lands in the one above');
        $foundationsCc = (int) DB::table('project_phases')->where('id', $this->idOf($c, 'Foundations'))->value('cost_centre_id');
        $this->assertSame($subCc, (int) DB::table('cost_centres')->where('id', $foundationsCc)->value('parent_id'));
        $this->assertSame($projectCc, $all[3]['cost_centre_id']);
        $this->assertSame('Nairobi › Projects › P-0001 Lodge wing › 1 Substructure › 1.2 Foundations', $all[2]['cost_centre_path']);
        $this->assertSame('project_phase', DB::table('cost_centres')->where('id', $foundationsCc)->value('purpose'));
        $this->assertNotEmpty($b);
    }

    public function test_a_phase_can_be_renamed_dated_finished_reordered_and_given_a_cost_centre_later_but_never_loses_one(): void
    {
        $a = $this->add(['code' => 'A', 'name' => 'Design']);
        $this->add(['code' => 'B', 'name' => 'Build']);
        $design = $this->idOf($a, 'Design');
        $put = fn (array $d) => $this->putJson("/api/admin/projects/{$this->project}/phases/{$design}", $d);

        $r = $put(['name' => 'Detailed design', 'start_date' => '2026-12-01', 'due_date' => '2027-01-31', 'state' => 'done'])->assertOk()->json('phases');
        $this->assertSame(['Detailed design', 'done', '2026-12-01', '2027-01-31'], [$r[0]['name'], $r[0]['state'], $r[0]['start_date'], $r[0]['due_date']]);
        $put(['due_date' => '2026-11-01'])->assertStatus(422);
        $put(['state' => 'abandoned'])->assertStatus(422);
        $put(['name' => '  '])->assertStatus(422);

        $this->assertSame(['Build', 'Detailed design'], array_column($put(['move' => 'down'])->assertOk()->json('phases'), 'name'));
        $this->assertSame(['Build', 'Detailed design'], array_column($put(['move' => 'down'])->assertOk()->json('phases'), 'name'), 'already last: nothing happens');
        $this->assertSame(['Detailed design', 'Build'], array_column($put(['move' => 'up'])->assertOk()->json('phases'), 'name'));

        $given = $put(['own_cost_centre' => true])->assertOk()->json('phases');
        $this->assertTrue($given[0]['has_own_cost_centre']);
        $cc = (int) DB::table('project_phases')->where('id', $design)->value('cost_centre_id');
        $put(['name' => 'Design and approvals'])->assertOk();
        $this->assertSame('A Design and approvals', DB::table('cost_centres')->where('id', $cc)->value('name'), 'its cost centre follows its name');
        $put(['own_cost_centre' => false])->assertOk();
        $this->assertSame($cc, (int) DB::table('project_phases')->where('id', $design)->value('cost_centre_id'), 'vouchers may carry it: it is never taken away');
        $this->assertSame(['phase.added', 'phase.added', 'phase.changed', 'phase.changed', 'phase.changed', 'phase.changed', 'phase.changed'],
            DB::table('project_log')->where('subject_type', 'phase')->where('result', 'done')->orderBy('id')->pluck('action')->all());
    }

    public function test_deleting_a_phase_takes_what_is_under_it_to_the_trash_too_and_needs_the_trash_permission(): void
    {
        $a = $this->add(['name' => 'Fit-out']);
        $fit = $this->idOf($a, 'Fit-out');
        $b = $this->add(['name' => 'Joinery', 'parent_id' => $fit]);
        $this->add(['name' => 'Hinges', 'parent_id' => $this->idOf($b, 'Joinery')]);
        $this->add(['name' => 'Handover']);

        $left = $this->deleteJson("/api/admin/projects/{$this->project}/phases/{$fit}")->assertOk()->json('phases');
        $this->assertSame(['Handover'], array_column($left, 'name'));
        $this->assertSame(3, DB::table('project_phases')->whereNotNull('deleted_at')->where('deleted_by', $this->kamau->id)->count(), 'kept in the trash, not erased');
        $this->deleteJson("/api/admin/projects/{$this->project}/phases/{$fit}")->assertNotFound();
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Under the bin', 'parent_id' => $fit])->assertStatus(422);

        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.phases']);
        $this->deleteJson("/api/admin/projects/{$this->project}/phases/" . $this->idOf($left, 'Handover'))->assertForbidden();
        $this->assertSame('Does not hold projects.delete', DB::table('project_log')->where('result', 'refused')->value('reason'));
    }

    public function test_phases_follow_the_two_questions_and_a_frozen_project(): void
    {
        $a = $this->add(['name' => 'Design']);
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.phases', 'projects.view_all']);   // may do phases, sees everything, is on nothing
        Sanctum::actingAs($njeri, ['*']);
        $this->getJson("/api/admin/projects/{$this->project}/phases")->assertOk()->assertJsonPath('can.phases', false)->assertJsonCount(1, 'phases');
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Sneaked in'])->assertForbidden();

        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active']);
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Build'])->assertCreated();   // a Member may

        DB::table('project_members')->where('user_id', $njeri->id)->update(['project_role_id' => DB::table('project_roles')->where('key', 'reviewer')->value('id')]);
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Not a reviewer\'s job'])->assertForbidden();

        Sanctum::actingAs($this->kamau, ['*']);
        $type = (int) DB::table('projects')->where('id', $this->project)->value('type_id');
        $this->putJson("/api/admin/projects/{$this->project}/stage", ['stage_id' => DB::table('project_stages')->where('type_id', $type)->where('name', 'Closed')->value('id')])->assertOk();
        $this->putJson("/api/admin/projects/{$this->project}/freeze", ['frozen' => true])->assertOk();
        $this->putJson("/api/admin/projects/{$this->project}/phases/" . $this->idOf($a, 'Design'), ['name' => 'Changed'])->assertForbidden();
        $this->getJson("/api/admin/projects/{$this->project}/phases")->assertOk()->assertJsonPath('can.phases', false);

        // a phase of another project is not reachable through this one
        $other = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Other'])->assertCreated()->json('project.id');
        $this->putJson("/api/admin/projects/{$other}/phases/" . $this->idOf($a, 'Design'), ['name' => 'Hijack'])->assertNotFound();
        $this->postJson("/api/admin/projects/{$other}/phases", ['name' => 'X', 'parent_id' => $this->idOf($a, 'Design')])->assertStatus(422);
    }

    public function test_a_project_without_a_cost_centre_still_has_phases(): void
    {
        DB::table('projects')->where('id', $this->project)->update(['cost_centre_id' => null]);
        $r = $this->add(['name' => 'Design', 'own_cost_centre' => true]);
        $this->assertSame([false, null, null], [$r[0]['has_own_cost_centre'], $r[0]['cost_centre_id'], $r[0]['cost_centre_path']]);
    }
}

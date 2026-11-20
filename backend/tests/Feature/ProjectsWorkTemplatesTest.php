<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 11.1 (docs/PROJECTS_STAGE11_SPEC.md): work templates made in Configuration and applied when a work starts or later; confidential to start with. */
class ProjectsWorkTemplatesTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $type;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.tasks', 'projects.config.view', 'projects.config.stages']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
    }

    private function template(array $d = []): array
    {
        return $this->postJson('/api/admin/projects/configuration/work-templates', $d + ['type_id' => $this->type, 'name' => 'Standard', 'is_default' => true, 'items' => [
            ['kind' => 'phase', 'title' => 'Discovery'],
            ['kind' => 'task', 'title' => 'Kick-off meeting', 'parent_ref' => 'Discovery', 'offset_days' => 2, 'estimate_minutes' => 90],
            ['kind' => 'phase', 'title' => 'Delivery'],
            ['kind' => 'phase', 'title' => 'Testing', 'parent_ref' => 'Delivery'],
            ['kind' => 'task', 'title' => 'User testing', 'parent_ref' => 'Testing', 'offset_days' => 30],
            ['kind' => 'date', 'title' => 'Handover', 'date_kind' => 'handover', 'offset_days' => 45, 'warn_days' => '7,1'],
        ]])->assertCreated()->json();
    }

    private function start(array $d = []): object
    {
        $id = (int) $this->postJson('/api/admin/projects', $d + ['type_id' => $this->type, 'title' => 'Website for Imara', 'start_date' => '2026-12-01'])->assertCreated()->json('project.id');

        return DB::table('projects')->find($id);
    }

    public function test_a_new_work_starts_from_its_kinds_default_template_from_its_start_day(): void
    {
        $page = $this->template();
        $this->assertSame(['Standard', true, 6], [$page['templates'][0]['name'], $page['templates'][0]['is_default'], count($page['templates'][0]['items'])]);
        $this->assertSame([['id' => $page['templates'][0]['id'], 'name' => 'Standard', 'is_default' => true]], $this->getJson('/api/admin/projects/options')->json("templates.{$this->type}"));
        $p = $this->start();
        $phases = DB::table('project_phases')->where('project_id', $p->id)->pluck('parent_id', 'name');
        $this->assertSame(['Discovery', 'Delivery', 'Testing'], $phases->keys()->all());
        $this->assertSame((int) DB::table('project_phases')->where('project_id', $p->id)->where('name', 'Delivery')->value('id'), (int) $phases['Testing'], 'phases to any depth');
        $tasks = DB::table('project_work_tasks')->where('project_id', $p->id)->orderBy('number')->get();
        $this->assertSame([['Kick-off meeting', '2026-12-03', 90, 'Discovery'], ['User testing', '2026-12-31', null, 'Testing']],
            $tasks->map(fn ($t) => [$t->title, $t->due_date, $t->estimate_minutes !== null ? (int) $t->estimate_minutes : null, DB::table('project_phases')->where('id', $t->phase_id)->value('name')])->all());
        $date = DB::table('project_key_dates')->where('project_id', $p->id)->first();
        $this->assertSame(['Handover', 'handover', '2027-01-15', '7,1'], [$date->title, $date->kind, substr($date->starts_at, 0, 10), $date->warn_days]);
        $this->assertTrue(DB::table('project_log')->where('project_id', $p->id)->where('action', 'work_template.applied')->exists());

        $none = $this->start(['title' => 'A blank one', 'template_id' => 0]);
        $this->assertSame(0, DB::table('project_phases')->where('project_id', $none->id)->count(), '0 starts from nothing');
    }

    public function test_applying_a_template_later_adds_only_what_is_missing(): void
    {
        $tid = $this->template(['is_default' => false])['templates'][0]['id'];
        $p = $this->start();
        $this->assertSame(0, DB::table('project_work_tasks')->where('project_id', $p->id)->count(), 'no default: nothing made');
        DB::table('project_phases')->insert(['project_id' => $p->id, 'name' => 'Discovery', 'sort_order' => 10, 'state' => 'open', 'created_at' => now()]);
        $made = $this->postJson("/api/admin/projects/{$p->id}/work-templates/{$tid}/apply")->assertOk()->json('made');
        $this->assertSame(['phases' => 2, 'tasks' => 2, 'dates' => 1], $made);
        $this->assertSame(['phases' => 0, 'tasks' => 0, 'dates' => 0], $this->postJson("/api/admin/projects/{$p->id}/work-templates/{$tid}/apply")->assertOk()->json('made'));
        $other = DB::table('project_types')->where('industry_key', 'general')->where('id', '!=', $this->type)->value('id');
        $foreign = $this->postJson('/api/admin/projects/configuration/work-templates', ['type_id' => $other, 'name' => 'Internal', 'items' => []])->assertCreated()->json('templates.0.id');
        $this->postJson("/api/admin/projects/{$p->id}/work-templates/{$foreign}/apply")->assertStatus(422);
    }

    public function test_templates_are_checked_and_a_kind_of_work_can_start_confidential(): void
    {
        $bad = fn (array $items) => $this->postJson('/api/admin/projects/configuration/work-templates', ['type_id' => $this->type, 'name' => 'Bad', 'items' => $items])->assertStatus(422)->json('message');
        $this->assertStringContainsString('sits under a phase that is not above it', $bad([['kind' => 'task', 'title' => 'Orphan', 'parent_ref' => 'Nowhere']]));
        $this->assertSame('Choose a kind of key date for "X" from the list.', $bad([['kind' => 'date', 'title' => 'X', 'date_kind' => 'no_such_kind']]));
        $this->assertSame('Two lines of the same kind have the same name.', $bad([['kind' => 'task', 'title' => 'A'], ['kind' => 'task', 'title' => 'A']]));
        $this->template();
        $this->postJson('/api/admin/projects/configuration/work-templates', ['type_id' => $this->type, 'name' => 'Short', 'is_default' => true, 'items' => []])->assertCreated();
        $this->assertSame(['Short'], DB::table('project_work_templates')->where('type_id', $this->type)->where('is_default', 1)->pluck('name')->all(), 'one default per kind of work');

        $this->putJson("/api/admin/projects/configuration/types/{$this->type}/settings", ['confidential_default' => true])->assertOk()->assertJsonPath('settings.confidential_default', true);
        $p = $this->start(['title' => 'Care plan for B.']);
        $this->assertSame(1, (int) $p->confidential, 'started confidential though Kamau may not make work confidential himself');

        Sanctum::actingAs($this->staff('Njeri', ['projects.use', 'projects.config.view']), ['*']);
        $this->postJson('/api/admin/projects/configuration/work-templates', ['type_id' => $this->type, 'name' => 'Mine', 'items' => []])->assertForbidden();
    }
}

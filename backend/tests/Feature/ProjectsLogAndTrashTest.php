<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Projects\ProjectTrash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Projects, build 1.6 (docs/PROJECTS_STAGE1_SPEC.md): reading the log, and the trash: delete, restore, delete for good, and the daily clean-up.
 */
class ProjectsLogAndTrashTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const LEAD = ['projects.use', 'projects.create', 'projects.edit', 'projects.phases', 'projects.delete', 'projects.log.view', 'projects.confidential', 'projects.stage', 'projects.close', 'projects.freeze'];

    private User $kamau;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', self::LEAD);
        Sanctum::actingAs($this->kamau, ['*']);
    }

    private function start(string $title, array $o = []): int
    {
        return (int) $this->postJson('/api/admin/projects', $o + ['type_id' => DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id'), 'title' => $title, 'location_id' => 1])->assertCreated()->json('project.id');
    }

    private function items(): array
    {
        return $this->getJson('/api/admin/projects/trash')->assertOk()->json('items');
    }

    // ------------------------------------------------------------------ the log

    public function test_a_projects_log_shows_what_was_done_and_what_was_refused_newest_first(): void
    {
        $id = $this->start('Stock system');
        $this->putJson("/api/admin/projects/{$id}", ['title' => 'Stock and tills'])->assertOk();
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.view_all', 'projects.edit']);
        Sanctum::actingAs($njeri, ['*']);
        $this->putJson("/api/admin/projects/{$id}", ['title' => 'Mine'])->assertForbidden();
        $this->getJson("/api/admin/projects/{$id}/log")->assertForbidden();   // she does not hold projects.log.view

        Sanctum::actingAs($this->kamau, ['*']);
        $log = $this->getJson("/api/admin/projects/{$id}/log")->assertOk()->json();
        $this->assertSame(3, $log['total']);
        $this->assertSame(['project.edit', 'project.changed', 'project.created'], array_column($log['data'], 'action'));
        $this->assertSame(['Njeri', 'refused', 'Not on it'], [$log['data'][0]['actor'], $log['data'][0]['result'], $log['data'][0]['reason']]);
        $this->assertSame(['title' => 'Stock system'], $log['data'][1]['old']);
        $this->assertSame(['title' => 'Stock and tills'], $log['data'][1]['new']);
        $this->assertSame('Project changed', $log['data'][1]['what']);
        $this->assertSame(['project.edit'], array_column($this->getJson("/api/admin/projects/{$id}/log?result=refused")->json('data'), 'action'));
        $this->assertSame(['project.edit'], array_column($this->getJson("/api/admin/projects/{$id}/log?q=njeri")->json('data'), 'action'));
        $this->assertSame(1, $this->getJson("/api/admin/projects/{$id}/log?q=created")->json('total'));
    }

    public function test_the_whole_log_never_shows_a_line_of_a_project_the_reader_could_not_open(): void
    {
        $open = $this->start('Open work');
        $secret = $this->start('Secret matter', ['confidential' => true]);
        $this->getJson("/api/admin/projects/{$secret}")->assertOk();

        $auditor = $this->staff('Auditor', ['projects.use', 'projects.view_all', 'projects.log.view']);   // reads logs, is on nothing
        Sanctum::actingAs($auditor, ['*']);
        $rows = $this->getJson('/api/admin/projects/log')->assertOk()->json('data');
        $this->assertSame([$open], array_values(array_unique(array_filter(array_column($rows, 'project_id')))));
        $this->assertSame(['P-0001'], array_values(array_unique(array_filter(array_column($rows, 'project_number')))));
        $this->getJson("/api/admin/projects/{$secret}/log")->assertNotFound();
        $this->getJson("/api/admin/projects/{$open}/log")->assertOk();   // an open one they are not on: reading its log is reading

        Sanctum::actingAs($this->kamau, ['*']);
        $mine = $this->getJson('/api/admin/projects/log')->json('data');
        $this->assertContains($secret, array_column($mine, 'project_id'));
        // the log cannot be changed through the application
        $this->assertSame(405, $this->putJson('/api/admin/projects/log', [])->status());
        $this->assertSame(405, $this->deleteJson("/api/admin/projects/{$open}/log")->status());
    }

    // ------------------------------------------------------------------ the trash

    public function test_a_deleted_project_goes_to_the_trash_disappears_everywhere_and_comes_back_whole(): void
    {
        $id = $this->start('Old draft');
        $this->postJson("/api/admin/projects/{$id}/phases", ['name' => 'Design'])->assertCreated();
        $this->deleteJson("/api/admin/projects/{$id}")->assertOk();
        $this->getJson("/api/admin/projects/{$id}")->assertNotFound();
        $this->assertSame([], $this->getJson('/api/admin/projects?state=')->json('data'));
        $this->putJson("/api/admin/projects/{$id}", ['title' => 'Still here'])->assertNotFound();

        $items = $this->items();
        $this->assertSame([['project', 'P-0001 Old draft', 'Kamau', 30, false]], array_map(fn ($i) => [$i['type'], $i['label'], $i['deleted_by'], $i['days_left'], $i['in_the_books']], $items));

        $this->postJson('/api/admin/projects/trash/restore', ['type' => 'project', 'id' => $id])->assertOk()->assertJsonCount(0, 'items');
        $this->getJson("/api/admin/projects/{$id}")->assertOk()->assertJsonPath('project.title', 'Old draft');
        $this->assertCount(1, $this->getJson("/api/admin/projects/{$id}/phases")->json('phases'));
        $this->assertSame(['project.created', 'phase.added', 'project.deleted', 'project.restored'], DB::table('project_log')->where('result', 'done')->orderBy('id')->pluck('action')->all());
    }

    public function test_deleting_needs_the_trash_permission_and_a_project_role_that_changes_the_project(): void
    {
        $id = $this->start('Stock system');
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.edit', 'projects.delete']);
        DB::table('project_members')->insert(['project_id' => $id, 'user_id' => $njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active']);
        Sanctum::actingAs($njeri, ['*']);
        $this->deleteJson("/api/admin/projects/{$id}")->assertForbidden();   // a Member does not change the project
        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.edit']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->deleteJson("/api/admin/projects/{$id}")->assertForbidden();   // the lead, without projects.delete
        $this->getJson('/api/admin/projects/trash')->assertForbidden();
        $this->assertNull(DB::table('projects')->where('id', $id)->value('deleted_at'));
    }

    public function test_a_frozen_project_cannot_be_deleted(): void
    {
        $id = $this->start('Finished');
        $type = (int) DB::table('projects')->where('id', $id)->value('type_id');
        $this->putJson("/api/admin/projects/{$id}/stage", ['stage_id' => DB::table('project_stages')->where('type_id', $type)->where('name', 'Closed')->value('id')])->assertOk();
        $this->putJson("/api/admin/projects/{$id}/freeze", ['frozen' => true])->assertOk();
        $this->deleteJson("/api/admin/projects/{$id}")->assertForbidden();
    }

    public function test_a_person_sees_in_the_trash_only_what_they_could_have_opened(): void
    {
        $open = $this->start('Open work');
        $secret = $this->start('Secret', ['confidential' => true]);
        $this->deleteJson("/api/admin/projects/{$open}")->assertOk();
        $this->deleteJson("/api/admin/projects/{$secret}")->assertOk();
        $this->assertCount(2, $this->items());

        $boss = $this->staff('Boss', ['projects.use', 'projects.view_all', 'projects.delete', 'projects.purge']);   // on nothing
        Sanctum::actingAs($boss, ['*']);
        $this->assertSame(['P-0001 Open work'], array_column($this->items(), 'label'));
        $this->postJson('/api/admin/projects/trash/restore', ['type' => 'project', 'id' => $secret])->assertNotFound();
        $this->postJson('/api/admin/projects/trash/purge', ['type' => 'project', 'id' => $secret])->assertNotFound();
        $this->assertNotNull(DB::table('projects')->where('id', $secret)->value('deleted_at'));

        Sanctum::actingAs($this->staff('Nobody', ['projects.use', 'projects.delete']), ['*']);
        $this->assertSame([], $this->items());
    }

    public function test_a_phase_in_the_trash_shows_once_and_comes_back_with_what_was_under_it(): void
    {
        $id = $this->start('Lodge wing');
        $a = $this->postJson("/api/admin/projects/{$id}/phases", ['name' => 'Fit-out'])->json('phases');
        $fit = $a[0]['id'];
        $b = $this->postJson("/api/admin/projects/{$id}/phases", ['name' => 'Joinery', 'parent_id' => $fit])->json('phases');
        $joinery = collect($b)->firstWhere('name', 'Joinery')['id'];
        $this->deleteJson("/api/admin/projects/{$id}/phases/{$fit}")->assertOk();

        $items = $this->items();
        $this->assertSame([['phase', 'Fit-out', 'P-0001 Lodge wing']], array_map(fn ($i) => [$i['type'], $i['label'], $i['within']], $items));
        $this->postJson('/api/admin/projects/trash/restore', ['type' => 'phase', 'id' => $joinery])->assertStatus(422);   // its parent is in the trash too
        $this->postJson('/api/admin/projects/trash/restore', ['type' => 'phase', 'id' => $fit])->assertOk();
        $this->assertSame(['Fit-out', 'Joinery'], array_column($this->getJson("/api/admin/projects/{$id}/phases")->json('phases'), 'name'));
    }

    public function test_deleting_for_good_needs_its_own_permission_and_removes_everything_but_the_log(): void
    {
        $id = $this->start('Old draft');
        $this->postJson("/api/admin/projects/{$id}/phases", ['name' => 'Design', 'own_cost_centre' => true])->assertCreated();
        $cc = (int) DB::table('projects')->where('id', $id)->value('cost_centre_id');
        $this->deleteJson("/api/admin/projects/{$id}")->assertOk();
        $this->postJson('/api/admin/projects/trash/purge', ['type' => 'project', 'id' => $id])->assertForbidden();
        $this->assertSame(1, DB::table('projects')->where('id', $id)->count());

        $this->grant($this->kamau, array_merge(['admin.access', 'projects.purge'], self::LEAD));
        $this->postJson('/api/admin/projects/trash/purge', ['type' => 'project', 'id' => $id])->assertOk()->assertJsonCount(0, 'items');
        foreach (['projects' => 'id', 'project_phases' => 'project_id', 'project_members' => 'project_id'] as $table => $col) {
            $this->assertSame(0, DB::table($table)->where($col, $id)->count(), $table);
        }
        $this->assertSame(0, (int) DB::table('cost_centres')->where('id', $cc)->value('is_active'), 'its cost centre is switched off, not erased');
        $this->assertSame(0, DB::table('cost_centres')->where('purpose', 'project_phase')->where('is_active', 1)->count());
        $this->assertSame(3, DB::table('project_log')->where('project_id', $id)->count(), 'what happened to it stays on record: started, a phase added, deleted');
        $purged = DB::table('project_log')->where('action', 'project.purged')->first();
        $this->assertSame(['number' => 'P-0001', 'title' => 'Old draft'], json_decode($purged->old_values, true));
        // only what is in the trash can be deleted for good
        $live = $this->start('Live');
        $this->postJson('/api/admin/projects/trash/purge', ['type' => 'project', 'id' => $live])->assertNotFound();
    }

    public function test_what_the_books_hold_vouchers_for_can_never_be_deleted_for_good(): void
    {
        Schema::create('voucher_entries', function ($t) { $t->id(); $t->unsignedBigInteger('cost_centre_id')->nullable(); });
        $this->grant($this->kamau, array_merge(['admin.access', 'projects.purge'], self::LEAD));
        $id = $this->start('Billed work');
        $phases = $this->postJson("/api/admin/projects/{$id}/phases", ['name' => 'Phase one', 'own_cost_centre' => true])->json('phases');
        DB::table('voucher_entries')->insert(['cost_centre_id' => $phases[0]['cost_centre_id']]);   // a voucher on the phase, none on the project itself

        $this->deleteJson("/api/admin/projects/{$id}/phases/{$phases[0]['id']}")->assertOk();
        $this->assertTrue($this->items()[0]['in_the_books']);
        $this->postJson('/api/admin/projects/trash/purge', ['type' => 'phase', 'id' => $phases[0]['id']])->assertStatus(422);
        $this->postJson('/api/admin/projects/trash/restore', ['type' => 'phase', 'id' => $phases[0]['id']])->assertOk();

        $this->deleteJson("/api/admin/projects/{$id}")->assertOk();
        $this->postJson('/api/admin/projects/trash/purge', ['type' => 'project', 'id' => $id])->assertStatus(422)->assertJsonPath('message', 'The books hold vouchers for this. It cannot be deleted for good: restore it, then close and freeze it instead.');
        $this->assertSame(1, DB::table('projects')->where('id', $id)->count());
    }

    public function test_the_daily_clean_up_removes_what_is_older_than_the_company_keeps_and_never_what_the_books_know(): void
    {
        Schema::create('voucher_entries', function ($t) { $t->id(); $t->unsignedBigInteger('cost_centre_id')->nullable(); });
        $old = $this->start('Old');
        $recent = $this->start('Recent');
        $billed = $this->start('Billed');
        DB::table('voucher_entries')->insert(['cost_centre_id' => DB::table('projects')->where('id', $billed)->value('cost_centre_id')]);
        $keep = $this->start('Keeps its phase');
        $phase = $this->postJson("/api/admin/projects/{$keep}/phases", ['name' => 'Dropped'])->json('phases')[0]['id'];
        foreach ([$old, $recent, $billed] as $p) {
            $this->deleteJson("/api/admin/projects/{$p}")->assertOk();
        }
        $this->deleteJson("/api/admin/projects/{$keep}/phases/{$phase}")->assertOk();
        DB::table('projects')->whereIn('id', [$old, $billed])->update(['deleted_at' => now()->subDays(31)]);
        DB::table('project_phases')->where('id', $phase)->update(['deleted_at' => now()->subDays(31)]);

        $this->assertSame(['projects' => 1, 'phases' => 1, 'kept' => 1], app(ProjectTrash::class)->empty());
        $this->assertSame([$recent, $billed, $keep], DB::table('projects')->orderBy('id')->pluck('id')->all());
        $this->assertSame(0, DB::table('project_phases')->where('id', $phase)->count());
        $this->artisan('projects:empty-trash')->assertSuccessful();
    }
}

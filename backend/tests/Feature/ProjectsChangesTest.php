<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 5.5 (docs/PROJECTS_STAGE5_SPEC.md): change control, applied in one step on approval, the price through a Books sales order. */
class ProjectsChangesTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $amina;
    private int $project;
    private int $line;
    private int $date;
    private int $task;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); $t->string('base_type'); $t->boolean('is_active')->default(true); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('voucher_number'); $t->string('status')->default('posted'); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->decimal('total_amount', 14, 2)->default(0); });
        DB::table('voucher_types')->insert([['id' => 5, 'name' => 'Sales Order', 'base_type' => 'sales_order']]);
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.scope', 'projects.dates', 'projects.tasks', 'projects.changes', 'projects.changes.approve', 'books.post']);
        $this->amina = $this->staff('Amina', ['projects.use', 'projects.changes', 'projects.changes.approve', 'books.post']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Office block', 'customer_id' => 1])->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->amina->id, 'project_role_id' => DB::table('project_roles')->where('key', 'lead')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->postJson("/api/admin/projects/{$this->project}/scope", ['code' => '3.4', 'description' => 'Blockwork', 'unit' => 'm2', 'quantity' => 1850])->assertCreated();
        $this->line = (int) DB::table('project_scope_lines')->value('id');
        $this->postJson("/api/admin/projects/{$this->project}/key-dates", ['title' => 'Roof handover', 'date' => '2026-12-06'])->assertCreated();
        $this->date = (int) DB::table('project_key_dates')->value('id');
        $this->task = (int) $this->postJson("/api/admin/projects/{$this->project}/tasks", ['title' => 'Roof trusses', 'due_date' => '2026-12-01'])->json('task.id');
    }

    private function raise(array $d = []): array
    {
        return $this->postJson("/api/admin/projects/{$this->project}/changes", $d + ['title' => 'Extra blockwork for the store room', 'reason' => 'Client asked on site', 'changes_price' => true, 'effects' => [
            ['kind' => 'scope_add', 'data' => ['code' => '3.5', 'description' => 'Store room blockwork', 'unit' => 'm2', 'quantity' => 120]],
            ['kind' => 'scope_alter', 'target_id' => $this->line, 'data' => ['quantity' => 1900]],
            ['kind' => 'date_move', 'target_id' => $this->date, 'data' => ['date' => '2026-12-20']],
            ['kind' => 'task_move', 'target_id' => $this->task, 'data' => ['due_date' => '2026-12-15']],
        ]])->assertCreated()->json();
    }

    private function step(int $id, string $step, array $d = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/api/admin/projects/{$this->project}/changes/{$id}/{$step}", $d);
    }

    public function test_a_change_is_raised_sent_and_approved_by_someone_else_and_its_effects_apply_in_one_step(): void
    {
        $c = $this->raise()['changes'][0];
        $this->assertSame(['C-01', 'draft', true], [$c['ref'], $c['state'], $c['changes_price']]);
        $this->assertSame(['Adds 3.5 Store room blockwork (120 m2)', 'Alters Blockwork to 1,900', 'Moves Roof handover to 20 Dec 2026'], array_slice(array_column($c['effects'], 'what'), 0, 3));
        $this->step($c['id'], 'approve')->assertStatus(422)->assertJson(['message' => 'It has not been sent for a decision yet.']);
        $this->step($c['id'], 'submit')->assertOk()->assertJsonPath('changes.0.state', 'submitted');
        $this->putJson("/api/admin/projects/{$this->project}/changes/{$c['id']}", ['title' => 'Later'])->assertStatus(422);
        $this->step($c['id'], 'approve')->assertForbidden()->assertJson(['message' => 'Someone else decides on a change you raised.']);
        $this->assertSame(1, DB::table('project_scope_lines')->count(), 'nothing applied yet');

        Sanctum::actingAs($this->amina, ['*']);
        $r = $this->step($c['id'], 'approve', ['note' => 'Agreed at the site meeting'])->assertOk()->json();
        $this->assertTrue($r['order_needed']);
        $this->assertSame(['approved', 'Amina', 'Agreed at the site meeting'], [$r['changes'][0]['state'], $r['changes'][0]['decided_by'], $r['changes'][0]['decision_note']]);
        $this->assertSame(['Store room blockwork', 120.0, $c['id']], [DB::table('project_scope_lines')->where('code', '3.5')->value('description'), (float) DB::table('project_scope_lines')->where('code', '3.5')->value('quantity'), (int) DB::table('project_scope_lines')->where('code', '3.5')->value('change_id')]);
        $this->assertSame(1900.0, (float) DB::table('project_scope_lines')->where('id', $this->line)->value('quantity'));
        $k = DB::table('project_key_dates')->find($this->date);
        $this->assertSame(['2026-12-20 00:00:00', '2026-12-06 00:00:00', 'Change C-01: Extra blockwork for the store room'], [$k->starts_at, $k->moved_from, $k->move_reason]);
        $this->assertSame('2026-12-15', DB::table('project_work_tasks')->where('id', $this->task)->value('due_date'));
        $this->assertSame(4, DB::table('project_change_effects')->whereNotNull('applied_at')->count());
    }

    public function test_an_effect_whose_target_is_gone_stops_the_whole_change_and_nothing_applies(): void
    {
        $c = $this->raise()['changes'][0];
        $this->step($c['id'], 'submit')->assertOk();
        DB::table('project_key_dates')->where('id', $this->date)->update(['deleted_at' => now()]);
        Sanctum::actingAs($this->amina, ['*']);
        $this->step($c['id'], 'approve')->assertStatus(422)->assertJson(['message' => 'C-01 moves a key date that is no longer there. Send it back and raise it again.']);
        $this->assertSame([1, 1850.0, 'submitted'], [DB::table('project_scope_lines')->count(), (float) DB::table('project_scope_lines')->where('id', $this->line)->value('quantity'), DB::table('project_changes')->value('state')]);
        $this->step($c['id'], 'reject', ['note' => 'Raise it again without the date'])->assertOk()->assertJsonPath('changes.0.state', 'rejected');
    }

    public function test_what_a_change_says_is_checked_and_who_may_do_what(): void
    {
        $p = "/api/admin/projects/{$this->project}/changes";
        $this->postJson($p, ['title' => ''])->assertStatus(422);
        $this->postJson($p, ['title' => 'X', 'effects' => [['kind' => 'scope_alter', 'target_id' => 999, 'data' => ['quantity' => 1]]]])->assertStatus(422);
        $this->postJson($p, ['title' => 'X', 'effects' => [['kind' => 'date_move', 'target_id' => $this->date, 'data' => []]]])->assertStatus(422)->assertJson(['message' => 'Give the new date.']);
        $this->postJson($p, ['title' => 'X', 'effects' => [['kind' => 'teleport']]])->assertStatus(422);
        $empty = $this->postJson($p, ['title' => 'Nothing yet'])->assertCreated()->json('changes.0.id');
        $this->step($empty, 'submit')->assertStatus(422)->assertJson(['message' => 'Say what the change does (a scope line, a date) or that it changes the price, before sending it.']);
        $this->putJson("{$p}/{$empty}", ['changes_price' => true])->assertOk();
        $this->step($empty, 'submit')->assertOk();
        $this->step($empty, 'withdraw')->assertOk()->assertJsonPath('changes.0.state', 'withdrawn');

        $viewer = $this->staff('Viewer', ['projects.use', 'projects.view_all']);
        Sanctum::actingAs($viewer, ['*']);
        $l = $this->getJson($p)->assertOk()->json();
        $this->assertSame([false, false, null], [$l['can']['raise'], $l['can']['approve'], $l['options']]);
        $this->postJson($p, ['title' => 'X'])->assertForbidden();
    }

    public function test_the_price_goes_through_a_books_sales_order_tied_to_the_change_and_linked_to_the_work(): void
    {
        $c = $this->raise(['effects' => []])['changes'][0];
        $this->step($c['id'], 'submit')->assertOk();
        $this->getJson("/api/admin/projects/changes/{$c['id']}/order-form")->assertStatus(422);
        Sanctum::actingAs($this->amina, ['*']);
        app(\App\Services\Projects\ProjectSettings::class)->save('serious', array_merge(\App\Services\Projects\ProjectSerious::defaults(), ['change.approve' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => false]]), $this->amina);
        $this->step($c['id'], 'approve')->assertStatus(428)->assertJsonPath('serious.action', 'change.approve');
        app(\App\Services\Projects\ProjectSettings::class)->save('serious', \App\Services\Projects\ProjectSerious::defaults(), $this->amina);
        $this->step($c['id'], 'approve')->assertOk();

        $cc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
        $number = DB::table('projects')->where('id', $this->project)->value('number');
        $f = $this->getJson("/api/admin/projects/changes/{$c['id']}/order-form")->assertOk()->json('order');
        $this->assertSame([5, 1, $cc, "{$number} change C-01: Extra blockwork for the store room", 'Change C-01: Extra blockwork for the store room', null], [$f['voucher_type_id'], $f['customer_id'], $f['cost_centre_id'], $f['narration'], $f['lines'][0]['description'], $f['lines'][0]['rate']]);

        // the person saves it on the Books sales order form
        $changes = app(\App\Services\Projects\ProjectChanges::class);
        $elsewhere = DB::table('vouchers')->insertGetId(['voucher_type_id' => 5, 'voucher_number' => 'SO-0130']);
        $changes->tie($c['id'], $elsewhere, null, $this->amina);
        $this->assertNull(DB::table('project_changes')->value('voucher_id'), 'not on the work\'s cost centre: left alone');
        $so = DB::table('vouchers')->insertGetId(['voucher_type_id' => 5, 'voucher_number' => 'SO-0131', 'cost_centre_id' => $cc]);
        $changes->tie($c['id'], $so, $cc, $this->amina);
        $this->assertSame($so, (int) DB::table('project_changes')->value('voucher_id'));
        $this->assertTrue(DB::table('project_links')->where('project_id', $this->project)->where('linked_id', $so)->where('link_type', 'voucher')->whereNull('deleted_at')->exists(), 'linked, so the agreed value counts it');
        $this->assertSame('SO-0131', $this->getJson("/api/admin/projects/{$this->project}/changes")->json('changes.0.order.number'));
        $this->getJson("/api/admin/projects/changes/{$c['id']}/order-form")->assertStatus(422)->assertJson(['message' => 'This change already has its sales order.']);
        $this->assertStringContainsString("ProjectChanges::class)->tie(\$request->integer('project_change_id')", file_get_contents(app_path('Http/Controllers/Api/BooksVoucherController.php')));
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 5.3 (docs/PROJECTS_STAGE5_SPEC.md): scope lines with progress, priced by the lines of a linked Books sales order. */
class ProjectsScopeTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $project;
    private int $order;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); $t->string('base_type'); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('voucher_number'); $t->string('status')->default('posted'); $t->decimal('total_amount', 14, 2)->default(0); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->boolean('is_header')->default(false); $t->string('description')->nullable(); $t->string('unit_code')->nullable();
            $t->decimal('quantity', 14, 4)->default(1); $t->decimal('rate', 14, 4)->default(0); $t->decimal('amount', 14, 2)->default(0); $t->unsignedBigInteger('ledger_id')->nullable(); });
        DB::table('voucher_types')->insert([['id' => 4, 'name' => 'Quotation', 'base_type' => 'quotation'], ['id' => 5, 'name' => 'Sales Order', 'base_type' => 'sales_order'], ['id' => 1, 'name' => 'Sales Invoice', 'base_type' => 'sales']]);
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.phases', 'projects.scope', 'projects.tasks']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Office block', 'customer_id' => 1])->json('project.id');
        $this->order = DB::table('vouchers')->insertGetId(['voucher_type_id' => 5, 'voucher_number' => 'SO-0112', 'total_amount' => 0]);
        DB::table('voucher_items')->insert([['voucher_id' => $this->order, 'description' => 'Excavation to foundations', 'unit_code' => 'm3', 'quantity' => 420, 'rate' => 850, 'amount' => 357000],
            ['voucher_id' => $this->order, 'description' => 'Concrete in footings', 'unit_code' => 'm3', 'quantity' => 96, 'rate' => 14500, 'amount' => 1392000]]);
        DB::table('project_links')->insert(['project_id' => $this->project, 'module' => 'books', 'link_type' => 'voucher', 'linked_id' => $this->order, 'created_at' => now()]);
    }

    private function scope(): array
    {
        return $this->getJson("/api/admin/projects/{$this->project}/scope")->assertOk()->json();
    }

    public function test_the_lines_of_a_linked_sales_order_are_copied_in_once_and_priced_from_books(): void
    {
        $r = $this->postJson("/api/admin/projects/{$this->project}/scope", ['copy_from' => $this->order])->assertCreated()->json();
        $this->assertSame([['1', 'Excavation to foundations', 'm3', 420], ['2', 'Concrete in footings', 'm3', 96]], array_map(fn ($l) => [$l['code'], $l['description'], $l['unit'], $l['quantity']], $r['lines']));
        $this->assertSame(['SO-0112', 850, 357000], [$r['lines'][0]['priced_by']['voucher'], $r['lines'][0]['priced_by']['rate'], $r['lines'][0]['priced_by']['amount']]);
        $this->postJson("/api/admin/projects/{$this->project}/scope", ['copy_from' => $this->order])->assertCreated();
        $this->assertCount(2, $this->scope()['lines'], 'lines already copied are skipped');
        $this->assertFalse(Schema::hasColumn('project_scope_lines', 'rate'), 'no price is kept in Projects');

        // the price shown is Books' as it is now
        DB::table('voucher_items')->where('description', 'Excavation to foundations')->update(['rate' => 900]);
        $this->assertSame(900, $this->scope()['lines'][0]['priced_by']['rate']);

        $other = DB::table('vouchers')->insertGetId(['voucher_type_id' => 5, 'voucher_number' => 'SO-0999']);
        $this->postJson("/api/admin/projects/{$this->project}/scope", ['copy_from' => $other])->assertStatus(422)->assertJson(['message' => 'Choose a quotation or sales order linked to this work.']);
        $item = DB::table('voucher_items')->insertGetId(['voucher_id' => $other, 'description' => 'Not ours']);
        $this->postJson("/api/admin/projects/{$this->project}/scope", ['description' => 'X', 'voucher_item_id' => $item])->assertStatus(422);
    }

    public function test_progress_is_a_quantity_or_a_percentage_and_every_change_is_logged(): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/scope", ['code' => '2.1', 'description' => 'Blockwork', 'unit' => 'm2', 'quantity' => 1850])->assertCreated();
        $this->postJson("/api/admin/projects/{$this->project}/scope", ['code' => '9', 'description' => 'Drawings and approvals'])->assertCreated();
        $this->postJson("/api/admin/projects/{$this->project}/scope", ['description' => 'Tiles', 'unit' => 'm2'])->assertStatus(422)->assertJson(['message' => 'A line measured in a unit needs its quantity.']);
        [$block, $draw] = array_column($this->scope()['lines'], 'id');
        $p = "/api/admin/projects/{$this->project}/scope";

        $this->putJson("{$p}/{$block}", ['progress' => 925, 'note' => 'Ground floor walls'])->assertOk()->assertJsonPath('lines.0.progress', 50);
        $this->putJson("{$p}/{$draw}", ['progress' => 40])->assertOk()->assertJsonPath('lines.1.progress', 40);
        $this->assertSame(45, $this->scope()['overall'], 'each line counts equally');
        $this->putJson("{$p}/{$draw}", ['progress' => 120])->assertStatus(422);
        $this->putJson("{$p}/{$block}", ['progress' => 3000])->assertStatus(422)->assertJson(['message' => 'That is far more than the 1,850 m2 agreed. If the scope grew, raise a change.']);
        $log = DB::table('project_log')->where('action', 'scope.progress')->orderBy('id')->first();
        $this->assertSame(['Ground floor walls', ['done_quantity' => 0]], [$log->reason, json_decode($log->old_values, true)]);

        // a line moved from a unit to a percentage starts its progress again
        $this->putJson("{$p}/{$block}", ['unit' => '', 'quantity' => ''])->assertOk()->assertJsonPath('lines.0.progress', 0);
    }

    public function test_tasks_can_be_tied_to_a_line_and_deleting_a_line_leaves_its_tasks_and_needs_the_permission(): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/scope", ['description' => 'Roof'])->assertCreated();
        $line = $this->scope()['lines'][0]['id'];
        $t = $this->postJson("/api/admin/projects/{$this->project}/tasks", ['title' => 'Fix trusses', 'scope_line_id' => $line])->assertCreated()->json('task');
        $this->postJson("/api/admin/projects/{$this->project}/tasks/{$t['id']}/status", ['status' => 'done'])->assertOk();
        $this->assertSame(['total' => 1, 'done' => 1], $this->scope()['lines'][0]['tasks']);

        $this->deleteJson("/api/admin/projects/{$this->project}/scope/{$line}")->assertOk()->assertJsonPath('lines', []);
        $this->assertNull(DB::table('project_work_tasks')->where('id', $t['id'])->value('scope_line_id'));

        $this->grant($this->kamau, ['admin.access', 'projects.use']);
        $this->assertFalse($this->scope()['can']['manage']);
        $this->postJson("/api/admin/projects/{$this->project}/scope", ['description' => 'X'])->assertForbidden();
    }
}

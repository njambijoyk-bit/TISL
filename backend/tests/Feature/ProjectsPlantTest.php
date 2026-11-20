<?php

namespace Tests\Feature;

use App\Models\Inventory\InventoryAssignment;
use App\Models\Inventory\InventoryInstance;
use App\Models\User;
use App\Services\Inventory\InventoryTransactionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 10.2 (docs/PROJECTS_STAGE10_SPEC.md): plant issued through Inventory with the work as holder, bookings with clash warnings, hired plant. */
class ProjectsPlantTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private int $project;
    private int $other;
    public array $calls = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('inventory_items', function ($t) { $t->id(); $t->string('name'); $t->string('brand')->nullable(); $t->string('model')->nullable(); $t->boolean('is_serialized')->default(false); $t->decimal('available_qty', 10, 2)->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); $t->softDeletes(); });
        Schema::create('inventory_instances', function ($t) { $t->id(); $t->unsignedBigInteger('item_id'); $t->string('serial_number')->nullable(); $t->string('asset_tag')->nullable(); $t->string('status')->default('available'); $t->boolean('is_obsolete')->default(false);
            $t->string('current_assignee_type')->nullable(); $t->unsignedBigInteger('current_assignee_id')->nullable(); $t->string('current_assignee_label')->nullable(); $t->unsignedBigInteger('current_assignment_id')->nullable(); $t->timestamps(); $t->softDeletes(); });
        Schema::create('inventory_assignments', function ($t) { $t->id(); $t->unsignedBigInteger('item_id'); $t->unsignedBigInteger('instance_id')->nullable(); $t->decimal('quantity', 10, 2)->default(1); $t->string('assignment_type')->default('issue');
            $t->string('assignee_type'); $t->unsignedBigInteger('assignee_id')->nullable(); $t->string('assignee_label')->nullable(); $t->unsignedBigInteger('issued_by')->nullable(); $t->timestamp('issued_at')->nullable(); $t->date('expected_return_date')->nullable();
            $t->string('issue_condition')->nullable(); $t->text('issue_notes')->nullable(); $t->timestamp('returned_at')->nullable(); $t->unsignedBigInteger('received_by')->nullable(); $t->string('return_condition')->nullable(); $t->string('status')->default('active'); $t->timestamps(); });
        Schema::create('vendors', function ($t) { $t->id(); $t->string('vendor_number')->nullable(); $t->string('company_name')->nullable(); $t->string('contact_name')->nullable(); $t->timestamps(); $t->softDeletes(); });
        Schema::create('vendor_orders', function ($t) { $t->id(); $t->string('po_number'); $t->unsignedBigInteger('vendor_id'); $t->string('status')->default('sent'); $t->decimal('subtotal', 14, 2)->default(0); $t->decimal('total', 14, 2)->default(0); $t->timestamps(); });
        DB::table('inventory_items')->insert([['id' => 1, 'name' => 'Excavator', 'brand' => 'CAT', 'model' => '320', 'is_serialized' => 1, 'available_qty' => 1], ['id' => 2, 'name' => 'Scaffold frame', 'brand' => null, 'model' => null, 'is_serialized' => 0, 'available_qty' => 40]]);
        DB::table('inventory_instances')->insert(['id' => 7, 'item_id' => 1, 'asset_tag' => 'EX-01', 'status' => 'available']);
        DB::table('vendors')->insert([['id' => 3, 'vendor_number' => 'V-003', 'company_name' => 'Mombasa Plant Hire'], ['id' => 4, 'vendor_number' => 'V-004', 'company_name' => 'Other Supplies']]);
        DB::table('vendor_orders')->insert([['id' => 30, 'po_number' => 'PO-0030', 'vendor_id' => 3], ['id' => 40, 'po_number' => 'PO-0040', 'vendor_id' => 4]]);
        $test = $this;
        $this->app->instance(InventoryTransactionService::class, new class($test) extends InventoryTransactionService {   // Inventory's own steps are its tests'; here only what Projects asks of it
            public function __construct(private $test) {}

            public function issueInstance(InventoryInstance $instance, array $data): InventoryAssignment
            {
                if ($instance->status !== 'available') {
                    throw new \RuntimeException("Instance #{$instance->id} ({$instance->asset_tag}) is not available (status: {$instance->status}).");
                }
                $a = InventoryAssignment::create(['item_id' => $instance->item_id, 'instance_id' => $instance->id, 'quantity' => 1, 'assignment_type' => 'issue', 'assignee_type' => $data['assignee_type'], 'assignee_id' => $data['assignee_id'],
                    'assignee_label' => $data['assignee_label'], 'issued_by' => $data['issued_by'], 'issued_at' => now(), 'expected_return_date' => $data['expected_return_date'] ?? null, 'issue_condition' => $data['issue_condition'] ?? 'good', 'status' => 'active']);
                $instance->update(['status' => 'issued', 'current_assignee_type' => $data['assignee_type'], 'current_assignee_id' => $data['assignee_id'], 'current_assignee_label' => $data['assignee_label'], 'current_assignment_id' => $a->id]);
                $this->test->calls[] = ['issue', $data['assignee_type'], $data['assignee_id']];

                return $a;
            }

            public function issueBulk(array $data): InventoryAssignment
            {
                if ($data['quantity'] > 40) {
                    throw new \RuntimeException('Insufficient available qty. Available: 40.00');
                }

                return InventoryAssignment::create(['item_id' => $data['item_id'], 'quantity' => $data['quantity'], 'assignment_type' => 'issue', 'assignee_type' => $data['assignee_type'], 'assignee_id' => $data['assignee_id'], 'assignee_label' => $data['assignee_label'], 'issued_at' => now(), 'status' => 'active']);
            }

            public function returnAssignment(InventoryAssignment $assignment, array $data): InventoryAssignment
            {
                $assignment->update(['status' => 'returned', 'returned_at' => now(), 'return_condition' => $data['return_condition']]);
                if ($assignment->instance_id) {
                    InventoryInstance::where('id', $assignment->instance_id)->update(['status' => 'available', 'current_assignee_type' => null, 'current_assignee_id' => null, 'current_assignee_label' => null]);
                }

                return $assignment;
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.plant', 'inventory.manage']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.plant']);
        Sanctum::actingAs($this->kamau, ['*']);
        $type = DB::table('project_types')->where('industry_key', 'general')->value('id');
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Kilimani flats'])->assertCreated()->json('project.id');
        $this->other = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Ruaka road'])->assertCreated()->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function url(int $p, string $more = ''): string
    {
        return "/api/admin/projects/{$p}/plant{$more}";
    }

    public function test_owned_plant_is_issued_to_the_work_through_inventory_and_returned_with_its_condition(): void
    {
        $found = $this->getJson('/api/admin/projects/plant/find?q=exca')->assertOk()->json('items');
        $this->assertSame([['Excavator', 'CAT 320', [['id' => 7, 'tag' => 'EX-01', 'free' => true]]]], array_map(fn ($i) => [$i['name'], $i['detail'], $i['pieces']], $found));
        $page = $this->postJson($this->url($this->project, '/issue'), ['instance_id' => 7, 'back_by' => '2026-12-15', 'condition' => 'good'])->assertOk()->json();
        $this->assertSame(['issue', 'project', $this->project], $this->calls[0], 'the work is the holder in the asset register');
        $this->assertSame([['Excavator', 'EX-01', '2026-12-15']], array_map(fn ($h) => [$h['name'], $h['tag'], $h['back_by']], $page['holding']));
        $this->assertSame('That piece is not free: it is out or being repaired.', $this->postJson($this->url($this->other, '/issue'), ['instance_id' => 7])->assertStatus(422)->json('message'));
        $this->assertStringStartsWith('Not that many are free', $this->postJson($this->url($this->project, '/issue'), ['item_id' => 2, 'quantity' => 60])->assertStatus(422)->json('message'));
        $this->postJson($this->url($this->project, '/issue'), ['item_id' => 2, 'quantity' => 20])->assertOk()->assertJsonCount(2, 'holding');

        Sanctum::actingAs($this->njeri, ['*']);   // works the site but does not keep the asset register
        $this->assertFalse($this->getJson($this->url($this->project))->json('can.issue'));
        $held = DB::table('inventory_assignments')->where('instance_id', 7)->value('id');
        $this->postJson($this->url($this->project, "/held/{$held}/return"))->assertForbidden();
        Sanctum::actingAs($this->kamau, ['*']);
        $this->postJson($this->url($this->other, "/held/{$held}/return"))->assertNotFound();
        $this->postJson($this->url($this->project, "/held/{$held}/return"), ['condition' => 'fair'])->assertOk()->assertJsonCount(1, 'holding');
        $this->assertSame(['returned', 'fair'], [DB::table('inventory_assignments')->where('id', $held)->value('status'), DB::table('inventory_assignments')->where('id', $held)->value('return_condition')]);
        $this->assertSame(['plant.issued', 'plant.issued', 'plant.returned'], DB::table('project_log')->where('project_id', $this->project)->where('action', 'like', 'plant.%')->orderBy('id')->pluck('action')->all());
    }

    public function test_a_booking_that_overlaps_another_works_is_warned_about_not_refused(): void
    {
        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson($this->url($this->project, '/bookings'), ['item_id' => 1, 'instance_id' => 7, 'starts_on' => '2026-12-01', 'ends_on' => '2026-12-10'])->assertCreated()->assertJsonPath('clashes', []);
        $this->postJson($this->url($this->project, '/bookings'), ['item_id' => 1, 'starts_on' => '2026-12-10', 'ends_on' => '2026-12-01'])->assertStatus(422);
        Sanctum::actingAs($this->kamau, ['*']);
        $r = $this->postJson($this->url($this->other, '/bookings'), ['item_id' => 1, 'instance_id' => 7, 'starts_on' => '2026-12-08', 'ends_on' => '2026-12-12'])->assertCreated()->json();
        $number = DB::table('projects')->where('id', $this->project)->value('number');
        $this->assertSame(["Booked for {$number} from 1 Dec to 10 Dec"], $r['clashes']);
        $this->assertSame(["Booked for {$number} from 1 Dec to 10 Dec"], $r['bookings'][0]['clashes'], 'shown on the list too');
        $this->postJson($this->url($this->project, '/bookings/' . DB::table('project_plant_bookings')->where('project_id', $this->project)->value('id') . '/cancel'))->assertOk();
        $this->assertSame([], $this->getJson($this->url($this->other))->json('bookings.0.clashes'), 'a cancelled booking clashes with nothing');
    }

    public function test_hired_plant_is_on_a_vendor_order_and_goes_off_hire(): void
    {
        $this->assertSame([['Mombasa Plant Hire', [['id' => 30, 'number' => 'PO-0030', 'status' => 'sent']]]], array_map(fn ($v) => [$v['name'], $v['orders']], $this->getJson('/api/admin/projects/vendors/find?q=mombasa')->json('vendors')));
        $this->postJson($this->url($this->project, '/hires'), ['what' => 'Tower crane', 'vendor_id' => 3, 'vendor_order_id' => 40, 'starts_on' => '2026-11-20'])->assertStatus(422)->assertJsonPath('message', 'That vendor order is with another vendor.');
        $page = $this->postJson($this->url($this->project, '/hires'), ['what' => 'Tower crane', 'vendor_order_id' => 30, 'starts_on' => '2026-11-20'])->assertCreated()->json();
        $this->assertSame(['Tower crane', 'Mombasa Plant Hire', 'PO-0030', 'on_hire'], [$page['hires'][0]['what'], $page['hires'][0]['vendor'], $page['hires'][0]['order']['number'], $page['hires'][0]['state']], 'the vendor comes from the order');
        $hire = $page['hires'][0]['id'];
        $this->assertSame(['Tower crane (hired)'], array_column(app(\App\Services\Projects\ProjectPlant::class)->onSite(DB::table('projects')->find($this->project), '2026-11-21'), 'name'), 'for the daily record');
        $this->postJson($this->url($this->project, "/hires/{$hire}/off"), ['on' => '2026-11-19'])->assertStatus(422);
        $this->postJson($this->url($this->project, "/hires/{$hire}/off"), ['on' => '2026-11-30'])->assertOk()->assertJsonPath('hires.0.state', 'off_hire')->assertJsonPath('hires.0.ends_on', '2026-11-30');
    }
}

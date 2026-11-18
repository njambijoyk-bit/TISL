<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 7.2 (docs/PROJECTS_STAGE7_SPEC.md): Core's records linked to a piece of work, each behind its own permission. */
class ProjectsCoreLinksTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        foreach (['tickets', 'bookings', 'products', 'vendors', 'vendor_orders', 'quote_requests'] as $t) {
            if (Schema::hasTable($t)) {
                Schema::drop($t);
            }
        }
        Schema::create('tickets', function ($t) { $t->id(); $t->string('ticket_number'); $t->string('subject'); $t->string('status'); $t->string('priority'); $t->softDeletes(); });
        Schema::create('bookings', function ($t) { $t->id(); $t->string('number')->nullable(); $t->dateTime('starts_at'); $t->integer('people')->nullable(); $t->string('status'); });
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->string('sku')->nullable(); $t->string('type')->nullable(); $t->softDeletes(); });
        Schema::create('vendors', function ($t) { $t->id(); $t->string('vendor_number')->nullable(); $t->string('company_name'); $t->string('contact_name')->nullable(); $t->string('status'); $t->softDeletes(); });
        Schema::create('vendor_orders', function ($t) { $t->id(); $t->string('po_number'); $t->unsignedBigInteger('vendor_id'); $t->string('status'); $t->string('currency')->nullable(); $t->decimal('total', 14, 2)->nullable(); $t->softDeletes(); });
        Schema::create('quote_requests', function ($t) { $t->id(); $t->string('request_number'); $t->string('request_title'); $t->string('status'); });
        DB::table('tickets')->insert(['id' => 3, 'ticket_number' => 'TK-0031', 'subject' => 'Leaking roof in room 4', 'status' => 'waiting_customer', 'priority' => 'high']);
        DB::table('bookings')->insert(['id' => 4, 'number' => 'BK-0012', 'starts_at' => '2026-11-20 09:00:00', 'people' => 6, 'status' => 'confirmed']);
        DB::table('products')->insert(['id' => 5, 'name' => 'Site survey', 'sku' => 'SVC-SURV', 'type' => 'service']);
        DB::table('vendors')->insert(['id' => 6, 'vendor_number' => 'V-0007', 'company_name' => 'Bamburi Cement', 'contact_name' => 'Otieno', 'status' => 'active']);
        DB::table('vendor_orders')->insert(['id' => 7, 'po_number' => 'PO-0090', 'vendor_id' => 6, 'status' => 'sent', 'currency' => 'KES', 'total' => 125000]);
        DB::table('quote_requests')->insert(['id' => 8, 'request_number' => 'QR-0004', 'request_title' => 'Lodge wing fit-out', 'status' => 'reviewing']);
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.links', 'tickets.manage', 'bookings.manage', 'catalogue.view', 'vendors.view', 'quotes.view']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Lodge wing'])->assertCreated()->json('project.id');
    }

    public function test_each_core_record_is_found_linked_and_read_with_its_state_and_its_usual_role(): void
    {
        $want = ['support.ticket' => [3, 'TK-0031 · Leaking roof in room 4', 'Waiting for the customer', 'related'], 'bookings.booking' => [4, 'Booking BK-0012', 'Confirmed', 'related'],
            'catalogue.product' => [5, 'Site survey', null, 'deliverable'], 'vendors.vendor' => [6, 'Bamburi Cement', 'Active', 'supplier'],
            'vendors.order' => [7, 'Order PO-0090', 'Sent', 'supplier'], 'quotes.request' => [8, 'QR-0004 · Lodge wing fit-out', 'Being looked at', 'related']];
        foreach ($want as $type => [$id, $title]) {
            $q = ['support.ticket' => 'roof', 'bookings.booking' => 'BK-00', 'catalogue.product' => 'SURV', 'vendors.vendor' => 'Bamburi', 'vendors.order' => 'PO-0090', 'quotes.request' => 'fit-out'][$type];
            $found = $this->getJson("/api/admin/projects/{$this->project}/links/find?type={$type}&q=" . urlencode($q))->assertOk()->json('found');
            $this->assertSame($id, $found[0]['id'] ?? null, $type);
            $this->postJson("/api/admin/projects/{$this->project}/links", ['type' => $type, 'linked_id' => $id])->assertCreated();
        }
        $r = $this->getJson("/api/admin/projects/{$this->project}/links")->assertOk()->json();
        foreach ($want as $type => [$id, $title, $state, $role]) {
            $i = collect($r['groups'])->firstWhere('type', $type)['items'][0];
            $this->assertSame([$title, $state, $role], [$i['title'], $i['state']['label'] ?? null, $i['role']['key'] ?? null], $type);
        }
        $order = collect($r['groups'])->firstWhere('type', 'vendors.order')['items'][0];
        $this->assertSame([125000, 'KES', 'Bamburi Cement', '/admin/vendors/6'], [(int) $order['amount'], $order['currency'], $order['detail'], $order['url']]);
        $this->assertSame([], $r['agreed'], 'a supplier order is never the agreed value');
        DB::table('tickets')->where('id', 3)->update(['status' => 'resolved']);
        $this->assertSame('Resolved', collect($this->getJson("/api/admin/projects/{$this->project}/links")->json('groups'))->firstWhere('type', 'support.ticket')['items'][0]['state']['label'], 'read each time');
    }

    public function test_someone_without_a_modules_permission_is_not_offered_it_and_only_told_how_many_they_cannot_see(): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/links", ['type' => 'support.ticket', 'linked_id' => 3])->assertCreated();
        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.links', 'catalogue.view']);
        $r = $this->getJson("/api/admin/projects/{$this->project}/links")->assertOk()->json();
        $this->assertNull(collect($r['groups'])->firstWhere('type', 'support.ticket'));
        $this->assertSame(1, $r['hidden']);
        $this->getJson("/api/admin/projects/{$this->project}/links/find?type=support.ticket&q=TK")->assertForbidden();
    }
}

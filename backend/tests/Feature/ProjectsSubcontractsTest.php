<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 10.3 (docs/PROJECTS_STAGE10_SPEC.md): subcontracts on a vendor order, cumulative claims, certifying into Books with retention, releasing it. */
class ProjectsSubcontractsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private int $project;
    public array $posted = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('vendors', function ($t) { $t->id(); $t->string('vendor_number')->nullable(); $t->string('company_name')->nullable(); $t->string('contact_name')->nullable(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('status')->default('approved'); $t->timestamps(); $t->softDeletes(); });
        Schema::create('vendor_orders', function ($t) { $t->id(); $t->string('po_number'); $t->unsignedBigInteger('vendor_id'); $t->string('status')->default('sent'); $t->string('currency')->nullable(); $t->decimal('subtotal', 14, 2)->default(0); $t->decimal('total', 14, 2)->default(0); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('voucher_number'); $t->string('status')->default('posted'); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->decimal('total_amount', 14, 2)->default(0); $t->date('date')->nullable(); $t->string('narration')->nullable(); });
        Schema::create('voucher_entries', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('side', 1); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->boolean('is_party')->default(false); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->string('name'); $t->string('nature'); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); });
        DB::table('ledger_groups')->insert([['id' => 1, 'name' => 'Direct costs', 'nature' => 'expense'], ['id' => 2, 'name' => 'Current liabilities', 'nature' => 'liability']]);
        DB::table('ledgers')->insert([['id' => 10, 'name' => 'Subcontract costs', 'group_id' => 1], ['id' => 11, 'name' => 'Retention payable', 'group_id' => 2]]);
        DB::table('vendors')->insert([['id' => 3, 'vendor_number' => 'V-003', 'company_name' => 'Juja Electrical'], ['id' => 4, 'vendor_number' => 'V-004', 'company_name' => 'Other']]);
        DB::table('vendor_orders')->insert([['id' => 30, 'po_number' => 'PO-0030', 'vendor_id' => 3, 'subtotal' => 2000000, 'total' => 2320000], ['id' => 40, 'po_number' => 'PO-0040', 'vendor_id' => 4, 'subtotal' => 1000, 'total' => 1160]]);
        $posted = &$this->posted;
        $this->app->instance(\App\Services\Projects\ProjectVoucherPoster::class, new class($posted) extends \App\Services\Projects\ProjectVoucherPoster {   // Books stood in: it saves what it is given
            public function __construct(private array &$posted) {}

            public function journal(string $date, string $narration, ?string $reference, array $entries, User $by, array $settles = []): int
            {
                $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 2, 'voucher_number' => 'JV-' . (count($this->posted) + 1), 'status' => 'posted', 'total_amount' => $entries[0]['amount'], 'narration' => $narration, 'date' => $date]);
                foreach ($entries as $e) {
                    DB::table('voucher_entries')->insert(['voucher_id' => $id, 'ledger_id' => $e['ledger_id'], 'side' => $e['side'], 'amount' => $e['amount'], 'cost_centre_id' => $e['cost_centre_id'] ?? null, 'is_party' => ! empty($e['is_party'])]);
                }
                $this->posted[] = ['kind' => 'journal', 'entries' => array_map(fn ($e) => [$e['ledger_id'], $e['side'], (float) $e['amount']], $entries), 'settles' => $settles];

                return $id;
            }

            public function supplierLedger(int $vendorId): int
            {
                return 50;
            }

            public function purchase(string $date, int $vendorId, array $lines, ?int $costCentreId, string $narration, ?string $reference, User $by): array
            {
                $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 3, 'voucher_number' => 'PI-' . (count($this->posted) + 1), 'status' => 'posted', 'cost_centre_id' => $costCentreId, 'total_amount' => round($lines[0]['rate'] * 1.16, 2), 'date' => $date]);
                $this->posted[] = ['kind' => 'purchase', 'id' => $id, 'vendor' => $vendorId, 'rate' => (float) $lines[0]['rate'], 'ledger' => $lines[0]['ledger_id'], 'cost_centre' => $costCentreId];

                return ['id' => $id, 'number' => 'PI-' . count($this->posted), 'party_ledger_id' => 50];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.subcontracts', 'projects.money.view', 'projects.config.view', 'projects.config.manage']);
        $this->njeri = $this->staff('Njeri', ['projects.use']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Kilimani flats'])->assertCreated()->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function url(string $more = ''): string
    {
        return "/api/admin/projects/{$this->project}{$more}";
    }

    private function sub(array $d = []): int
    {
        return (int) $this->postJson($this->url('/subcontracts'), $d + ['vendor_id' => 3, 'title' => 'Electrical works', 'vendor_order_id' => 30, 'retention_pct' => 10])->assertCreated()->json('subcontracts.0.id');
    }

    public function test_certifying_bills_the_difference_since_the_last_certificate_and_holds_retention_back(): void
    {
        $this->postJson($this->url('/subcontracts'), ['vendor_id' => 3, 'title' => 'Electrical', 'vendor_order_id' => 40])->assertStatus(422)->assertJsonPath('message', 'That vendor order is with another vendor.');
        $sub = $this->sub();
        $this->assertSame([2000000.0, 0.0], [(float) $this->getJson($this->url('/subcontracts'))->json('subcontracts.0.value'), (float) $this->getJson($this->url('/subcontracts'))->json('subcontracts.0.certified_pct')], 'the value is read from the vendor order, before tax');
        $claim = $this->postJson($this->url("/subcontracts/{$sub}/claims"), ['claimed_pct' => 30, 'period_to' => '2026-11-30'])->assertCreated()->json('subcontracts.0.claims.0.id');
        $this->postJson($this->url("/subcontracts/{$sub}/claims"), ['claimed_pct' => 40])->assertStatus(422);   // one waiting at a time
        $this->postJson($this->url("/claims/{$claim}/certify"), ['certified_pct' => 25])->assertStatus(409)->assertJsonPath('message', 'Choose the ledger subcontract costs go to in Configuration → Site first.');
        $this->putJson('/api/admin/projects/configuration/site', ['sub_cost_ledger_id' => 10, 'sub_retention_ledger_id' => 11])->assertOk();
        $this->postJson($this->url("/claims/{$claim}/certify"), ['certified_pct' => 35])->assertStatus(422);   // never more than claimed
        $page = $this->postJson($this->url("/claims/{$claim}/certify"), ['certified_pct' => 25, 'note' => 'Second floor not finished'])->assertOk()->json();
        $cc = DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
        $this->assertSame(['purchase', 3, 500000.0, 10, $cc ? (int) $cc : null], [$this->posted[0]['kind'], $this->posted[0]['vendor'], $this->posted[0]['rate'], $this->posted[0]['ledger'], $this->posted[0]['cost_centre']], '25% of 2,000,000 on the cost ledger and the work');
        $this->assertSame([[50, 'D', 50000.0], [11, 'C', 50000.0]], $this->posted[1]['entries'], '10% held back: debit the supplier, credit retention');
        $this->assertSame([['against_voucher_id' => $this->posted[0]['id'], 'amount' => 50000.0]], $this->posted[1]['settles'], 'settled against the bill');
        $this->assertSame([25.0, 500000.0, 50000.0], [(float) $page['subcontracts'][0]['certified_pct'], (float) $page['subcontracts'][0]['certified'], (float) $page['subcontracts'][0]['held']]);

        $next = $this->postJson($this->url("/subcontracts/{$sub}/claims"), ['claimed_pct' => 60])->assertCreated()->json('subcontracts.0.claims.0.id');
        $this->postJson($this->url("/claims/{$next}/certify"), ['certified_pct' => 60])->assertOk();
        $this->assertSame(700000.0, $this->posted[2]['rate'], 'only the difference: 60% less the 25% already certified');
        $this->putJson($this->url("/subcontracts/{$sub}"), ['retention_pct' => 5])->assertStatus(422);
    }

    public function test_a_claim_can_be_rejected_and_retention_is_released_once_at_the_end(): void
    {
        $this->putJson('/api/admin/projects/configuration/site', ['sub_cost_ledger_id' => 10, 'sub_retention_ledger_id' => 11])->assertOk();
        $sub = $this->sub();
        $claim = $this->postJson($this->url("/subcontracts/{$sub}/claims"), ['claimed_pct' => 100])->assertCreated()->json('subcontracts.0.claims.0.id');
        $this->postJson($this->url("/claims/{$claim}/reject"), [])->assertStatus(422);
        $this->postJson($this->url("/claims/{$claim}/reject"), ['note' => 'Snags still open'])->assertOk()->assertJsonPath('subcontracts.0.claims.0.state', 'rejected');
        $claim = $this->postJson($this->url("/subcontracts/{$sub}/claims"), ['claimed_pct' => 100])->assertCreated()->json('subcontracts.0.claims.0.id');
        $this->postJson($this->url("/claims/{$claim}/certify"), ['certified_pct' => 100])->assertOk();
        $this->postJson($this->url("/subcontracts/{$sub}/release"))->assertStatus(422)->assertJsonPath('message', 'Mark the subcontract complete before releasing its retention.');
        $this->putJson($this->url("/subcontracts/{$sub}"), ['state' => 'complete'])->assertOk();
        $this->postJson($this->url("/subcontracts/{$sub}/release"))->assertOk()->assertJsonPath('subcontracts.0.released', true);
        $this->assertSame([[11, 'D', 200000.0], [50, 'C', 200000.0]], end($this->posted)['entries'], 'from the retention ledger it was held in back to the supplier');
        $this->postJson($this->url("/subcontracts/{$sub}/release"))->assertStatus(422);
        $this->assertSame(['subcontract.added', 'subcontract.claimed', 'subcontract.claim_rejected', 'subcontract.claimed', 'subcontract.certified', 'subcontract.changed', 'subcontract.retention_released'],
            DB::table('project_log')->where('project_id', $this->project)->where('action', 'like', 'subcontract.%')->orderBy('id')->pluck('action')->all());
    }

    public function test_only_those_who_work_the_site_act_and_money_is_hidden_without_the_money_permission_and_certifying_is_serious(): void
    {
        $sub = $this->sub();
        Sanctum::actingAs($this->njeri, ['*']);
        $page = $this->getJson($this->url('/subcontracts'))->assertOk()->json();
        $this->assertSame([false, null, 0.0], [$page['can']['manage'], $page['subcontracts'][0]['value'], (float) $page['subcontracts'][0]['certified_pct']], 'percentages, but no amounts');
        $this->postJson($this->url("/subcontracts/{$sub}/claims"), ['claimed_pct' => 10])->assertForbidden();

        Sanctum::actingAs($this->staff('Wanjiru', ['projects.use', 'projects.config.view', 'projects.config.actions']), ['*']);
        $this->putJson('/api/admin/projects/configuration/serious', ['rules' => ['sub.certify' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => false]]])->assertOk();
        Sanctum::actingAs($this->kamau, ['*']);
        $this->putJson('/api/admin/projects/configuration/site', ['sub_cost_ledger_id' => 10, 'sub_retention_ledger_id' => 11])->assertOk();
        $claim = $this->postJson($this->url("/subcontracts/{$sub}/claims"), ['claimed_pct' => 10])->assertCreated()->json('subcontracts.0.claims.0.id');
        $this->postJson($this->url("/claims/{$claim}/certify"), ['certified_pct' => 10])->assertStatus(428)->assertJsonPath('serious.action', 'sub.certify');
        $this->assertSame([], $this->posted, 'nothing reaches the books before it is approved');
    }

    public function test_the_subcontractor_sees_only_their_own_on_their_portal_and_claims_there(): void
    {
        $sub = $this->sub();
        $this->postJson($this->url('/subcontracts'), ['vendor_id' => 4, 'title' => 'Plumbing'])->assertCreated();
        $grace = User::forceCreate(['name' => 'Grace (Juja Electrical)', 'email' => 'grace@juja.test', 'role' => 'vendor']);
        DB::table('vendors')->where('id', 3)->update(['user_id' => $grace->id]);

        Sanctum::actingAs($grace, ['*']);
        $mine = $this->getJson('/api/vendor-portal/subcontracts')->assertOk()->json('subcontracts');
        $this->assertSame(['Electrical works'], array_column($mine, 'title'), 'never another vendor\'s');
        $this->assertStringEndsWith('Kilimani flats', $mine[0]['project']);
        $other = (int) DB::table('project_subcontracts')->where('vendor_id', 4)->value('id');
        $this->postJson("/api/vendor-portal/subcontracts/{$other}/claims", ['claimed_pct' => 10])->assertNotFound();
        $this->postJson("/api/vendor-portal/subcontracts/{$sub}/claims", ['claimed_pct' => 40, 'note' => 'First and second floors wired'])->assertCreated()->assertJsonPath('subcontracts.0.claims.0.by_vendor', true);
        $this->assertSame([40.0, 'submitted'], [(float) DB::table('project_sub_claims')->value('claimed_pct'), DB::table('project_sub_claims')->value('state')]);

        DB::table('vendors')->where('id', 3)->update(['status' => 'suspended']);
        $this->getJson('/api/vendor-portal/subcontracts')->assertForbidden();
        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson('/api/vendor-portal/subcontracts')->assertForbidden();
    }
}

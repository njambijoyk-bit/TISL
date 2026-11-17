<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 4.7 (docs/PROJECTS_STAGE4_SPEC.md): advances and retention, taken off bills as journals settled against the invoice. */
class ProjectsAdvancesRetentionTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $project;
    private int $cc;
    private array $posted = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); $t->string('base_type'); $t->boolean('is_active')->default(true); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('voucher_number'); $t->string('status')->default('posted'); $t->unsignedBigInteger('cost_centre_id')->nullable();
            $t->decimal('total_amount', 14, 2)->default(0); $t->date('date')->nullable(); $t->string('narration')->nullable(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->boolean('is_header')->default(false); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('ledger_id')->nullable(); });
        Schema::create('voucher_entries', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('side', 1); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('cost_centre_id')->nullable();
            $t->boolean('is_party')->default(false); $t->unsignedBigInteger('project_holding_id')->nullable(); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('nature'); $t->string('behaviour')->nullable(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); $t->unsignedBigInteger('customer_id')->nullable(); });
        DB::table('voucher_types')->insert([['id' => 1, 'name' => 'Sales Invoice', 'base_type' => 'sales'], ['id' => 2, 'name' => 'Journal', 'base_type' => 'journal'], ['id' => 5, 'name' => 'Sales Order', 'base_type' => 'sales_order']]);
        DB::table('ledger_groups')->insert([['id' => 1, 'parent_id' => null, 'name' => 'Sales', 'nature' => 'income', 'behaviour' => null], ['id' => 2, 'parent_id' => null, 'name' => 'Current Assets', 'nature' => 'asset', 'behaviour' => null],
            ['id' => 3, 'parent_id' => null, 'name' => 'Sundry Debtors', 'nature' => 'asset', 'behaviour' => 'debtors'], ['id' => 4, 'parent_id' => null, 'name' => 'Current Liabilities', 'nature' => 'liability', 'behaviour' => null],
            ['id' => 5, 'parent_id' => 2, 'name' => 'Bank Accounts', 'nature' => 'asset', 'behaviour' => 'bank']]);
        DB::table('ledgers')->insert([['id' => 1, 'name' => 'Legal fees', 'group_id' => 1, 'customer_id' => null], ['id' => 2, 'name' => 'Retention receivable', 'group_id' => 2, 'customer_id' => null], ['id' => 3, 'name' => 'Imara Sacco', 'group_id' => 3, 'customer_id' => 1],
            ['id' => 4, 'name' => 'Advances from clients', 'group_id' => 4, 'customer_id' => null], ['id' => 5, 'name' => 'KCB Main', 'group_id' => 5, 'customer_id' => null], ['id' => 6, 'name' => 'Retention: Imara Sacco', 'group_id' => 2, 'customer_id' => null]]);
        // the books' own voucher service is stood in for: it saves what it is given, as Books would
        $posted = &$this->posted;
        $this->app->instance(\App\Services\Projects\ProjectVoucherPoster::class, new class($posted) extends \App\Services\Projects\ProjectVoucherPoster {
            public function __construct(private array &$posted) {}

            public function journal(string $date, string $narration, ?string $reference, array $entries, \App\Models\User $by, array $settles = []): int
            {
                $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 2, 'voucher_number' => 'JV-' . (count($this->posted) + 1), 'status' => 'posted', 'narration' => $narration, 'date' => $date]);
                foreach ($entries as $e) {
                    DB::table('voucher_entries')->insert(['voucher_id' => $id] + $e);
                }
                $this->posted[] = ['kind' => 'journal'] + compact('narration', 'entries', 'settles');

                return $id;
            }

            public function sales(string $date, int $customerId, array $lines, ?int $costCentreId, string $narration, ?string $reference, \App\Models\User $by): array
            {
                $total = round(array_sum(array_column($lines, 'rate')) * 1.16, 2);   // the ledger adds 16% tax
                $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'INV-' . (count($this->posted) + 1), 'status' => 'posted', 'cost_centre_id' => $costCentreId, 'total_amount' => $total, 'date' => $date]);
                $this->posted[] = ['kind' => 'sales', 'id' => $id, 'total' => $total];

                return ['id' => $id, 'number' => 'INV-' . count($this->posted)];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.money.view', 'projects.money.bill', 'projects.money.retention', 'books.post']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Office block', 'customer_id' => 1])->json('project.id');
        $this->cc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
        $so = DB::table('vouchers')->insertGetId(['voucher_type_id' => 5, 'voucher_number' => 'SO-1', 'status' => 'posted', 'total_amount' => 1160000]);
        DB::table('voucher_items')->insert(['voucher_id' => $so, 'amount' => 1000000, 'ledger_id' => 1]);
        DB::table('project_links')->insert(['project_id' => $this->project, 'module' => 'books', 'link_type' => 'voucher', 'linked_id' => $so, 'created_at' => now()]);
        $this->putJson("/api/admin/projects/{$this->project}/billing", ['stages' => [['name' => 'Foundations', 'share' => 40], ['name' => 'Roof', 'share' => 60]]])->assertOk();
        app(\App\Services\Projects\ProjectSettings::class)->save('money', ['bill_mode' => 'post', 'retention_ledger_id' => 2], $this->kamau);
    }

    private function terms(): array
    {
        return $this->getJson("/api/admin/projects/{$this->project}/terms")->assertOk()->json('terms');
    }

    private function stage(string $name): int
    {
        return (int) DB::table('project_billing_stages')->where('name', $name)->value('id');
    }

    public function test_retention_is_held_back_on_each_bill_before_tax_and_settled_against_the_invoice(): void
    {
        $this->putJson("/api/admin/projects/{$this->project}/terms", ['retention_percent' => 10])->assertOk()->assertJsonPath('terms.retention_ledger', ['id' => 2, 'name' => 'Retention receivable', 'from' => 'the company']);
        $r = $this->postJson("/api/admin/projects/{$this->project}/billing/{$this->stage('Foundations')}/bill")->assertCreated()->json();
        [$invoice, $journal] = [$this->posted[0], $this->posted[1]];
        $this->assertSame(464000.0, $invoice['total'], '400,000 plus tax');
        $this->assertSame([['ledger_id' => 2, 'side' => 'D', 'amount' => 40000.0, 'cost_centre_id' => $this->cc], ['ledger_id' => 3, 'side' => 'C', 'amount' => 40000.0, 'cost_centre_id' => $this->cc, 'is_party' => true]], $journal['entries'],
            '10% of the 400,000 before tax moves from the client to retention');
        $this->assertSame([['against_voucher_id' => $invoice['id'], 'amount' => 40000.0]], $journal['settles'], 'and comes off that invoice');
        $this->assertSame([40000, null, false], [$r['billing']['stages'][0]['retention'], $r['billing']['stages'][0]['advance'], $r['billing']['stages'][0]['owing']]);
        $this->assertSame(40000, $this->terms()['retention_held']);

        $this->putJson("/api/admin/projects/{$this->project}/terms", ['retention_percent' => 10, 'retention_ledger_id' => 6])->assertStatus(422)->assertJson(['message' => 'Retention is held on the ledger this work uses now. Release it before changing the ledger.']);
        $this->putJson("/api/admin/projects/{$this->project}/terms", ['retention_percent' => 60])->assertStatus(422);
        $this->putJson("/api/admin/projects/{$this->project}/terms", ['retention_ledger_id' => 3])->assertStatus(422)->assertJson(['message' => 'Retention is money the client still owes: choose an asset ledger.']);
    }

    public function test_releasing_retention_puts_it_back_on_the_clients_account_never_more_than_is_held_and_follows_the_serious_action_rules(): void
    {
        $this->putJson("/api/admin/projects/{$this->project}/terms", ['retention_percent' => 5])->assertOk();
        $this->postJson("/api/admin/projects/{$this->project}/billing/{$this->stage('Foundations')}/bill")->assertCreated();
        $this->postJson("/api/admin/projects/{$this->project}/billing/{$this->stage('Roof')}/bill")->assertCreated();
        $this->assertSame(50000, $this->terms()['retention_held'], '5% of 400,000 and of 600,000');

        $this->postJson("/api/admin/projects/{$this->project}/retention/release", ['amount' => 60000])->assertStatus(422)->assertJson(['message' => 'That is more than the retention held on this work (50,000.00).']);
        $this->postJson("/api/admin/projects/{$this->project}/retention/release", ['amount' => 20000])->assertCreated()->assertJsonPath('terms.retention_held', 30000);
        $last = end($this->posted);
        $this->assertSame([['ledger_id' => 3, 'side' => 'D', 'amount' => 20000.0, 'cost_centre_id' => $this->cc, 'is_party' => true], ['ledger_id' => 2, 'side' => 'C', 'amount' => 20000.0, 'cost_centre_id' => $this->cc]], $last['entries']);
        $this->assertSame('money.retention_released', DB::table('project_log')->orderByDesc('id')->value('action'));

        app(\App\Services\Projects\ProjectSettings::class)->save('serious', array_merge(\App\Services\Projects\ProjectSerious::defaults(), ['retention.release' => ['needs' => 'supervisor', 'on_project' => true, 'reason' => true]]), $this->kamau);
        $this->postJson("/api/admin/projects/{$this->project}/retention/release", ['amount' => 1000])->assertStatus(428)->assertJsonPath('serious.action', 'retention.release');
        $this->assertSame(30000, $this->terms()['retention_held']);

        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.money.view', 'projects.money.bill']);
        $this->postJson("/api/admin/projects/{$this->project}/retention/release", ['amount' => 1000])->assertForbidden();
        $this->putJson("/api/admin/projects/{$this->project}/terms", ['retention_percent' => 0])->assertForbidden();
    }

    public function test_an_advance_is_received_into_cash_or_bank_and_used_on_bills_until_it_is_gone(): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/advances", ['amount' => 100, 'ledger_id' => 5])->assertStatus(422)->assertJson(['message' => "Choose this work's advances ledger first."]);
        $this->putJson("/api/admin/projects/{$this->project}/terms", ['advance_ledger_id' => 2])->assertStatus(422);
        $this->putJson("/api/admin/projects/{$this->project}/terms", ['advance_ledger_id' => 4])->assertOk();
        $this->postJson("/api/admin/projects/{$this->project}/advances", ['amount' => 500000, 'ledger_id' => 1])->assertStatus(422)->assertJson(['message' => 'Choose the cash or bank ledger it was paid into.']);
        $this->postJson("/api/admin/projects/{$this->project}/advances", ['amount' => 500000, 'ledger_id' => 5, 'from' => 'Imara Sacco', 'reference' => 'EFT 77'])->assertCreated()->assertJsonPath('terms.advance_unused', 500000);
        $this->assertSame([['ledger_id' => 5, 'side' => 'D', 'amount' => 500000.0, 'cost_centre_id' => $this->cc], ['ledger_id' => 4, 'side' => 'C', 'amount' => 500000.0, 'cost_centre_id' => $this->cc]], $this->posted[0]['entries']);

        // the first bill (464,000 with tax) is covered in full; the second uses the 36,000 left
        $this->postJson("/api/admin/projects/{$this->project}/billing/{$this->stage('Foundations')}/bill")->assertCreated();
        $used = end($this->posted);
        $this->assertSame([[4, 'D', 464000.0], [3, 'C', 464000.0]], array_map(fn ($e) => [$e['ledger_id'], $e['side'], $e['amount']], $used['entries']));
        $this->assertSame(464000.0, $used['settles'][0]['amount']);
        $this->assertSame(36000, $this->terms()['advance_unused']);
        $r = $this->postJson("/api/admin/projects/{$this->project}/billing/{$this->stage('Roof')}/bill")->assertCreated()->json();
        $this->assertSame([36000, 0], [$r['billing']['stages'][1]['advance'], $this->terms()['advance_unused']]);
        $this->putJson("/api/admin/projects/{$this->project}/terms", ['advance_ledger_id' => null])->assertOk();
    }

    public function test_with_both_retention_comes_off_first_and_the_advance_covers_what_is_left(): void
    {
        $this->putJson("/api/admin/projects/{$this->project}/terms", ['retention_percent' => 10, 'advance_ledger_id' => 4])->assertOk();
        $this->postJson("/api/admin/projects/{$this->project}/advances", ['amount' => 1000000, 'ledger_id' => 5])->assertCreated();
        $this->postJson("/api/admin/projects/{$this->project}/billing/{$this->stage('Foundations')}/bill")->assertCreated();
        $this->assertSame([40000.0, 424000.0], [$this->posted[2]['entries'][0]['amount'], $this->posted[3]['entries'][0]['amount']], 'the client owes nothing more on it: 464,000 less 40,000 retention less 424,000 advance');
    }

    public function test_a_per_client_ledger_follows_the_client_and_a_bill_saved_on_the_books_form_has_its_retention_taken_or_offered_again(): void
    {
        app(\App\Services\Projects\ProjectSettings::class)->save('money', ['bill_mode' => 'draft', 'retention_mode' => 'client'], $this->kamau);
        $this->putJson("/api/admin/projects/{$this->project}/terms", ['retention_percent' => 10])->assertOk()->assertJsonPath('terms.retention_ledger', null);

        // drafted bill saved on the Books form while no ledger is chosen: the invoice stands, and the stage offers to try again
        $inv = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'INV-50', 'status' => 'posted', 'cost_centre_id' => $this->cc, 'total_amount' => 464000]);
        app(\App\Services\Projects\ProjectBilling::class)->tie($this->stage('Foundations'), $inv, $this->cc, $this->kamau);
        $stage = $this->getJson("/api/admin/projects/{$this->project}/billing")->json('billing.stages.0');
        $this->assertSame(['billed', null, true], [$stage['state'], $stage['retention'], $stage['owing']]);
        $this->assertSame('billing.deduct_waiting', DB::table('project_log')->orderByDesc('id')->value('action'));
        $this->postJson("/api/admin/projects/{$this->project}/billing/{$this->stage('Foundations')}/deduct")->assertStatus(422)->assertJson(['message' => 'Retention is set on this work but no retention ledger is chosen. Choose one, then take it off the bill.']);

        $this->putJson("/api/admin/projects/{$this->project}/terms", ['retention_ledger_id' => 6])->assertOk();
        $r = $this->postJson("/api/admin/projects/{$this->project}/billing/{$this->stage('Foundations')}/deduct")->assertOk()->json();
        $this->assertSame([40000, false], [$r['billing']['stages'][0]['retention'], $r['billing']['stages'][0]['owing']]);
        $this->postJson("/api/admin/projects/{$this->project}/billing/{$this->stage('Foundations')}/deduct")->assertOk();
        $this->assertCount(1, $this->posted, 'taken once');

        // the client's next piece of work uses the same ledger without being told
        $next = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Car park', 'customer_id' => 1])->json('project.id');
        $this->assertSame(['id' => 6, 'name' => 'Retention: Imara Sacco', 'from' => 'the client'], $this->getJson("/api/admin/projects/{$next}/terms")->json('terms.retention_ledger'));
    }
}

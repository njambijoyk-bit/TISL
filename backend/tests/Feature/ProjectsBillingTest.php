<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 4.6 (docs/PROJECTS_STAGE4_SPEC.md): billing plans as shares of the agreed value, when each stage falls due, posting or drafting the bill. */
class ProjectsBillingTest extends TestCase
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
            $t->decimal('total_amount', 14, 2)->default(0); $t->decimal('base_total', 14, 2)->nullable(); $t->date('date')->nullable(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->boolean('is_header')->default(false); $t->decimal('amount', 14, 2); $t->unsignedBigInteger('ledger_id')->nullable(); });
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->string('name'); $t->string('nature'); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); });
        DB::table('voucher_types')->insert([['id' => 1, 'name' => 'Sales Invoice', 'base_type' => 'sales'], ['id' => 4, 'name' => 'Quotation', 'base_type' => 'quotation'], ['id' => 5, 'name' => 'Sales Order', 'base_type' => 'sales_order']]);
        DB::table('ledger_groups')->insert([['id' => 1, 'name' => 'Sales', 'nature' => 'income'], ['id' => 3, 'name' => 'Debtors', 'nature' => 'asset']]);
        DB::table('ledgers')->insert([['id' => 1, 'name' => 'Legal fees', 'group_id' => 1], ['id' => 2, 'name' => 'Consulting fees', 'group_id' => 1], ['id' => 3, 'name' => 'Imara Sacco', 'group_id' => 3]]);
        // the books' own voucher service is stood in for: the invoice is saved as Books would, with its number
        $posted = &$this->posted;
        $this->app->instance(\App\Services\Projects\ProjectVoucherPoster::class, new class($posted) extends \App\Services\Projects\ProjectVoucherPoster {
            public function __construct(private array &$posted) {}

            public function sales(string $date, int $customerId, array $lines, ?int $costCentreId, string $narration, ?string $reference, \App\Models\User $by): array
            {
                $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'INV-' . (count($this->posted) + 1), 'status' => 'posted', 'cost_centre_id' => $costCentreId, 'total_amount' => array_sum(array_column($lines, 'rate')), 'date' => $date]);
                $this->posted[] = compact('date', 'customerId', 'lines', 'costCentreId', 'narration', 'reference');

                return ['id' => $id, 'number' => 'INV-' . count($this->posted)];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.phases', 'projects.money.view', 'projects.money.bill', 'books.post']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Stock system', 'customer_id' => 1])->json('project.id');
        $this->cc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
    }

    /** A sales order (or quotation) linked to the work, with its lines before tax. @param array<int, array{0: float, 1: int}> $items amount, income ledger */
    private function agreed(int $type, array $items, float $total): int
    {
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => $type, 'voucher_number' => $type === 5 ? 'SO-1' : 'Q-1', 'status' => 'posted', 'total_amount' => $total]);
        foreach ($items as [$amount, $ledger]) {
            DB::table('voucher_items')->insert(['voucher_id' => $id, 'amount' => $amount, 'ledger_id' => $ledger]);
        }
        DB::table('project_links')->insert(['project_id' => $this->project, 'module' => 'books', 'link_type' => 'voucher', 'linked_id' => $id, 'created_at' => now()]);

        return $id;
    }

    private function save(array $stages, ?int $ledger = null): \Illuminate\Testing\TestResponse
    {
        return $this->putJson("/api/admin/projects/{$this->project}/billing", ['stages' => $stages, 'income_ledger_id' => $ledger]);
    }

    private function plan(): array
    {
        return $this->getJson("/api/admin/projects/{$this->project}/billing")->assertOk()->json('billing');
    }

    public function test_a_plan_is_shares_of_the_agreed_value_before_tax_and_the_last_stage_takes_what_is_left(): void
    {
        $this->save([['name' => 'Deposit', 'share' => 30]])->assertStatus(422)->assertJson(['message' => 'A billing plan is shares of the agreed value. Link the quotation or sales order to this work first.']);
        $this->agreed(5, [[700000, 1], [300000.01, 2]], 1160000.01);   // 1,000,000.01 before tax; most of it to Legal fees

        $this->save([['name' => 'Deposit', 'share' => 33.3333], ['name' => 'Midway', 'share' => 33.3333], ['name' => 'Handover', 'share' => 33.3334]])->assertOk();
        $p = $this->plan();
        $this->assertSame(['net' => 1000000.01, 'from' => 'sales orders', 'count' => 1], $p['basis']);
        $this->assertSame(['id' => 1, 'name' => 'Legal fees'], $p['income_ledger'], 'the ledger most of the order goes to, until one is chosen');
        $amounts = array_column($p['stages'], 'amount');
        $this->assertSame([333333, 333333, 333334.01], $amounts);
        $this->assertSame(1000000.01, round(array_sum($amounts), 2), 'the bills add up to the agreed value to the cent');
        $this->assertSame(['due', 'due', 'due'], array_column($p['stages'], 'state'), 'a stage billed when someone says so is always due');
        $this->assertSame(0, (int) DB::table('project_billing_stages')->whereNotNull('voucher_id')->count());
        $this->assertFalse(Schema::hasColumn('project_billing_stages', 'amount'), 'no amount is stored');

        $this->save([['name' => 'Deposit', 'share' => 60], ['name' => 'Rest', 'share' => 50]])->assertStatus(422)->assertJson(['message' => 'The shares add up to 110%. A plan bills the agreed value once: no more than 100%.']);
        $this->save([['name' => '', 'share' => 10]])->assertStatus(422);
        $this->save([['name' => 'X', 'share' => 0]])->assertStatus(422);
        $this->save([['name' => 'X', 'share' => 10]], 3)->assertStatus(422)->assertJson(['message' => 'Choose an income ledger from the books.']);
        $this->save([['name' => 'X', 'share' => 10]], 2)->assertOk()->assertJsonPath('billing.income_ledger.name', 'Consulting fees');
    }

    public function test_a_stage_falls_due_on_a_date_when_a_phase_is_done_or_when_the_work_reaches_a_stage(): void
    {
        $this->agreed(4, [[100000, 1]], 116000);
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Design'])->assertCreated();
        $phase = (int) DB::table('project_phases')->where('name', 'Design')->value('id');
        $type = (int) DB::table('projects')->where('id', $this->project)->value('type_id');
        $stages = DB::table('project_stages')->where('type_id', $type)->orderBy('sort_order')->pluck('id')->all();
        $this->save([['name' => 'On signing', 'share' => 10, 'due_kind' => 'date', 'due_on' => now()->subDay()->toDateString()], ['name' => 'Next month', 'share' => 10, 'due_kind' => 'date', 'due_on' => now()->addMonth()->toDateString()],
            ['name' => 'Design done', 'share' => 30, 'due_kind' => 'phase', 'phase_id' => $phase], ['name' => 'At the last stage', 'share' => 50, 'due_kind' => 'stage', 'stage_id' => end($stages)]])->assertOk();
        $p = $this->plan();
        $this->assertSame(['quotations', [10000, 10000, 30000, 50000]], [$p['basis']['from'], array_column($p['stages'], 'amount')]);
        $this->assertSame(['due', 'waiting', 'waiting', 'waiting'], array_column($p['stages'], 'state'));
        $this->assertSame(['Design', 'Design'], [$p['stages'][2]['phase']['name'], $p['options']['phases'][0]['name']]);

        DB::table('project_phases')->where('id', $phase)->update(['state' => 'done']);
        DB::table('projects')->where('id', $this->project)->update(['stage_id' => end($stages)]);
        $this->assertSame(['due', 'waiting', 'due', 'due'], array_column($this->plan()['stages'], 'state'));

        $this->save([['name' => 'X', 'share' => 10, 'due_kind' => 'date']])->assertStatus(422)->assertJson(['message' => '"X": give the date it falls due.']);
        $this->save([['name' => 'X', 'share' => 10, 'due_kind' => 'phase', 'phase_id' => 999]])->assertStatus(422);
        $this->save([['name' => 'X', 'share' => 10, 'due_kind' => 'soon']])->assertStatus(422);
    }

    public function test_with_the_setting_on_post_a_stage_is_posted_as_a_sales_invoice_on_the_works_cost_centre_and_cannot_be_billed_twice(): void
    {
        $this->agreed(5, [[200000, 1]], 232000);
        $this->save([['name' => 'Deposit', 'share' => 25], ['name' => 'Rest', 'share' => 75]])->assertOk();
        app(\App\Services\Projects\ProjectSettings::class)->save('money', ['bill_mode' => 'post'], $this->kamau);
        $deposit = (int) DB::table('project_billing_stages')->where('name', 'Deposit')->value('id');

        $r = $this->postJson("/api/admin/projects/{$this->project}/billing/{$deposit}/bill")->assertCreated()->json();
        $this->assertSame(['post', 'INV-1'], [$r['mode'], $r['voucher']['number']]);
        $number = DB::table('projects')->where('id', $this->project)->value('number');
        $this->assertSame([1, $this->cc, $number, "{$number} Stock system: Deposit"], [$this->posted[0]['customerId'], $this->posted[0]['costCentreId'], $this->posted[0]['reference'], $this->posted[0]['narration']]);
        $this->assertSame([['type' => 'custom', 'description' => "Deposit: 25% of the agreed order for {$number}", 'quantity' => 1, 'rate' => 50000.0, 'ledger_id' => 1]], $this->posted[0]['lines']);
        $this->assertSame(['billed', 'due'], array_column($r['billing']['stages'], 'state'));
        $this->assertSame('INV-1', $r['billing']['stages'][0]['voucher']['number']);

        $this->postJson("/api/admin/projects/{$this->project}/billing/{$deposit}/bill")->assertStatus(422)->assertJson(['message' => 'This stage is already billed.']);
        // a billed stage is kept when the plan is saved again
        $this->save([['id' => $deposit, 'name' => 'Changed', 'share' => 99], ['name' => 'Rest', 'share' => 75]])->assertOk();
        $this->assertSame([['Deposit', 25], ['Rest', 75]], array_map(fn ($s) => [$s['name'], $s['share']], $this->plan()['stages']));
        $this->save([['name' => 'Rest', 'share' => 80]])->assertStatus(422)->assertJson(['message' => 'The shares add up to 105%. A plan bills the agreed value once: no more than 100%.']);

        // the invoice cancelled in Books frees the stage
        DB::table('vouchers')->where('voucher_number', 'INV-1')->update(['status' => 'cancelled']);
        $this->assertSame('due', $this->plan()['stages'][0]['state']);
        $this->postJson("/api/admin/projects/{$this->project}/billing/{$deposit}/bill")->assertCreated();
        $this->assertSame('billing.billed', DB::table('project_log')->orderByDesc('id')->value('action'));
    }

    public function test_posting_a_bill_follows_the_serious_action_rules_and_needs_the_permission(): void
    {
        $this->agreed(5, [[200000, 1]], 232000);
        $this->save([['name' => 'Deposit', 'share' => 25]])->assertOk();
        $deposit = (int) DB::table('project_billing_stages')->value('id');
        $settings = app(\App\Services\Projects\ProjectSettings::class);
        $settings->save('money', ['bill_mode' => 'post'], $this->kamau);
        $settings->save('serious', array_merge(\App\Services\Projects\ProjectSerious::defaults(), ['bill.post' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => false]]), $this->kamau);
        $r = $this->postJson("/api/admin/projects/{$this->project}/billing/{$deposit}/bill")->assertStatus(428)->json();
        $this->assertSame(['ask', 'bill.post', 'Post a bill from a billing plan'], [$r['serious']['state'], $r['serious']['action'], $r['serious']['label']]);
        $this->assertSame([], $this->posted);

        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.money.view']);
        $this->postJson("/api/admin/projects/{$this->project}/billing/{$deposit}/bill")->assertForbidden();
        $this->save([['name' => 'X', 'share' => 1]])->assertForbidden();
        $this->assertFalse($this->plan()['can']['plan']);
    }

    public function test_with_the_setting_on_draft_books_opens_its_sales_form_filled_in_and_the_invoice_saved_there_is_tied_to_the_stage(): void
    {
        $this->agreed(5, [[200000, 1]], 232000);
        $this->save([['name' => 'Deposit', 'share' => 25]])->assertOk();
        $deposit = (int) DB::table('project_billing_stages')->value('id');

        $r = $this->postJson("/api/admin/projects/{$this->project}/billing/{$deposit}/bill")->assertOk()->json();
        $this->assertSame(['draft', $deposit, 50000, 1, $this->cc], [$r['mode'], $r['form']['stage_id'], $r['form']['amount'], $r['form']['customer_id'], $r['form']['cost_centre_id']]);
        $this->assertSame([], $this->posted, 'nothing is posted from here');
        $this->assertSame(50000, $this->getJson("/api/admin/projects/billing-stages/{$deposit}/form")->assertOk()->json('bill.lines.0.rate'));

        // the person saves it on the Books form: the stage is tied to it only when it is on this work's cost centre
        $billing = app(\App\Services\Projects\ProjectBilling::class);
        $elsewhere = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'INV-9', 'status' => 'posted']);
        $billing->tie($deposit, $elsewhere, null);
        $this->assertSame('due', $this->plan()['stages'][0]['state']);
        $saved = DB::table('vouchers')->insertGetId(['voucher_type_id' => 1, 'voucher_number' => 'INV-10', 'status' => 'posted', 'cost_centre_id' => $this->cc]);
        $billing->tie($deposit, $saved, $this->cc);
        $this->assertSame(['billed', 'INV-10'], [$this->plan()['stages'][0]['state'], $this->plan()['stages'][0]['voucher']['number']]);
        $billing->tie($deposit, $elsewhere, $this->cc);
        $this->assertSame('INV-10', $this->plan()['stages'][0]['voucher']['number'], 'a billed stage is not tied to another invoice');
        $this->assertStringContainsString("ProjectBilling::class)->tie(\$request->integer('project_billing_stage_id')", file_get_contents(app_path('Http/Controllers/Api/BooksVoucherController.php')));

        // drafting needs the permission to post in Books, where it is finished
        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.money.view', 'projects.money.bill']);
        $this->save([['id' => $deposit], ['name' => 'Rest', 'share' => 75]])->assertOk();
        $rest = (int) DB::table('project_billing_stages')->where('name', 'Rest')->value('id');
        $this->postJson("/api/admin/projects/{$this->project}/billing/{$rest}/bill")->assertForbidden();
        $this->assertFalse($this->plan()['can']['bill']);
    }
}

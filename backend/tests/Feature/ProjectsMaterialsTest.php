<?php

namespace Tests\Feature;

use App\Models\StockJob;
use App\Models\StockJobLine;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Stock\StockJobService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 10.1 (docs/PROJECTS_STAGE10_SPEC.md): materials planned, asked for, and issued and returned through Stock jobs on the work's cost centre. */
class ProjectsMaterialsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private User $store;
    private int $project;
    public array $calls = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->softDeletes(); });
        Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('sku')->nullable(); $t->string('barcode', 64)->nullable(); $t->string('name')->nullable(); $t->softDeletes(); });
        Schema::create('stock_jobs', function ($t) { $t->id(); $t->string('number')->nullable(); $t->string('title'); $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('location_id'); $t->unsignedBigInteger('cost_centre_id')->nullable();
            $t->string('status')->default('open'); $t->text('note')->nullable(); $t->unsignedBigInteger('invoice_voucher_id')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamp('completed_at')->nullable(); $t->timestamps(); });
        Schema::create('stock_job_lines', function ($t) { $t->id(); $t->unsignedBigInteger('job_id'); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('batch_id')->nullable(); $t->decimal('quantity', 14, 4); $t->decimal('unit_cost', 14, 4); $t->unsignedBigInteger('voucher_id')->nullable(); $t->timestamp('issued_at')->nullable(); $t->decimal('sale_price', 14, 4)->nullable(); $t->timestamps(); });
        DB::table('products')->insert([['id' => 1, 'name' => 'Cement 50kg'], ['id' => 2, 'name' => 'Steel bar Y12']]);
        DB::table('product_variants')->insert([['id' => 11, 'product_id' => 1, 'sku' => 'CEM50', 'name' => null], ['id' => 12, 'product_id' => 2, 'sku' => 'Y12', 'name' => null]]);
        DB::table('locations')->updateOrInsert(['id' => 1], ['name' => 'Main store', 'is_active' => 1, 'sort_order' => 0]);
        DB::table('locations')->updateOrInsert(['id' => 2], ['name' => 'Yard', 'is_active' => 1, 'sort_order' => 1]);
        $test = $this;
        $this->app->instance(StockJobService::class, new class($test) extends StockJobService {   // Stock itself is checked below; here only what Projects asks of it
            public function __construct(private $test) {}

            public function open(string $title, int $locationId, ?int $customerId, ?string $note, ?User $user = null, ?int $costCentreId = null): StockJob
            {
                $this->test->calls[] = ['open', $locationId, $costCentreId];
                $j = StockJob::create(['title' => $title, 'location_id' => $locationId, 'customer_id' => $customerId, 'cost_centre_id' => $costCentreId, 'status' => 'open']);
                $j->update(['number' => 'JB-' . str_pad((string) $j->id, 6, '0', STR_PAD_LEFT)]);

                return $j;
            }

            public function issue(StockJob $j, array $items, ?User $user = null): StockJob
            {
                foreach ($items as $i) {
                    if ($i['quantity'] > 50) {
                        throw new BooksException('Not enough Cement 50kg at this branch: need ' . $i['quantity'] . ', have 50.');
                    }
                    StockJobLine::create(['job_id' => $j->id, 'variant_id' => $i['variant_id'], 'batch_id' => 1, 'quantity' => $i['quantity'], 'unit_cost' => 750, 'issued_at' => now()]);
                }
                $this->test->calls[] = ['issue', $j->id, $items];

                return $j;
            }

            public function returnLine(StockJob $j, int $lineId, ?float $qty, ?User $user = null): StockJob
            {
                $l = StockJobLine::findOrFail($lineId);
                $l->update(['quantity' => (float) $l->quantity - ($qty ?? (float) $l->quantity)]);
                $this->test->calls[] = ['return', $lineId, $qty];

                return $j;
            }

            public function complete(StockJob $j, ?int $invoiceVoucherId = null, ?User $user = null): StockJob
            {
                $j->update(['status' => 'completed']);
                $this->test->calls[] = ['complete', $j->id];

                return $j;
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.materials', 'projects.stage', 'projects.close', 'projects.money.view']);
        $this->njeri = $this->staff('Njeri', ['projects.use']);
        $this->store = $this->staff('Otieno', ['projects.use', 'projects.materials', 'stock.manage']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Kilimani flats', 'customer_id' => 1])->assertCreated()->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function url(string $more = ''): string
    {
        return "/api/admin/projects/{$this->project}/materials{$more}";
    }

    public function test_planned_and_asked_for_materials_and_the_store_issues_through_a_stock_job_on_the_works_cost_centre(): void
    {
        $this->assertSame([['id' => 11, 'name' => 'Cement 50kg', 'unit' => null]], $this->getJson('/api/admin/projects/materials/find?q=cem')->json('products'));
        $this->postJson($this->url('/plan'), ['variant_id' => 11, 'quantity' => 400])->assertOk();
        $page = $this->postJson($this->url('/requests'), ['variant_id' => 11, 'quantity' => 40, 'location_id' => 2, 'needed_on' => '2026-11-25'])->assertCreated()->json();
        $this->assertEquals([['Cement 50kg', 400.0, 40.0, 0.0]], array_map(fn ($m) => [$m['name'], $m['planned'], $m['waiting'], $m['issued']], $page['materials']));
        $this->assertSame([false, true], [$page['can']['issue'], $page['can']['plan']], 'Kamau keeps no store');
        $this->assertSame(2, $page['site']['location_id'], 'the branch asked from becomes the usual one');
        $req = $page['requests'][0]['id'];
        $this->postJson($this->url('/issue'), ['request_id' => $req])->assertForbidden();

        Sanctum::actingAs($this->store, ['*']);   // not on the work, but keeps the store
        $this->assertEquals([['Cement 50kg', 40.0, 'Yard']], array_map(fn ($r) => [$r['name'], $r['still'], $r['branch']], $this->getJson('/api/admin/projects/materials/waiting')->json('requests')));
        $this->postJson($this->url('/issue'), ['request_id' => $req, 'items' => [['quantity' => 25]]])->assertOk()->assertJsonPath('requests.0.state', 'part');
        $cc = (int) DB::table('projects')->where('id', $this->project)->value('cost_centre_id');
        $this->assertSame(['open', 2, $cc ?: null], $this->calls[0], 'one job for the work at that branch, on its cost centre');
        $page = $this->postJson($this->url('/issue'), ['request_id' => $req])->assertOk()->json();   // the rest
        $this->assertEquals(['done', 40.0], [$page['requests'][0]['state'], $page['requests'][0]['issued']]);
        $this->assertSame(1, DB::table('project_stock_jobs')->count(), 'the same open job is used again');
        $this->assertSame(422, $this->postJson($this->url('/issue'), ['location_id' => 2, 'items' => [['variant_id' => 11, 'quantity' => 60]]])->status());
        $this->assertStringStartsWith('Not enough Cement', $this->postJson($this->url('/issue'), ['location_id' => 2, 'items' => [['variant_id' => 11, 'quantity' => 60]]])->json('message'), "Stock's own refusal comes back");
        $this->assertSame([], $this->getJson('/api/admin/projects/materials/waiting')->json('requests'));

        $line = DB::table('stock_job_lines')->orderBy('id')->value('id');
        $page = $this->postJson($this->url("/lines/{$line}/return"), ['quantity' => 5])->assertOk()->json();
        $this->assertEquals([35.0, 26250.0], [$page['materials'][0]['issued'], $page['materials'][0]['cost']], 'the cost is read from Stock\'s lines');

        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson($this->url())->assertOk()->assertJsonPath('can.plan', false);
        $this->postJson($this->url('/requests'), ['variant_id' => 11, 'quantity' => 1, 'location_id' => 1])->assertForbidden();
    }

    public function test_closing_the_work_completes_its_jobs_and_confidential_work_is_only_for_those_on_it(): void
    {
        $this->postJson($this->url('/requests'), ['variant_id' => 12, 'quantity' => 10, 'location_id' => 1])->assertCreated();
        Sanctum::actingAs($this->store, ['*']);
        $this->postJson($this->url('/issue'), ['location_id' => 1, 'items' => [['variant_id' => 12, 'quantity' => 10]]])->assertOk();
        DB::table('projects')->where('id', $this->project)->update(['confidential' => 1]);
        $this->getJson($this->url())->assertNotFound();   // confidential work is not even known to be there
        $this->assertSame([], $this->getJson('/api/admin/projects/materials/waiting')->json('requests'));
        DB::table('projects')->where('id', $this->project)->update(['confidential' => 0]);

        Sanctum::actingAs($this->kamau, ['*']);
        $closed = DB::table('project_stages')->where('type_id', DB::table('projects')->where('id', $this->project)->value('type_id'))->where('state', 'closed')->value('id');
        $this->putJson("/api/admin/projects/{$this->project}/stage", ['stage_id' => $closed])->assertOk();
        $this->assertSame('completed', DB::table('stock_jobs')->value('status'));
        $this->assertTrue(DB::table('project_log')->where('action', 'material.used_up')->exists());
        Sanctum::actingAs($this->store, ['*']);
        $this->assertStringContainsString('closed', $this->postJson($this->url('/issue'), ['location_id' => 1, 'items' => [['variant_id' => 12, 'quantity' => 1]]])->assertStatus(422)->json('message'));
    }

    public function test_a_stock_job_on_a_cost_centre_puts_its_journals_there(): void
    {
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->integer('edit_window_days')->nullable(); $t->unsignedBigInteger('wip_ledger_id')->nullable(); $t->unsignedBigInteger('stock_ledger_id')->nullable(); $t->unsignedBigInteger('cost_of_services_ledger_id')->nullable(); $t->timestamps(); });
        DB::table('accounting_settings')->insert(['id' => 1, 'wip_ledger_id' => 5, 'stock_ledger_id' => 6, 'cost_of_services_ledger_id' => 7]);
        if (! Schema::hasTable('voucher_types')) {
            Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); $t->string('base_type')->nullable(); $t->boolean('is_active')->default(true); $t->timestamps(); });
        }
        DB::table('voucher_types')->insert(['name' => 'Journal', 'base_type' => 'journal', 'is_active' => 1]);
        $sent = [];
        $this->app->instance(\App\Services\Books\VoucherService::class, new class($sent) extends \App\Services\Books\VoucherService {
            public function __construct(private array &$sent) {}

            public function create(array $data, ?User $user = null): \App\Models\Books\Voucher
            {
                $this->sent[] = $data;
                $v = new \App\Models\Books\Voucher();
                $v->id = 99;

                return $v;
            }
        });
        $this->app->forgetInstance(StockJobService::class);
        $jobs = $this->app->make(StockJobService::class);
        $job = $jobs->open('Kilimani flats', 1, null, null, $this->kamau, 77);
        $this->assertSame(77, (int) $job->fresh()->cost_centre_id);
        StockJobLine::create(['job_id' => $job->id, 'variant_id' => 11, 'batch_id' => 1, 'quantity' => 2, 'unit_cost' => 750, 'issued_at' => now()]);
        $jobs->complete($job, null, $this->kamau);
        $this->assertSame([77, 1500.0], [$sent[0]['cost_centre_id'] ?? null, (float) $sent[0]['entries'][0]['amount']]);
        $plain = $jobs->open('A plain job', 1, null, null, $this->kamau);
        StockJobLine::create(['job_id' => $plain->id, 'variant_id' => 11, 'batch_id' => 1, 'quantity' => 1, 'unit_cost' => 750, 'issued_at' => now()]);
        $jobs->complete($plain, null, $this->kamau);
        $this->assertArrayNotHasKey('cost_centre_id', $sent[1], 'a job with no cost centre is as before');
    }
}

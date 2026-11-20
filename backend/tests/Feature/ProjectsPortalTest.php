<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;

/** Projects, build 9.5 (docs/PROJECTS_STAGE9_SPEC.md): the client portal shows the customer their own work and only what was shared. */
class ProjectsPortalTest extends ProjectsFilesTestCase
{
    private User $client;

    protected function setUp(): void
    {
        parent::setUp();
        $this->app->instance(\App\Services\Notify\Notifier::class, new class extends \App\Services\Notify\Notifier {
            public function __construct() {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                return ['notification' => null, 'channels' => ['email'], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->client = User::forceCreate(['name' => 'Grace Wambua', 'email' => 'grace@example.test', 'role' => 'customer']);
        Schema::table('customers', fn ($t) => $t->unsignedBigInteger('user_id')->nullable());   // the customer's login (the real table has it)
        DB::table('customers')->where('id', 1)->update(['user_id' => $this->client->id]);
        DB::table('customers')->insertOrIgnore(['id' => 2, 'first_name' => 'Other', 'last_name' => 'Client']);
    }

    public function test_the_customer_sees_their_work_its_stage_and_only_the_shared_files(): void
    {
        $shared = $this->upload('Plaint.pdf', 'the plaint')['files'][0]['id'];
        $this->upload('Strategy notes.pdf', 'team only');
        $this->putJson($this->url("/files/{$shared}"), ['shared' => true])->assertOk();
        $other = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Someone else', 'customer_id' => 2])->json('project.id');
        $contact = DB::table('project_contacts')->insertGetId(['owner_type' => 'customer', 'owner_id' => 1, 'name' => 'Grace Wambua', 'email' => 'grace@example.test', 'created_at' => now()]);
        $this->postJson($this->url('/requests'), ['kind' => 'file', 'what' => 'The title deed', 'contact_id' => $contact])->assertCreated();

        Sanctum::actingAs($this->client, ['*']);
        $list = $this->getJson('/api/customer/my-work')->assertOk()->json('work');
        $this->assertSame([['Imara v Baraka', 1]], array_map(fn ($w) => [$w['title'], $w['waiting']], $list), 'their own work only, with what is asked of them');
        $w = $this->getJson("/api/customer/my-work/{$this->project}")->assertOk()->json();
        $this->assertSame(['Plaint.pdf'], array_column($w['files'], 'name'), 'never a team-only file');
        $this->assertTrue(collect($w['stages'])->contains('now', true));
        $this->assertSame([['what' => 'The title deed', 'kind' => 'file', 'due_on' => null, 'of' => 'Grace Wambua']], array_map(fn ($r) => array_diff_key($r, ['link' => 1]), $w['requests']));
        $this->assertStringStartsWith('/request/', $w['requests'][0]['link']);
        $this->assertSame('the plaint', $this->get("/api/customer/my-work/{$this->project}/files/{$shared}")->assertOk()->streamedContent());
        $teamOnly = DB::table('project_files')->where('name', 'Strategy notes.pdf')->value('id');
        $this->getJson("/api/customer/my-work/{$this->project}/files/{$teamOnly}")->assertNotFound();
        $this->getJson("/api/customer/my-work/{$other}")->assertNotFound();
    }

    public function test_invoices_on_the_work_are_read_from_books(): void
    {
        if (! Schema::hasTable('voucher_types')) {
            Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); $t->string('base_type')->nullable(); });
        }
        if (! Schema::hasTable('vouchers')) {
            Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('voucher_number'); $t->date('date')->nullable(); $t->string('status')->default('posted');
                $t->decimal('total_amount', 14, 2)->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->unsignedBigInteger('party_ledger_id')->nullable(); });
        }
        $type = DB::table('voucher_types')->insertGetId(['name' => 'Sales Invoice', 'base_type' => 'sales']);
        $cc = DB::table('projects')->where('id', $this->project)->value('cost_centre_id') ?? 77;
        DB::table('projects')->where('id', $this->project)->update(['cost_centre_id' => $cc]);
        DB::table('vouchers')->insert([['voucher_type_id' => $type, 'voucher_number' => 'INV-0044', 'date' => '2026-11-12', 'total_amount' => 480000, 'customer_id' => 1, 'cost_centre_id' => $cc, 'status' => 'posted'],
            ['voucher_type_id' => $type, 'voucher_number' => 'INV-0099', 'date' => '2026-11-13', 'total_amount' => 9000, 'customer_id' => 1, 'cost_centre_id' => 999, 'status' => 'posted']]);
        Sanctum::actingAs($this->client, ['*']);
        $this->assertSame([['INV-0044', 480000]], array_map(fn ($i) => [$i['number'], (int) $i['total']], $this->getJson("/api/customer/my-work/{$this->project}")->json('invoices')), 'the ones on this work only');
    }
}

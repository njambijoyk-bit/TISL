<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 3.2 (docs/PROJECTS_STAGE3_SPEC.md): opportunities, the pipeline, its stages, and winning (lead to client to project). */
class ProjectsPipelineTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const SALES = ['projects.use', 'projects.leads.manage', 'projects.pipeline', 'projects.clients.manage', 'projects.create', 'projects.links', 'books.view'];

    private User $njeri;
    private User $kamau;
    private int $lead;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        // the customer is made the way TISL makes one; here that is stood in for by a plain row, since this world has no currencies
        $this->app->instance(\App\Services\Projects\ClientMaker::class, new class extends \App\Services\Projects\ClientMaker {
            public function make(array $values): int
            {
                return (int) DB::table('customers')->insertGetId(array_intersect_key($values, array_flip(['first_name', 'last_name', 'company_name', 'email'])) + ['customer_number' => 'C-NEW', 'created_at' => now()]);
            }
        });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code'); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('voucher_number'); $t->string('party_name')->nullable(); $t->string('reference_no')->nullable();
            $t->date('date')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 14, 2)->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); });
        DB::table('voucher_types')->insert(['id' => 1, 'name' => 'Quotation']);
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES']);
        DB::table('vouchers')->insert(['id' => 10, 'voucher_type_id' => 1, 'voucher_number' => 'QT-0231', 'party_name' => 'Tumaini Academy', 'date' => '2026-11-10', 'total_amount' => 48600000, 'currency_id' => 1]);

        $this->njeri = $this->staff('Njeri', self::SALES);
        $this->kamau = $this->staff('Kamau', array_merge(self::SALES, ['projects.leads.view', 'projects.config.view', 'projects.config.manage']));
        Sanctum::actingAs($this->njeri, ['*']);
        $this->lead = (int) $this->postJson('/api/admin/projects/leads', ['name' => 'Tumaini Academy', 'contact_name' => 'Grace Wambua', 'email' => 'head@tumaini.test'])->assertCreated()->json('lead.id');
    }

    private function as(User $u): static
    {
        Sanctum::actingAs($u, ['*']);

        return $this;
    }

    private function stage(string $key): int
    {
        return (int) DB::table('project_pipeline_stages')->where('key', $key)->value('id');
    }

    private function type(): int
    {
        return (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
    }

    private function opp(array $o = []): array
    {
        return $this->postJson('/api/admin/projects/opportunities', $o + ['title' => 'New classroom block', 'lead_id' => $this->lead])->assertCreated()->json('opportunity');
    }

    public function test_an_opportunity_is_for_a_lead_or_a_client_and_starts_at_the_first_stage(): void
    {
        $o = $this->opp(['type_id' => $this->type(), 'expected_on' => '2026-12-15', 'estimate' => '45000000', 'estimate_currency' => 'kes']);
        $this->assertSame(['New classroom block', ['type' => 'lead', 'id' => $this->lead, 'name' => 'Tumaini Academy'], 'new', 'Njeri', '2026-12-15', 'Client project'],
            [$o['title'], $o['for'], $o['stage']['key'], $o['owner']['name'], $o['expected_on'], $o['kind']['name']]);
        $this->assertSame(['amount' => 45000000, 'currency' => 'KES', 'from' => 'estimate', 'title' => null, 'url' => null], $o['value']);
        $this->assertSame('working', DB::table('project_leads')->where('id', $this->lead)->value('status'), 'a lead with an opportunity is being worked');

        $c = $this->postJson('/api/admin/projects/opportunities', ['title' => 'Retainer 2027', 'customer_id' => 1])->assertCreated()->json('opportunity');
        $this->assertSame([['type' => 'client', 'id' => 1, 'name' => 'Imara Sacco'], null], [$c['for'], $c['value']]);

        $this->postJson('/api/admin/projects/opportunities', ['title' => 'Nobody'])->assertStatus(422)->assertJson(['message' => 'Say who it is for: a lead, or a client.']);
        $this->postJson('/api/admin/projects/opportunities', ['title' => 'Both', 'lead_id' => $this->lead, 'customer_id' => 1])->assertStatus(422);
        $this->postJson('/api/admin/projects/opportunities', ['title' => '', 'customer_id' => 1])->assertStatus(422);
        $this->postJson('/api/admin/projects/opportunities', ['title' => 'X', 'customer_id' => 1, 'estimate' => '-5'])->assertStatus(422);
        $this->postJson('/api/admin/projects/opportunities', ['title' => 'X', 'customer_id' => 1, 'estimate' => '5', 'estimate_currency' => 'shillings'])->assertStatus(422);
        $this->postJson('/api/admin/projects/opportunities', ['title' => 'X', 'customer_id' => 999])->assertStatus(422);
    }

    public function test_the_value_comes_from_the_books_once_a_quotation_is_linked(): void
    {
        $id = $this->opp(['estimate' => '45000000', 'estimate_currency' => 'KES'])['id'];
        $this->assertSame(['QT-0231'], array_map(fn ($v) => substr($v['title'], -7), $this->getJson('/api/admin/projects/pipeline/quotations?q=QT')->assertOk()->json('vouchers')));
        $o = $this->putJson("/api/admin/projects/opportunities/{$id}", ['quotation_voucher_id' => 10])->assertOk()->json('opportunity');
        $this->assertSame([48600000, 'KES', 'quotation', 'Quotation QT-0231'], [$o['value']['amount'], $o['value']['currency'], $o['value']['from'], $o['value']['title']]);
        DB::table('vouchers')->where('id', 10)->update(['total_amount' => 50000000]);
        $this->assertSame(50000000, $this->getJson("/api/admin/projects/opportunities/{$id}")->json('opportunity.value.amount'), 'read from the books each time, never copied');
        $this->putJson("/api/admin/projects/opportunities/{$id}", ['quotation_voucher_id' => 999])->assertStatus(422)->assertJson(['message' => 'Choose a quotation from the books.']);

        // someone who may not see the books is told there is a quotation, not what it says
        $this->grant($this->njeri, array_diff(array_merge(['admin.access'], self::SALES), ['books.view']));
        $v = $this->getJson("/api/admin/projects/opportunities/{$id}")->json('opportunity.value');
        $this->assertSame([null, 'quotation', 'A quotation in the books'], [$v['amount'], $v['from'], $v['title']]);
        $this->getJson('/api/admin/projects/pipeline/quotations?q=QT')->assertForbidden();
    }

    public function test_the_board_groups_by_stage_totals_per_currency_and_shows_only_what_someone_may_see(): void
    {
        $a = $this->opp(['estimate' => '100', 'estimate_currency' => 'KES'])['id'];
        $this->opp(['title' => 'Second', 'estimate' => '50', 'estimate_currency' => 'USD']);
        $this->as($this->kamau)->postJson('/api/admin/projects/opportunities', ['title' => 'His', 'customer_id' => 1, 'quotation_voucher_id' => 10])->assertCreated();
        $this->as($this->njeri)->putJson("/api/admin/projects/opportunities/{$a}", ['stage_id' => $this->stage('qualified')])->assertOk();

        $b = $this->getJson('/api/admin/projects/pipeline?scope=all')->assertOk()->json();
        $this->assertSame(['New', 'Qualified', 'Proposal sent', 'Negotiation', 'Won', 'Lost'], array_column($b['stages'], 'name'));
        $this->assertSame([false, 2, ['Second'], ['New classroom block']], [$b['sees_all'], $b['open'], array_column($b['stages'][0]['items'], 'title'), array_column($b['stages'][1]['items'], 'title')]);
        $this->assertSame([['currency' => 'USD', 'amount' => 50, 'estimated' => true]], $b['stages'][0]['totals']);

        $b = $this->as($this->kamau)->getJson('/api/admin/projects/pipeline?scope=all')->json();
        $this->assertSame([true, 3], [$b['sees_all'], $b['open']]);
        $totals = collect($b['stages'][0]['totals'])->keyBy('currency');
        $this->assertSame([48600000, false, 50, true], [$totals['KES']['amount'], $totals['KES']['estimated'], $totals['USD']['amount'], $totals['USD']['estimated']], 'a total says when it includes a guess');
        $this->assertSame(1, $this->getJson('/api/admin/projects/pipeline?scope=mine')->json('open'));

        $his = (int) DB::table('project_opportunities')->where('title', 'His')->value('id');
        $this->as($this->njeri)->getJson("/api/admin/projects/opportunities/{$his}")->assertNotFound();
        $viewer = $this->staff('Viewer', ['projects.use', 'projects.leads.view']);
        $this->as($viewer)->getJson("/api/admin/projects/opportunities/{$his}")->assertOk()->assertJsonPath('opportunity.can.change', false);
        $this->putJson("/api/admin/projects/opportunities/{$his}", ['title' => 'Changed'])->assertForbidden();
    }

    public function test_losing_needs_a_reason_and_winning_is_its_own_step(): void
    {
        $id = $this->opp()['id'];
        $this->putJson("/api/admin/projects/opportunities/{$id}", ['stage_id' => $this->stage('lost')])->assertStatus(422);
        $reason = (int) DB::table('project_lists')->where('list', 'lost_reason')->where('key', 'price')->value('id');
        $o = $this->putJson("/api/admin/projects/opportunities/{$id}", ['stage_id' => $this->stage('lost'), 'lost_reason_id' => $reason])->assertOk()->json('opportunity');
        $this->assertSame(['lost', 'Price'], [$o['stage']['kind'], $o['lost_reason']]);
        $this->assertNotNull($o['closed_at']);
        $o = $this->putJson("/api/admin/projects/opportunities/{$id}", ['stage_id' => $this->stage('negotiation')])->assertOk()->json('opportunity');   // and it can come back
        $this->assertSame([null, null], [$o['closed_at'], $o['lost_reason']]);
        $this->putJson("/api/admin/projects/opportunities/{$id}", ['stage_id' => $this->stage('won')])->assertStatus(422)->assertJson(['message' => 'Winning is its own step: it makes the client and can start the work.']);
    }

    public function test_winning_makes_the_lead_a_client_moves_what_is_known_and_can_start_the_project(): void
    {
        $id = $this->opp(['type_id' => $this->type(), 'quotation_voucher_id' => 10, 'notes' => 'Two storeys, eight classrooms'])['id'];
        $other = $this->opp(['title' => 'Perimeter wall'])['id'];
        DB::table('project_contacts')->insert(['owner_type' => 'lead', 'owner_id' => $this->lead, 'name' => 'Bursar', 'created_at' => now()]);
        DB::table('project_interactions')->insert(['kind' => 'call', 'subject_type' => 'lead', 'subject_id' => $this->lead, 'happened_at' => now(), 'summary' => 'Asked for a quote', 'created_at' => now()]);
        DB::table('project_follow_ups')->insert(['subject_type' => 'lead', 'subject_id' => $this->lead, 'what' => 'Site visit', 'due_on' => '2026-11-21', 'owner_id' => $this->njeri->id, 'created_at' => now()]);
        $before = DB::table('customers')->count();

        $r = $this->postJson("/api/admin/projects/opportunities/{$id}/win", ['start_project' => true])->assertOk()->json();
        $c = DB::table('customers')->where('id', $r['customer_id'])->first();
        $this->assertSame($before + 1, DB::table('customers')->count());
        $this->assertSame(['Tumaini Academy', 'Grace', 'Wambua', 'head@tumaini.test', $this->lead, $this->njeri->id, now()->format('Y-m-d')],
            [$c->company_name, $c->first_name, $c->last_name, $c->email, (int) $c->projects_lead_id, (int) $c->projects_account_manager_id, $c->projects_client_since]);
        $lead = DB::table('project_leads')->where('id', $this->lead)->first();
        $this->assertSame(['won', (int) $c->id], [$lead->status, (int) $lead->customer_id]);
        // what was known about the lead is now known about the client
        $this->assertSame(['customer', (int) $c->id], [DB::table('project_contacts')->value('owner_type'), (int) DB::table('project_contacts')->value('owner_id')]);
        $this->assertSame('customer', DB::table('project_interactions')->value('subject_type'));
        $this->assertSame('customer', DB::table('project_follow_ups')->value('subject_type'));
        $this->assertSame((int) $c->id, (int) DB::table('project_opportunities')->where('id', $other)->value('customer_id'), 'its other opportunities follow it');

        $p = DB::table('projects')->where('id', $r['project_id'])->first();
        $this->assertSame(['New classroom block', (int) $c->id, $this->type(), 'Two storeys, eight classrooms', $this->njeri->id], [$p->title, (int) $p->customer_id, (int) $p->type_id, $p->description, (int) $p->lead_user_id]);
        $this->assertSame(['won', $p->number], [$r['opportunity']['stage']['kind'], $r['opportunity']['project']['number']]);
        $this->assertSame(10, (int) DB::table('project_links')->where('project_id', $p->id)->where('module', 'books')->where('link_type', 'voucher')->value('linked_id'), 'the quotation goes with it, so the project shows the agreed figure from the books');

        $this->postJson("/api/admin/projects/opportunities/{$id}/win")->assertStatus(422)->assertJson(['message' => 'This is already won.']);
        $this->putJson("/api/admin/projects/opportunities/{$id}", ['stage_id' => $this->stage('new')])->assertStatus(422);
        $this->putJson("/api/admin/projects/leads/{$this->lead}", ['name' => 'Renamed'])->assertStatus(422);   // the lead is a client now

        // a second win for the same client makes no second customer, and the work can be started later
        $r2 = $this->postJson("/api/admin/projects/opportunities/{$other}/win")->assertOk()->json();
        $this->assertSame([(int) $c->id, null, $before + 1], [$r2['customer_id'], $r2['project_id'], DB::table('customers')->count()]);
        $this->postJson("/api/admin/projects/opportunities/{$other}/project")->assertStatus(422)->assertJson(['message' => 'Choose the kind of work to start.']);
        $pid = $this->postJson("/api/admin/projects/opportunities/{$other}/project", ['type_id' => $this->type(), 'title' => 'Tumaini perimeter wall'])->assertCreated()->json('project_id');
        $this->assertSame('Tumaini perimeter wall', DB::table('projects')->where('id', $pid)->value('title'));
        $this->postJson("/api/admin/projects/opportunities/{$other}/project", ['type_id' => $this->type()])->assertStatus(422);
    }

    public function test_winning_asks_for_the_right_to_make_a_client_and_starting_for_the_right_to_start_work(): void
    {
        $id = $this->opp(['type_id' => $this->type()])['id'];
        $this->grant($this->njeri, array_diff(array_merge(['admin.access'], self::SALES), ['projects.clients.manage']));
        $this->postJson("/api/admin/projects/opportunities/{$id}/win")->assertForbidden();
        $this->postJson("/api/admin/projects/leads/{$this->lead}/client")->assertForbidden();
        $this->assertSame(2, DB::table('customers')->count());
        $this->assertSame('new', DB::table('project_pipeline_stages')->where('id', DB::table('project_opportunities')->where('id', $id)->value('stage_id'))->value('key'), 'nothing half happened');

        $this->grant($this->njeri, array_diff(array_merge(['admin.access'], self::SALES), ['projects.create']));
        $this->postJson("/api/admin/projects/opportunities/{$id}/win", ['start_project' => true])->assertForbidden();
        $this->assertSame(2, DB::table('customers')->count());
        $r = $this->postJson("/api/admin/projects/opportunities/{$id}/win")->assertOk()->json();
        $this->assertNull($r['project_id']);

        // a lead can also be made a client with no opportunity at all
        $this->grant($this->njeri, array_merge(['admin.access'], self::SALES));
        $walkIn = (int) $this->postJson('/api/admin/projects/leads', ['name' => 'Faith Wanjiru'])->json('lead.id');
        $c = DB::table('customers')->where('id', $this->postJson("/api/admin/projects/leads/{$walkIn}/client")->assertOk()->json('customer_id'))->first();
        $this->assertSame([null, 'Faith', 'Wanjiru'], [$c->company_name, $c->first_name, $c->last_name], 'a lead that is a person becomes a person');
    }

    public function test_the_stages_are_managed_in_configuration_and_the_two_ends_stay(): void
    {
        $this->as($this->kamau);
        $s = $this->postJson('/api/admin/projects/configuration/pipeline', ['name' => 'Site visit done'])->assertCreated()->json('stages');
        $this->assertSame(['New', 'Qualified', 'Proposal sent', 'Negotiation', 'Site visit done', 'Won', 'Lost'], array_column($s, 'name'), 'a new stage goes just before Won');
        $this->postJson('/api/admin/projects/configuration/pipeline', ['name' => 'won'])->assertStatus(422);
        $new = collect($s)->firstWhere('name', 'Site visit done')['id'];
        $this->putJson("/api/admin/projects/configuration/pipeline/{$new}", ['move' => 'up'])->assertOk();
        $s = $this->putJson("/api/admin/projects/configuration/pipeline/{$new}", ['name' => 'Visited'])->assertOk()->json('stages');
        $this->assertSame(['New', 'Qualified', 'Proposal sent', 'Visited', 'Negotiation', 'Won', 'Lost'], array_column($s, 'name'));

        $this->putJson('/api/admin/projects/configuration/pipeline/' . $this->stage('won'), ['is_active' => false])->assertStatus(422);
        $this->putJson('/api/admin/projects/configuration/pipeline/' . $this->stage('lost'), ['move' => 'up'])->assertStatus(422);
        $this->opp(['title' => 'Kamau sees it too']);
        $this->putJson('/api/admin/projects/configuration/pipeline/' . $this->stage('new'), ['is_active' => false])->assertStatus(422)->assertJson(['message' => 'There are opportunities at this stage. Move them first.']);
        $this->putJson("/api/admin/projects/configuration/pipeline/{$new}", ['is_active' => false])->assertOk();
        $this->assertNotContains('Visited', array_column($this->getJson('/api/admin/projects/pipeline')->json('stages'), 'name'));
        $this->as($this->njeri)->postJson('/api/admin/projects/configuration/pipeline', ['name' => 'Mine'])->assertForbidden();
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 3.1 (docs/PROJECTS_STAGE3_SPEC.md): leads, the lists an owner manages, and "do we already know them?". */
class ProjectsLeadsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $njeri;
    private User $kamau;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.leads.manage']);
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.leads.manage', 'projects.leads.view', 'projects.config.view', 'projects.config.manage']);
        Sanctum::actingAs($this->njeri, ['*']);
    }

    private function as(User $u): static
    {
        Sanctum::actingAs($u, ['*']);

        return $this;
    }

    private function list(string $list, string $key): int
    {
        return (int) DB::table('project_lists')->where('list', $list)->where('key', $key)->value('id');
    }

    private function add(array $o = []): array
    {
        return $this->postJson('/api/admin/projects/leads', $o + ['name' => 'Baraka Traders Ltd'])->assertCreated()->json('lead');
    }

    public function test_the_script_ships_the_lists_and_the_pipeline_and_adds_three_columns_to_customers(): void
    {
        $this->assertSame(70, DB::table('project_lists')->count());
        $this->assertSame(['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'], DB::table('project_pipeline_stages')->orderBy('sort_order')->pluck('key')->all());
        $this->assertSame([], array_diff(DB::table('project_lists')->whereNotNull('industry_key')->distinct()->pluck('industry_key')->all(), DB::table('project_industries')->pluck('key')->all()), 'every party role belongs to a real industry');
        foreach (['projects_account_manager_id', 'projects_lead_id', 'projects_client_since'] as $column) {
            $this->assertTrue(\Illuminate\Support\Facades\Schema::hasColumn('customers', $column));
        }
        $sql = file_get_contents(base_path('database/sql/259_projects_relationships.sql'));
        $this->assertSame(0, preg_match('/\b(DROP TABLE|DELETE FROM|TRUNCATE|UPDATE )\b/', preg_replace('/--[^\n]*/', '', $sql)), 'the script only adds');
    }

    public function test_a_lead_is_added_with_its_source_and_owner_and_never_touches_customers(): void
    {
        $before = DB::table('customers')->count();
        $lead = $this->add(['contact_name' => 'J. Baraka', 'email' => 'J.Baraka@Example.test ', 'phone' => '0712 345 678', 'source_id' => $this->list('source', 'referral'), 'referred_by_customer_id' => 1, 'industry_key' => 'legal', 'notes' => 'Fourteen accounts to recover']);
        $this->assertSame(['Baraka Traders Ltd', 'J. Baraka', 'j.baraka@example.test', 'Referral', 'Imara Sacco', 'Njeri', 'new', 'Fourteen accounts to recover'],
            [$lead['name'], $lead['contact_name'], $lead['email'], $lead['source']['name'], $lead['referred_by']['name'], $lead['owner']['name'], $lead['status'], $lead['notes']]);
        $this->assertSame($before, DB::table('customers')->count(), 'a lead is not a customer');
        $this->assertSame('lead.created', DB::table('project_log')->orderByDesc('id')->value('action'));

        $this->postJson('/api/admin/projects/leads', ['name' => '  '])->assertStatus(422);
        $this->postJson('/api/admin/projects/leads', ['name' => 'X', 'email' => 'not an email'])->assertStatus(422);
        $this->postJson('/api/admin/projects/leads', ['name' => 'X', 'source_id' => $this->list('flag', 'vip')])->assertStatus(422)->assertJson(['message' => 'Choose where they came from from the list.']);
        $this->postJson('/api/admin/projects/leads', ['name' => 'X', 'referred_by_customer_id' => 999])->assertStatus(422);
        $this->postJson('/api/admin/projects/leads', ['name' => 'X', 'owner_id' => $this->staff('Clerk')->id])->assertStatus(422)->assertJson(['message' => 'Give it to someone who can work leads.']);
    }

    public function test_someone_sees_their_own_leads_and_with_the_permission_everyones(): void
    {
        $mine = $this->add();
        $his = $this->as($this->kamau)->add(['name' => 'Tumaini Academy']);

        $r = $this->as($this->njeri)->getJson('/api/admin/projects/leads?scope=all')->assertOk()->json();
        $this->assertSame([['Baraka Traders Ltd'], false, 1], [array_column($r['data'], 'name'), $r['sees_all'], $r['counts']['new']]);
        $this->getJson("/api/admin/projects/leads/{$his['id']}")->assertNotFound();
        $this->putJson("/api/admin/projects/leads/{$his['id']}", ['name' => 'Mine now'])->assertNotFound();

        $r = $this->as($this->kamau)->getJson('/api/admin/projects/leads?scope=all')->json();
        $this->assertSame([['Tumaini Academy', 'Baraka Traders Ltd'], true], [array_column($r['data'], 'name'), $r['sees_all']]);
        $this->assertSame(['Tumaini Academy'], array_column($this->getJson('/api/admin/projects/leads?scope=mine')->json('data'), 'name'));
        $this->assertSame(['Baraka Traders Ltd'], array_column($this->getJson('/api/admin/projects/leads?scope=all&q=baraka')->json('data'), 'name'));

        // handing a lead over: the new owner sees it, the old one no longer does
        $this->putJson("/api/admin/projects/leads/{$his['id']}", ['owner_id' => $this->njeri->id])->assertOk()->assertJsonPath('lead.owner.name', 'Njeri');
        $this->as($this->njeri)->getJson("/api/admin/projects/leads/{$his['id']}")->assertOk();

        // seeing is not changing
        $viewer = $this->staff('Viewer', ['projects.use', 'projects.leads.view']);
        $this->as($viewer)->getJson("/api/admin/projects/leads/{$mine['id']}")->assertOk()->assertJsonPath('lead.can.change', false);
        $this->putJson("/api/admin/projects/leads/{$mine['id']}", ['name' => 'Changed'])->assertForbidden();
        $this->postJson('/api/admin/projects/leads', ['name' => 'New'])->assertForbidden();
        $this->as($this->staff('Stranger'))->getJson('/api/admin/projects/leads')->assertForbidden();
    }

    public function test_a_lead_is_worked_lost_with_a_reason_and_brought_back(): void
    {
        $id = $this->add()['id'];
        $this->putJson("/api/admin/projects/leads/{$id}", ['status' => 'working'])->assertOk()->assertJsonPath('lead.status', 'working');
        $this->putJson("/api/admin/projects/leads/{$id}", ['status' => 'lost'])->assertStatus(422)->assertJson(['message' => 'Choose why it was lost from the list.']);
        $lead = $this->putJson("/api/admin/projects/leads/{$id}", ['status' => 'lost', 'lost_reason_id' => $this->list('lost_reason', 'competitor'), 'lost_note' => 'Went with Mwangi and Co.'])->assertOk()->json('lead');
        $this->assertSame(['lost', ['reason' => 'Went with someone else', 'note' => 'Went with Mwangi and Co.']], [$lead['status'], $lead['lost']]);
        $this->assertSame([], $this->getJson('/api/admin/projects/leads')->json('data'), 'the list starts on what is still open');
        $this->assertSame(['Baraka Traders Ltd'], array_column($this->getJson('/api/admin/projects/leads?status=lost')->json('data'), 'name'), 'a lost lead stays findable');
        $this->putJson("/api/admin/projects/leads/{$id}", ['status' => 'working'])->assertOk()->assertJsonPath('lead.lost', null);
        $this->putJson("/api/admin/projects/leads/{$id}", ['status' => 'won'])->assertStatus(422);   // winning makes a client, which is its own step
        $this->assertSame(['lead.created', 'lead.working', 'lead.lost', 'lead.working'], DB::table('project_log')->where('subject_type', 'lead')->orderBy('id')->pluck('action')->all());
    }

    public function test_it_warns_when_we_already_know_them_by_name_email_or_phone(): void
    {
        $id = $this->add(['email' => 'info@baraka.test', 'phone' => '+254 712 345 678'])['id'];
        DB::table('project_parties')->insert(['name' => 'Baraka Traders Ltd', 'kind' => 'organisation', 'created_at' => now()]);
        $known = fn (array $q) => $this->getJson('/api/admin/projects/known?' . http_build_query($q))->assertOk()->json('known');

        $this->assertSame(['lead', 'party'], array_column($known(['name' => 'baraka traders ltd']), 'type'), 'by name, whatever the capitals');
        $this->assertSame(['lead'], array_column($known(['email' => 'INFO@baraka.test']), 'type'));
        $this->assertSame(['lead'], array_column($known(['phone' => '0712345678']), 'type'), 'the same number with or without the country code');
        $this->assertSame(['Already a client (C-001)'], array_column($known(['name' => 'Imara Sacco']), 'detail'));
        $this->assertSame(['customer'], array_column($known(['name' => 'brian kariuki']), 'type'), 'a person by first and last name');
        $this->assertSame(['party'], array_column($known(['name' => 'Baraka Traders Ltd', 'except_type' => 'lead', 'except_id' => $id]), 'type'), 'the one being edited is not its own duplicate');
        $this->assertSame([], $known(['name' => 'Nobody We Know']));
        $this->assertSame([], $known([]));
    }

    public function test_the_lists_are_managed_in_configuration(): void
    {
        $this->as($this->kamau);
        $page = $this->getJson('/api/admin/projects/configuration/lists')->assertOk()->json();
        $this->assertSame(['source', 'lost_reason', 'contact_role', 'party_role', 'flag', 'trade'], array_column($page['lists'], 'key'));
        $this->assertSame('Referral', $page['rows']['source'][0]['name']);

        $page = $this->postJson('/api/admin/projects/configuration/lists/source', ['name' => 'Radio advert'])->assertCreated()->json();
        $row = collect($page['rows']['source'])->firstWhere('name', 'Radio advert');
        $this->assertSame(['radio_advert', false, true], [$row['key'], $row['is_system'], $row['is_active']]);
        $this->postJson('/api/admin/projects/configuration/lists/source', ['name' => 'radio ADVERT'])->assertStatus(422)->assertJson(['message' => 'That name is already on the list.']);
        $this->postJson('/api/admin/projects/configuration/lists/colours', ['name' => 'Red'])->assertNotFound();

        $this->postJson('/api/admin/projects/configuration/lists/flag', ['name' => 'Under review', 'status' => '#ff0000'])->assertStatus(422);   // a named status, never a colour
        $this->postJson('/api/admin/projects/configuration/lists/flag', ['name' => 'Under review', 'status' => 'info'])->assertCreated();
        $this->postJson('/api/admin/projects/configuration/lists/party_role', ['name' => 'Mediator', 'industry' => 'legal'])->assertCreated();
        $this->assertSame('legal', DB::table('project_lists')->where('name', 'Mediator')->value('industry_key'));

        // switched off: no longer offered, but what already uses it keeps its name
        $referral = $this->list('source', 'referral');
        $lead = $this->add(['source_id' => $referral]);
        $this->putJson("/api/admin/projects/configuration/lists/source/{$referral}", ['is_active' => false, 'name' => 'Word of mouth'])->assertOk();
        $this->assertNotContains('Word of mouth', array_column($this->getJson('/api/admin/projects/leads/options')->json('sources'), 'name'));
        $this->assertSame('Word of mouth', $this->getJson("/api/admin/projects/leads/{$lead['id']}")->json('lead.source.name'));
        $this->putJson("/api/admin/projects/leads/{$lead['id']}", ['contact_name' => 'J. Baraka'])->assertOk();   // and it can still be edited without being made to pick another
        $this->postJson('/api/admin/projects/leads', ['name' => 'Another', 'source_id' => $referral])->assertStatus(422);

        $first = fn () => $this->getJson('/api/admin/projects/configuration/lists')->json('rows.lost_reason.0.key');
        $this->putJson('/api/admin/projects/configuration/lists/lost_reason/' . $this->list('lost_reason', 'competitor'), ['move' => 'up'])->assertOk();
        $this->assertSame('competitor', $first());

        $this->as($this->njeri)->postJson('/api/admin/projects/configuration/lists/source', ['name' => 'Mine'])->assertForbidden();
    }
}

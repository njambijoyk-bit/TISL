<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 3.3 (docs/PROJECTS_STAGE3_SPEC.md): contacts under clients, leads and parties; other parties and client contacts on a project. */
class ProjectsContactsPartiesTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const LEAD = ['projects.use', 'projects.create', 'projects.edit', 'projects.links', 'projects.parties', 'projects.clients.view', 'projects.clients.manage', 'projects.leads.manage'];

    private User $kamau;
    private int $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', self::LEAD);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'legal')->value('id'), 'industry_key' => 'legal', 'title' => 'Imara v. Baraka', 'customer_id' => 1])->assertCreated()->json('project.id');
    }

    private function as(User $u): static
    {
        Sanctum::actingAs($u, ['*']);

        return $this;
    }

    private function role(string $key): int
    {
        return (int) DB::table('project_lists')->where('list', 'party_role')->where('key', $key)->value('id');
    }

    public function test_a_client_has_contacts_with_roles_and_always_one_main_contact(): void
    {
        $r = $this->postJson('/api/admin/projects/contacts/customer/1', ['name' => 'A. Otieno', 'job_title' => 'CEO', 'email' => 'CEO@Imara.test', 'phone' => '0711 000 111', 'roles' => ['decision_maker', 'signatory']])->assertCreated()->json();
        $this->assertSame(['A. Otieno', 'ceo@imara.test', '0711000111', true, ['Decision maker', 'Signs for them']], [$r['contacts'][0]['name'], $r['contacts'][0]['email'], $r['contacts'][0]['phone'], $r['contacts'][0]['is_main'], array_column($r['contacts'][0]['roles'], 'name')]);
        $this->assertContains('Billing', array_column($r['roles'], 'name'));
        $r = $this->postJson('/api/admin/projects/contacts/customer/1', ['name' => 'M. Chebet', 'roles' => ['billing']])->assertCreated()->json();
        $this->assertSame([['A. Otieno', true], ['M. Chebet', false]], array_map(fn ($c) => [$c['name'], $c['is_main']], $r['contacts']), 'the first one added is the main contact');

        $chebet = $r['contacts'][1]['id'];
        $r = $this->putJson("/api/admin/projects/contacts/{$chebet}", ['is_main' => true, 'job_title' => 'Finance manager'])->assertOk()->json();
        $this->assertSame([['M. Chebet', true, 'Finance manager'], ['A. Otieno', false, 'CEO']], array_map(fn ($c) => [$c['name'], $c['is_main'], $c['job_title']], $r['contacts']), 'only one is main');
        $r = $this->deleteJson("/api/admin/projects/contacts/{$chebet}")->assertOk()->json();
        $this->assertSame([['A. Otieno', true]], array_map(fn ($c) => [$c['name'], $c['is_main']], $r['contacts']), 'when the main one goes, another becomes main');

        $this->postJson('/api/admin/projects/contacts/customer/1', ['name' => ''])->assertStatus(422);
        $this->postJson('/api/admin/projects/contacts/customer/1', ['name' => 'X', 'roles' => ['emperor']])->assertStatus(422);
        $this->postJson('/api/admin/projects/contacts/customer/999', ['name' => 'X'])->assertNotFound();
        $this->assertContains($this->postJson('/api/admin/projects/contacts/planet/1', ['name' => 'X'])->status(), [404, 405], 'there is no such kind of owner');
    }

    public function test_who_may_see_and_change_contacts_follows_what_they_belong_to(): void
    {
        $this->postJson('/api/admin/projects/contacts/customer/1', ['name' => 'A. Otieno'])->assertCreated();
        $lead = (int) $this->postJson('/api/admin/projects/leads', ['name' => 'Tumaini Academy'])->json('lead.id');
        $this->postJson("/api/admin/projects/contacts/lead/{$lead}", ['name' => 'Head teacher'])->assertCreated();
        $contact = (int) DB::table('project_contacts')->where('owner_type', 'customer')->value('id');

        $viewer = $this->staff('Viewer', ['projects.use', 'projects.clients.view']);
        $this->as($viewer)->getJson('/api/admin/projects/contacts/customer/1')->assertOk()->assertJsonPath('can.change', false);
        $this->postJson('/api/admin/projects/contacts/customer/1', ['name' => 'Mine'])->assertForbidden();
        $this->putJson("/api/admin/projects/contacts/{$contact}", ['name' => 'Renamed'])->assertForbidden();
        $this->getJson("/api/admin/projects/contacts/lead/{$lead}")->assertNotFound();   // a lead they cannot see

        $this->as($this->staff('Clerk'))->getJson('/api/admin/projects/contacts/customer/1')->assertForbidden();
        $this->assertSame(3, DB::table('project_log')->where('result', 'refused')->where('action', 'like', 'contact.%')->count(), 'each refusal is logged: the add, the change, and the clerk\'s look');
    }

    public function test_a_party_is_put_on_a_project_in_a_role_of_its_industry_and_reused_across_projects(): void
    {
        $page = $this->getJson("/api/admin/projects/{$this->project}/parties")->assertOk()->json();
        $names = array_column($page['roles'], 'name');
        $this->assertContains('Opposing party', $names);
        $this->assertContains('Consultant', $names, 'roles for every industry are offered too');
        $this->assertNotContains('Subcontractor', $names, 'another industry\'s roles are not');

        $page = $this->postJson("/api/admin/projects/{$this->project}/parties", ['name' => 'Baraka Traders Ltd', 'phone' => '+254 712 345 678', 'role_id' => $this->role('opponent'), 'note' => 'Served 3 Nov'])->assertCreated()->json();
        $this->assertSame([['Baraka Traders Ltd', 'Opposing party', '+254712345678', 'Served 3 Nov']], array_map(fn ($p) => [$p['name'], $p['role'], $p['phone'], $p['note']], $page['parties']));
        $party = $page['parties'][0]['party_id'];
        $this->assertSame('party.added', DB::table('project_log')->where('project_id', $this->project)->orderByDesc('id')->value('action'));

        // their own contact, as who to talk to on this project
        $c = $this->postJson("/api/admin/projects/contacts/party/{$party}", ['name' => 'J. Baraka'])->assertCreated()->json('contacts.0.id');
        $second = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'legal')->value('id'), 'industry_key' => 'legal', 'title' => 'Second matter'])->json('project.id');
        $this->assertSame(['Baraka Traders Ltd'], array_column($this->getJson('/api/admin/projects/parties?q=baraka')->assertOk()->json('parties'), 'name'));
        $page = $this->postJson("/api/admin/projects/{$second}/parties", ['party_id' => $party, 'role_id' => $this->role('witness'), 'contact_id' => $c])->assertCreated()->json();
        $this->assertSame(['Witness', 'J. Baraka'], [$page['parties'][0]['role'], $page['parties'][0]['contact']['name']]);
        $this->assertSame(1, DB::table('project_parties')->count(), 'one record, two projects');

        $this->postJson("/api/admin/projects/{$second}/parties", ['party_id' => $party, 'role_id' => $this->role('witness')])->assertStatus(422)->assertJson(['message' => 'They are already on this in that role.']);
        $this->postJson("/api/admin/projects/{$second}/parties", ['party_id' => $party, 'role_id' => $this->role('subcontractor')])->assertStatus(422);
        $this->postJson("/api/admin/projects/{$second}/parties", ['name' => '', 'role_id' => $this->role('witness')])->assertStatus(422);
        $this->postJson("/api/admin/projects/{$second}/parties", ['party_id' => 999, 'role_id' => $this->role('expert')])->assertStatus(422);

        $link = $page['parties'][0]['id'];
        $this->assertSame([], $this->deleteJson("/api/admin/projects/{$second}/parties/{$link}")->assertOk()->json('parties'));
        $this->assertSame(1, DB::table('project_parties')->count(), 'taking them off a project does not delete the party');
    }

    public function test_it_says_when_a_party_is_also_a_lead_or_a_client(): void
    {
        $this->postJson('/api/admin/projects/leads', ['name' => 'Baraka Traders Ltd'])->assertCreated();
        $this->postJson("/api/admin/projects/{$this->project}/parties", ['name' => 'Baraka Traders Ltd', 'role_id' => $this->role('opponent')])->assertCreated();
        $page = $this->postJson("/api/admin/projects/{$this->project}/parties", ['name' => 'Imara Sacco', 'role_id' => $this->role('witness')])->assertCreated()->json();
        $by = collect($page['parties'])->keyBy('name');
        $this->assertSame(['A lead, owned by Kamau'], $by['Baraka Traders Ltd']['also']);
        $this->assertSame(['Also a client'], $by['Imara Sacco']['also']);
    }

    public function test_the_clients_own_contacts_can_be_put_on_a_project(): void
    {
        $a = $this->postJson('/api/admin/projects/contacts/customer/1', ['name' => 'A. Otieno'])->json('contacts.0.id');
        $b = $this->postJson('/api/admin/projects/contacts/customer/2', ['name' => 'Someone else\'s'])->json('contacts.0.id');
        $page = $this->getJson("/api/admin/projects/{$this->project}/parties")->json();
        $this->assertSame(['A. Otieno'], array_column($page['available_contacts'], 'name'), 'only this client\'s contacts are offered');

        $page = $this->postJson("/api/admin/projects/{$this->project}/party-contacts", ['contact_id' => $a, 'note' => 'Signs the pleadings'])->assertCreated()->json();
        $this->assertSame([['A. Otieno', 'Signs the pleadings']], array_map(fn ($c) => [$c['name'], $c['note']], $page['client_contacts']));
        $this->assertSame([], $page['available_contacts']);
        $this->postJson("/api/admin/projects/{$this->project}/party-contacts", ['contact_id' => $b])->assertStatus(422)->assertJson(['message' => 'Choose one of this client\'s contacts.']);

        // a contact that is removed leaves the project too
        $this->deleteJson("/api/admin/projects/contacts/{$a}")->assertOk();
        $this->assertSame([], $this->getJson("/api/admin/projects/{$this->project}/parties")->json('client_contacts'));
    }

    public function test_parties_are_read_by_anyone_who_can_open_the_project_and_changed_with_both_questions(): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/parties", ['name' => 'Baraka Traders Ltd', 'role_id' => $this->role('opponent')])->assertCreated();
        $link = (int) DB::table('project_party_links')->value('id');
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.parties']);
        $this->as($njeri)->getJson("/api/admin/projects/{$this->project}/parties")->assertNotFound();   // not on it

        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'reviewer')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->getJson("/api/admin/projects/{$this->project}/parties")->assertOk()->assertJsonPath('can.change', false);   // a Reviewer's project role does not attach things
        $this->postJson("/api/admin/projects/{$this->project}/parties", ['name' => 'X', 'role_id' => $this->role('witness')])->assertForbidden();
        $this->deleteJson("/api/admin/projects/{$this->project}/parties/{$link}")->assertForbidden();

        $this->grant($this->kamau, array_diff(array_merge(['admin.access'], self::LEAD), ['projects.parties']));
        $this->as($this->kamau)->getJson("/api/admin/projects/{$this->project}/parties")->assertOk()->assertJsonPath('can.change', false);
        $this->postJson("/api/admin/projects/{$this->project}/parties", ['name' => 'X', 'role_id' => $this->role('witness')])->assertForbidden();
    }
}

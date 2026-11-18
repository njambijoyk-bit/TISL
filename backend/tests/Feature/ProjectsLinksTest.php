<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Projects\ProjectLinks;
use App\Services\Projects\ProjectLinkTypes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Projects, build 1.7 (docs/PROJECTS_STAGE1_SPEC.md): attaching records of other modules to a project. A link is seen only while its module is
 * licensed and on, by someone who holds that module's own permission and can open the project.
 */
class ProjectsLinksTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const LEAD = ['projects.use', 'projects.create', 'projects.links', 'projects.confidential', 'books.view', 'events.view'];

    private User $kamau;
    private int $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('name'); $t->string('base_type')->nullable(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code'); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id'); $t->string('voucher_number'); $t->string('party_name')->nullable(); $t->string('reference_no')->nullable();
            $t->date('date')->nullable(); $t->string('status')->default('posted'); $t->decimal('total_amount', 14, 2)->nullable(); $t->unsignedBigInteger('currency_id')->nullable(); });
        Schema::create('events', function ($t) { $t->id(); $t->string('title'); $t->string('venue_name')->nullable(); $t->string('status')->default('published'); $t->softDeletes(); });
        DB::table('voucher_types')->insert([['id' => 1, 'name' => 'Quotation', 'base_type' => 'quotation'], ['id' => 2, 'name' => 'Sales Invoice', 'base_type' => 'sales']]);
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES']);
        DB::table('vouchers')->insert([
            ['id' => 10, 'voucher_type_id' => 1, 'voucher_number' => 'QT-0231', 'party_name' => 'Imara Sacco', 'date' => '2026-11-10', 'status' => 'posted', 'total_amount' => 1500000, 'currency_id' => 1],
            ['id' => 11, 'voucher_type_id' => 2, 'voucher_number' => 'INV-0044', 'party_name' => 'Imara Sacco', 'date' => '2026-11-12', 'status' => 'posted', 'total_amount' => 480000, 'currency_id' => 1],
            ['id' => 12, 'voucher_type_id' => 2, 'voucher_number' => 'INV-0045', 'party_name' => 'Duka Fresh', 'date' => '2026-11-13', 'status' => 'cancelled', 'total_amount' => 9000, 'currency_id' => 1],
        ]);
        DB::table('events')->insert([['id' => 5, 'title' => 'Wing opening night', 'venue_name' => 'Karura Lodge', 'status' => 'published']]);
        $this->kamau = $this->staff('Kamau', self::LEAD);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = $this->start('Lodge wing');
    }

    private function start(string $title, array $o = []): int
    {
        return (int) $this->postJson('/api/admin/projects', $o + ['type_id' => DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id'), 'title' => $title])->assertCreated()->json('project.id');
    }

    private function link(string $type, int $id, ?string $note = null)
    {
        return $this->postJson("/api/admin/projects/{$this->project}/links", ['type' => $type, 'linked_id' => $id, 'note' => $note]);
    }

    private function group(array $r, string $type): ?array
    {
        return collect($r['groups'])->firstWhere('type', $type);
    }

    public function test_a_voucher_is_linked_and_its_amount_is_read_from_the_books_never_kept(): void
    {
        $found = $this->getJson("/api/admin/projects/{$this->project}/links/find?type=books.voucher&q=QT")->assertOk()->json('found');
        $this->assertSame([['id' => 10, 'title' => 'Quotation QT-0231', 'detail' => 'Imara Sacco · 2026-11-10']], $found);

        $r = $this->link('books.voucher', 10, '  The agreed <b>fee</b> ')->assertCreated()->json();
        $item = $this->group($r, 'books.voucher')['items'][0];
        $this->assertSame(['Quotation QT-0231', 'Imara Sacco · 2026-11-10', '/admin/books/vouchers/10', 'KES', 'The agreed fee', 'Kamau', false],
            [$item['title'], $item['detail'], $item['url'], $item['currency'], $item['note'], $item['added_by'], $item['gone']]);
        $this->assertEquals(1500000, $item['amount']);
        $this->assertTrue($r['can']['links']);

        // the books change it; the project shows the new figure, because it never held the old one
        DB::table('vouchers')->where('id', 10)->update(['total_amount' => 1750000]);
        $this->assertEquals(1750000, $this->group($this->getJson("/api/admin/projects/{$this->project}/links")->json(), 'books.voucher')['items'][0]['amount']);
        $stored = (array) DB::table('project_links')->first();
        $this->assertArrayNotHasKey('amount', $stored);
        $this->assertSame(['books', 'voucher', 10], [$stored['module'], $stored['link_type'], (int) $stored['linked_id']]);
        $this->assertSame('link.added', DB::table('project_log')->orderByDesc('id')->value('action'));
    }

    public function test_links_are_checked_and_can_be_removed_and_added_again(): void
    {
        $this->link('books.voucher', 10)->assertCreated();
        $this->link('books.voucher', 10)->assertStatus(422)->assertJsonPath('message', 'It is already linked.');
        $this->link('books.voucher', 9999)->assertStatus(422);
        $this->link('books.invoice_from_the_moon', 10)->assertNotFound();
        $this->link('not a type', 10)->assertNotFound();

        $id = (int) DB::table('project_links')->value('id');
        $r = $this->deleteJson("/api/admin/projects/{$this->project}/links/{$id}")->assertOk()->json();
        $this->assertSame([], $this->group($r, 'books.voucher')['items']);
        $this->deleteJson("/api/admin/projects/{$this->project}/links/{$id}")->assertNotFound();
        $this->link('books.voucher', 10, 'Again')->assertCreated();
        $this->assertSame(1, DB::table('project_links')->count(), 'the same row is used again');

        // a link of another project is not reachable through this one
        $other = $this->start('Other');
        $this->deleteJson("/api/admin/projects/{$other}/links/{$id}")->assertNotFound();
    }

    public function test_a_record_that_has_since_gone_says_so_instead_of_breaking_the_page(): void
    {
        $this->link('events.event', 5)->assertCreated();
        DB::table('events')->where('id', 5)->delete();
        $item = $this->group($this->getJson("/api/admin/projects/{$this->project}/links")->assertOk()->json(), 'events.event')['items'][0];
        $this->assertSame(['No longer there', true, null], [$item['title'], $item['gone'], $item['url']]);
    }

    public function test_a_link_whose_module_is_off_is_kept_and_not_shown_and_returns_with_the_module(): void
    {
        $this->link('events.event', 5)->assertCreated();
        $this->link('books.voucher', 11)->assertCreated();

        $this->modulesOff = ['events'];
        $r = $this->getJson("/api/admin/projects/{$this->project}/links")->assertOk()->json();
        $this->assertSame(['books.voucher'], array_column($r['groups'], 'type'));
        $this->assertSame(1, $r['hidden']);
        $this->assertSame(['Events'], $r['off']);
        $this->link('events.event', 5)->assertNotFound();
        $this->getJson("/api/admin/projects/{$this->project}/links/find?type=events.event")->assertNotFound();
        $this->assertSame(2, DB::table('project_links')->whereNull('deleted_at')->count(), 'nothing was removed');

        $this->modulesOff = [];
        $r = $this->getJson("/api/admin/projects/{$this->project}/links")->json();
        $this->assertSame('Wing opening night', $this->group($r, 'events.event')['items'][0]['title']);
        $this->assertSame([0, []], [$r['hidden'], $r['off']]);
    }

    public function test_a_person_sees_only_the_links_of_modules_they_may_see(): void
    {
        $this->link('events.event', 5)->assertCreated();
        $this->link('books.voucher', 10)->assertCreated();
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.links', 'events.view']);   // no books.view
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active']);
        Sanctum::actingAs($njeri, ['*']);
        $r = $this->getJson("/api/admin/projects/{$this->project}/links")->assertOk()->json();
        $this->assertSame(['events.event'], array_column($r['groups'], 'type'));
        $this->assertSame(1, $r['hidden'], 'she is told something is there that she may not see, and nothing about it');
        $this->getJson("/api/admin/projects/{$this->project}/links/find?type=books.voucher")->assertForbidden();
        $this->link('books.voucher', 11)->assertForbidden();
        $voucherLink = (int) DB::table('project_links')->where('module', 'books')->value('id');
        $this->deleteJson("/api/admin/projects/{$this->project}/links/{$voucherLink}")->assertForbidden();
        $this->assertNull(DB::table('project_links')->where('id', $voucherLink)->value('deleted_at'));
    }

    public function test_adding_and_removing_links_follows_the_two_questions(): void
    {
        $boss = $this->staff('Boss', ['projects.use', 'projects.view_all', 'projects.links', 'books.view']);   // sees all, on nothing
        Sanctum::actingAs($boss, ['*']);
        $this->getJson("/api/admin/projects/{$this->project}/links")->assertOk()->assertJsonPath('can.links', false);
        $this->link('books.voucher', 10)->assertForbidden();
        $this->getJson("/api/admin/projects/{$this->project}/links/find?type=books.voucher")->assertForbidden();

        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $boss->id, 'project_role_id' => DB::table('project_roles')->where('key', 'reviewer')->value('id'), 'status' => 'active']);
        $this->link('books.voucher', 10)->assertForbidden();   // a Reviewer does not add links
        DB::table('project_members')->where('user_id', $boss->id)->update(['project_role_id' => DB::table('project_roles')->where('key', 'finance')->value('id')]);
        $this->link('books.voucher', 10)->assertCreated();   // Finance does
    }

    public function test_another_modules_page_can_ask_which_projects_a_record_is_part_of(): void
    {
        $secret = $this->start('Secret', ['confidential' => true]);
        $this->link('books.voucher', 10)->assertCreated();
        $this->postJson("/api/admin/projects/{$secret}/links", ['type' => 'books.voucher', 'linked_id' => 10])->assertCreated();
        $this->assertSame(['P-0001', 'P-0002'], array_column($this->getJson('/api/admin/projects/linked?type=books.voucher&id=10')->assertOk()->json('projects'), 'number'));
        $this->assertSame([], $this->getJson('/api/admin/projects/linked?type=books.voucher&id=11')->json('projects'));

        $boss = $this->staff('Boss', ['projects.use', 'projects.view_all', 'books.view']);
        $this->assertSame(['P-0001'], array_column(app(ProjectLinks::class)->projectsOf($boss, 'books.voucher', 10), 'number'), 'never a confidential project they are not on');
        $this->assertSame([], app(ProjectLinks::class)->projectsOf($this->staff('NoProjects', ['books.view']), 'books.voucher', 10));
    }

    public function test_a_module_adds_a_link_type_of_its_own_without_any_change_to_projects(): void
    {
        app(ProjectLinkTypes::class)->register('campaigns.campaign', ['module' => 'campaigns', 'label' => 'Campaign', 'plural' => 'Campaigns', 'permission' => 'projects.use',
            'search' => fn (string $q) => [['id' => 3, 'title' => 'New wing launch', 'detail' => null]],
            'describe' => fn (array $ids) => in_array(3, $ids) ? [3 => ['title' => 'New wing launch', 'detail' => '12 items', 'url' => '/admin/campaigns/3']] : []]);
        $r = $this->link('campaigns.campaign', 3)->assertCreated()->json();
        $this->assertSame('New wing launch', $this->group($r, 'campaigns.campaign')['items'][0]['title']);
        $this->assertNull($this->group($r, 'campaigns.campaign')['items'][0]['amount']);

        $this->expectException(\InvalidArgumentException::class);
        app(ProjectLinkTypes::class)->register('nonsense', ['label' => 'X', 'plural' => 'Xs', 'permission' => 'p', 'search' => fn () => [], 'describe' => fn () => []]);
    }

    public function test_a_link_says_what_it_is_to_the_work_and_the_agreed_value_is_added_up_from_the_books(): void
    {
        $r = $this->link('books.voucher', 10)->assertCreated()->json();
        $q = $this->group($r, 'books.voucher')['items'][0];
        $this->assertSame(['agreed_value', 'Posted', 'good'], [$q['role']['key'], $q['state']['label'], $q['state']['status']], 'a quotation is the agreed value on its own; its state is read from the books');
        $r = $this->link('books.voucher', 11)->assertCreated()->json();
        $this->assertNull(collect($this->group($r, 'books.voucher')['items'])->firstWhere('linked_id', 11)['role']);
        $this->assertSame([['currency' => 'KES', 'amount' => 1500000]], $r['agreed']);
        $this->assertSame(['Agreed value', 'Supplier', 'Deliverable', 'Related'], array_column($r['roles'], 'name'));

        $inv = collect($this->group($r, 'books.voucher')['items'])->firstWhere('linked_id', 11)['id'];
        $r = $this->putJson("/api/admin/projects/{$this->project}/links/{$inv}", ['role' => 'agreed_value', 'note' => 'Phase two'])->assertOk()->json();
        $this->assertSame([['currency' => 'KES', 'amount' => 1980000]], $r['agreed'], 'both count; the amounts are the books\' own');
        DB::table('vouchers')->where('id', 11)->update(['total_amount' => 500000]);
        $this->assertSame(2000000, (int) $this->getJson("/api/admin/projects/{$this->project}/links")->json('agreed.0.amount'));
        $this->putJson("/api/admin/projects/{$this->project}/links/{$inv}", ['role' => 'nonsense'])->assertStatus(422);
        $this->assertSame(['old' => ['role' => null, 'note' => null], 'new' => ['role' => 'agreed_value', 'note' => 'Phase two']], ['old' => json_decode(DB::table('project_log')->where('action', 'link.changed')->value('old_values'), true), 'new' => json_decode(DB::table('project_log')->where('action', 'link.changed')->value('new_values'), true)]);
        $this->assertSame(2, $this->getJson("/api/admin/projects/{$this->project}")->json('project.links_count'));
    }

    public function test_a_link_taken_off_can_be_put_back_and_the_record_is_never_touched(): void
    {
        $id = $this->link('events.event', 5)->assertCreated()->json('groups.1.items.0.id') ?? DB::table('project_links')->where('linked_id', 5)->value('id');
        $r = $this->deleteJson("/api/admin/projects/{$this->project}/links/{$id}")->assertOk()->json();
        $this->assertSame([['what' => 'Event', 'title' => 'Wing opening night', 'removed_by' => 'Kamau']], array_map(fn ($x) => array_intersect_key($x, ['what' => 1, 'title' => 1, 'removed_by' => 1]), $r['removed']));
        $this->assertSame(1, DB::table('events')->where('id', 5)->count());
        $r = $this->postJson("/api/admin/projects/{$this->project}/links/{$id}/restore")->assertOk()->json();
        $this->assertSame(['Wing opening night'], array_column($this->group($r, 'events.event')['items'], 'title'));
        $this->assertSame([], $r['removed']);
        $this->postJson("/api/admin/projects/{$this->project}/links/{$id}/restore")->assertNotFound();
        $this->assertSame(1, DB::table('project_log')->where('action', 'link.restored')->count());
    }

    public function test_link_roles_are_a_company_list_in_configuration(): void
    {
        $this->grant($this->kamau, ['admin.access', ...self::LEAD, 'projects.config.view', 'projects.config.manage']);
        $this->postJson('/api/admin/projects/configuration/link-roles', ['name' => 'Subcontract', 'status' => 'info'])->assertOk();
        $roles = $this->getJson('/api/admin/projects/configuration/link-roles')->assertOk()->json('roles');
        $this->assertSame('subcontract', collect($roles)->firstWhere('name', 'Subcontract')['key']);
        $this->postJson('/api/admin/projects/configuration/link-roles', ['name' => 'Subcontract'])->assertStatus(422);
        $related = collect($roles)->firstWhere('key', 'related')['id'];
        $this->putJson("/api/admin/projects/configuration/link-roles/{$related}", ['name' => 'Related', 'is_active' => false])->assertOk();
        $this->link('events.event', 5)->assertCreated();
        $id = DB::table('project_links')->where('linked_id', 5)->value('id');
        $this->putJson("/api/admin/projects/{$this->project}/links/{$id}", ['role' => 'related'])->assertStatus(422)->assertJson(['message' => 'Choose what it is to the work from the list.']);
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 3.5 (docs/PROJECTS_STAGE3_SPEC.md): the client list and page, account manager, flags, health and the export. */
class ProjectsClientsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const MANAGER = ['projects.use', 'projects.create', 'projects.clients.view', 'projects.clients.manage', 'projects.clients.export', 'projects.health.view', 'projects.flags', 'projects.interactions', 'projects.config.view', 'projects.config.manage', 'projects.money.view'];

    private User $kamau;
    private array $owed = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-16 10:00:00');
        $this->createProjectsWorld();
        // what the books say a client owes is stood in for: this world has no ledgers
        $owed = &$this->owed;
        $this->app->instance(\App\Services\Projects\ClientMoney::class, new class($owed) extends \App\Services\Projects\ClientMoney {
            public function __construct(private array &$owed) {}

            public function forMany(array $customerIds): array
            {
                return array_intersect_key($this->owed, array_flip($customerIds));
            }
        });
        $this->kamau = $this->staff('Kamau', self::MANAGER);
        Sanctum::actingAs($this->kamau, ['*']);
        DB::table('customers')->insert(['id' => 3, 'customer_number' => 'C-003', 'company_name' => 'Shop Shopper Ltd', 'created_at' => now()]);   // a shop customer Projects has nothing to do with
        DB::table('customers')->whereIn('id', [1, 2])->update(['projects_client_since' => '2026-11-01']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function as(User $u): static
    {
        Sanctum::actingAs($u, ['*']);

        return $this;
    }

    private function flag(string $key): int
    {
        return (int) DB::table('project_lists')->where('list', 'flag')->where('key', $key)->value('id');
    }

    public function test_the_list_holds_the_clients_projects_knows_and_a_search_finds_any_customer(): void
    {
        $r = $this->getJson('/api/admin/projects/clients')->assertOk()->json();
        $this->assertSame(['Brian Kariuki', 'Imara Sacco'], array_column($r['data'], 'name'));
        $this->assertSame(['Shop Shopper Ltd'], array_column($this->getJson('/api/admin/projects/clients?q=shopper')->json('data'), 'name'), 'any customer can be found and opened');

        DB::table('customers')->where('id', 1)->update(['projects_account_manager_id' => $this->kamau->id]);
        $this->assertSame(['Imara Sacco'], array_column($this->getJson('/api/admin/projects/clients?scope=mine')->json('data'), 'name'));
        $this->postJson('/api/admin/projects/clients/2/flags', ['flag_id' => $this->flag('slow_payer'), 'reason' => 'Pays at 90 days'])->assertCreated();
        $this->assertSame(['Brian Kariuki'], array_column($this->getJson('/api/admin/projects/clients?flagged=1')->json('data'), 'name'));

        $this->as($this->staff('Clerk'))->getJson('/api/admin/projects/clients')->assertForbidden();
    }

    public function test_health_is_worked_out_from_four_rules_and_always_says_why(): void
    {
        $page = fn (int $id) => $this->getJson("/api/admin/projects/clients/{$id}")->assertOk()->json('client.health');
        $this->assertSame(['colour' => 'amber', 'reasons' => ['Nothing planned next']], $page(1));

        DB::table('project_follow_ups')->insert(['subject_type' => 'customer', 'subject_id' => 1, 'what' => 'Quarterly review', 'due_on' => '2026-11-20', 'owner_id' => $this->kamau->id, 'created_at' => now()]);
        $this->assertSame(['colour' => 'green', 'reasons' => []], $page(1), 'contact counts from the day it became a client: 15 days, under 30');

        Carbon::setTestNow('2026-12-05 10:00:00');
        $h = $page(1);
        $this->assertSame('red', $h['colour'], 'a next action 14 or more days late is red');
        $this->assertContains('Next action 15 days late', $h['reasons']);
        $this->assertContains('No contact since becoming a client 34 days ago', $h['reasons']);

        $this->postJson('/api/admin/projects/history/customer/1', ['kind' => 'call', 'summary' => 'Caught up'])->assertCreated();
        DB::table('project_follow_ups')->update(['due_on' => '2026-12-10']);
        $this->assertSame(['colour' => 'green', 'reasons' => []], $page(1));

        $this->postJson('/api/admin/projects/clients/1/flags', ['flag_id' => $this->flag('difficult'), 'reason' => 'Disputes every fee note'])->assertCreated();
        $this->assertSame(['colour' => 'amber', 'reasons' => ['Flag: Needs careful handling']], $page(1));
        $this->postJson('/api/admin/projects/clients/1/flags', ['flag_id' => $this->flag('credit_hold'), 'reason' => 'Over the limit'])->assertCreated();
        $this->assertSame('red', $page(1)['colour'], 'a flag shown as a problem is red');

        $this->owed = [2 => ['owed' => 412000.0, 'overdue' => 150000.0, 'days_late' => 75, 'currency' => 'KES']];
        DB::table('project_follow_ups')->insert(['subject_type' => 'customer', 'subject_id' => 2, 'what' => 'Chase', 'due_on' => '2026-12-10', 'owner_id' => $this->kamau->id, 'created_at' => now()]);
        $this->postJson('/api/admin/projects/history/customer/2', ['kind' => 'call', 'summary' => 'Chased'])->assertCreated();
        $c = $this->getJson('/api/admin/projects/clients/2')->json('client');
        $this->assertSame(['red', ['Money overdue for 75 days'], 412000], [$c['health']['colour'], $c['health']['reasons'], $c['money']['owed']]);
    }

    public function test_the_health_rules_are_numbers_an_owner_sets(): void
    {
        DB::table('project_follow_ups')->insert(['subject_type' => 'customer', 'subject_id' => 1, 'what' => 'Review', 'due_on' => '2026-11-20', 'owner_id' => $this->kamau->id, 'created_at' => now()]);
        $r = $this->putJson('/api/admin/projects/configuration/health', ['contact_amber_days' => 10, 'contact_red_days' => 20])->assertOk()->json('health');
        $this->assertSame([10, 20], [$r['contact_amber_days'], $r['contact_red_days']]);
        $this->assertSame(['colour' => 'amber', 'reasons' => ['No contact since becoming a client 15 days ago']], $this->getJson('/api/admin/projects/clients/1')->json('client.health'));
        $this->putJson('/api/admin/projects/configuration/health', ['contact_amber_days' => 20, 'contact_red_days' => 10])->assertStatus(422)->assertJson(['message' => 'No contact: red must come after amber.']);
        $this->putJson('/api/admin/projects/configuration/health', ['contact_amber_days' => 0, 'nothing_planned_amber' => false])->assertOk();
        DB::table('project_follow_ups')->delete();
        $this->assertSame('green', $this->getJson('/api/admin/projects/clients/1')->json('client.health.colour'), 'a rule set to 0 or off says nothing');
        $this->as($this->staff('Viewer', ['projects.use', 'projects.config.view']))->putJson('/api/admin/projects/configuration/health', ['contact_amber_days' => 5])->assertForbidden();
    }

    public function test_health_and_money_are_shown_only_to_those_who_may_see_them(): void
    {
        $this->owed = [1 => ['owed' => 412000.0, 'overdue' => 0.0, 'days_late' => 0, 'currency' => 'KES']];
        $reader = $this->staff('Reader', ['projects.use', 'projects.clients.view']);
        $c = $this->as($reader)->getJson('/api/admin/projects/clients/1')->assertOk()->json('client');
        $this->assertSame([null, null, false, false], [$c['health'], $c['money'], $c['can']['manage'], $c['can']['flags']]);
        $this->assertNull($this->getJson('/api/admin/projects/clients')->json('counts'));
        $this->putJson('/api/admin/projects/clients/1', ['manager_id' => $reader->id])->assertForbidden();
        $this->postJson('/api/admin/projects/clients/1/flags', ['flag_id' => $this->flag('vip'), 'reason' => 'x'])->assertForbidden();
        $this->getJson('/api/admin/projects/clients/export')->assertForbidden();
    }

    public function test_the_page_shows_the_work_opportunities_and_flags_and_sets_the_account_manager(): void
    {
        $type = DB::table('project_types')->where('industry_key', 'general')->value('id');
        $open = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Stock system', 'customer_id' => 1])->json('project.id');
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.create', 'projects.confidential']);
        $this->as($njeri)->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Hidden', 'customer_id' => 1, 'confidential' => true])->assertCreated();
        $c = $this->as($this->kamau)->getJson('/api/admin/projects/clients/1')->assertOk()->json();
        $this->assertSame(['Stock system'], array_column($c['client']['projects'], 'title'), 'a confidential piece of work Kamau is not on is not listed');
        $this->assertSame(1, $c['client']['open_work']);
        $this->assertContains('Credit hold', array_column($c['flag_choices'], 'name'));

        $c = $this->putJson('/api/admin/projects/clients/1', ['manager_id' => $njeri->id])->assertOk()->json('client');
        $this->assertSame('Njeri', $c['manager']['name']);
        $this->putJson('/api/admin/projects/clients/1', ['manager_id' => $this->staff('Outsider', [])->id])->assertStatus(422);
        $this->assertSame('client.manager', DB::table('project_log')->orderByDesc('id')->value('action'));
        $this->assertSame($open, $c['projects'][0]['id']);
    }

    public function test_a_flag_needs_a_reason_on_and_off_and_shows_wherever_the_client_is_picked(): void
    {
        $this->postJson('/api/admin/projects/clients/1/flags', ['flag_id' => $this->flag('credit_hold')])->assertStatus(422)->assertJson(['message' => 'Say why the flag is there.']);
        $c = $this->postJson('/api/admin/projects/clients/1/flags', ['flag_id' => $this->flag('credit_hold'), 'reason' => 'Over the limit'])->assertCreated()->json('client');
        $this->assertSame([['Credit hold', 'problem', 'Over the limit', 'Kamau']], array_map(fn ($f) => [$f['name'], $f['status'], $f['reason'], $f['set_by']], $c['flags']));
        $this->postJson('/api/admin/projects/clients/1/flags', ['flag_id' => $this->flag('credit_hold'), 'reason' => 'Again'])->assertStatus(422)->assertJson(['message' => 'That flag is already on.']);
        $this->grant($this->kamau, array_merge(['admin.access', 'projects.edit'], self::MANAGER));
        $this->assertSame(['Credit hold'], $this->getJson('/api/admin/projects/options/customers?q=imara')->json('customers.0.flags'));

        $flag = $c['flags'][0]['id'];
        $this->deleteJson("/api/admin/projects/clients/1/flags/{$flag}")->assertStatus(422)->assertJson(['message' => 'Say why the flag is coming off.']);
        $this->assertSame([], $this->deleteJson("/api/admin/projects/clients/1/flags/{$flag}", ['note' => 'Paid in full'])->assertOk()->json('client.flags'));
        $this->assertSame(['client.flagged', 'client.unflagged'], DB::table('project_log')->where('subject_type', 'customer')->where('action', 'like', 'client.%flagged')->orderBy('id')->pluck('action')->all());
        $this->assertSame('Paid in full', DB::table('project_client_flags')->value('remove_note'), 'a flag taken off is kept, with why');
    }

    public function test_the_export_is_the_list_as_filtered_and_is_logged(): void
    {
        $this->owed = [1 => ['owed' => 412000.0, 'overdue' => 0.0, 'days_late' => 0, 'currency' => 'KES']];
        $csv = $this->get('/api/admin/projects/clients/export')->assertOk()->streamedContent();
        $lines = array_map('str_getcsv', array_filter(explode("\n", trim($csv))));
        $this->assertSame(['Client', 'Number', 'Email', 'Account manager', 'Client since', 'Came from', 'Open work', 'Last contact', 'Next action', 'Next action due', 'Flags', 'Owes', 'Overdue', 'Currency', 'Health', 'Why'], $lines[0]);
        $this->assertSame(['Brian Kariuki', 'Imara Sacco'], [$lines[1][0], $lines[2][0]]);
        $this->assertSame(['412000', 'KES', 'amber'], [$lines[2][11], $lines[2][13], $lines[2][14]]);
        $this->assertSame(2, json_decode(DB::table('project_log')->where('action', 'clients.exported')->value('new_values'), true)['rows']);
    }
}

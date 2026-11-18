<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

/** Projects, build 8.5 (docs/PROJECTS_STAGE8_SPEC.md): the casebook: reporting, routing, handling, hidden names. */
class ProjectsCasebookTest extends ProjectsTeamTest
{
    private User $hr;
    private array $told = [];
    private array $outside = [];

    protected function setUp(): void
    {
        parent::setUp();
        $told = &$this->told;
        $outside = &$this->outside;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($told, $outside) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$told, private array &$outside) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->told[] = [$to->name, $title, $message];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                $this->outside[] = [$contact['email'], $title, $message];

                return ['notification' => null, 'channels' => ['email'], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->hr = $this->staff('Achieng', ['projects.use', 'projects.casebook.handle', 'projects.casebook.identity', 'projects.casebook.configure', 'projects.flags']);
        foreach ([$this->wanjiru, $this->kamau, $this->njeri, $this->otieno] as $u) {
            $this->grant($u, ['admin.access', 'projects.use', 'projects.casebook.report', ...($u->is($this->wanjiru) ? ['projects.create', 'projects.tasks', 'projects.team.view', 'projects.team.manage'] : []), ...($u->is($this->kamau) ? ['projects.tasks', 'projects.team.view'] : [])]);
        }
    }

    private function kind(string $key): int
    {
        return (int) DB::table('project_case_kinds')->where('key', $key)->value('id');
    }

    public function test_a_report_with_a_hidden_name_goes_to_the_handlers_who_never_learn_the_name_unless_it_is_revealed(): void
    {
        Sanctum::actingAs($this->njeri, ['*']);
        $c = $this->postJson('/api/admin/projects/casebook', ['kind_id' => $this->kind('harassment'), 'what' => 'He keeps shouting at me in meetings.', 'about_people' => [$this->kamau->id], 'hide_name' => true, 'happened_on' => '2026-11-16'])->assertCreated()->json('case');
        $this->assertSame(['CB-0001', 'You', 'new'], [$c['number'], $c['reporter'], $c['state']]);
        $this->assertSame([['Achieng', 'A casebook report: Harassment or bullying']], array_map(fn ($t) => [$t[0], $t[1]], $this->told), 'the handlers; never Kamau, whom it is about');
        $this->assertSame([], $c['log'], 'the reporter does not see the handlers\' log');

        Sanctum::actingAs($this->kamau, ['*']);
        $this->getJson("/api/admin/projects/casebook/{$c['id']}")->assertNotFound();
        $this->assertSame([], $this->getJson('/api/admin/projects/casebook')->json('handling'));

        Sanctum::actingAs($this->hr, ['*']);
        $h = $this->getJson("/api/admin/projects/casebook/{$c['id']}")->assertOk()->json('case');
        $this->assertSame(['Name hidden', true, [['type' => 'person', 'id' => $this->kamau->id, 'name' => 'Kamau']]], [$h['reporter'], $h['hidden'], $h['about']]);
        $this->assertSame('The reporter', $h['log'][0]['who']);
        $this->putJson("/api/admin/projects/casebook/{$c['id']}", ['take' => true, 'state' => 'looking'])->assertOk()->assertJsonPath('case.handler', 'Achieng');
        $this->postJson("/api/admin/projects/casebook/{$c['id']}/messages", ['body' => 'Thank you. Can you say which meetings?'])->assertOk();
        $this->postJson("/api/admin/projects/casebook/{$c['id']}/messages", ['body' => 'Spoke to two witnesses.', 'internal' => true])->assertOk();

        Sanctum::actingAs($this->njeri, ['*']);
        $mine = $this->postJson("/api/admin/projects/casebook/{$c['id']}/messages", ['body' => 'The Monday ones.'])->assertOk()->json('case');
        $this->assertSame(['Achieng', 'You'], array_column($mine['messages'], 'from'), 'the reporter never sees the handlers\' note');
        Sanctum::actingAs($this->hr, ['*']);
        $this->assertSame(['Achieng', 'Achieng', 'Name hidden'], array_column($this->getJson("/api/admin/projects/casebook/{$c['id']}")->json('case.messages'), 'from'));

        $this->told = [];
        $r = $this->postJson("/api/admin/projects/casebook/{$c['id']}/reveal", ['reason' => 'Needed for the formal hearing'])->assertOk()->json('case');
        $this->assertSame(['Njeri', false], [$r['reporter'], $r['hidden']]);
        $this->assertSame('Your name on CB-0001 was revealed', collect($this->told)->firstWhere(0, 'Njeri')[1], 'the reporter is told');
        $this->assertSame(['reported', 'routed', 'viewed', 'taken', 'state', 'message', 'note', 'message', 'viewed', 'revealed'], array_column($r['log'], 'action'));
        $this->assertSame(0, DB::table('project_log')->where('action', 'like', 'case%')->count(), 'nothing in any work\'s log');
    }

    public function test_each_kind_is_routed_its_own_way_and_never_to_someone_it_is_about(): void
    {
        Sanctum::actingAs($this->hr, ['*']);
        $pay = $this->kind('pay');
        $this->putJson("/api/admin/projects/configuration/casebook/{$pay}", ['name' => 'Pay', 'route' => 'manager'])->assertOk();
        $safety = $this->kind('safety');
        $this->putJson("/api/admin/projects/configuration/casebook/{$safety}", ['name' => 'Safety', 'route' => 'outside', 'route_email' => 'counsel@example.test', 'route_name' => 'Our counsellor'])->assertOk();
        $this->putJson("/api/admin/projects/configuration/casebook/{$safety}", ['name' => 'Safety', 'route' => 'outside'])->assertStatus(422);

        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson('/api/admin/projects/casebook', ['kind_id' => $pay, 'what' => 'My overtime was not paid in October.'])->assertCreated();
        $this->assertSame('Kamau', $this->told[0][0], 'her manager');
        $this->told = [];
        $this->postJson('/api/admin/projects/casebook', ['kind_id' => $pay, 'what' => 'My manager cut my hours unfairly.', 'about_people' => [$this->kamau->id]])->assertCreated();
        $this->assertSame('Wanjiru', $this->told[0][0], 'about her manager: his manager');
        $this->told = [];
        $this->postJson('/api/admin/projects/casebook', ['kind_id' => $safety, 'what' => 'The site scaffolding is loose.', 'hide_name' => true])->assertCreated();
        $this->assertSame([['counsel@example.test', 'A casebook report: Safety (CB-0003)']], array_map(fn ($o) => [$o[0], $o[1]], $this->outside));
        $this->assertStringContainsString('asked for their name to be hidden', $this->outside[0][2]);
        $this->assertStringNotContainsString('Njeri', $this->outside[0][2]);

        Sanctum::actingAs($this->kamau, ['*']);
        $this->assertSame(['CB-0001'], array_column($this->getJson('/api/admin/projects/casebook')->json('handling'), 'number'), 'the one routed to him, not the one about him');
        Sanctum::actingAs($this->otieno, ['*']);
        $this->postJson('/api/admin/projects/casebook', ['kind_id' => $pay, 'what' => 'x'])->assertStatus(422);
    }

    public function test_a_difficult_client_case_can_raise_a_client_flag(): void
    {
        DB::table('customers')->insertOrIgnore(['id' => 1, 'first_name' => 'Imara', 'last_name' => 'Sacco']);
        $flag = DB::table('project_lists')->where('list', 'flag')->value('id');
        Sanctum::actingAs($this->kamau, ['*']);
        $c = $this->postJson('/api/admin/projects/casebook', ['kind_id' => $this->kind('difficult_client'), 'what' => 'The client threatened our clerk on the phone.', 'about_clients' => [1]])->assertCreated()->json('case');
        Sanctum::actingAs($this->hr, ['*']);
        $this->assertNotEmpty($this->getJson("/api/admin/projects/casebook/{$c['id']}")->json('case.flags'));
        $this->postJson("/api/admin/projects/casebook/{$c['id']}/flag", ['client_id' => 1, 'flag_id' => $flag, 'reason' => 'Threatened staff (casebook)'])->assertOk();
        $this->assertSame(1, DB::table('project_client_flags')->where('customer_id', 1)->whereNull('removed_at')->count());
        $this->postJson("/api/admin/projects/casebook/{$c['id']}/flag", ['client_id' => 99, 'flag_id' => $flag, 'reason' => 'x'])->assertStatus(422);
    }

    public function test_a_reporter_may_name_any_colleague_and_the_clients_of_their_own_work(): void
    {
        DB::table('customers')->insertOrIgnore(['id' => 1, 'first_name' => 'Imara', 'last_name' => 'Sacco']);
        DB::table('projects')->where('id', $this->project)->update(['customer_id' => 1]);
        Sanctum::actingAs($this->njeri, ['*']);
        $r = $this->getJson('/api/admin/projects/casebook')->assertOk()->json();
        $this->assertNotContains('Njeri', array_column($r['people'], 'name'));
        $this->assertContains('Kamau', array_column($r['people'], 'name'));
        $this->assertSame([['id' => 1, 'name' => 'Imara Sacco']], $r['clients']);
        Sanctum::actingAs($this->otieno, ['*']);
        $this->assertSame([], $this->getJson('/api/admin/projects/casebook')->json('clients'), 'not on that work');
    }
}

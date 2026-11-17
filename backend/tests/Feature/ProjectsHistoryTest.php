<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 3.4 (docs/PROJECTS_STAGE3_SPEC.md): the history of a relationship, next actions, my follow-ups and the daily reminder. */
class ProjectsHistoryTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const SALES = ['projects.use', 'projects.create', 'projects.leads.manage', 'projects.pipeline', 'projects.interactions', 'projects.clients.view', 'projects.clients.manage', 'projects.confidential'];

    private User $njeri;
    private User $kamau;
    private int $lead;
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-16 10:00:00');
        $this->createProjectsWorld();
        $sent = &$this->sent;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$to->name, $type, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->njeri = $this->staff('Njeri', self::SALES);
        $this->kamau = $this->staff('Kamau', array_merge(self::SALES, ['projects.leads.view']));
        Sanctum::actingAs($this->njeri, ['*']);
        $this->lead = (int) $this->postJson('/api/admin/projects/leads', ['name' => 'Tumaini Academy'])->json('lead.id');
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

    public function test_the_history_records_what_happened_with_whom_and_about_what(): void
    {
        $contact = $this->postJson('/api/admin/projects/contacts/customer/1', ['name' => 'A. Otieno'])->json('contacts.0.id');
        $project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Stock system', 'customer_id' => 1])->json('project.id');
        $this->postJson('/api/admin/projects/history/customer/1', ['kind' => 'note', 'summary' => 'Prefers WhatsApp to email', 'happened_at' => '2026-09-14 09:00'])->assertCreated();
        $r = $this->postJson('/api/admin/projects/history/customer/1', ['kind' => 'call', 'summary' => 'Agreed to file by November', 'contact_id' => $contact, 'project_id' => $project, 'team_only' => true])->assertCreated()->json();
        $e = $r['entries'][0];
        $this->assertSame(['call', 'Call', 'Agreed to file by November', 'Njeri', 'A. Otieno', 'P-0001', true, true, '2026-11-16 10:00:00'],
            [$e['kind'], $e['kind_name'], $e['summary'], $e['by'], $e['contact']['name'], $e['project']['number'], $e['team_only'], $e['mine'], $e['happened_at']]);
        $this->assertSame(['Prefers WhatsApp to email'], [$r['entries'][1]['summary']], 'newest first');

        $this->postJson('/api/admin/projects/history/customer/1', ['kind' => 'gossip', 'summary' => 'x'])->assertStatus(422);
        $this->postJson('/api/admin/projects/history/customer/1', ['kind' => 'call', 'summary' => ' '])->assertStatus(422);
        $this->postJson('/api/admin/projects/history/customer/1', ['kind' => 'call', 'summary' => 'x', 'happened_at' => '2026-11-20'])->assertStatus(422)->assertJson(['message' => 'The history is what has happened. For something still to do, set a next action.']);
        $this->postJson('/api/admin/projects/history/customer/1', ['kind' => 'call', 'summary' => 'x', 'contact_id' => 999])->assertStatus(422);
        $this->postJson('/api/admin/projects/history/customer/2', ['kind' => 'call', 'summary' => 'x', 'contact_id' => $contact])->assertStatus(422)->assertJson(['message' => 'Choose one of their own contacts.']);
    }

    public function test_only_the_writer_changes_an_entry_and_what_is_about_a_confidential_project_stays_with_its_people(): void
    {
        $secret = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Secret', 'customer_id' => 1, 'confidential' => true])->json('project.id');
        $this->postJson('/api/admin/projects/history/customer/1', ['kind' => 'meeting', 'summary' => 'Settlement figure discussed', 'project_id' => $secret])->assertCreated();
        $this->postJson('/api/admin/projects/history/customer/1', ['kind' => 'note', 'summary' => 'Open note'])->assertCreated();
        $entry = (int) DB::table('project_interactions')->where('summary', 'Open note')->value('id');

        $this->assertSame(['Open note'], array_column($this->as($this->kamau)->getJson('/api/admin/projects/history/customer/1')->json('entries'), 'summary'), 'Kamau is not on the confidential one');
        $this->putJson("/api/admin/projects/history/entries/{$entry}", ['summary' => 'Rewritten'])->assertForbidden();
        $this->as($this->njeri)->putJson("/api/admin/projects/history/entries/{$entry}", ['summary' => 'Open note, corrected'])->assertOk();
        $this->assertSame(2, count($this->deleteJson("/api/admin/projects/history/entries/{$entry}")->assertOk()->json('entries')) + 1);
        $this->assertSame('history.removed', DB::table('project_log')->orderByDesc('id')->value('action'));

        $this->as($this->staff('Clerk', ['projects.use']))->getJson('/api/admin/projects/history/customer/1')->assertForbidden();
        $this->as($this->staff('Reader', ['projects.use', 'projects.clients.view']))->getJson('/api/admin/projects/history/customer/1')->assertOk()->assertJsonPath('can.write', false);
        $this->postJson('/api/admin/projects/history/customer/1', ['kind' => 'note', 'summary' => 'x'])->assertForbidden();
        $this->getJson("/api/admin/projects/history/lead/{$this->lead}")->assertNotFound();   // Njeri's lead: the reader may not see it
    }

    public function test_a_next_action_shows_on_the_lead_and_the_pipeline_and_the_earliest_wins(): void
    {
        $this->postJson("/api/admin/projects/next/lead/{$this->lead}", ['what' => 'Site visit', 'due_on' => '2026-11-21'])->assertCreated();
        $r = $this->postJson("/api/admin/projects/next/lead/{$this->lead}", ['what' => 'Send fee proposal', 'due_on' => '2026-11-16'])->assertCreated()->json();
        $this->assertSame(['Send fee proposal', 'Site visit'], array_column($r['next'], 'what'));
        $next = $this->getJson('/api/admin/projects/leads')->json('data.0.next');
        $this->assertSame(['Send fee proposal', true, false, 'Njeri'], [$next['what'], $next['today'], $next['late'], $next['owner']['name']]);

        $opp = (int) $this->postJson('/api/admin/projects/opportunities', ['title' => 'Classroom block', 'lead_id' => $this->lead])->json('opportunity.id');
        $this->postJson("/api/admin/projects/next/opportunity/{$opp}", ['what' => 'Chase the board', 'due_on' => '2026-11-18'])->assertCreated();
        $this->assertSame('Chase the board', $this->getJson("/api/admin/projects/opportunities/{$opp}")->json('opportunity.next.what'));

        $this->postJson("/api/admin/projects/next/lead/{$this->lead}", ['what' => 'x', 'due_on' => '2026-11-10'])->assertStatus(422)->assertJson(['message' => 'Choose a date that has not passed.']);
        $this->postJson("/api/admin/projects/next/lead/{$this->lead}", ['what' => 'x'])->assertStatus(422);
        $this->postJson("/api/admin/projects/next/lead/{$this->lead}", ['what' => '', 'due_on' => '2026-11-20'])->assertStatus(422);
        $this->postJson('/api/admin/projects/next/party/1', ['what' => 'x', 'due_on' => '2026-11-20'])->assertStatus(405);   // a party has no next action: there is no such door

        Carbon::setTestNow('2026-11-19 09:00:00');
        $next = $this->getJson('/api/admin/projects/leads')->json('data.0.next');
        $this->assertSame([true, 3], [$next['late'], $next['days_late']]);
    }

    public function test_marking_one_done_writes_what_happened_and_sets_what_is_next(): void
    {
        $id = (int) DB::table('project_follow_ups')->insertGetId(['subject_type' => 'lead', 'subject_id' => $this->lead, 'what' => 'First call', 'due_on' => '2026-11-16', 'owner_id' => $this->njeri->id, 'created_at' => now()]);
        $this->postJson("/api/admin/projects/next/{$id}/done", ['kind' => 'call', 'summary' => 'Spoke to the head teacher'])->assertStatus(422)->assertJson(['message' => 'Say what happens next, or that nothing more is planned.']);
        $r = $this->postJson("/api/admin/projects/next/{$id}/done", ['kind' => 'call', 'summary' => 'Spoke to the head teacher', 'next_what' => 'Site visit', 'next_due' => '2026-11-21'])->assertOk()->json();
        $this->assertSame(['Spoke to the head teacher', 'call'], [$r['entries'][0]['summary'], $r['entries'][0]['kind']]);
        $this->assertSame([['Site visit', '2026-11-21', 'Njeri']], array_map(fn ($n) => [$n['what'], $n['due_on'], $n['owner']['name']], $r['next']));
        $done = DB::table('project_follow_ups')->where('id', $id)->first();
        $this->assertSame([$this->njeri->id, (int) DB::table('project_interactions')->value('id')], [(int) $done->done_by, (int) $done->interaction_id]);
        $this->postJson("/api/admin/projects/next/{$id}/done", ['no_next' => true])->assertStatus(422)->assertJson(['message' => 'That is already done.']);

        $next = (int) DB::table('project_follow_ups')->whereNull('done_at')->value('id');
        $r = $this->postJson("/api/admin/projects/next/{$next}/done", ['no_next' => true])->assertOk()->json();
        $this->assertSame([[], 1], [$r['next'], count($r['entries'])], 'nothing more planned, said out loud; and no empty history entry');
    }

    public function test_giving_someone_a_next_action_tells_them_and_my_follow_ups_lists_mine_late_first(): void
    {
        $this->postJson("/api/admin/projects/next/lead/{$this->lead}", ['what' => 'Call back', 'due_on' => '2026-11-17', 'owner_id' => $this->kamau->id])->assertCreated();
        $this->assertSame(['Kamau', 'project_follow_up', 'Njeri gave you a next action'], end($this->sent));
        $this->postJson("/api/admin/projects/next/lead/{$this->lead}", ['what' => 'x', 'due_on' => '2026-11-17', 'owner_id' => $this->staff('Clerk')->id])->assertStatus(422);
        DB::table('project_follow_ups')->insert(['subject_type' => 'customer', 'subject_id' => 1, 'what' => 'Quarterly review', 'due_on' => '2026-11-07', 'owner_id' => $this->kamau->id, 'created_at' => now()]);

        $r = $this->as($this->kamau)->getJson('/api/admin/projects/follow-ups')->assertOk()->json();
        $this->assertSame([['Quarterly review', 'Imara Sacco', true], ['Call back', 'Tumaini Academy', false]], array_map(fn ($i) => [$i['what'], $i['subject']['name'], $i['late']], $r['items']));
        $this->assertSame(['late' => 1, 'today' => 0, 'later' => 1], $r['counts']);
        $this->assertSame('/admin/projects/clients/1', $r['items'][0]['subject']['url']);
        $this->assertSame([], $this->as($this->njeri)->getJson('/api/admin/projects/follow-ups')->json('items'), 'Njeri\'s list holds only hers');
        $this->assertSame(2, count($this->as($this->kamau)->getJson('/api/admin/projects/follow-ups?scope=all')->json('items')));
    }

    public function test_each_owner_is_reminded_once_a_day_of_what_is_due_or_late(): void
    {
        DB::table('project_follow_ups')->insert([
            ['subject_type' => 'lead', 'subject_id' => $this->lead, 'what' => 'First call', 'due_on' => '2026-11-13', 'owner_id' => $this->njeri->id, 'created_at' => now()],
            ['subject_type' => 'lead', 'subject_id' => $this->lead, 'what' => 'Send proposal', 'due_on' => '2026-11-16', 'owner_id' => $this->njeri->id, 'created_at' => now()],
            ['subject_type' => 'lead', 'subject_id' => $this->lead, 'what' => 'Site visit', 'due_on' => '2026-11-21', 'owner_id' => $this->njeri->id, 'created_at' => now()],
            ['subject_type' => 'customer', 'subject_id' => 1, 'what' => 'Review', 'due_on' => '2026-11-16', 'owner_id' => $this->kamau->id, 'created_at' => now()],
        ]);
        $this->artisan('projects:follow-up-reminders')->assertSuccessful();
        $titles = collect($this->sent)->keyBy(0);
        $this->assertSame('Your follow-ups: 1 late, 1 due today', $titles['Njeri'][2]);
        $this->assertSame('Your follow-ups: 1 due today', $titles['Kamau'][2]);
        $this->assertCount(2, $this->sent, 'one message each, not one per action');
        $this->artisan('projects:follow-up-reminders')->assertSuccessful();
        $this->assertCount(2, $this->sent, 'once a day');
        Carbon::setTestNow('2026-11-17 07:20:00');
        $this->artisan('projects:follow-up-reminders')->assertSuccessful();
        $this->assertCount(4, $this->sent, 'and again the next day while they are still open');
    }

    public function test_winning_a_lead_keeps_its_history_and_next_actions(): void
    {
        $this->app->instance(\App\Services\Projects\ClientMaker::class, new class extends \App\Services\Projects\ClientMaker {
            public function make(array $values): int
            {
                return (int) DB::table('customers')->insertGetId(['first_name' => $values['first_name'] ?? null, 'company_name' => $values['company_name'] ?? null, 'created_at' => now()]);
            }
        });
        $this->postJson("/api/admin/projects/history/lead/{$this->lead}", ['kind' => 'call', 'summary' => 'First chat'])->assertCreated();
        $this->postJson("/api/admin/projects/next/lead/{$this->lead}", ['what' => 'Site visit', 'due_on' => '2026-11-21'])->assertCreated();
        $customer = $this->postJson("/api/admin/projects/leads/{$this->lead}/client")->assertOk()->json('customer_id');
        $r = $this->getJson("/api/admin/projects/history/customer/{$customer}")->assertOk()->json();
        $this->assertSame([['First chat'], ['Site visit']], [array_column($r['entries'], 'summary'), array_column($r['next'], 'what')]);
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 6.1 (docs/PROJECTS_STAGE6_SPEC.md): conversations (team, client, others), messages through the Notifier, read state. */
class ProjectsThreadsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private int $project;
    private int $grace;
    private int $counsel;
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $sent = &$this->sent;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$contact['name'], $contact['email'], $type, $title, $message, $o['subject'] ?? null];

                return ['notification' => null, 'channels' => $contact['email'] ? ['email'] : [], 'skipped' => [], 'staff_list' => false];
            }

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.messages.internal', 'projects.messages.client']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.messages.internal']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Imara v Baraka', 'customer_id' => 1])->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->grace = (int) DB::table('project_contacts')->insertGetId(['owner_type' => 'customer', 'owner_id' => 1, 'name' => 'Grace Wambua', 'email' => 'grace@example.test', 'is_main' => 1, 'created_at' => now()]);
        $party = (int) DB::table('project_parties')->insertGetId(['name' => 'Baraka Advocates', 'kind' => 'organisation', 'created_at' => now()]);
        DB::table('project_party_links')->insert(['project_id' => $this->project, 'party_id' => $party, 'role_id' => 1, 'created_at' => now()]);
        $this->counsel = (int) DB::table('project_contacts')->insertGetId(['owner_type' => 'party', 'owner_id' => $party, 'name' => 'Opposing Counsel', 'email' => 'counsel@example.test', 'created_at' => now()]);
    }

    private function start(array $d): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/api/admin/projects/{$this->project}/threads", $d);
    }

    public function test_a_team_conversation_stays_inside_and_unread_counts_follow_each_person(): void
    {
        $t = $this->start(['subject' => 'Strategy before the mention', 'audience' => 'team', 'body' => 'We rely on the delivery note.'])->assertCreated()->json('thread');
        $this->assertSame(['team', 'open', 'Kamau', 1], [$t['audience'], $t['state'], $t['owner']['name'], count($t['messages'])]);
        $this->assertSame([], $this->sent, 'a team conversation goes to nobody outside');

        Sanctum::actingAs($this->njeri, ['*']);
        $l = $this->getJson("/api/admin/projects/{$this->project}/threads")->assertOk()->json();
        $this->assertSame([1, ['team' => 'Team']], [$l['threads'][0]['unread'], $l['audiences']], 'she may write to the team only');
        $this->getJson("/api/admin/projects/{$this->project}/threads/{$t['id']}")->assertOk();
        $this->assertSame(0, $this->getJson("/api/admin/projects/{$this->project}/threads")->json('threads.0.unread'), 'reading it marks it read');
        $this->postJson("/api/admin/projects/{$this->project}/threads/{$t['id']}/messages", ['body' => 'Agreed. I will find the driver.'])->assertCreated();

        Sanctum::actingAs($this->kamau, ['*']);
        $this->assertSame([1, 'Njeri', 'Agreed. I will find the driver.'], [$this->getJson("/api/admin/projects/{$this->project}/threads")->json('threads.0.unread'), $this->getJson("/api/admin/projects/{$this->project}/threads")->json('threads.0.last.from'), $this->getJson("/api/admin/projects/{$this->project}/threads")->json('threads.0.last.text')]);
        $this->assertSame('message.posted', DB::table('project_log')->orderByDesc('id')->value('action'));
    }

    public function test_a_client_conversation_sends_each_message_to_the_clients_contacts_through_the_notifier(): void
    {
        $t = $this->start(['subject' => 'Defence draft for review', 'audience' => 'client', 'contacts' => [$this->grace], 'body' => "Dear Grace,\nthe draft is ready for your comments."])->assertCreated()->json('thread');
        $this->assertSame(['Grace Wambua', 'grace@example.test', 'project_message'], array_slice($this->sent[0], 0, 3));
        $number = DB::table('projects')->where('id', $this->project)->value('number');
        $this->assertSame(["Defence draft for review · {$number}", "Kamau:\n\nDear Grace,\nthe draft is ready for your comments.", "Defence draft for review [{$number}]"], array_slice($this->sent[0], 3));
        $this->assertSame([['contact' => 'Grace Wambua', 'channels' => ['email']]], $t['messages'][0]['sent_to'], 'what was sent where is kept on the message');
        $this->assertSame(['Grace Wambua'], array_column($t['contacts'], 'name'));

        // owner's choice 2: a client conversation is with the client's contacts only
        $this->start(['subject' => 'X', 'audience' => 'client', 'contacts' => [$this->counsel], 'body' => 'x'])->assertStatus(422)
            ->assertJson(['message' => 'A client conversation is with the client\'s contacts only. Start an "Others" conversation for anyone else.']);
        $this->start(['subject' => 'Settlement offer', 'audience' => 'others', 'contacts' => [$this->counsel], 'body' => 'We have your offer.'])->assertCreated();
        $this->assertSame('Opposing Counsel', end($this->sent)[0]);
        $this->start(['subject' => 'X', 'audience' => 'client', 'body' => 'x'])->assertStatus(422)->assertJson(['message' => 'Choose who at the client the conversation is with.']);

        // someone with only the team permission does not see client or others conversations at all
        Sanctum::actingAs($this->njeri, ['*']);
        $this->assertSame([], $this->getJson("/api/admin/projects/{$this->project}/threads")->json('threads'));
        $this->getJson("/api/admin/projects/{$this->project}/threads/{$t['id']}")->assertNotFound();
        $this->start(['subject' => 'X', 'audience' => 'client', 'contacts' => [$this->grace], 'body' => 'x'])->assertForbidden();
    }

    public function test_closing_changing_the_owner_and_a_new_message_opening_it_again_and_frozen_work_is_read_only(): void
    {
        $t = $this->start(['subject' => 'Fees', 'audience' => 'team', 'body' => 'Fee note goes out Friday.', 'owner_id' => $this->njeri->id])->assertCreated()->json('thread');
        $this->assertSame('Njeri', $t['owner']['name']);
        $p = "/api/admin/projects/{$this->project}/threads/{$t['id']}";
        $this->putJson($p, ['state' => 'closed'])->assertOk()->assertJsonPath('thread.state', 'closed');
        $this->assertSame([], $this->getJson("/api/admin/projects/{$this->project}/threads")->json('threads'), 'closed ones are hidden by default');
        $this->assertCount(1, $this->getJson("/api/admin/projects/{$this->project}/threads?state=all")->json('threads'));
        $this->postJson("{$p}/messages", ['body' => 'One more thing.'])->assertCreated()->assertJsonPath('thread.state', 'open');
        $this->putJson($p, ['owner_id' => $this->staff('Stranger')->id])->assertStatus(422);
        $this->postJson("{$p}/messages", ['body' => '   '])->assertStatus(422);

        DB::table('projects')->where('id', $this->project)->update(['frozen_at' => now()]);
        $this->getJson($p)->assertOk()->assertJsonPath('thread.can.write', false);
        $this->postJson("{$p}/messages", ['body' => 'x'])->assertForbidden();
    }
}

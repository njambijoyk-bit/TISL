<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Notify\Replies\InboundReplies;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 6.5 (docs/PROJECTS_STAGE6_SPEC.md): replies to client conversations come back into them; what cannot be matched waits for a moderator. */
class ProjectsRepliesTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $project;
    private int $grace;
    private int $thread;
    private array $told = [];
    private array $sentWith = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-18 10:00:00');
        $this->createProjectsWorld();
        $told = &$this->told;
        $with = &$this->sentWith;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($told, $with) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$told, private array &$with) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->told[] = [$to->name, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                $this->with[] = $o['reply_route'] ?? null;

                return ['notification' => null, 'channels' => ['email'], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.messages.internal', 'projects.messages.client']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Imara v Baraka', 'customer_id' => 1])->json('project.id');
        $this->grace = DB::table('project_contacts')->insertGetId(['owner_type' => 'customer', 'owner_id' => 1, 'name' => 'Grace Wambua', 'email' => 'grace@example.test', 'phone' => '0722 000 111', 'created_at' => now()]);
        $this->thread = (int) $this->postJson("/api/admin/projects/{$this->project}/threads", ['subject' => 'Defence draft', 'audience' => 'client', 'contacts' => [$this->grace], 'body' => 'Here is the draft.'])->json('thread.id');
    }

    public function test_a_message_to_a_contact_is_answerable_and_the_reply_becomes_a_message_from_them(): void
    {
        $this->assertSame([['module' => 'projects', 'type' => 'thread', 'id' => $this->thread, 'ref' => $this->grace]], $this->sentWith);
        $this->putJson("/api/admin/projects/{$this->project}/threads/{$this->thread}", ['state' => 'closed'])->assertOk();
        $token = app(InboundReplies::class)->route('projects', 'thread', $this->thread, 'email', 'grace@example.test', (string) $this->grace);
        $this->told = [];
        $r = app(InboundReplies::class)->receive(['channel' => 'email', 'external_id' => 'm1', 'from' => 'grace@example.test', 'body' => "Paragraph 14 should say the 3rd.\n\n> Here is the draft.", 'to' => ["replies+{$token}@imara.test"]]);
        $this->assertSame('filed', $r['state']);
        $t = $this->getJson("/api/admin/projects/{$this->project}/threads/{$this->thread}")->json('thread');
        $this->assertSame(['open', 'Grace Wambua', 'contact', 'Paragraph 14 should say the 3rd.', 'email'], [$t['state'], $t['messages'][1]['from']['name'], $t['messages'][1]['from']['type'], $t['messages'][1]['body'], $t['messages'][1]['via']], 'it opens the conversation again');
        $this->assertSame([['Kamau', 'Grace Wambua replied in "Defence draft" · ' . DB::table('projects')->where('id', $this->project)->value('number')]], $this->told, 'its followers are told');

        // someone taken out of the conversation: the reply waits
        DB::table('project_thread_people')->where('contact_id', $this->grace)->delete();
        $this->assertSame('waiting', app(InboundReplies::class)->receive(['channel' => 'email', 'external_id' => 'm2', 'from' => 'grace@example.test', 'body' => 'One more thing', 'to' => ["replies+{$token}@imara.test"]])['state']);
    }

    public function test_a_moderator_files_a_waiting_reply_into_a_conversation_or_throws_it_away(): void
    {
        $lost = app(InboundReplies::class)->receive(['channel' => 'email', 'external_id' => 'm9', 'from' => 'grace@example.test', 'body' => 'Did you get my letter?', 'to' => ['info@imara.test']]);
        $spam = app(InboundReplies::class)->receive(['channel' => 'whatsapp', 'external_id' => 'w9', 'from' => '254799999999', 'body' => 'Win a prize']);
        $this->getJson('/api/admin/projects/replies/waiting')->assertForbidden();
        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.messages.internal', 'projects.messages.client', 'projects.messages.moderate']);
        $w = $this->getJson('/api/admin/projects/replies/waiting')->assertOk()->json('replies');
        $this->assertSame(['Win a prize', 'Did you get my letter?'], array_column($w, 'body'));
        $this->assertSame([['thread_id' => $this->thread, 'label' => DB::table('projects')->where('id', $this->project)->value('number') . ' · Defence draft', 'contact_id' => $this->grace, 'contact' => 'Grace Wambua']], $w[1]['matches'], 'the conversations its sender is in');
        $this->assertSame(2, $this->getJson('/api/admin/projects/inbox')->json('waiting_replies'));

        $team = (int) $this->postJson("/api/admin/projects/{$this->project}/threads", ['subject' => 'Inside', 'audience' => 'team', 'body' => 'x'])->json('thread.id');
        $this->postJson("/api/admin/projects/replies/{$lost['id']}/file", ['thread_id' => $team, 'contact_id' => $this->grace])->assertStatus(422)->assertJson(['message' => 'A reply from outside goes into a client or others conversation.']);
        $this->postJson("/api/admin/projects/replies/{$lost['id']}/file", ['thread_id' => $this->thread, 'contact_id' => 999])->assertStatus(422);
        $this->postJson("/api/admin/projects/replies/{$lost['id']}/file", ['thread_id' => $this->thread, 'contact_id' => $this->grace])->assertOk();
        $this->assertSame('Did you get my letter?', $this->getJson("/api/admin/projects/{$this->project}/threads/{$this->thread}")->json('thread.messages.1.body'));
        $this->assertSame(['filed', 'projects', $this->thread, $this->kamau->id], array_values((array) DB::table('notification_inbound')->where('id', $lost['id'])->first(['state', 'filed_module', 'filed_id', 'filed_by'])));
        $this->postJson("/api/admin/projects/replies/{$lost['id']}/file", ['thread_id' => $this->thread, 'contact_id' => $this->grace])->assertNotFound();

        $this->postJson("/api/admin/projects/replies/{$spam['id']}/discard", ['note' => 'Spam'])->assertOk()->assertJsonPath('replies', []);
    }
}

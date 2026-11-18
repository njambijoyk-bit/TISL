<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 6.2 (docs/PROJECTS_STAGE6_SPEC.md): mentions, tags, a message made into a task, editing and moderation. */
class ProjectsMentionsTagsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private int $project;
    private array $told = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-18 10:00:00');
        $this->createProjectsWorld();
        $told = &$this->told;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($told) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$told) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->told[] = [$to->name, $type, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                return ['notification' => null, 'channels' => ['email'], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.tasks', 'projects.messages.internal', 'projects.messages.client', 'projects.config.view', 'projects.config.manage']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.messages.internal']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Imara v Baraka', 'customer_id' => 1])->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function thread(string $audience = 'team'): int
    {
        $contacts = [];
        if ($audience === 'client') {
            $contacts = [DB::table('project_contacts')->insertGetId(['owner_type' => 'customer', 'owner_id' => 1, 'name' => 'Grace', 'email' => 'g@example.test', 'created_at' => now()])];
        }

        return (int) $this->postJson("/api/admin/projects/{$this->project}/threads", ['subject' => 'Strategy', 'audience' => $audience, 'contacts' => $contacts, 'body' => 'Opening the conversation.'])->json('thread.id');
    }

    public function test_mentions_tell_the_people_named_who_may_read_it_and_tags_typed_in_a_message_tag_the_conversation(): void
    {
        $t = $this->thread();
        $r = $this->postJson("/api/admin/projects/{$this->project}/threads/{$t}/messages", ['body' => '@Njeri please find the driver. #urgent #nonsense', 'mentions' => [$this->njeri->id, $this->kamau->id, 999]])->assertCreated()->json('thread');
        $this->assertSame([['Njeri', 'project_follow', 'Kamau mentioned you on ' . DB::table('projects')->where('id', $this->project)->value('number')]], $this->told, 'not the writer, not a stranger');
        $this->assertSame([$this->njeri->id], DB::table('project_message_mentions')->pluck('user_id')->map(fn ($v) => (int) $v)->all());
        $this->assertSame(['urgent'], array_column($r['tags'], 'key'), 'only tags on the company list');

        // someone without the client permission is not told about a client conversation, even when named
        $c = $this->thread('client');
        $this->told = [];
        $this->postJson("/api/admin/projects/{$this->project}/threads/{$c}/messages", ['body' => '@Njeri see this', 'mentions' => [$this->njeri->id]])->assertCreated();
        $this->assertSame([], $this->told);

        $tags = $this->getJson('/api/admin/projects/configuration/tags')->assertOk()->json('tags');
        $this->putJson("/api/admin/projects/{$this->project}/threads/{$t}/tags", ['tags' => [collect($tags)->firstWhere('key', 'decision')['id']]])->assertOk()->assertJsonPath('thread.tags.0.key', 'decision');
        $this->putJson("/api/admin/projects/{$this->project}/threads/{$t}/tags", ['tags' => [999]])->assertStatus(422);
    }

    public function test_tags_are_a_company_list_managed_in_configuration(): void
    {
        $this->assertSame(['Needs a decision', 'Sorted', 'Urgent', 'Waiting on them'], array_column($this->getJson('/api/admin/projects/configuration/tags')->json('tags'), 'name'));
        $this->postJson('/api/admin/projects/configuration/tags', ['name' => 'Court bundle', 'status' => 'info'])->assertOk();
        $this->assertSame('court-bundle', collect($this->getJson('/api/admin/projects/configuration/tags')->json('tags'))->firstWhere('name', 'Court bundle')['key']);
        $this->postJson('/api/admin/projects/configuration/tags', ['name' => 'Urgent again', 'key' => 'urgent'])->assertStatus(422)->assertJson(['message' => 'There is already a tag #urgent.']);
        $id = DB::table('project_tags')->where('key', 'done')->value('id');
        $this->putJson("/api/admin/projects/configuration/tags/{$id}", ['name' => 'Sorted', 'key' => 'done', 'is_active' => false])->assertOk();
        $this->assertFalse(collect($this->getJson('/api/admin/projects/configuration/tags')->json('tags'))->firstWhere('key', 'done')['is_active']);
        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson('/api/admin/projects/configuration/tags', ['name' => 'X'])->assertForbidden();
    }

    public function test_a_message_becomes_a_task_once_and_editing_is_for_15_minutes_or_for_moderators_with_the_original_kept(): void
    {
        $t = $this->thread();
        $m = $this->postJson("/api/admin/projects/{$this->project}/threads/{$t}/messages", ['body' => "/task Witness statement from the driver\nHe signed the delivery note."])->json('thread.messages.1.id');
        $r = $this->postJson("/api/admin/projects/{$this->project}/threads/{$t}/messages/{$m}/task")->assertCreated()->json();
        $task = DB::table('project_work_tasks')->find($r['task_id']);
        $this->assertSame(['Witness statement from the driver', $r['task_id']], [$task->title, $r['thread']['messages'][1]['task_id']]);
        $this->assertStringContainsString('He signed the delivery note.', $task->description);
        $this->postJson("/api/admin/projects/{$this->project}/threads/{$t}/messages/{$m}/task")->assertStatus(422);

        $p = "/api/admin/projects/{$this->project}/threads/{$t}/messages/{$m}";
        $this->putJson($p, ['body' => 'Witness statement from the driver, by Friday'])->assertOk()->assertJsonPath('thread.messages.1.edited', true);
        $this->assertSame("/task Witness statement from the driver\nHe signed the delivery note.", json_decode(DB::table('project_log')->where('action', 'message.edited')->value('old_values'), true)['body']);

        Carbon::setTestNow('2026-11-18 10:20:00');
        $this->putJson($p, ['body' => 'Too late'])->assertForbidden()->assertJson(['message' => 'A message can be changed for 15 minutes after it is sent. After that, ask someone who moderates messages.']);
        Sanctum::actingAs($this->njeri, ['*']);
        $this->deleteJson($p)->assertForbidden();
        $this->grant($this->njeri, ['admin.access', 'projects.use', 'projects.messages.internal', 'projects.messages.moderate']);
        $this->deleteJson($p)->assertOk()->assertJsonPath('thread.messages.1.removed.by', 'Njeri');
        $this->assertNull($this->getJson("/api/admin/projects/{$this->project}/threads/{$t}")->json('thread.messages.1.body'));

        $in = DB::table('project_thread_messages')->insertGetId(['thread_id' => $t, 'contact_id' => 1, 'body' => 'From outside', 'via' => 'email', 'created_at' => now()]);
        $this->putJson("/api/admin/projects/{$this->project}/threads/{$t}/messages/{$in}", ['body' => 'x'])->assertStatus(422)->assertJson(['message' => 'A message from a contact is kept as it came.']);
    }
}

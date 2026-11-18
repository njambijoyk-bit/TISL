<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 6.3 (docs/PROJECTS_STAGE6_SPEC.md): the inbox across all a person's work, and following work, conversations and tasks. */
class ProjectsInboxFollowTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private User $otieno;
    private int $a;
    private int $b;
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
                $this->told[] = [$to->name, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                return ['notification' => null, 'channels' => ['email'], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.tasks', 'projects.dates', 'projects.messages.internal', 'projects.messages.client']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.tasks', 'projects.messages.internal']);
        $this->otieno = $this->staff('Otieno', ['projects.use', 'projects.messages.internal']);
        Sanctum::actingAs($this->kamau, ['*']);
        $type = DB::table('project_types')->where('industry_key', 'general')->value('id');
        $this->a = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Imara v Baraka', 'customer_id' => 1])->json('project.id');
        $this->b = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Office fit-out', 'customer_id' => 1])->json('project.id');
        $this->member($this->a, $this->njeri);
        $this->member($this->b, $this->njeri);
        $this->member($this->a, $this->otieno);
    }

    private function member(int $project, User $u): void
    {
        DB::table('project_members')->insert(['project_id' => $project, 'user_id' => $u->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function thread(int $project, string $subject, string $audience = 'team', array $extra = []): int
    {
        $contacts = $audience === 'client' ? [DB::table('project_contacts')->insertGetId(['owner_type' => 'customer', 'owner_id' => 1, 'name' => 'Grace', 'email' => 'g@example.test', 'created_at' => now()])] : [];

        return (int) $this->postJson("/api/admin/projects/{$project}/threads", ['subject' => $subject, 'audience' => $audience, 'contacts' => $contacts, 'body' => "About {$subject}."] + $extra)->json('thread.id');
    }

    public function test_the_inbox_lists_conversations_across_all_the_work_a_person_is_on_with_its_filters(): void
    {
        $t1 = $this->thread($this->a, 'Defence draft');
        Carbon::setTestNow('2026-11-18 10:05:00');
        $t2 = $this->thread($this->b, 'Paint colours', 'team', ['owner_id' => $this->njeri->id]);
        $this->thread($this->a, 'Fees with Grace', 'client');
        Carbon::setTestNow('2026-11-18 10:10:00');
        $this->postJson("/api/admin/projects/{$this->a}/threads/{$t1}/messages", ['body' => '@Njeri the draft is ready #urgent', 'mentions' => [$this->njeri->id]])->assertCreated();

        Sanctum::actingAs($this->njeri, ['*']);
        $r = $this->getJson('/api/admin/projects/inbox')->assertOk()->json();
        $this->assertSame(['Defence draft', 'Paint colours'], array_column($r['threads'], 'subject'), 'newest first, both pieces of work, no client conversation without the permission');
        $this->assertSame([2, 1], array_column($r['threads'], 'unread'));
        $this->assertSame(['unread' => 2, 'mentions' => 1, 'mine' => 1], $r['totals']);
        $this->assertSame(['Defence draft'], array_column($this->getJson('/api/admin/projects/inbox?mentions=1')->json('threads'), 'subject'));
        $this->assertSame(['Paint colours'], array_column($this->getJson('/api/admin/projects/inbox?mine=1')->json('threads'), 'subject'));
        $this->assertSame(['Defence draft'], array_column($this->getJson('/api/admin/projects/inbox?tag=urgent')->json('threads'), 'subject'));
        $this->assertSame(['Paint colours'], array_column($this->getJson("/api/admin/projects/inbox?project_id={$this->b}")->json('threads'), 'subject'));
        $this->assertSame(2, $this->getJson('/api/admin/projects/inbox/count')->json('unread'));

        $this->getJson("/api/admin/projects/{$this->b}/threads/{$t2}")->assertOk();   // reading it
        $this->assertSame(['Defence draft'], array_column($this->getJson('/api/admin/projects/inbox?unread=1')->json('threads'), 'subject'));
        $this->assertSame(1, $this->getJson('/api/admin/projects/inbox/count')->json('unread'));

        $this->putJson("/api/admin/projects/{$this->b}/threads/{$t2}", ['state' => 'closed'])->assertOk();
        $this->assertSame(['Defence draft'], array_column($this->getJson('/api/admin/projects/inbox')->json('threads'), 'subject'), 'closed ones leave the default inbox');
        $this->assertSame(['Paint colours'], array_column($this->getJson('/api/admin/projects/inbox?state=closed')->json('threads'), 'subject'));

        // Otieno is on work A only; with projects.inbox.all and projects.view_all he sees B's conversations too
        Sanctum::actingAs($this->otieno, ['*']);
        $this->assertSame(['Defence draft'], array_column($this->getJson('/api/admin/projects/inbox?state=all')->json('threads'), 'subject'));
        $this->grant($this->otieno, ['admin.access', 'projects.use', 'projects.view_all', 'projects.messages.internal', 'projects.inbox.all']);
        $this->assertSame(['Defence draft', 'Paint colours'], array_column($this->getJson('/api/admin/projects/inbox?state=all')->json('threads'), 'subject'));
    }

    public function test_people_in_a_conversation_follow_it_on_their_own_anyone_can_stop_or_follow_the_whole_work(): void
    {
        $t = $this->thread($this->a, 'Defence draft');
        Sanctum::actingAs($this->njeri, ['*']);
        $this->assertSame(['on' => false, 'automatic' => false], $this->getJson("/api/admin/projects/{$this->a}/threads/{$t}")->json('thread.following'));
        $this->postJson("/api/admin/projects/{$this->a}/threads/{$t}/messages", ['body' => 'I will look at it.'])->assertCreated();
        $this->assertSame([['Kamau', "Njeri wrote in \"Defence draft\" · " . $this->number($this->a)]], $this->told, 'the one who started it hears; the writer does not');
        $this->assertSame(['on' => true, 'automatic' => true], $this->getJson("/api/admin/projects/{$this->a}/threads/{$t}")->json('thread.following'));

        // Otieno follows the whole work; Kamau stops following the conversation
        Sanctum::actingAs($this->otieno, ['*']);
        $this->putJson("/api/admin/projects/{$this->a}/follow", ['type' => 'project', 'id' => $this->a, 'on' => true])->assertOk()->assertJson(['following' => ['on' => true, 'automatic' => false]]);
        $this->assertTrue($this->getJson("/api/admin/projects/{$this->a}/threads")->json('following.on'));
        Sanctum::actingAs($this->kamau, ['*']);
        $this->putJson("/api/admin/projects/{$this->a}/follow", ['type' => 'thread', 'id' => $t, 'on' => false])->assertOk()->assertJson(['following' => ['on' => false, 'automatic' => true]]);
        $this->told = [];
        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson("/api/admin/projects/{$this->a}/threads/{$t}/messages", ['body' => 'Done, see paragraph 14.'])->assertCreated();
        $this->assertSame(['Otieno'], array_column($this->told, 0));

        // a client conversation is never told to someone who may not read it, even following the work
        $this->told = [];
        Sanctum::actingAs($this->kamau, ['*']);
        $this->putJson("/api/admin/projects/{$this->a}/follow", ['type' => 'thread', 'id' => $t, 'on' => true])->assertOk()->assertJson(['following' => ['on' => true, 'automatic' => true]]);
        $this->assertSame(0, DB::table('project_follows')->where('user_id', $this->kamau->id)->count(), 'back to what happens on its own');
        $this->thread($this->a, 'Fees', 'client');
        $this->assertSame([], $this->told);

        $this->putJson("/api/admin/projects/{$this->a}/follow", ['type' => 'thread', 'id' => 99999, 'on' => true])->assertNotFound();
        $this->putJson("/api/admin/projects/{$this->a}/follow", ['type' => 'project', 'id' => $this->b, 'on' => true])->assertNotFound();
    }

    public function test_a_task_moving_and_a_key_date_moving_tell_whoever_follows_them(): void
    {
        $task = (int) $this->postJson("/api/admin/projects/{$this->a}/tasks", ['title' => 'File the defence', 'people' => [$this->njeri->id]])->assertCreated()->json('task.id');
        $this->assertSame(['on' => true, 'automatic' => true], $this->getJson("/api/admin/projects/{$this->a}/tasks/{$task}")->json('task.following'), 'its maker follows it');
        Sanctum::actingAs($this->otieno, ['*']);
        $this->putJson("/api/admin/projects/{$this->a}/follow", ['type' => 'task', 'id' => $task, 'on' => true])->assertOk();
        Sanctum::actingAs($this->njeri, ['*']);
        $this->told = [];
        $this->postJson("/api/admin/projects/{$this->a}/tasks/{$task}/status", ['status' => 'doing'])->assertOk();
        $this->assertEqualsCanonicalizing(['Kamau', 'Otieno'], array_column($this->told, 0), 'the maker and the follower; not the person who moved it');

        Sanctum::actingAs($this->otieno, ['*']);
        $this->putJson("/api/admin/projects/{$this->a}/follow", ['type' => 'project', 'id' => $this->a, 'on' => true])->assertOk();
        Sanctum::actingAs($this->kamau, ['*']);
        $this->postJson("/api/admin/projects/{$this->a}/key-dates", ['title' => 'Hearing', 'date' => '2026-12-03'])->assertCreated();
        $k = (int) DB::table('project_key_dates')->where('title', 'Hearing')->value('id');
        $this->told = [];
        $this->putJson("/api/admin/projects/{$this->a}/key-dates/{$k}", ['date' => '2026-12-10', 'reason' => 'Court diary'])->assertOk();
        $this->assertSame([['Otieno', 'Hearing moved · ' . $this->number($this->a)]], $this->told);
    }

    private function number(int $p): string
    {
        return DB::table('projects')->where('id', $p)->value('number');
    }
}

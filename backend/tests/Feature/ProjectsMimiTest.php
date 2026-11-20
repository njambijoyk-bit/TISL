<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Ai\AiGateway;
use App\Services\Chat\Local\CallerContext;
use App\Services\Chat\Local\ResolverRegistry;
use App\Services\Chat\Local\Slots;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 12.6 (docs/PROJECTS_STAGE12_SPEC.md): Mimi answers from Projects, and weekly update drafts the lead sends or throws away. */
class ProjectsMimiTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private object $work;
    private array $sent = [];
    private array $asked = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-20 10:00:00');   // a Friday
        $this->createProjectsWorld();
        $sent = &$this->sent;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$to->name, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$contact['name'] ?? 'contact', $message];

                return ['channels' => ['email'], 'skipped' => []];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.tasks', 'projects.messages.client', 'projects.messages.internal']);
        Sanctum::actingAs($this->kamau, ['*']);
        $type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
        $this->work = DB::table('projects')->find((int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Imara website', 'customer_id' => 1, 'due_date' => '2027-01-31', 'template_id' => 0])->assertCreated()->json('project.id'));
        foreach ([[1, 'Design the home page', 'done', '2026-11-18', '2026-11-18 15:00:00'], [2, 'Write the copy', 'todo', '2026-11-17', null], [3, 'Build the shop', 'todo', '2026-11-22', null], [4, 'Test on phones', 'todo', '2026-11-26', null]] as [$n, $t, $s, $due, $done]) {
            $id = DB::table('project_work_tasks')->insertGetId(['project_id' => $this->work->id, 'number' => $n, 'title' => $t, 'status' => $s, 'priority' => 'medium', 'due_date' => $due, 'completed_at' => $done, 'sort_order' => $n, 'created_at' => now()]);
            DB::table('project_task_people')->insert(['task_id' => $id, 'user_id' => $this->kamau->id]);
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function ask(string $resolver, User $as, array $slots = []): array
    {
        $r = ResolverRegistry::all()[$resolver]->run(CallerContext::fake('staff', ['*'], 'all', $as), $slots);

        return [$r->status, $r->lines];
    }

    private function fakeAi(?string $text): void
    {
        $asked = &$this->asked;
        $this->app->instance(AiGateway::class, new class($asked, $text) extends AiGateway {
            public function __construct(private array &$asked, private ?string $text) {}

            public function run(string $purpose, ?string $system, array $messages, array $opt = []): array
            {
                $this->asked[] = [$purpose, $messages[0]['content']];
                if ($this->text === null) {
                    throw new \App\Services\Ai\AiGatewayException('No AI key is set up.', 0, false, 'none');
                }

                return ['text' => $this->text, 'blocked' => false];
            }
        });
    }

    public function test_mimi_answers_from_projects_only_what_the_person_may_open(): void
    {
        $s = (new Slots(['WNKJ-SO-'], ['M', 'P']))->extract('how is ' . strtolower($this->work->number) . ' going and order WNKJ-SO-00012');
        $this->assertSame(strtolower($this->work->number), $s['slots']['projref']);
        $this->assertSame('WNKJ-SO-00012', $s['slots']['ordref']);

        [$status, $lines] = $this->ask('projects.late', $this->kamau);
        $this->assertSame('ok', $status);
        $this->assertSame(["{$this->work->number}-T2 Write the copy · was due 17 Nov"], $lines);
        [, $lines] = $this->ask('projects.due', $this->kamau);
        $this->assertSame(["{$this->work->number}-T3 Build the shop · due 22 Nov"], $lines, 'only to Sunday');
        [$status, $lines] = $this->ask('projects.status', $this->kamau, ['projref' => strtolower($this->work->number)]);
        $this->assertSame('ok', $status);
        $this->assertStringContainsString("{$this->work->number} Imara website", $lines[0]);
        $this->assertSame('3 tasks open, 1 late · expected to end 31 Jan', $lines[1]);

        // someone not on it, without view_all, cannot ask about it; with view_all, confidential work stays hidden
        $njeri = $this->staff('Njeri', ['projects.use']);
        $this->assertSame('empty', $this->ask('projects.status', $njeri, ['projref' => $this->work->number])[0]);
        $this->assertSame('empty', $this->ask('projects.late', $njeri)[0]);
        $boss = $this->staff('Wanjiru', ['projects.use', 'projects.view_all']);
        $this->assertSame('ok', $this->ask('projects.status', $boss, ['projref' => $this->work->number])[0]);
        DB::table('projects')->where('id', $this->work->id)->update(['confidential' => 1]);
        $this->assertSame('empty', $this->ask('projects.status', $boss, ['projref' => $this->work->number])[0]);

        $this->assertSame(['projects.use', 'projects.capacity'], ResolverRegistry::all()['projects.room']->requires());
    }

    public function test_a_weekly_draft_is_written_from_the_facts_when_there_is_no_ai_and_the_lead_sends_it(): void
    {
        $this->fakeAi(null);
        DB::table('project_contacts')->insert(['owner_type' => 'customer', 'owner_id' => 1, 'name' => 'Achieng', 'email' => 'achieng@imara.test', 'is_main' => 1, 'created_at' => now()]);
        $this->artisan('projects:weekly-updates')->assertSuccessful();
        $this->assertContains(['Kamau', "Weekly update to check · {$this->work->number}"], $this->sent);
        $list = $this->getJson("/api/admin/projects/{$this->work->id}/updates")->assertOk()->json();
        $u = $list['updates'][0];
        $this->assertSame(['2026-11-16', 'draft', false], [$u['week'], $u['state'], $u['by_ai']]);
        $this->assertStringContainsString('This week we finished: Design the home page.', $u['body']);
        $this->assertStringContainsString('Next week: Test on phones.', $u['body']);
        $this->assertCount(1, $this->asked, 'the AI was asked, and the draft fell back to the facts');
        $this->assertSame(0, DB::table('project_thread_messages')->count(), 'nothing is sent by itself');

        $this->putJson("/api/admin/projects/{$this->work->id}/updates/{$u['id']}/save", ['body' => 'A good week: the home page is designed.'])->assertOk();
        $this->putJson("/api/admin/projects/{$this->work->id}/updates/{$u['id']}/send")->assertOk()->assertJsonPath('updates.0.state', 'sent');
        $thread = DB::table('project_threads')->where('project_id', $this->work->id)->first();
        $this->assertSame(['client', 'Weekly updates'], [$thread->audience, $thread->subject]);
        $this->assertSame('A good week: the home page is designed.', DB::table('project_thread_messages')->where('thread_id', $thread->id)->value('body'));
        $this->assertContains(['Achieng', "Kamau:\n\nA good week: the home page is designed."], $this->sent);
        $this->putJson("/api/admin/projects/{$this->work->id}/updates/{$u['id']}/discard")->assertStatus(422)->assertJsonPath('message', 'That update was already sent.');
        $this->artisan('projects:weekly-updates')->assertSuccessful();
        $this->assertSame(1, DB::table('project_updates')->count(), 'one a week');
    }

    public function test_the_ai_writes_the_draft_but_never_sees_confidential_work_or_sensitive_fields_unless_switched_on(): void
    {
        $this->fakeAi('Dear Imara, a good week.');
        $field = DB::table('project_fields')->insertGetId(['key' => 'board_ref', 'label' => 'Board reference', 'kind' => 'text', 'is_sensitive' => 1, 'is_active' => 1, 'sort_order' => 1]);
        DB::table('project_field_values')->insert(['project_id' => $this->work->id, 'field_id' => $field, 'value' => 'SECRET-77']);
        $this->postJson("/api/admin/projects/{$this->work->id}/updates")->assertCreated()->assertJsonPath('updates.0.body', 'Dear Imara, a good week.')->assertJsonPath('updates.0.by_ai', true);
        $this->assertSame('drafts', $this->asked[0][0]);
        $this->assertStringContainsString('Done this week: Design the home page', $this->asked[0][1]);
        $this->assertStringNotContainsString('SECRET-77', $this->asked[0][1], 'sensitive fields stay out');

        DB::table('projects')->where('id', $this->work->id)->update(['confidential' => 1]);
        $this->asked = [];
        $this->postJson("/api/admin/projects/{$this->work->id}/updates")->assertCreated()->assertJsonPath('updates.0.by_ai', false);
        $this->assertSame([], $this->asked, 'confidential work is not sent to the AI');

        $boss = $this->staff('Wanjiru', ['projects.use', 'projects.config.manage', 'projects.config.view']);
        Sanctum::actingAs($boss, ['*']);
        $this->putJson('/api/admin/projects/configuration/insights', ['settings' => ['weekly_updates' => true, 'ai_drafts' => true, 'ai_confidential' => true, 'ai_sensitive_fields' => true]])->assertOk()->assertJsonPath('settings.ai_confidential', true);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->postJson("/api/admin/projects/{$this->work->id}/updates")->assertCreated()->assertJsonPath('updates.0.by_ai', true);
        $this->assertStringContainsString('SECRET-77', $this->asked[0][1]);

        $id = DB::table('project_updates')->value('id');
        $this->putJson("/api/admin/projects/{$this->work->id}/updates/{$id}/discard")->assertOk()->assertJsonPath('updates.0.state', 'discarded');
        Sanctum::actingAs($this->staff('Otieno', ['projects.use']), ['*']);
        $this->getJson("/api/admin/projects/{$this->work->id}/updates")->assertNotFound();   // work they may not open looks like none
    }
}

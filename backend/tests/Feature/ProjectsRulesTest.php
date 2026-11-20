<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 12.5 (docs/PROJECTS_STAGE12_SPEC.md): rules (when, if, then), what they may do, the daily limit, trying a rule and the log. */
class ProjectsRulesTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $wanjiru;
    private int $type;
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-17 06:30:00');   // a Tuesday
        $this->createProjectsWorld();
        $sent = &$this->sent;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$to->name, $title, $message];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        Schema::dropIfExists('employees');
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->unsignedBigInteger('manager_id')->nullable(); });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.stage', 'projects.config.view', 'projects.rules']);
        $this->wanjiru = $this->staff('Wanjiru', ['projects.use']);
        $w = DB::table('employees')->insertGetId(['user_id' => $this->wanjiru->id]);
        DB::table('employees')->insert(['user_id' => $this->kamau->id, 'manager_id' => $w]);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function start(string $title = 'Imara website'): object
    {
        return DB::table('projects')->find((int) $this->postJson('/api/admin/projects', ['type_id' => $this->type, 'title' => $title, 'template_id' => 0])->assertCreated()->json('project.id'));
    }

    private function rule(array $d): int
    {
        $page = $this->postJson('/api/admin/projects/configuration/rules', $d + ['is_active' => true])->assertCreated()->json();

        return (int) collect($page['rules'])->firstWhere('name', $d['name'])['id'];
    }

    public function test_starter_rules_are_off_and_rules_are_checked_when_saved(): void
    {
        $page = $this->getJson('/api/admin/projects/configuration/rules')->assertOk()->json();
        $this->assertEqualsCanonicalizing(['red_tell_manager', 'missed_filing', 'late_snag', 'new_work_follow'], array_column($page['rules'], 'key'));
        $this->assertFalse(collect($page['rules'])->contains('is_active', true), 'starter rules start switched off');
        $this->assertTrue($page['can']['change']);

        $bad = fn (array $d) => $this->postJson('/api/admin/projects/configuration/rules', $d + ['name' => 'X'])->assertStatus(422)->json('message');
        $this->assertSame('Choose what starts the rule.', $bad(['trigger_event' => 'invoice_paid', 'actions' => [['do' => 'tell', 'who' => 'lead']]]));
        $this->assertSame('Add at least one thing the rule does.', $bad(['trigger_event' => 'work_started', 'actions' => []]));
        $this->assertSame('A rule may tell, make a task or a key date, add a follower, tag or flag. Nothing else.', $bad(['trigger_event' => 'work_started', 'actions' => [['do' => 'move_stage']]]));
        $this->assertSame('A rule may tell, make a task or a key date, add a follower, tag or flag. Nothing else.', $bad(['trigger_event' => 'work_started', 'actions' => [['do' => 'bill']]]));
        $this->assertSame('Choose the stage.', $bad(['trigger_event' => 'stage_entered', 'actions' => [['do' => 'tell', 'who' => 'lead']]]));
        $this->assertSame('Say after how many days late.', $bad(['trigger_event' => 'snag_late', 'trigger_value' => 'soon', 'actions' => [['do' => 'tell', 'who' => 'lead']]]));
        $this->assertSame('Name the task it makes.', $bad(['trigger_event' => 'work_started', 'actions' => [['do' => 'task', 'who' => 'lead']]]));
        $this->assertSame('An opportunity is not a piece of work yet: a rule about it can tell or flag only.', $bad(['trigger_event' => 'opportunity_moved', 'trigger_value' => 'Won', 'actions' => [['do' => 'task', 'who' => 'owner', 'title' => 'X']]]));

        Sanctum::actingAs($this->staff('Njeri', ['projects.use', 'projects.config.view']), ['*']);
        $this->getJson('/api/admin/projects/configuration/rules')->assertOk()->assertJsonPath('can.change', false);
        $this->postJson('/api/admin/projects/configuration/rules', ['name' => 'X', 'trigger_event' => 'work_started', 'actions' => [['do' => 'tell', 'who' => 'lead']]])->assertForbidden();
    }

    public function test_a_rule_runs_its_actions_when_its_event_happens_and_logs_it(): void
    {
        DB::table('project_tags')->insertOrIgnore(['key' => 'urgent', 'name' => 'Urgent', 'is_active' => 1]);
        $this->rule(['name' => 'Kick-off', 'trigger_event' => 'work_started', 'conditions' => ['industry' => 'general'], 'actions' => [
            ['do' => 'tell', 'who' => 'lead_manager', 'message' => 'New work is in.'],
            ['do' => 'task', 'who' => 'lead', 'title' => 'Book the kick-off meeting', 'days' => 2],
            ['do' => 'date', 'title' => 'First review', 'days' => 14],
            ['do' => 'follow', 'who' => 'lead_manager'],
        ]]);
        $this->rule(['name' => 'Legal only', 'trigger_event' => 'work_started', 'conditions' => ['industry' => 'legal'], 'actions' => [['do' => 'tell', 'who' => 'lead']]]);
        $work = $this->start();

        $this->assertContains(['Wanjiru', "Kick-off · {$work->number}", 'New work is in.'], $this->sent);
        $this->assertCount(1, $this->sent, 'the legal rule does not match general work');
        $task = DB::table('project_work_tasks')->where('project_id', $work->id)->where('title', 'Book the kick-off meeting')->first();
        $this->assertSame('2026-11-19', substr((string) $task->due_date, 0, 10));
        $this->assertTrue(DB::table('project_task_people')->where('task_id', $task->id)->where('user_id', $this->kamau->id)->exists());
        $this->assertSame('2026-12-01', substr((string) DB::table('project_key_dates')->where('project_id', $work->id)->where('title', 'First review')->value('starts_at'), 0, 10));
        $this->assertTrue(DB::table('project_follows')->where('user_id', $this->wanjiru->id)->where('subject_type', 'project')->where('subject_id', $work->id)->exists());
        $run = DB::table('project_rule_runs')->where('project_id', $work->id)->first();
        $this->assertSame('done', $run->outcome);
        $this->assertCount(4, json_decode($run->done, true));
        $this->assertTrue(DB::table('project_log')->where('project_id', $work->id)->where('action', 'rule.ran')->exists());
    }

    public function test_stage_and_missed_date_rules_match_their_value(): void
    {
        $work = $this->start();
        $stages = DB::table('project_stages')->where('type_id', $this->type)->whereNull('deleted_at')->orderBy('sort_order')->get();
        $next = $stages->first(fn ($s) => $s->state === 'open' && (int) $s->id !== (int) $work->stage_id);
        $this->rule(['name' => 'Entered', 'trigger_event' => 'stage_entered', 'trigger_value' => $next->name, 'actions' => [['do' => 'tell', 'who' => 'lead', 'message' => 'Moved on.']]]);
        $this->rule(['name' => 'Filing missed', 'trigger_event' => 'date_missed', 'trigger_value' => 'filing', 'actions' => [['do' => 'task', 'who' => 'lead', 'title' => 'Explain the missed filing date', 'days' => 1]]]);
        $this->putJson("/api/admin/projects/{$work->id}/stage", ['stage_id' => $next->id])->assertOk();
        $this->assertContains(['Kamau', "Entered · {$work->number}", 'Moved on.'], $this->sent);

        foreach (['filing' => 'Filing deadline', 'meeting' => 'Site meeting'] as $kind => $title) {
            DB::table('project_key_dates')->insert(['project_id' => $work->id, 'kind' => $kind, 'title' => $title, 'starts_at' => '2026-11-14 00:00:00', 'all_day' => 1, 'state' => 'open', 'responsible_id' => $this->kamau->id, 'created_at' => now()]);
        }
        $this->artisan('projects:key-date-warnings')->assertSuccessful();
        $this->assertSame(1, DB::table('project_work_tasks')->where('project_id', $work->id)->where('title', 'Explain the missed filing date')->count(), 'the meeting kind does not start it');
    }

    public function test_rules_do_not_start_themselves_keep_to_their_daily_limit_and_can_be_tried(): void
    {
        $id = $this->rule(['name' => 'Each task', 'trigger_event' => 'work_started', 'max_per_day' => 2, 'actions' => [['do' => 'tell', 'who' => 'lead']]]);
        $this->start('One');
        $this->start('Two');
        $this->start('Three');
        $this->assertSame(2, DB::table('project_rule_runs')->where('rule_id', $id)->where('outcome', 'done')->count());
        $this->assertSame('Reached its runs for today.', DB::table('project_rule_runs')->where('rule_id', $id)->where('outcome', 'skipped')->value('note'));

        // trying: what it would have done in the last 30 days, without doing it
        $before = DB::table('project_rule_runs')->count();
        $tried = $this->postJson("/api/admin/projects/configuration/rules/{$id}/try")->assertOk()->json();
        $this->assertSame(3, $tried['runs']);
        $this->assertCount(3, $tried['examples']);
        $this->assertSame($before, DB::table('project_rule_runs')->count(), 'trying a rule does nothing');

        // the morning: a task that went late yesterday starts task_late
        $work = DB::table('projects')->where('title', 'One')->first();
        DB::table('project_work_tasks')->insert(['project_id' => $work->id, 'number' => 9, 'title' => 'Draft the plan', 'status' => 'todo', 'priority' => 'medium', 'due_date' => '2026-11-16', 'sort_order' => 9, 'created_at' => now()]);
        $this->rule(['name' => 'Late', 'trigger_event' => 'task_late', 'actions' => [['do' => 'tell', 'who' => 'lead_manager']]]);
        $this->sent = [];
        $this->artisan('projects:rules-morning')->assertSuccessful();
        $this->assertSame([['Wanjiru', "Late · {$work->number}", 'Draft the plan']], $this->sent);
    }
}

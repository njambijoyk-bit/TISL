<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 5.2 (docs/PROJECTS_STAGE5_SPEC.md): tasks on people's calendars, task notices, the daily reminder and saved views. */
class ProjectsTaskViewsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private int $project;
    private string $number;
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-17 09:00:00');
        $this->createProjectsWorld();
        Schema::create('calendar_entries', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->unsignedBigInteger('resource_id')->nullable(); $t->string('source_type'); $t->unsignedBigInteger('source_id')->nullable();
            $t->string('kind'); $t->string('title'); $t->dateTime('starts_at'); $t->dateTime('ends_at')->nullable(); $t->boolean('all_day')->default(false); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable();
            $t->string('status')->nullable(); $t->string('visibility')->default('team'); $t->string('url')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        $sent = &$this->sent;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$to->name, $type, $title, $message];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.tasks']);
        $this->njeri = $this->staff('Njeri', ['projects.use']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Stock system', 'customer_id' => 1])->json('project.id');
        $this->number = (string) DB::table('projects')->where('id', $this->project)->value('number');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function task(array $d): array
    {
        return $this->postJson("/api/admin/projects/{$this->project}/tasks", $d)->assertCreated()->json('task');
    }

    private function entries(): array
    {
        return DB::table('calendar_entries')->where('source_type', 'project_task')->orderBy('user_id')->get()->map(fn ($e) => [$e->user_id, $e->title, substr($e->starts_at, 0, 10), $e->status])->all();
    }

    public function test_a_task_with_a_due_date_is_on_each_persons_calendar_and_follows_it(): void
    {
        $t = $this->task(['title' => 'Draft the plan', 'due_date' => '2026-11-20', 'people' => [$this->kamau->id, $this->njeri->id]]);
        $title = "{$this->number}-T1 · Draft the plan";
        $this->assertSame([[$this->kamau->id, $title, '2026-11-20', 'todo'], [$this->njeri->id, $title, '2026-11-20', 'todo']], $this->entries());
        $this->assertSame("/admin/projects/{$this->project}?tab=work&task={$t['id']}", DB::table('calendar_entries')->value('url'));

        $p = "/api/admin/projects/{$this->project}/tasks/{$t['id']}";
        $this->putJson($p, ['due_date' => '2026-11-25', 'people' => [$this->njeri->id]])->assertOk();
        $this->assertSame([[$this->njeri->id, $title, '2026-11-25', 'todo']], $this->entries(), 'it moves with the date and leaves whoever is taken off');
        $this->postJson("{$p}/status", ['status' => 'done'])->assertOk();
        $this->assertSame('done', $this->entries()[0][3], 'a finished task stays on its day as a record');
        $this->putJson($p, ['due_date' => null])->assertOk();
        $this->assertSame([], $this->entries());

        $u = $this->task(['title' => 'Order parts', 'due_date' => '2026-11-21', 'people' => [$this->njeri->id]]);
        $this->postJson("/api/admin/projects/{$this->project}/tasks/{$u['id']}/status", ['status' => 'cancelled'])->assertOk();
        $this->assertSame([], $this->entries(), 'a cancelled task comes off');
        $w = $this->task(['title' => 'Test it', 'due_date' => '2026-11-22', 'people' => [$this->njeri->id]]);
        $this->deleteJson("/api/admin/projects/{$this->project}/tasks/{$w['id']}")->assertOk();
        $this->assertSame([], $this->entries());

        // Core's refresh of a calendar keeps them, and still sweeps away the old module's task entries
        $this->task(['title' => 'Train staff', 'due_date' => '2026-11-26', 'people' => [$this->njeri->id]]);
        DB::table('calendar_entries')->where('source_type', 'project_task')->delete();
        DB::table('calendar_entries')->insert(['user_id' => $this->njeri->id, 'source_type' => 'task', 'source_id' => 99, 'kind' => 'task', 'title' => 'An old task', 'starts_at' => '2026-11-24 00:00:00']);
        $this->assertStringContainsString('ProjectTaskCalendar::class)->refreshFor($user, $from, $to)', file_get_contents(app_path('Services/Calendar/CalendarService.php')));
        $kept = app(\App\Services\Projects\ProjectTaskCalendar::class)->refreshFor($this->njeri, Carbon::parse('2026-11-01'), Carbon::parse('2026-11-30'));
        $this->assertCount(1, $kept);
        $this->assertSame([[$this->njeri->id, "{$this->number}-T4 · Train staff", '2026-11-26', 'todo']], $this->entries());
    }

    public function test_people_hear_when_given_a_task_when_what_it_waits_for_is_done_and_each_morning_what_is_due_or_late(): void
    {
        $a = $this->task(['title' => 'Survey', 'people' => [$this->kamau->id]]);
        $this->assertSame([], $this->sent, 'nobody is told they gave themselves a task');
        $b = $this->task(['title' => 'Design', 'waits_for' => [$a['id']], 'people' => [$this->njeri->id], 'due_date' => '2026-11-18']);
        $this->assertSame(['Njeri', 'project_task', "Kamau gave you a task on {$this->number}", "{$this->number}-T2 Design, due 18 Nov 2026."], $this->sent[0]);
        $this->putJson("/api/admin/projects/{$this->project}/tasks/{$b['id']}", ['title' => 'Design it', 'people' => [$this->njeri->id]])->assertOk();
        $this->assertCount(1, $this->sent, 'someone already on it is not told again');

        $this->postJson("/api/admin/projects/{$this->project}/tasks/{$a['id']}/status", ['status' => 'done'])->assertOk();
        $this->assertSame(['Njeri', 'project_task', "{$this->number}-T1 is done", "{$this->number}-T2 Design it was waiting for it."], $this->sent[1]);

        $c = $this->task(['title' => 'Old one', 'people' => [$this->njeri->id], 'due_date' => '2026-11-16']);
        $this->task(['title' => 'Far off', 'people' => [$this->njeri->id], 'due_date' => '2026-12-30']);
        $this->sent = [];
        $this->assertSame(1, app(\App\Services\Projects\ProjectTasks::class)->remind());
        $this->assertSame(['Njeri', 'project_task', 'A task of yours is late'], array_slice($this->sent[0], 0, 3));
        $this->assertSame("Due tomorrow:\n{$this->number}-T2 Design it\n\nLate since yesterday:\n{$this->number}-T3 Old one", $this->sent[0][3]);
        $this->postJson("/api/admin/projects/{$this->project}/tasks/{$c['id']}/status", ['status' => 'done'])->assertOk();
        $this->sent = [];
        app(\App\Services\Projects\ProjectTasks::class)->remind();
        $this->assertSame('A task of yours is due tomorrow', $this->sent[0][2], 'a finished task is not mentioned');
        $this->artisan('projects:task-reminders')->assertSuccessful();
        $this->assertContains('project_task', \App\Services\Notify\NotificationTypes::keys());
    }

    public function test_saved_views_are_each_persons_own_and_keep_only_known_settings(): void
    {
        $r = $this->postJson('/api/admin/projects/saved-views/work', ['name' => 'My overdue', 'settings' => ['mine' => true, 'overdue' => true, 'view' => 'board', 'colour' => 'red', 'status' => '']])->assertCreated()->json();
        $this->assertSame([['name' => 'My overdue', 'settings' => ['mine' => true, 'overdue' => true, 'view' => 'board']]], array_map(fn ($v) => ['name' => $v['name'], 'settings' => $v['settings']], $r['views']));
        $this->postJson('/api/admin/projects/saved-views/work', ['name' => 'My overdue', 'settings' => ['view' => 'timeline']])->assertCreated()->assertJsonPath('views.0.settings', ['view' => 'timeline']);
        $this->assertSame(1, DB::table('project_saved_views')->count(), 'the same name replaces it');
        $this->postJson('/api/admin/projects/saved-views/work', ['name' => ' '])->assertStatus(422);
        $this->postJson('/api/admin/projects/saved-views/nowhere', ['name' => 'X'])->assertNotFound();

        Sanctum::actingAs($this->njeri, ['*']);
        $this->assertSame([], $this->getJson('/api/admin/projects/saved-views/work')->assertOk()->json('views'));
        $this->deleteJson('/api/admin/projects/saved-views/work/' . $r['id'])->assertNotFound();
        Sanctum::actingAs($this->kamau, ['*']);
        $this->deleteJson('/api/admin/projects/saved-views/work/' . $r['id'])->assertOk()->assertJsonPath('views', []);
    }
}

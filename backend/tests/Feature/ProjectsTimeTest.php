<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 5.6 (docs/PROJECTS_STAGE5_SPEC.md): time entries, rounding, the Attendance check, someone else's time, and the timer. */
class ProjectsTimeTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private int $project;
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-17 15:00:00');
        $this->createProjectsWorld();
        Schema::create('attendance_days', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->date('work_date'); $t->string('status')->default('present'); $t->integer('minutes_worked')->default(0); });
        $sent = &$this->sent;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$to->name, $type, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.tasks', 'projects.time.log']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.time.log']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Stock system', 'customer_id' => 1])->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function log(array $d): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/admin/projects/time', $d + ['project_id' => $this->project]);
    }

    public function test_time_is_rounded_up_to_the_companys_step_and_billable_follows_the_task_or_the_setting(): void
    {
        $task = $this->postJson("/api/admin/projects/{$this->project}/tasks", ['title' => 'Internal review', 'billable' => false])->json('task.id');
        $this->assertSame(48, $this->log(['minutes' => 43, 'work_date' => '2026-11-17'])->assertCreated()->json('minutes'), 'up to the next 6 minutes');
        $this->assertSame(90, $this->log(['hours' => 1.5, 'task_id' => $task])->assertCreated()->json('minutes'));
        $rows = DB::table('project_time')->orderBy('id')->get();
        $this->assertSame([[1, 'draft', 'manual'], [0, 'draft', 'manual']], $rows->map(fn ($r) => [(int) $r->billable, $r->state, $r->source])->all(), 'billable as the setting, then as the task says');

        app(\App\Services\Projects\ProjectSettings::class)->save('work', ['rounding' => 0], $this->kamau);
        $this->assertSame(43, $this->log(['minutes' => 43])->json('minutes'));
        $this->log(['minutes' => 0])->assertStatus(422);
        $this->log(['minutes' => 25 * 60])->assertStatus(422);
        $this->log(['minutes' => 30, 'work_date' => '2026-11-20'])->assertStatus(422)->assertJson(['message' => 'Time is logged on the day it was worked, not ahead of it.']);

        $l = $this->getJson("/api/admin/projects/{$this->project}/time")->assertOk()->json();
        $this->assertSame([181, 91], [$l['totals']['minutes'], $l['totals']['billable']]);
        $this->assertSame([true, false], [$l['can']['log'], $l['can']['others']]);
    }

    public function test_time_beyond_what_attendance_says_is_warned_or_refused_as_the_setting_says(): void
    {
        DB::table('attendance_days')->insert([['user_id' => $this->kamau->id, 'work_date' => '2026-11-17', 'status' => 'present', 'minutes_worked' => 300], ['user_id' => $this->kamau->id, 'work_date' => '2026-11-16', 'status' => 'leave', 'minutes_worked' => 0]]);
        $this->assertSame([], $this->log(['minutes' => 240])->assertCreated()->json('warnings'));
        $this->assertSame(['That makes 6h logged on Tue 17 Nov, more than the 5h Attendance says was worked.'], $this->log(['minutes' => 120])->assertCreated()->json('warnings'));
        $this->assertSame(['Attendance has Kamau as leave on Mon 16 Nov.'], $this->log(['minutes' => 60, 'work_date' => '2026-11-16'])->json('warnings'));

        app(\App\Services\Projects\ProjectSettings::class)->save('work', ['attendance_check' => 'refuse'], $this->kamau);
        $this->log(['minutes' => 30])->assertStatus(422)->assertJsonPath('attendance.0', 'That makes 6h 30m logged on Tue 17 Nov, more than the 5h Attendance says was worked.');
        app(\App\Services\Projects\ProjectSettings::class)->save('work', ['attendance_check' => 'off'], $this->kamau);
        $this->assertSame([], $this->log(['minutes' => 30])->json('warnings'));
    }

    public function test_someone_elses_time_needs_the_permission_and_a_reason_and_submitted_time_is_not_changed(): void
    {
        $this->log(['minutes' => 30, 'user_id' => $this->njeri->id])->assertForbidden();
        $this->grant($this->kamau, ['admin.access', 'projects.use', 'projects.time.log', 'projects.time.others']);
        $this->log(['minutes' => 30, 'user_id' => $this->njeri->id])->assertStatus(422)->assertJson(['message' => "Say why you are logging someone else's time."]);
        $this->log(['minutes' => 30, 'user_id' => $this->staff('Stranger')->id, 'reason' => 'x'])->assertStatus(422);
        $id = $this->log(['minutes' => 30, 'user_id' => $this->njeri->id, 'reason' => 'She was on site without her phone'])->assertCreated()->json('id');
        $e = DB::table('project_time')->find($id);
        $this->assertSame([$this->njeri->id, $this->kamau->id], [(int) $e->user_id, (int) $e->entered_by]);
        $this->assertSame('She was on site without her phone', DB::table('project_log')->where('action', 'time.logged')->orderByDesc('id')->value('reason'));

        $this->putJson("/api/admin/projects/time/{$id}", ['minutes' => 60])->assertStatus(422);
        $this->putJson("/api/admin/projects/time/{$id}", ['minutes' => 60, 'reason' => 'Corrected from her notes'])->assertOk();
        DB::table('project_time')->where('id', $id)->update(['state' => 'submitted']);
        Sanctum::actingAs($this->njeri, ['*']);
        $this->putJson("/api/admin/projects/time/{$id}", ['minutes' => 90])->assertStatus(422)->assertJson(['message' => 'This time is submitted. It can be changed once it is sent back.']);
        DB::table('project_time')->where('id', $id)->update(['state' => 'approved']);
        $this->deleteJson("/api/admin/projects/time/{$id}")->assertStatus(422)->assertJson(['message' => 'This time is approved, so it is fixed.']);
        $this->assertSame(1, count($this->getJson("/api/admin/projects/{$this->project}/time")->json('entries')), 'she sees her own');

        $outsider = $this->staff('Outsider', ['projects.use', 'projects.time.log', 'projects.view_all']);
        Sanctum::actingAs($outsider, ['*']);
        $this->log(['minutes' => 30])->assertForbidden();
    }

    public function test_the_timer_makes_an_entry_when_stopped_one_runs_at_a_time_and_a_forgotten_one_stops_at_the_cap(): void
    {
        $task = $this->postJson("/api/admin/projects/{$this->project}/tasks", ['title' => 'Draft the plan'])->json('task.id');
        $t = $this->postJson('/api/admin/projects/timer', ['project_id' => $this->project, 'task_id' => $task, 'note' => 'First draft'])->assertCreated()->json('timer');
        $this->assertSame([$task, 0], [$t['task_id'], $t['seconds']]);
        Carbon::setTestNow('2026-11-17 15:41:00');
        $this->assertSame(2460, $this->getJson('/api/admin/projects/timer')->json('timer.seconds'));
        $r = $this->postJson('/api/admin/projects/timer', ['project_id' => $this->project])->assertCreated()->json();
        $this->assertSame([42, false], [$r['stopped']['minutes'], $r['stopped']['capped']], 'starting another stops the first: 41 minutes, up to 42');
        $this->assertSame(['timer', 'First draft', $task], [DB::table('project_time')->value('source'), DB::table('project_time')->value('note'), (int) DB::table('project_time')->value('task_id')]);

        Carbon::setTestNow('2026-11-17 16:00:00');
        $this->postJson('/api/admin/projects/timer/stop')->assertOk()->assertJsonPath('stopped.minutes', 24);
        $this->postJson('/api/admin/projects/timer/stop')->assertStatus(422)->assertJson(['message' => 'No timer is running.']);

        // left running overnight: stopped at the 10 hour cap by the hourly sweep, and the person is told
        $this->postJson('/api/admin/projects/timer', ['project_id' => $this->project])->assertCreated();
        Carbon::setTestNow('2026-11-18 03:00:00');
        $this->assertSame(1, app(\App\Services\Projects\ProjectTime::class)->stopForgotten());
        $this->assertSame(600, (int) DB::table('project_time')->orderByDesc('id')->value('minutes'));
        $this->assertSame([['Kamau', 'project_timesheet', 'Your timer was left running']], $this->sent);
        $this->assertNull($this->getJson('/api/admin/projects/timer')->json('timer'));
        $this->artisan('projects:stop-timers')->assertSuccessful();

        $this->postJson('/api/admin/projects/timer', ['project_id' => $this->project])->assertCreated();
        $this->deleteJson('/api/admin/projects/timer')->assertOk();
        $this->assertSame(3, DB::table('project_time')->count(), 'a discarded timer makes no entry');
    }
}

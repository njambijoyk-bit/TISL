<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 5.7 (docs/PROJECTS_STAGE5_SPEC.md): weekly timesheets, submitting, approving or sending back, reopening, reminders. */
class ProjectsTimesheetsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;   // the lead: approves time on the work
    private User $njeri;   // a member: logs time
    private int $project;
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-19 12:00:00');   // a Thursday
        $this->createProjectsWorld();
        Schema::create('attendance_days', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->date('work_date'); $t->string('status')->default('present'); $t->integer('minutes_worked')->default(0); });
        Schema::create('employees', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->unsignedBigInteger('manager_id')->nullable(); });
        $sent = &$this->sent;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$to->name, $type, $title, $message];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.time.log', 'projects.time.approve']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.time.log', 'projects.time.approve']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Stock system', 'customer_id' => 1])->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        Sanctum::actingAs($this->njeri, ['*']);
        foreach ([['2026-11-16', 120], ['2026-11-16', 30], ['2026-11-17', 240], ['2026-11-10', 60]] as [$d, $m]) {
            $this->postJson('/api/admin/projects/time', ['project_id' => $this->project, 'work_date' => $d, 'minutes' => $m])->assertCreated();
        }
        DB::table('attendance_days')->insert(['user_id' => $this->njeri->id, 'work_date' => '2026-11-16', 'minutes_worked' => 480]);
    }

    private function ids(string $state = null): array
    {
        return DB::table('project_time')->when($state, fn ($q) => $q->where('state', $state))->whereBetween('work_date', ['2026-11-16', '2026-11-22'])->orderBy('id')->pluck('id')->map(fn ($v) => (int) $v)->all();
    }

    public function test_a_week_is_a_grid_by_day_with_attendance_and_submitting_it_locks_it_and_tells_the_approver(): void
    {
        $w = $this->getJson('/api/admin/projects/timesheet?week=2026-11-18')->assertOk()->json();
        $this->assertSame(['2026-11-16', '2026-11-22', 'open', true], [$w['from'], $w['to'], $w['state'], $w['can']['submit']]);
        $this->assertSame([150, 240, 0, 0, 0, 0, 0], $w['lines'][0]['days']);
        $this->assertSame(['status' => 'present', 'minutes' => 480], $w['attendance'][0]);

        $this->postJson('/api/admin/projects/timesheet/submit', ['week' => '2026-11-16'])->assertOk()->assertJsonPath('submitted', 3)->assertJsonPath('state', 'submitted');
        $this->assertSame(1, DB::table('project_time')->where('state', 'draft')->count(), 'the week before is not touched');
        $this->assertSame(['Kamau', 'project_timesheet', 'Njeri submitted their time', 'Week of 16 Nov 2026: 3 entries to approve.'], $this->sent[0]);
        $this->assertCount(1, $this->sent, 'Njeri approves time too, but not her own, so only Kamau is told');
        $this->putJson('/api/admin/projects/time/' . $this->ids()[0], ['minutes' => 10])->assertStatus(422);
        $this->postJson('/api/admin/projects/timesheet/submit', ['week' => '2026-11-16'])->assertStatus(422)->assertJson(['message' => 'Nothing in this week is waiting to be submitted.']);
    }

    public function test_the_lead_approves_or_sends_back_and_nobody_approves_their_own(): void
    {
        $this->postJson('/api/admin/projects/timesheet/submit', ['week' => '2026-11-16'])->assertOk();
        $this->assertSame(0, $this->getJson('/api/admin/projects/timesheet/approvals')->json('count'), 'not her own');
        $this->postJson('/api/admin/projects/timesheet/approvals', ['ids' => $this->ids()])->assertForbidden()->assertJson(['message' => 'Someone else approves your own time.']);

        Sanctum::actingAs($this->kamau, ['*']);
        $a = $this->getJson('/api/admin/projects/timesheet/approvals')->assertOk()->json();
        $this->assertSame([3, 'Njeri', 390], [$a['count'], $a['people'][0]['person'], $a['people'][0]['minutes']]);
        [$one, $two, $three] = $this->ids();
        $this->postJson('/api/admin/projects/timesheet/approvals', ['ids' => [$one, $two]])->assertOk()->assertJsonPath('done', 2)->assertJsonPath('count', 1);
        $this->postJson('/api/admin/projects/timesheet/approvals', ['ids' => [$three], 'step' => 'return', 'note' => ''])->assertStatus(422);
        $this->sent = [];
        $this->postJson('/api/admin/projects/timesheet/approvals', ['ids' => [$three], 'step' => 'return', 'note' => 'Tuesday was a public holiday'])->assertOk();
        $this->assertSame(['Njeri', 'project_timesheet', 'Kamau sent some of your time back', '1 entry needs changing: Tuesday was a public holiday'], $this->sent[0]);
        $this->postJson('/api/admin/projects/timesheet/approvals', ['ids' => [$one]])->assertStatus(422)->assertJson(['message' => 'Only submitted time is approved or sent back.']);

        Sanctum::actingAs($this->njeri, ['*']);
        $w = $this->getJson('/api/admin/projects/timesheet?week=2026-11-16')->json();
        $this->assertSame(['returned', 'Tuesday was a public holiday'], [$w['state'], collect($w['lines'][0]['entries'])->firstWhere('id', $three)['return_note']]);
        $this->putJson("/api/admin/projects/time/{$three}", ['minutes' => 60])->assertOk();
        $this->putJson("/api/admin/projects/time/{$one}", ['minutes' => 60])->assertStatus(422)->assertJson(['message' => 'This time is approved, so it is fixed.']);
        $this->postJson('/api/admin/projects/timesheet/submit', ['week' => '2026-11-16'])->assertOk()->assertJsonPath('submitted', 1);
    }

    public function test_with_the_manager_setting_the_persons_manager_approves_and_approved_time_is_reopened_only_with_a_reason_and_not_once_billed(): void
    {
        app(\App\Services\Projects\ProjectSettings::class)->save('work', ['approve_by' => 'manager'], $this->kamau);
        $amina = $this->staff('Amina', ['projects.use', 'projects.time.approve']);
        DB::table('employees')->insert([['id' => 1, 'user_id' => $amina->id, 'manager_id' => null], ['id' => 2, 'user_id' => $this->njeri->id, 'manager_id' => 1]]);
        $this->postJson('/api/admin/projects/timesheet/submit', ['week' => '2026-11-16'])->assertOk();
        $this->assertSame('Amina', $this->sent[0][0], 'her manager is told, not the lead');

        Sanctum::actingAs($this->kamau, ['*']);
        $this->assertSame(0, $this->getJson('/api/admin/projects/timesheet/approvals')->json('count'));
        Sanctum::actingAs($amina, ['*']);
        $this->assertSame(3, $this->getJson('/api/admin/projects/timesheet/approvals')->json('count'));
        $this->assertSame('Njeri', $this->getJson('/api/admin/projects/timesheet?week=2026-11-16&user_id=' . $this->njeri->id)->assertOk()->json('person.name'), 'a manager may read the week');
        $this->postJson('/api/admin/projects/timesheet/approvals', ['ids' => $this->ids()])->assertOk();

        [$one, $two] = $this->ids();
        $this->postJson("/api/admin/projects/time/{$one}/reopen", ['reason' => ''])->assertStatus(422);
        $this->postJson("/api/admin/projects/time/{$one}/reopen", ['reason' => 'Booked to the wrong work'])->assertOk();
        $this->assertSame(['returned', 'Booked to the wrong work'], [DB::table('project_time')->where('id', $one)->value('state'), DB::table('project_time')->where('id', $one)->value('return_note')]);
        DB::table('project_time')->where('id', $two)->update(['billed_voucher_id' => 77]);
        $this->postJson("/api/admin/projects/time/{$two}/reopen", ['reason' => 'x'])->assertStatus(422)->assertJson(['message' => 'This time is on a bill. Cancel the bill in Books first.']);
    }

    public function test_on_monday_people_hear_about_last_weeks_time_and_time_waiting_for_them(): void
    {
        DB::table('project_time')->whereIn('id', [$this->ids()[0]])->update(['state' => 'submitted']);
        Carbon::setTestNow('2026-11-23 10:00:00');
        $this->sent = [];
        $this->assertSame(2, app(\App\Services\Projects\ProjectTimesheets::class)->remind());
        $this->assertSame([['Njeri', 'Your time is not submitted'], ['Kamau', 'Time waits for you to approve']], array_map(fn ($s) => [$s[0], $s[2]], $this->sent));
        $this->assertSame('3 entries from 10 Nov still wait for you to submit them.', $this->sent[0][3]);
        $this->artisan('projects:timesheet-reminders')->assertSuccessful();
    }
}

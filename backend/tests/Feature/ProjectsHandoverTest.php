<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 6.8 (docs/PROJECTS_STAGE6_SPEC.md): handing one person's work over to someone else, all or some, on one piece of work or all. */
class ProjectsHandoverTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private User $otieno;
    private int $a;
    private int $b;
    private array $told = [];
    private array $ids = [];

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
                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.members.manage', 'projects.tasks', 'projects.dates', 'projects.messages.internal', 'projects.config.view', 'projects.config.actions', 'projects.approve']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.tasks', 'projects.messages.internal']);
        $this->otieno = $this->staff('Otieno', ['projects.use', 'projects.tasks', 'projects.messages.internal']);
        Sanctum::actingAs($this->kamau, ['*']);
        $type = DB::table('project_types')->where('industry_key', 'general')->value('id');
        $this->a = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Imara v Baraka', 'customer_id' => 1])->json('project.id');
        $this->b = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Office fit-out', 'customer_id' => 1])->json('project.id');
        $this->member($this->a, $this->njeri);
        $this->member($this->b, $this->njeri);
        $this->member($this->a, $this->otieno);

        $this->ids['task'] = (int) $this->postJson("/api/admin/projects/{$this->a}/tasks", ['title' => 'File the defence', 'people' => [$this->njeri->id]])->json('task.id');
        $this->ids['done'] = (int) $this->postJson("/api/admin/projects/{$this->a}/tasks", ['title' => 'Old one', 'people' => [$this->njeri->id]])->json('task.id');
        DB::table('project_work_tasks')->where('id', $this->ids['done'])->update(['status' => 'done']);
        $this->ids['taskB'] = (int) $this->postJson("/api/admin/projects/{$this->b}/tasks", ['title' => 'Measure the office', 'people' => [$this->njeri->id]])->json('task.id');
        $this->postJson("/api/admin/projects/{$this->a}/key-dates", ['title' => 'Hearing', 'date' => '2026-12-03', 'responsible_id' => $this->njeri->id])->assertCreated();
        $this->ids['date'] = (int) DB::table('project_key_dates')->where('title', 'Hearing')->value('id');
        DB::table('project_key_dates')->where('id', $this->ids['date'])->update(['responsible_id' => $this->njeri->id]);
        $this->ids['thread'] = DB::table('project_threads')->insertGetId(['project_id' => $this->a, 'subject' => 'Strategy', 'audience' => 'team', 'owner_id' => $this->njeri->id, 'state' => 'open', 'created_at' => now(), 'updated_at' => now()]);
        $this->ids['meeting'] = DB::table('project_meetings')->insertGetId(['project_id' => $this->a, 'title' => 'Case review', 'starts_at' => '2026-11-20 10:00:00', 'ends_at' => '2026-11-20 11:00:00', 'audience' => 'team', 'organiser_id' => $this->njeri->id, 'state' => 'planned', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('project_meeting_people')->insert(['meeting_id' => $this->ids['meeting'], 'user_id' => $this->njeri->id, 'response' => 'yes']);
        $this->ids['follow_up'] = DB::table('project_follow_ups')->insertGetId(['subject_type' => 'customer', 'subject_id' => 1, 'what' => 'Call about fees', 'due_on' => '2026-11-25', 'owner_id' => $this->njeri->id, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function member(int $project, User $u): void
    {
        DB::table('project_members')->insert(['project_id' => $project, 'user_id' => $u->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function preview(array $q): array
    {
        return $this->getJson('/api/admin/projects/handover/preview?' . http_build_query($q))->assertOk()->json();
    }

    public function test_the_preview_lists_what_would_move_and_where_the_new_person_is_not_on_the_work(): void
    {
        $r = $this->preview(['from' => $this->njeri->id, 'to' => $this->otieno->id]);
        $this->assertTrue($r['serious']);
        $this->assertSame([[$this->a, null], [$this->b, 'Otieno is not on this work. Add them first.']], array_map(fn ($p) => [$p['project']['id'], $p['blocked']], $r['projects']));
        $this->assertSame([['task', $this->ids['task']], ['date', $this->ids['date']], ['thread', $this->ids['thread']], ['meeting', $this->ids['meeting']], ['follow_up', $this->ids['follow_up']]],
            array_map(fn ($i) => [$i['kind'], $i['id']], $r['projects'][0]['items']), 'open work only; the client\'s follow-up listed once');
        $this->assertSame([['task', $this->ids['taskB']]], array_map(fn ($i) => [$i['kind'], $i['id']], $r['projects'][1]['items']));
        $this->getJson('/api/admin/projects/handover/preview?' . http_build_query(['from' => $this->njeri->id, 'to' => $this->njeri->id]))->assertStatus(422);
        $this->assertSame(['Kamau', 'Njeri', 'Otieno'], array_column($this->getJson('/api/admin/projects/handover/people')->json('people'), 'name'));
    }

    public function test_handing_over_some_of_the_work_moves_exactly_that_tells_both_and_logs_it(): void
    {
        $items = [['kind' => 'task', 'id' => $this->ids['task']], ['kind' => 'date', 'id' => $this->ids['date']], ['kind' => 'thread', 'id' => $this->ids['thread']], ['kind' => 'meeting', 'id' => $this->ids['meeting']]];
        $this->postJson('/api/admin/projects/handover', ['from' => $this->njeri->id, 'to' => $this->otieno->id, 'project_id' => $this->a, 'items' => $items])->assertOk()->assertJson(['moved' => 4, 'projects' => 1]);
        $this->assertSame([$this->otieno->id], DB::table('project_task_people')->where('task_id', $this->ids['task'])->pluck('user_id')->map(fn ($v) => (int) $v)->all());
        $this->assertSame([$this->njeri->id], DB::table('project_task_people')->where('task_id', $this->ids['done'])->pluck('user_id')->map(fn ($v) => (int) $v)->all(), 'finished tasks stay as the record');
        $this->assertSame($this->otieno->id, (int) DB::table('project_key_dates')->where('id', $this->ids['date'])->value('responsible_id'));
        $this->assertSame($this->otieno->id, (int) DB::table('project_threads')->where('id', $this->ids['thread'])->value('owner_id'));
        $this->assertSame($this->otieno->id, (int) DB::table('project_meetings')->where('id', $this->ids['meeting'])->value('organiser_id'));
        $this->assertSame('yes', DB::table('project_meeting_people')->where(['meeting_id' => $this->ids['meeting'], 'user_id' => $this->otieno->id])->value('response'), 'the new organiser comes');
        $this->assertSame($this->njeri->id, (int) DB::table('project_follow_ups')->where('id', $this->ids['follow_up'])->value('owner_id'), 'not chosen, not moved');
        $this->assertSame([['Njeri', 'Your work was handed to Otieno'], ['Otieno', "Njeri's work was handed to you"]], array_values(array_filter($this->told, fn ($t) => str_contains($t[1], 'handed'))));
        $log = DB::table('project_log')->where('action', 'work.handed_over')->first();
        $this->assertSame(['to' => 'Otieno', 'task' => 1, 'date' => 1, 'thread' => 1, 'meeting' => 1], json_decode($log->new_values, true));
    }

    public function test_work_where_the_new_person_is_not_on_it_is_refused_and_nothing_moves(): void
    {
        $this->postJson('/api/admin/projects/handover', ['from' => $this->njeri->id, 'to' => $this->otieno->id])->assertStatus(422)
            ->assertJson(['message' => DB::table('projects')->where('id', $this->b)->value('number') . ': Otieno is not on this work. Add them first.']);
        $this->assertSame($this->njeri->id, (int) DB::table('project_threads')->where('id', $this->ids['thread'])->value('owner_id'));
        $this->member($this->b, $this->otieno);
        $this->postJson('/api/admin/projects/handover', ['from' => $this->njeri->id, 'to' => $this->otieno->id])->assertOk()->assertJson(['moved' => 6, 'projects' => 2]);
        $this->postJson('/api/admin/projects/handover', ['from' => $this->njeri->id, 'to' => $this->otieno->id])->assertStatus(422)->assertJson(['message' => 'There is nothing to hand over.']);
    }

    public function test_handing_over_someone_elses_work_is_a_serious_action_your_own_is_not(): void
    {
        $this->putJson('/api/admin/projects/configuration/serious', ['rules' => ['work.handover' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => true]]])->assertOk();
        $this->postJson('/api/admin/projects/handover', ['from' => $this->njeri->id, 'to' => $this->otieno->id, 'project_id' => $this->a])->assertStatus(428)->assertJsonPath('serious.action', 'work.handover');
        $this->assertSame($this->njeri->id, (int) DB::table('project_threads')->where('id', $this->ids['thread'])->value('owner_id'));

        $own = (int) $this->postJson("/api/admin/projects/{$this->a}/tasks", ['title' => 'Mine', 'people' => [$this->kamau->id]])->json('task.id');
        $this->postJson('/api/admin/projects/handover', ['from' => $this->kamau->id, 'to' => $this->otieno->id, 'project_id' => $this->a, 'items' => [['kind' => 'task', 'id' => $own]]])->assertOk()->assertJson(['moved' => 1]);

        // someone whose project role does not manage members may not hand over work on it
        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson('/api/admin/projects/handover/preview?' . http_build_query(['from' => $this->njeri->id, 'to' => $this->otieno->id]))->assertForbidden();
    }
}

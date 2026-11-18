<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, builds 6.6 and 6.7 (docs/PROJECTS_STAGE6_SPEC.md): meetings, free-time search, calendar entries, invitations and answers; minutes, action items into tasks, sharing the minutes. */
class ProjectsMeetingsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private int $project;
    private int $grace;
    private array $told = [];
    private array $out = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-18 15:00:00');   // a Wednesday afternoon
        $this->createProjectsWorld();
        Schema::create('calendar_entries', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->unsignedBigInteger('resource_id')->nullable(); $t->string('source_type'); $t->unsignedBigInteger('source_id')->nullable();
            $t->string('kind'); $t->string('title'); $t->dateTime('starts_at'); $t->dateTime('ends_at')->nullable(); $t->boolean('all_day')->default(false); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable();
            $t->string('status')->nullable(); $t->string('visibility')->default('team'); $t->string('url')->nullable(); $t->json('meta')->nullable(); $t->timestamps(); });
        if (! Schema::hasTable('attendance_days')) {
            Schema::create('attendance_days', function ($t) { $t->id(); $t->unsignedBigInteger('user_id'); $t->date('work_date'); $t->string('status', 20); $t->timestamps(); });
        }
        $told = &$this->told;
        $out = &$this->out;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($told, $out) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$told, private array &$out) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->told[] = [$to->name, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                $this->out[] = ['to' => $contact['name'], 'type' => $type, 'title' => $title, 'message' => $message, 'o' => $o];

                return ['notification' => null, 'channels' => ['email'], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.meetings', 'projects.tasks', 'projects.messages.internal', 'projects.messages.client']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.messages.internal', 'projects.messages.client']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Imara v Baraka', 'customer_id' => 1])->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->grace = DB::table('project_contacts')->insertGetId(['owner_type' => 'customer', 'owner_id' => 1, 'name' => 'Grace Wambua', 'email' => 'grace@example.test', 'created_at' => now()]);
    }

    private function url(string $more = ''): string
    {
        return "/api/admin/projects/{$this->project}/meetings{$more}";
    }

    private function plan(array $o = []): array
    {
        return $this->postJson($this->url(), $o + ['title' => 'Defence strategy', 'date' => '2026-11-19', 'time' => '11:00', 'minutes' => 60, 'location' => 'Board room', 'online_link' => 'https://meet.example.test/abc',
            'agenda' => "1. The delivery note\n2. Witnesses", 'audience' => 'client', 'people' => [$this->njeri->id], 'contacts' => [$this->grace]])->assertCreated()->json('meeting');
    }

    public function test_free_time_is_inside_company_hours_skipping_busy_times_leave_and_weekends(): void
    {
        DB::table('calendar_entries')->insert(['user_id' => $this->kamau->id, 'source_type' => 'booking', 'source_id' => 1, 'kind' => 'booking', 'title' => 'Client visit', 'starts_at' => '2026-11-19 10:00:00', 'ends_at' => '2026-11-19 11:00:00', 'all_day' => 0, 'visibility' => 'team', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('attendance_days')->insert(['user_id' => $this->njeri->id, 'work_date' => '2026-11-20', 'status' => 'leave', 'created_at' => now(), 'updated_at' => now()]);
        $r = $this->postJson($this->url('/free-time'), ['people' => [$this->kamau->id, $this->njeri->id], 'minutes' => 60])->assertOk()->json();
        $starts = array_column($r['slots'], 'starts_at');
        $this->assertSame(['2026-11-18 15:00:00', '2026-11-18 15:30:00', '2026-11-18 16:00:00', '2026-11-19 08:00:00', '2026-11-19 08:30:00', '2026-11-19 09:00:00', '2026-11-19 11:00:00'], array_slice($starts, 0, 7), 'not 09:30 to 10:30 on Thursday: Kamau is busy');
        $this->assertEmpty(array_filter($starts, fn ($s) => str_starts_with($s, '2026-11-20') || str_starts_with($s, '2026-11-21') || str_starts_with($s, '2026-11-22')), 'Njeri is on leave on Friday; no weekend');
        $this->assertSame([['name' => 'Njeri', 'why' => 'on leave some days']], $r['away']);
        $this->assertSame(['start' => '08:00', 'end' => '17:00', 'days' => [1, 2, 3, 4, 5]], $r['hours']);
        $this->postJson($this->url('/free-time'), ['people' => [999], 'minutes' => 60])->assertStatus(422);
    }

    public function test_planning_a_meeting_puts_it_on_calendars_and_invites_staff_and_contacts_with_a_calendar_file_and_an_answer_link(): void
    {
        $m = $this->plan();
        $this->assertSame(['planned', 'yes', ['yes' => 1, 'no' => 0, 'maybe' => 0, 'pending' => 2]], [$m['state'], $m['my_answer'], $m['answers']]);
        $cal = DB::table('calendar_entries')->where('source_type', 'project_meeting')->where('source_id', $m['id'])->orderBy('user_id')->get();
        $this->assertSame([[$this->kamau->id, 'meeting', '2026-11-19 11:00:00', '2026-11-19 12:00:00', 'planned'], [$this->njeri->id, 'meeting', '2026-11-19 11:00:00', '2026-11-19 12:00:00', 'planned']],
            $cal->map(fn ($e) => [(int) $e->user_id, $e->kind, (string) $e->starts_at, (string) $e->ends_at, $e->status])->all());
        $number = DB::table('projects')->where('id', $this->project)->value('number');
        $this->assertSame([['Njeri', "Invitation: Defence strategy · {$number}"]], $this->told, 'the organiser is not told about their own meeting');
        $o = $this->out[0];
        $token = DB::table('project_meeting_people')->where('contact_id', $this->grace)->value('answer_token');
        $this->assertSame(['Grace Wambua', 'project_meeting_invite', "/meeting/{$token}", 'meeting.ics'], [$o['to'], $o['type'], $o['o']['action_url'], $o['o']['attachments'][0]['name']]);
        $this->assertStringContainsString('When: Thursday 19 November 2026, 11:00 to 12:00', $o['message']);
        $this->assertStringContainsString("Where: Board room · https://meet.example.test/abc", $o['message']);
        $ics = $o['o']['attachments'][0]['content'];
        foreach (['METHOD:REQUEST', 'DTSTART:20261119T', 'SUMMARY:Defence strategy (' . $number . ')', 'LOCATION:Board room · https://meet.example.test/abc', 'STATUS:CONFIRMED', "ORGANIZER;CN=Kamau:mailto:kamau@example.test"] as $line) {
            $this->assertStringContainsString($line, str_replace("\r\n ", '', $ics));
        }
        $this->assertCount(40, str_split($token));
    }

    public function test_staff_answer_in_the_app_and_contacts_by_their_link_without_signing_in(): void
    {
        $m = $this->plan();
        $token = DB::table('project_meeting_people')->where('contact_id', $this->grace)->value('answer_token');
        $this->told = [];
        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson($this->url("/{$m['id']}/answer"), ['answer' => 'no'])->assertOk()->assertJsonPath('meeting.my_answer', 'no');
        $this->assertSame('declined', DB::table('calendar_entries')->where('source_id', $m['id'])->where('user_id', $this->njeri->id)->value('status'));
        $this->assertSame('Kamau', $this->told[0][0]);
        $this->assertStringStartsWith('Njeri answered no · Defence strategy', $this->told[0][1]);
        $this->postJson($this->url("/{$m['id']}/answer"), ['answer' => 'perhaps'])->assertStatus(422);

        auth()->forgetGuards();
        $this->app['auth']->forgetGuards();
        $pub = $this->withHeaders([])->getJson("/api/meetings/{$token}")->assertOk()->json();
        $this->assertSame(['Defence strategy', 'Grace Wambua', 'pending', 'Kamau'], [$pub['title'], $pub['who'], $pub['response'], $pub['organiser']]);
        $this->postJson("/api/meetings/{$token}/answer", ['answer' => 'maybe'])->assertOk()->assertJsonPath('response', 'maybe');
        $this->get("/api/meetings/{$token}/ics")->assertOk()->assertHeader('Content-Type', 'text/calendar; charset=utf-8');
        $this->getJson('/api/meetings/' . str_repeat('x', 40))->assertNotFound();
    }

    public function test_moving_asks_everyone_again_and_cancelling_tells_everyone_with_a_cancellation_file(): void
    {
        $m = $this->plan();
        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson($this->url("/{$m['id']}/answer"), ['answer' => 'yes']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->out = [];
        $this->told = [];
        Carbon::setTestNow('2026-11-18 15:05:00');
        $r = $this->putJson($this->url("/{$m['id']}"), ['date' => '2026-11-20', 'time' => '09:00'])->assertOk()->json('meeting');
        $this->assertSame(['2026-11-20 09:00:00', '2026-11-20 10:00:00', ['yes' => 1, 'no' => 0, 'maybe' => 0, 'pending' => 2]], [$r['starts_at'], $r['ends_at'], $r['answers']], 'same length; everyone but the organiser asked again');
        $this->assertSame('2026-11-20 09:00:00', (string) DB::table('calendar_entries')->where('source_id', $m['id'])->where('user_id', $this->njeri->id)->value('starts_at'));
        $this->assertStringStartsWith('Moved: Defence strategy', $this->out[0]['title']);
        $this->assertStringContainsString('SEQUENCE:300', $this->out[0]['o']['attachments'][0]['content']);
        $this->assertSame('Njeri', $this->told[0][0]);

        $this->out = [];
        $this->postJson($this->url("/{$m['id']}/cancel"), ['reason' => 'Settled out of court'])->assertOk()->assertJsonPath('meeting.state', 'cancelled');
        $this->assertSame(['cancelled', 'cancelled'], DB::table('calendar_entries')->where('source_id', $m['id'])->pluck('status')->all());
        $this->assertStringContainsString('METHOD:CANCEL', $this->out[0]['o']['attachments'][0]['content']);
        $this->assertStringContainsString('Why: Settled out of court', $this->out[0]['message']);
        $this->assertNull($this->out[0]['o']['action_url']);
        $token = DB::table('project_meeting_people')->where('contact_id', $this->grace)->value('answer_token');
        $this->postJson("/api/meetings/{$token}/answer", ['answer' => 'yes'])->assertStatus(422)->assertJson(['message' => 'This meeting was cancelled.']);
        $this->putJson($this->url("/{$m['id']}"), ['title' => 'Again'])->assertStatus(422);
    }

    public function test_who_may_plan_and_what_a_meeting_may_hold(): void
    {
        $this->postJson($this->url(), ['title' => 'x', 'date' => '2026-11-19', 'time' => '11:00', 'audience' => 'team', 'contacts' => [$this->grace]])->assertStatus(422)->assertJson(['message' => 'A team meeting is for the team only. Make it a client or others meeting to invite contacts.']);
        $this->postJson($this->url(), ['title' => 'x', 'date' => '2026-11-19', 'time' => '11:00', 'audience' => 'team', 'people' => [12345]])->assertStatus(422);
        $this->postJson($this->url(), ['title' => 'x', 'date' => '2026-11-19', 'time' => '11:00', 'audience' => 'team', 'online_link' => 'http://plain.test'])->assertStatus(422)->assertJson(['message' => 'The online link must be a full https:// address.']);
        $this->postJson($this->url(), ['title' => 'x', 'audience' => 'team'])->assertStatus(422)->assertJson(['message' => 'Choose the day and the time.']);
        $otieno = $this->staff('Otieno', ['projects.use', 'projects.messages.internal']);
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $otieno->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->postJson($this->url(), ['title' => 'x', 'date' => '2026-11-19', 'time' => '11:00', 'audience' => 'client', 'contacts' => [$this->grace], 'people' => [$otieno->id]])->assertStatus(422)->assertJson(['message' => 'Otieno may not see client meetings. Invite them to a team meeting instead.']);
        $m = $this->plan(['audience' => 'team', 'contacts' => []]);
        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson($this->url(), ['title' => 'x', 'date' => '2026-11-19', 'time' => '11:00', 'audience' => 'team'])->assertForbidden();
        $this->assertSame(['Defence strategy'], array_column($this->getJson($this->url())->assertOk()->json('meetings'), 'title'), 'people on the work see its team meetings');
        $this->postJson($this->url("/{$m['id']}/cancel"))->assertForbidden();
    }

    public function test_minutes_and_action_items_are_kept_on_the_meeting_and_each_item_becomes_a_task_once(): void
    {
        $m = $this->plan();
        $this->putJson($this->url("/{$m['id']}/minutes"), ['minutes' => 'Too early', 'actions' => []])->assertStatus(422)->assertJson(['message' => 'Minutes are written once the meeting has started.']);
        Carbon::setTestNow('2026-11-19 12:10:00');
        $r = $this->putJson($this->url("/{$m['id']}/minutes"), ['minutes' => "We rely on the delivery note.\nDecision: no settlement offer yet.", 'actions' => [
            ['text' => 'Get the driver\'s statement', 'user_id' => $this->njeri->id, 'due_date' => '2026-11-26'],
            ['text' => 'Send the signed delivery note', 'contact_id' => $this->grace, 'due_date' => '2026-11-24'],
            ['text' => '   '],
        ]])->assertOk()->json('meeting');
        $this->assertSame(['held', 2], [$r['state'], count($r['actions'])]);
        $this->assertSame('held', DB::table('calendar_entries')->where('source_id', $m['id'])->where('user_id', $this->kamau->id)->value('status'));
        $this->putJson($this->url("/{$m['id']}/minutes"), ['minutes' => 'x', 'actions' => [['text' => 'y', 'user_id' => 9999]]])->assertStatus(422);

        $a = $r['actions'][0];
        $t = $this->postJson($this->url("/{$m['id']}/actions/{$a['id']}/task"))->assertCreated()->json();
        $task = DB::table('project_work_tasks')->find($t['task_id']);
        $this->assertSame(["Get the driver's statement", '2026-11-26'], [$task->title, $task->due_date]);
        $this->assertStringContainsString('From the meeting "Defence strategy" on 19 Nov 2026.', $task->description);
        $this->assertSame([$this->njeri->id], DB::table('project_task_people')->where('task_id', $task->id)->pluck('user_id')->map(fn ($v) => (int) $v)->all(), 'given to its person');
        $this->assertSame(DB::table('projects')->where('id', $this->project)->value('number') . '-T1', $t['meeting']['actions'][0]['task']['ref']);
        $this->postJson($this->url("/{$m['id']}/actions/{$a['id']}/task"))->assertStatus(422);

        // saving again keeps the item that became a task, and replaces the rest
        $again = $this->putJson($this->url("/{$m['id']}/minutes"), ['minutes' => 'Updated.', 'actions' => [['id' => $a['id'], 'text' => 'changed here, ignored'], ['text' => 'Book the court room', 'user_id' => $this->kamau->id]]])->assertOk()->json('meeting.actions');
        $this->assertSame([["Get the driver's statement", true], ['Book the court room', false]], array_map(fn ($x) => [$x['text'], $x['task'] !== null], $again));
    }

    public function test_sharing_the_minutes_sends_them_to_the_team_and_a_client_meetings_contacts(): void
    {
        $m = $this->plan();
        Carbon::setTestNow('2026-11-19 12:10:00');
        $this->postJson($this->url("/{$m['id']}/share"))->assertStatus(422)->assertJson(['message' => 'Write the minutes first.']);
        $this->putJson($this->url("/{$m['id']}/minutes"), ['minutes' => 'We rely on the delivery note.', 'actions' => [['text' => 'Send the signed delivery note', 'contact_id' => $this->grace, 'due_date' => '2026-11-24']]])->assertOk();
        $this->told = [];
        $this->out = [];
        $this->postJson($this->url("/{$m['id']}/share"))->assertOk()->assertJsonPath('meeting.minutes_shared_at', '2026-11-19 12:10:00');
        $number = DB::table('projects')->where('id', $this->project)->value('number');
        $this->assertSame([['Njeri', "Minutes: Defence strategy · {$number}"]], $this->told);
        $this->assertSame(['Grace Wambua', 'project_meeting_invite', "Minutes: Defence strategy · {$number}"], [$this->out[0]['to'], $this->out[0]['type'], $this->out[0]['title']]);
        $this->assertStringContainsString("Action items:\n- Send the signed delivery note (Grace Wambua), by 24 Nov 2026", $this->out[0]['message']);
        $this->out = [];
        $this->postJson($this->url("/{$m['id']}/share"))->assertOk();
        $this->assertStringStartsWith('Minutes, updated:', $this->out[0]['title']);

        // a team meeting's minutes never leave the team
        $team = $this->plan(['audience' => 'team', 'contacts' => [], 'date' => '2026-11-19', 'time' => '08:00']);
        $this->putJson($this->url("/{$team['id']}/minutes"), ['minutes' => 'Inside only.', 'actions' => []])->assertOk();
        $this->out = [];
        $this->postJson($this->url("/{$team['id']}/share"))->assertOk();
        $this->assertSame([], $this->out);
    }
}

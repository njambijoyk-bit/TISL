<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 5.4 (docs/PROJECTS_STAGE5_SPEC.md): key dates with warnings, missed dates, moves remembered, on everyone's calendar. */
class ProjectsKeyDatesTest extends TestCase
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
        Carbon::setTestNow('2026-11-17 06:00:00');
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
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.dates', 'projects.tasks']);
        $this->njeri = $this->staff('Njeri', ['projects.use']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Imara v Baraka', 'customer_id' => 1])->json('project.id');
        DB::table('projects')->where('id', $this->project)->update(['industry_key' => 'legal']);
        $this->number = (string) DB::table('projects')->where('id', $this->project)->value('number');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function add(array $d): array
    {
        return $this->postJson("/api/admin/projects/{$this->project}/key-dates", $d)->assertCreated()->json();
    }

    public function test_a_key_date_has_a_kind_of_its_industry_a_time_and_someone_responsible_and_is_on_everyones_calendar(): void
    {
        $r = $this->add(['title' => 'Mention, HCCC 88', 'kind' => 'mention', 'date' => '2026-12-03', 'time' => '09:30', 'responsible_id' => $this->njeri->id]);
        $d = $r['dates'][0];
        $this->assertSame(['Mention', '2026-12-03 09:30:00', false, 'open', 16, 'Njeri'], [$d['kind_name'], $d['starts_at'], $d['all_day'], $d['state'], $d['days'], $d['responsible']['name']]);
        $this->assertContains('Hearing', array_column($r['kinds'], 'name'), 'legal work offers the legal kinds');
        $this->assertNotContains('Inspection', array_column($r['kinds'], 'name'), 'and not another industry\'s');
        $this->assertSame([[$this->kamau->id, "{$this->number} · Mention, HCCC 88", '2026-12-03 09:30:00', false], [$this->njeri->id, "{$this->number} · Mention, HCCC 88", '2026-12-03 09:30:00', false]],
            DB::table('calendar_entries')->where('source_type', 'project_key_date')->orderBy('user_id')->get()->map(fn ($e) => [$e->user_id, $e->title, $e->starts_at, (bool) $e->all_day])->all());

        $p = "/api/admin/projects/{$this->project}/key-dates";
        $this->postJson($p, ['title' => 'X', 'date' => '2026-12-03', 'kind' => 'inspection'])->assertStatus(422)->assertJson(['message' => 'Choose a kind of date from the list.']);
        $this->postJson($p, ['title' => 'X', 'date' => '2026-12-03', 'time' => '25:00'])->assertStatus(422);
        $this->postJson($p, ['title' => 'X'])->assertStatus(422)->assertJson(['message' => 'Give the date.']);
        $this->postJson($p, ['title' => 'X', 'date' => '2026-12-03', 'responsible_id' => $this->staff('Stranger')->id])->assertStatus(422);
        $this->assertSame(85, DB::table('project_lists')->count());
    }

    public function test_moving_a_date_needs_a_reason_and_keeps_where_it_was(): void
    {
        $id = $this->add(['title' => 'Hearing', 'kind' => 'hearing', 'date' => '2026-12-03'])['dates'][0]['id'];
        $p = "/api/admin/projects/{$this->project}/key-dates/{$id}";
        $this->putJson($p, ['date' => '2026-12-10', 'reason' => ''])->assertStatus(422)->assertJson(['message' => 'Say why the date moved.']);
        $d = $this->putJson($p, ['date' => '2026-12-10', 'reason' => 'Judge on leave'])->assertOk()->json('dates.0');
        $this->assertSame(['2026-12-10 00:00:00', '2026-12-03 00:00:00', 'Judge on leave', 'Kamau'], [$d['starts_at'], $d['moved_from'], $d['move_reason'], $d['moved_by']]);
        $this->assertSame('Judge on leave', DB::table('project_log')->where('action', 'key_date.moved')->value('reason'));
        $this->assertSame('2026-12-10 00:00:00', DB::table('calendar_entries')->where('source_type', 'project_key_date')->value('starts_at'));
        $this->putJson($p, ['title' => 'Hearing, HCCC 88', 'date' => '2027-01-01'])->assertOk()->assertJsonPath('dates.0.starts_at', '2026-12-10 00:00:00');   // a plain change does not move it

        $this->putJson($p, ['done' => true])->assertOk()->assertJsonPath('dates.0.state', 'done');
        $this->putJson($p, ['date' => '2026-12-20', 'reason' => 'Again'])->assertStatus(422)->assertJson(['message' => 'This date is done. Add a new one instead.']);
        $this->assertSame('done', DB::table('calendar_entries')->where('source_type', 'project_key_date')->value('status'));
        $this->deleteJson($p)->assertOk()->assertJsonPath('dates', []);
        $this->assertSame(0, DB::table('calendar_entries')->where('source_type', 'project_key_date')->count());
    }

    public function test_warnings_go_on_their_days_and_on_the_day_once_each_and_a_passed_open_date_becomes_missed(): void
    {
        $this->add(['title' => 'Filing deadline', 'kind' => 'filing', 'date' => '2026-11-24', 'responsible_id' => $this->njeri->id]);   // 7 days away
        $this->add(['title' => 'Inspection', 'date' => '2026-11-18', 'warn_days' => '2']);   // tomorrow, with its own warnings
        $this->add(['title' => 'Call the client', 'date' => '2026-11-16']);                     // yesterday, still open
        $k = app(\App\Services\Projects\ProjectKeyDates::class);

        $k->warn();
        $titles = array_map(fn ($s) => "{$s[0]}: {$s[2]}", $this->sent);
        sort($titles);
        $this->assertSame(["Kamau: In 7 days: Filing deadline on {$this->number}", "Kamau: Missed: Call the client on {$this->number}", "Kamau: Tomorrow: Inspection on {$this->number}", "Njeri: In 7 days: Filing deadline on {$this->number}"], $titles,
            'to the person responsible and the leads; tomorrow is inside its own 2 days');
        $this->assertSame('missed', DB::table('project_key_dates')->where('title', 'Call the client')->value('state'));
        $this->sent = [];
        $k->warn();
        $this->assertSame([], $this->sent, 'each warning goes once');

        Carbon::setTestNow('2026-11-23 06:00:00');
        $k->warn();
        $this->assertSame("Tomorrow: Filing deadline on {$this->number}", $this->sent[0][2]);
        $this->sent = [];
        Carbon::setTestNow('2026-11-24 06:00:00');
        $k->warn();
        $this->assertSame("Today: Filing deadline on {$this->number}", $this->sent[0][2]);
        $this->artisan('projects:key-date-warnings')->assertSuccessful();
    }
}

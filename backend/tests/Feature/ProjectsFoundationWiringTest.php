<?php

namespace Tests\Feature;

use App\Models\CalendarEntry;
use App\Models\User;
use App\Services\ActivityFeedService;
use App\Services\AiAnalyticsService;
use App\Services\Calendar\CalendarService;
use App\Services\Projects\ProjectsSetup;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Build 1.1 of the rebuilt Projects module (docs/PROJECTS_STAGE1_SPEC.md) removed the old module. The parts of the system that used to read
 * it (the calendar, AI analytics, the company timeline) must work both before the new tables exist and once they do, and must never
 * show a confidential project to someone who is not on it.
 */
class ProjectsFoundationWiringTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        ProjectsSetup::forget();
        Schema::create('calendar_entries', function ($t) {
            $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->unsignedBigInteger('resource_id')->nullable(); $t->string('source_type'); $t->unsignedBigInteger('source_id');
            $t->string('kind'); $t->string('title'); $t->dateTime('starts_at'); $t->dateTime('ends_at')->nullable(); $t->boolean('all_day')->default(false);
            $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedBigInteger('customer_id')->nullable(); $t->string('status')->nullable(); $t->string('visibility')->default('team');
            $t->string('url')->nullable(); $t->json('meta')->nullable(); $t->timestamps();
        });
        Schema::create('bookable_resources', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->timestamps(); });
        Schema::create('tickets', function ($t) { $t->id(); $t->unsignedBigInteger('assigned_to')->nullable(); $t->string('status')->default('open'); $t->softDeletes(); $t->timestamps(); });
    }

    protected function tearDown(): void
    {
        ProjectsSetup::forget();
        parent::tearDown();
    }

    private function person(int $id): User
    {
        $u = new User();
        $u->forceFill(['id' => $id, 'name' => "Person {$id}"]);
        $u->exists = true;

        return $u;
    }

    /** The few columns of the new structure these readers use. */
    private function newTables(): void
    {
        Schema::create('users', function ($t) { $t->id(); $t->string('name'); });
        Schema::create('project_industries', function ($t) { $t->id(); $t->string('key'); });
        Schema::create('project_types', function ($t) { $t->id(); $t->string('industry_key'); $t->string('name'); });
        Schema::create('project_stages', function ($t) { $t->id(); $t->unsignedBigInteger('type_id'); $t->string('name'); });
        Schema::create('project_roles', function ($t) { $t->id(); $t->string('key'); $t->string('name'); });
        Schema::create('projects', function ($t) {
            $t->id(); $t->string('number'); $t->string('industry_key')->default('general'); $t->unsignedBigInteger('type_id')->default(1); $t->string('title'); $t->unsignedBigInteger('customer_id')->nullable();
            $t->unsignedBigInteger('stage_id')->nullable(); $t->string('state')->default('open'); $t->string('priority')->default('medium'); $t->date('start_date')->nullable(); $t->date('due_date')->nullable();
            $t->boolean('confidential')->default(false); $t->softDeletes(); $t->timestamps();
        });
        Schema::create('project_members', function ($t) { $t->id(); $t->unsignedBigInteger('project_id'); $t->unsignedBigInteger('user_id'); $t->unsignedBigInteger('project_role_id')->default(1); $t->string('status')->default('active'); });
        Schema::create('project_log', function ($t) {
            $t->id(); $t->unsignedBigInteger('project_id')->nullable(); $t->unsignedBigInteger('actor_id')->nullable(); $t->string('action'); $t->string('subject_type')->nullable(); $t->unsignedBigInteger('subject_id')->nullable();
            $t->string('result')->default('done'); $t->string('reason')->nullable(); $t->timestamp('created_at')->nullable();
        });
        ProjectsSetup::forget();
    }

    private function aiData(?int $id = null): array
    {
        $m = new \ReflectionMethod(AiAnalyticsService::class, 'fetchProjectsData');

        return $m->invoke(app(AiAnalyticsService::class), $id);
    }

    public function test_before_the_new_tables_exist_nothing_reads_projects_and_nothing_breaks(): void
    {
        $this->assertFalse(ProjectsSetup::ready());
        app(CalendarService::class)->refreshFromSources($this->person(5), Carbon::parse('2026-11-01'), Carbon::parse('2026-11-30'));
        $this->assertSame(0, CalendarEntry::count());
        $this->assertSame(['note' => 'The Projects module has no data yet.'], $this->aiData());
    }

    public function test_an_old_projects_table_on_its_own_is_not_mistaken_for_the_new_structure(): void
    {
        Schema::create('projects', function ($t) { $t->id(); $t->string('title'); $t->string('status'); });
        ProjectsSetup::forget();
        $this->assertFalse(ProjectsSetup::ready());
        app(CalendarService::class)->refreshFromSources($this->person(5), Carbon::parse('2026-11-01'), Carbon::parse('2026-11-30'));
        $this->assertSame(0, CalendarEntry::count());
    }

    public function test_the_calendar_shows_a_project_due_date_to_the_people_on_it_and_clears_what_the_old_module_left(): void
    {
        $this->newTables();
        DB::table('projects')->insert([
            ['id' => 1, 'number' => 'P-0001', 'title' => 'Stock system', 'state' => 'open', 'due_date' => '2026-11-20', 'deleted_at' => null],
            ['id' => 2, 'number' => 'P-0002', 'title' => 'Not mine', 'state' => 'open', 'due_date' => '2026-11-21', 'deleted_at' => null],
            ['id' => 3, 'number' => 'P-0003', 'title' => 'Closed one', 'state' => 'closed', 'due_date' => '2026-11-22', 'deleted_at' => null],
            ['id' => 4, 'number' => 'P-0004', 'title' => 'In the trash', 'state' => 'open', 'due_date' => '2026-11-23', 'deleted_at' => '2026-11-10 10:00:00'],
            ['id' => 5, 'number' => 'P-0005', 'title' => 'I was removed', 'state' => 'open', 'due_date' => '2026-11-24', 'deleted_at' => null],
        ]);
        DB::table('project_members')->insert([
            ['project_id' => 1, 'user_id' => 5, 'status' => 'active'], ['project_id' => 2, 'user_id' => 6, 'status' => 'active'], ['project_id' => 3, 'user_id' => 5, 'status' => 'active'],
            ['project_id' => 4, 'user_id' => 5, 'status' => 'active'], ['project_id' => 5, 'user_id' => 5, 'status' => 'removed'],
        ]);
        // left behind by the old module
        CalendarEntry::create(['user_id' => 5, 'source_type' => 'task', 'source_id' => 9, 'kind' => 'task', 'title' => 'Old task', 'starts_at' => '2026-11-12 00:00:00', 'all_day' => true]);
        CalendarEntry::create(['user_id' => 5, 'source_type' => 'milestone', 'source_id' => 9, 'kind' => 'milestone', 'title' => 'Old milestone', 'starts_at' => '2026-11-13 00:00:00', 'all_day' => true]);

        app(CalendarService::class)->refreshFromSources($this->person(5), Carbon::parse('2026-11-01'), Carbon::parse('2026-11-30'));

        $entries = CalendarEntry::where('user_id', 5)->get();
        $this->assertCount(1, $entries);
        $this->assertSame('project', $entries[0]->source_type);
        $this->assertSame(1, (int) $entries[0]->source_id);
        $this->assertSame('Due: P-0001 Stock system', $entries[0]->title);
        $this->assertSame('/admin/projects/1', $entries[0]->url);
    }

    public function test_ai_analytics_never_receives_a_confidential_project(): void
    {
        $this->newTables();
        DB::table('projects')->insert([
            ['id' => 1, 'number' => 'P-0001', 'title' => 'Open one', 'state' => 'open', 'due_date' => now()->addDays(2)->toDateString(), 'confidential' => 0],
            ['id' => 2, 'number' => 'M-0002', 'title' => 'Secret matter', 'state' => 'open', 'due_date' => now()->addDays(2)->toDateString(), 'confidential' => 1],
        ]);
        $all = $this->aiData();
        $this->assertSame(1, (int) $all['stats']->total_projects);
        $this->assertSame(['P-0001'], array_map(fn ($p) => $p->number, $all['dueSoon']));
        $this->assertNull($this->aiData(2)['project']);
        $this->assertSame([], $this->aiData(2)['members']);
        DB::table('users')->insert(['id' => 5, 'name' => 'Wanjiru']);
        DB::table('project_roles')->insert(['id' => 1, 'key' => 'lead', 'name' => 'Lead']);
        DB::table('project_members')->insert(['project_id' => 1, 'user_id' => 5, 'project_role_id' => 1, 'status' => 'active']);
        $one = $this->aiData(1);
        $this->assertSame('P-0001', $one['project']->number);
        $this->assertSame(['Wanjiru'], array_map(fn ($m) => $m->name, $one['members']));
        $this->assertSame('Lead', $one['members'][0]->project_role);
    }

    public function test_the_company_timeline_leaves_out_the_log_of_a_confidential_project(): void
    {
        $this->newTables();
        DB::table('projects')->insert([
            ['id' => 1, 'number' => 'P-0001', 'title' => 'Open one', 'confidential' => 0], ['id' => 2, 'number' => 'M-0002', 'title' => 'Secret matter', 'confidential' => 1],
        ]);
        DB::table('project_log')->insert([
            ['project_id' => 1, 'action' => 'project.created', 'result' => 'done', 'created_at' => '2026-11-14 10:00:00'],
            ['project_id' => 2, 'action' => 'project.created', 'result' => 'done', 'created_at' => '2026-11-14 10:01:00'],
            ['project_id' => null, 'action' => 'settings.saved', 'result' => 'done', 'created_at' => '2026-11-14 10:02:00'],
            ['project_id' => 1, 'action' => 'project.opened', 'result' => 'refused', 'created_at' => '2026-11-14 10:03:00'],
        ]);
        $svc = app(ActivityFeedService::class);
        $source = collect((new \ReflectionMethod(ActivityFeedService::class, 'sources'))->invoke($svc))->firstWhere('key', 'project_activity');
        $this->assertSame('projects.log.view', $source['permission']);

        $query = new \ReflectionMethod(ActivityFeedService::class, 'query');
        $shape = new \ReflectionMethod(ActivityFeedService::class, 'shape');
        $rows = $query->invoke($svc, $source, null, null, 50);
        $this->assertCount(3, $rows, 'the two rows of the open project and the one that is about no project');
        $this->assertNotContains(2, $rows->pluck('project_id')->all());
        $shaped = $rows->map(fn ($r) => $shape->invoke($svc, $source, $r));
        $this->assertContains('Project P-0001', $shaped->pluck('subject')->all());
        $this->assertContains('Projects', $shaped->pluck('subject')->all());
        $this->assertCount(1, $shaped->pluck('action')->filter(fn ($a) => str_contains(strtolower($a), 'refused')), 'a refusal says so on the timeline');
    }
}

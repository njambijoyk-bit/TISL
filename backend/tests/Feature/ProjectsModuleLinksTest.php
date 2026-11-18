<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 7.3 (docs/PROJECTS_STAGE7_SPEC.md): the paid modules' records, each there only while its module is on. */
class ProjectsModuleLinksTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private int $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $make = [
            'campaigns' => fn ($t) => [$t->id(), $t->string('slug'), $t->string('title'), $t->string('type')->nullable(), $t->dateTime('starts_at')->nullable(), $t->dateTime('ends_at')->nullable(), $t->boolean('is_published')->default(false), $t->boolean('is_paused')->default(false), $t->dateTime('archived_at')->nullable(), $t->string('approval_status')->nullable()],
            'course_offerings' => fn ($t) => [$t->id(), $t->string('title'), $t->string('slug'), $t->string('kind')->nullable(), $t->string('delivery')->nullable(), $t->string('status')],
            'course_intakes' => fn ($t) => [$t->id(), $t->unsignedBigInteger('offering_id'), $t->string('name'), $t->date('starts_on')->nullable(), $t->date('ends_on')->nullable(), $t->string('status')],
            'course_enrolments' => fn ($t) => [$t->id(), $t->string('number')->nullable(), $t->unsignedBigInteger('offering_id'), $t->unsignedBigInteger('student_user_id')->nullable(), $t->string('status')],
            'memberships' => fn ($t) => [$t->id(), $t->string('number')->nullable(), $t->unsignedBigInteger('plan_id'), $t->unsignedBigInteger('member_user_id')->nullable(), $t->string('status'), $t->date('paid_until')->nullable()],
            'membership_plans' => fn ($t) => [$t->id(), $t->string('name'), $t->string('slug'), $t->string('period_unit')->nullable(), $t->integer('period_count')->default(1), $t->string('status')],
            'events' => fn ($t) => [$t->id(), $t->string('title'), $t->string('venue_name')->nullable(), $t->string('status')->default('published'), $t->softDeletes()],
            'event_bookings' => fn ($t) => [$t->id(), $t->string('reference')->nullable(), $t->unsignedBigInteger('event_id'), $t->string('provider_type')->nullable(), $t->date('starts_on')->nullable(), $t->integer('guests')->nullable(), $t->string('status')],
            'menus_orders' => fn ($t) => [$t->id(), $t->string('number')->nullable(), $t->string('name')->nullable(), $t->string('order_type')->nullable(), $t->dateTime('fulfil_at')->nullable(), $t->string('status')],
        ];
        foreach ($make as $table => $cols) {
            Schema::dropIfExists($table);
            Schema::create($table, fn ($t) => $cols($t));
        }
        $student = $this->staff('Achieng');
        DB::table('campaigns')->insert(['id' => 1, 'slug' => 'wing', 'title' => 'Lodge wing launch', 'type' => 'launch', 'starts_at' => '2026-12-01 00:00:00', 'is_published' => true]);
        DB::table('course_offerings')->insert(['id' => 2, 'title' => 'Site safety', 'slug' => 'site-safety', 'kind' => 'course', 'delivery' => 'in_person', 'status' => 'published']);
        DB::table('course_intakes')->insert(['id' => 3, 'offering_id' => 2, 'name' => 'December', 'starts_on' => '2026-12-07', 'status' => 'open']);
        DB::table('course_enrolments')->insert(['id' => 4, 'number' => 'EN-0004', 'offering_id' => 2, 'student_user_id' => $student->id, 'status' => 'active']);
        DB::table('membership_plans')->insert(['id' => 5, 'name' => 'Gold', 'slug' => 'gold', 'period_unit' => 'month', 'period_count' => 1, 'status' => 'published']);
        DB::table('memberships')->insert(['id' => 6, 'number' => 'MB-0006', 'plan_id' => 5, 'member_user_id' => $student->id, 'status' => 'past_due', 'paid_until' => '2026-11-01']);
        DB::table('events')->insert(['id' => 7, 'title' => 'Wing opening night']);
        DB::table('event_bookings')->insert(['id' => 8, 'reference' => 'EB-0008', 'event_id' => 7, 'provider_type' => 'venue', 'starts_on' => '2026-12-12', 'guests' => 80, 'status' => 'consulting']);
        DB::table('menus_orders')->insert(['id' => 9, 'number' => 'FO-0009', 'name' => 'Site lunch', 'order_type' => 'delivery', 'fulfil_at' => '2026-11-20 12:30:00', 'status' => 'ready']);
        $kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.links', 'campaigns.build', 'courses.view', 'courses.enrol', 'memberships.view', 'events.view', 'menus.view']);
        Sanctum::actingAs($kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->value('id'), 'title' => 'Lodge wing'])->assertCreated()->json('project.id');
    }

    public function test_each_paid_modules_record_is_linked_and_read_with_its_own_state(): void
    {
        $want = [
            'campaigns.campaign' => [1, 'Lodge wing launch', 'Live', 'deliverable'],
            'courses.offering' => [2, 'Site safety', 'Published', 'deliverable'],
            'courses.intake' => [3, 'Site safety · December', 'Taking people', 'deliverable'],
            'courses.enrolment' => [4, 'Enrolment EN-0004', 'Active', 'related'],
            'memberships.plan' => [5, 'Gold', 'Offered', 'deliverable'],
            'memberships.member' => [6, 'Membership MB-0006', 'Payment late', 'related'],
            'events.booking' => [8, 'Booking EB-0008 · Wing opening night', 'Being discussed', 'supplier'],
            'menus.order' => [9, 'Food order FO-0009', 'Ready', 'related'],
        ];
        foreach ($want as $type => [$id]) {
            $this->postJson("/api/admin/projects/{$this->project}/links", ['type' => $type, 'linked_id' => $id])->assertCreated();
        }
        $groups = collect($this->getJson("/api/admin/projects/{$this->project}/links")->assertOk()->json('groups'));
        foreach ($want as $type => [$id, $title, $state, $role]) {
            $i = $groups->firstWhere('type', $type)['items'][0];
            $this->assertSame([$title, $state, $role], [$i['title'], $i['state']['label'] ?? null, $i['role']['key'] ?? null], $type);
        }
        $this->assertSame('Achieng · Gold · paid to 2026-11-01', $groups->firstWhere('type', 'memberships.member')['items'][0]['detail']);
        $this->assertSame([2], array_column($this->getJson("/api/admin/projects/{$this->project}/links/find?type=courses.offering&q=safety")->json('found'), 'id'));
    }

    public function test_a_module_switched_off_takes_its_kinds_away_and_brings_them_back(): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/links", ['type' => 'courses.enrolment', 'linked_id' => 4])->assertCreated();
        $this->modulesOff = ['courses'];
        $r = $this->getJson("/api/admin/projects/{$this->project}/links")->json();
        $this->assertEmpty(array_filter(array_column($r['groups'], 'type'), fn ($t) => str_starts_with($t, 'courses.')));
        $this->assertSame(1, $r['hidden']);
        $this->assertContains('Enrolments', $r['off']);
        $this->modulesOff = [];
        $this->assertSame('Enrolment EN-0004', collect($this->getJson("/api/admin/projects/{$this->project}/links")->json('groups'))->firstWhere('type', 'courses.enrolment')['items'][0]['title']);
    }
}

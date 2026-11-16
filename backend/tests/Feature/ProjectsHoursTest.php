<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 2.2 (docs/PROJECTS_STAGE2_SPEC.md): the hours a project can be opened, a person's own hours on it, and short passes outside them. */
class ProjectsHoursTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const LEAD = ['projects.use', 'projects.create', 'projects.edit', 'projects.members.view', 'projects.members.manage', 'projects.access.rules', 'projects.config.view', 'projects.config.manage'];
    private const WEEK = [['day' => 1, 'opens' => '07:00', 'closes' => '19:00'], ['day' => 2, 'opens' => '07:00', 'closes' => '19:00'], ['day' => 3, 'opens' => '07:00', 'closes' => '19:00'],
        ['day' => 4, 'opens' => '07:00', 'closes' => '19:00'], ['day' => 5, 'opens' => '07:00', 'closes' => '19:00']];

    private User $kamau;
    private User $njeri;
    private int $project;
    private int $njeriPlace;
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-16 10:00:00');   // a Monday
        $this->createProjectsWorld();
        $sent = &$this->sent;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$to->name, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', self::LEAD);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.edit', 'projects.members.view', 'projects.phases']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id'), 'title' => 'Stock system'])->assertCreated()->json('project.id');
        $this->njeriPlace = (int) DB::table('project_members')->insertGetId(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function hours(array $days, array $o = []): \Illuminate\Testing\TestResponse
    {
        return $this->putJson("/api/admin/projects/{$this->project}/access/hours", $o + ['days' => $days]);
    }

    private function as(User $u): static
    {
        Sanctum::actingAs($u, ['*']);

        return $this;
    }

    public function test_a_project_with_hours_is_closed_outside_them_and_says_when_it_opens(): void
    {
        $t = $this->hours(self::WEEK)->assertOk()->json();
        $this->assertSame('Mon to Fri, 07:00 to 19:00', $t['project_hours']);
        $this->assertSame(['Kamau'], $t['hours']['key_holders']);
        $this->assertSame('hours.set', DB::table('project_log')->orderByDesc('id')->value('action'));

        $this->as($this->njeri)->getJson("/api/admin/projects/{$this->project}")->assertOk();   // Monday 10:00

        Carbon::setTestNow('2026-11-16 19:40:00');
        $r = $this->getJson("/api/admin/projects/{$this->project}")->assertForbidden()->json();
        $this->assertSame('P-0001 is closed for now. It can be opened Mon to Fri, 07:00 to 19:00. It opens again tomorrow at 07:00.', $r['message']);
        $this->assertSame(['2026-11-17 07:00:00', true, false, 'Kamau'], [$r['closed']['opens_at'], $r['closed']['can_ask'], $r['closed']['asked'], $r['closed']['lead']]);
        $this->putJson("/api/admin/projects/{$this->project}", ['title' => 'Changed after hours'])->assertForbidden();
        $this->assertSame('Outside hours', DB::table('project_log')->where('result', 'refused')->orderByDesc('id')->value('reason'), 'the refusal is logged');

        Carbon::setTestNow('2026-11-16 06:59:00');
        $this->assertStringEndsWith('It opens again today at 07:00.', $this->getJson("/api/admin/projects/{$this->project}")->assertForbidden()->json('message'));
        Carbon::setTestNow('2026-11-20 19:00:00');   // Friday, the minute it closes
        $this->assertStringEndsWith('It opens again on Monday at 07:00.', $this->getJson("/api/admin/projects/{$this->project}")->assertForbidden()->json('message'));
        Carbon::setTestNow('2026-11-23 07:00:00');
        $this->getJson("/api/admin/projects/{$this->project}")->assertOk();

        // it stays on the list: it exists, it is only closed
        Carbon::setTestNow('2026-11-21 12:00:00');
        $this->assertSame(1, $this->getJson('/api/admin/projects?scope=mine')->assertOk()->json('total'));
    }

    public function test_the_people_who_can_set_the_hours_are_never_held_by_them(): void
    {
        $this->hours([['day' => 1, 'opens' => '09:00', 'closes' => '09:05']])->assertOk();
        Carbon::setTestNow('2026-11-18 03:00:00');
        $this->getJson("/api/admin/projects/{$this->project}")->assertOk();
        $this->putJson("/api/admin/projects/{$this->project}", ['title' => 'Still mine'])->assertOk();
        $t = $this->hours([])->assertOk()->json();   // and can always open it up again
        $this->assertNull($t['project_hours']);
        $this->as($this->njeri)->getJson("/api/admin/projects/{$this->project}")->assertOk();
    }

    public function test_a_persons_own_hours_narrow_the_projects_and_the_access_tab_says_so(): void
    {
        $this->hours(self::WEEK)->assertOk();
        $t = $this->hours([['day' => 1, 'opens' => '08:00', 'closes' => '12:00'], ['day' => 6, 'opens' => '09:00', 'closes' => '13:00']], ['member_id' => $this->njeriPlace])->assertOk()->json();
        $row = collect($t['people'])->firstWhere('name', 'Njeri');
        $this->assertSame(['Mon, 08:00 to 12:00; Sat, 09:00 to 13:00', 'in'], [$row['hours'], $row['state']]);

        Carbon::setTestNow('2026-11-16 13:00:00');   // inside the project's hours, outside hers
        $r = $this->as($this->njeri)->getJson("/api/admin/projects/{$this->project}")->assertForbidden()->json();
        // Saturday is hers but the project is closed then, so the next time both are open is next Monday at 08:00
        $this->assertSame('2026-11-23 08:00:00', $r['closed']['opens_at']);
        $this->assertStringContainsString('Mon to Fri, 07:00 to 19:00, and for you Mon, 08:00 to 12:00; Sat, 09:00 to 13:00', $r['message']);
        $row = collect($this->as($this->kamau)->getJson("/api/admin/projects/{$this->project}/access")->json('people'))->firstWhere('name', 'Njeri');
        $this->assertSame(['outside_hours', 'Outside hours, back on Monday at 08:00', 'info'], [$row['state'], $row['state_words'], $row['status']]);

        $this->hours([], ['member_id' => 99999])->assertNotFound();
    }

    public function test_reading_outside_hours_can_be_allowed_per_project(): void
    {
        $t = $this->hours(self::WEEK, ['read_outside_hours' => true])->assertOk()->json();
        $this->assertTrue($t['hours']['read_outside_hours']);
        Carbon::setTestNow('2026-11-21 12:00:00');   // Saturday
        $this->as($this->njeri)->getJson("/api/admin/projects/{$this->project}")->assertOk();
        $this->assertArrayHasKey('closed', $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'A change on Saturday'])->assertForbidden()->json());
    }

    public function test_hours_are_checked_before_they_are_saved_and_only_set_by_those_who_may(): void
    {
        $this->hours([['day' => 1, 'opens' => '19:00', 'closes' => '07:00']])->assertStatus(422)->assertJson(['message' => 'Monday closes before it opens.']);
        $this->hours([['day' => 8, 'opens' => '07:00', 'closes' => '09:00']])->assertStatus(422);
        $this->hours([['day' => 1, 'opens' => '7am', 'closes' => '09:00']])->assertStatus(422);
        $this->assertSame(0, DB::table('project_hours')->count());

        $this->as($this->njeri)->hours(self::WEEK)->assertForbidden();   // no permission
        $this->grant($this->njeri, ['admin.access', 'projects.use', 'projects.access.rules']);
        $this->hours(self::WEEK)->assertForbidden();   // the permission, but a Member's project role does not set access
        $this->assertSame(0, DB::table('project_hours')->count());
    }

    public function test_someone_outside_hours_can_ask_for_a_pass_that_ends_by_itself(): void
    {
        $this->hours(self::WEEK)->assertOk();
        Carbon::setTestNow('2026-11-16 19:40:00');
        $this->as($this->njeri)->postJson("/api/admin/projects/{$this->project}/access/pass", ['reason' => 'Filing closes at midnight'])->assertCreated();
        $this->assertSame(['Kamau', 'Njeri asks to open P-0001 outside its hours'], $this->sent[0]);
        $this->postJson("/api/admin/projects/{$this->project}/access/pass")->assertStatus(422)->assertJson(['message' => 'You have already asked. Wait for an answer.']);
        $r = $this->getJson("/api/admin/projects/{$this->project}")->assertForbidden()->json('closed');
        $this->assertSame([false, true], [$r['can_ask'], $r['asked']]);

        $t = $this->as($this->kamau)->getJson("/api/admin/projects/{$this->project}/access")->json();
        $this->assertSame([['Njeri', 'asked', 'Filing closes at midnight']], array_map(fn ($p) => [$p['name'], $p['status'], $p['reason']], $t['passes']));
        $pass = $t['passes'][0]['id'];
        $t = $this->putJson("/api/admin/projects/{$this->project}/access/passes/{$pass}", ['approve' => true])->assertOk()->json();
        $this->assertSame(['approved', '2026-11-16 20:40:00'], [$t['passes'][0]['status'], $t['passes'][0]['ends_at']]);
        $this->assertSame(['Njeri', 'You can open P-0001 until 20:40'], $this->sent[1]);
        $this->putJson("/api/admin/projects/{$this->project}/access/passes/{$pass}", ['approve' => true])->assertNotFound();   // answered once

        $this->as($this->njeri)->getJson("/api/admin/projects/{$this->project}")->assertOk();
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Filing'])->assertCreated();   // and work, as far as her project role goes
        Carbon::setTestNow('2026-11-16 20:41:00');
        $this->getJson("/api/admin/projects/{$this->project}")->assertForbidden();
        $this->assertSame(['pass.asked', 'pass.approved'], DB::table('project_log')->where('action', 'like', 'pass.%')->orderBy('id')->pluck('action')->all());
    }

    public function test_a_pass_can_be_declined_or_switched_off_and_strangers_cannot_ask(): void
    {
        $this->hours(self::WEEK)->assertOk();
        Carbon::setTestNow('2026-11-16 19:40:00');
        $this->as($this->njeri)->postJson("/api/admin/projects/{$this->project}/access/pass")->assertCreated();
        $pass = (int) DB::table('project_passes')->value('id');
        $this->putJson("/api/admin/projects/{$this->project}/access/passes/{$pass}", ['approve' => true])->assertForbidden();   // she cannot answer it herself
        $this->as($this->kamau)->putJson("/api/admin/projects/{$this->project}/access/passes/{$pass}", ['approve' => false])->assertOk();
        $this->assertSame(['Njeri', 'Your request to open P-0001 was declined'], end($this->sent));
        $this->as($this->njeri)->getJson("/api/admin/projects/{$this->project}")->assertForbidden();

        $this->as($this->staff('Stranger'))->postJson("/api/admin/projects/{$this->project}/access/pass")->assertNotFound();

        $this->as($this->kamau)->putJson('/api/admin/projects/configuration/access', ['passes' => false])->assertOk();
        $r = $this->as($this->njeri)->getJson("/api/admin/projects/{$this->project}")->assertForbidden()->json('closed');
        $this->assertFalse($r['can_ask']);
        $this->postJson("/api/admin/projects/{$this->project}/access/pass")->assertForbidden();

        Carbon::setTestNow('2026-11-17 09:00:00');
        $this->postJson("/api/admin/projects/{$this->project}/access/pass")->assertStatus(422)->assertJson(['message' => 'It is open to you now.']);
    }

    public function test_a_new_project_starts_with_the_companys_default_hours(): void
    {
        $page = $this->putJson('/api/admin/projects/configuration/access', ['default_hours' => self::WEEK, 'read_outside_hours' => true, 'pass_minutes' => 30, 'warn_days' => 14])->assertOk()->json('access');
        $this->assertSame([14, true, true, 30, 5], [$page['warn_days'], $page['read_outside_hours'], $page['passes'], $page['pass_minutes'], count($page['default_hours'])]);
        $this->putJson('/api/admin/projects/configuration/access', ['pass_minutes' => 2])->assertStatus(422);
        $this->putJson('/api/admin/projects/configuration/access', ['default_hours' => [['day' => 1, 'opens' => '10:00', 'closes' => '09:00']]])->assertStatus(422);

        $id = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id'), 'title' => 'Second'])->assertCreated()->json('project.id');
        $t = $this->getJson("/api/admin/projects/{$id}/access")->assertOk()->json();
        $this->assertSame(['Mon to Fri, 07:00 to 19:00', true], [$t['project_hours'], $t['hours']['read_outside_hours']]);
        $this->assertNull($this->getJson("/api/admin/projects/{$this->project}/access")->json('project_hours'), 'a project that already existed is left as it was');

        $this->as($this->njeri)->putJson('/api/admin/projects/configuration/access', ['warn_days' => 1])->assertForbidden();
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 2.5 (docs/PROJECTS_STAGE2_SPEC.md): signals read from the log, alerts, cooling off, pausing and releasing. */
class ProjectsSecurityTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private User $njeri;
    private User $amina;
    private array $projects = [];
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-16 10:00:00');
        $this->createProjectsWorld();
        $sent = &$this->sent;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$to->name, $type, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.edit', 'projects.phases', 'projects.members.view', 'projects.access.rules', 'projects.confidential']);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.view_all', 'projects.edit', 'projects.phases']);
        $this->amina = $this->staff('Amina', ['projects.use', 'projects.security.view', 'projects.config.actions', 'projects.edit']);
        Sanctum::actingAs($this->kamau, ['*']);
        $type = DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
        foreach (['One', 'Two', 'Three'] as $title) {
            $this->projects[] = (int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => $title])->assertCreated()->json('project.id');
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function as(User $u): static
    {
        Sanctum::actingAs($u, ['*']);

        return $this;
    }

    private function settings(array $o): void
    {
        $current = app(\App\Services\Projects\ProjectSettings::class)->get('security');
        $this->as($this->amina)->putJson('/api/admin/projects/configuration/security', ['settings' => array_replace_recursive($current, $o)])->assertOk();
    }

    /** Njeri sees every project but is on none, so changing one is refused each time. */
    private function refusals(int $n): void
    {
        $this->as($this->njeri);
        for ($i = 0; $i < $n; $i++) {
            $this->putJson('/api/admin/projects/' . $this->projects[$i % 3], ['title' => 'Mine now'])->assertForbidden();
        }
    }

    public function test_many_refusals_raise_one_alert_and_by_default_do_nothing_to_the_person(): void
    {
        $this->settings(['refusals' => ['count' => 4]]);
        $this->refusals(3);
        $this->assertSame(0, DB::table('project_security_events')->count());
        $this->refusals(3);
        $e = DB::table('project_security_events')->get();
        $this->assertCount(1, $e, 'once per window, however many more refusals follow');
        $this->assertSame(['refusals', $this->njeri->id, '4 refusals in 10 minutes across 3 projects', 'alert', null], [$e[0]->signal, (int) $e[0]->user_id, $e[0]->detail, $e[0]->response, $e[0]->hold_until]);
        $this->assertSame(['Amina', 'project_security', 'Projects security: Njeri, many refusals'], $this->sent[0]);
        $this->getJson('/api/admin/projects/' . $this->projects[0])->assertOk();   // an alert holds nobody back

        $page = $this->as($this->amina)->getJson('/api/admin/projects/security')->assertOk()->json();
        $this->assertSame(['Many refusals', 'Njeri', false, 1], [$page['events'][0]['signal_label'], $page['events'][0]['who'], $page['events'][0]['held'], $page['summary']['open']]);
        $this->putJson('/api/admin/projects/security/events/' . $e[0]->id, ['note' => ''])->assertStatus(422);
        $page = $this->putJson('/api/admin/projects/security/events/' . $e[0]->id, ['note' => 'New starter clicking around. Spoken to.'])->assertOk()->json();
        $this->assertSame(['Amina', 'New starter clicking around. Spoken to.', 0], [$page['events'][0]['reviewed_by'], $page['events'][0]['review_note'], $page['summary']['open']]);

        Carbon::setTestNow('2026-11-16 10:11:00');   // a new window
        $this->refusals(4);
        $this->assertSame(2, DB::table('project_security_events')->count());
    }

    public function test_cooling_off_leaves_reading_and_stops_changes_until_it_ends(): void
    {
        $this->settings(['refusals' => ['count' => 3, 'response' => 'slow'], 'cool_off_minutes' => 20]);
        DB::table('project_members')->insert(['project_id' => $this->projects[0], 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->as($this->njeri);
        foreach ([1, 2, 1] as $i) {
            $this->putJson('/api/admin/projects/' . $this->projects[$i], ['title' => 'Mine now'])->assertForbidden();
        }
        $this->assertSame(['slow', '2026-11-16 10:20:00'], [DB::table('project_security_events')->value('response'), DB::table('project_security_events')->value('hold_until')]);
        $this->getJson('/api/admin/projects/' . $this->projects[0])->assertOk();
        $r = $this->postJson('/api/admin/projects/' . $this->projects[0] . '/phases', ['name' => 'Design'])->assertStatus(429)->json();
        $this->assertSame('After unusual activity you can read but not change anything in Projects until 10:20.', $r['message']);
        Carbon::setTestNow('2026-11-16 10:21:00');
        $this->postJson('/api/admin/projects/' . $this->projects[0] . '/phases', ['name' => 'Design'])->assertCreated();
    }

    public function test_a_pause_closes_projects_to_the_person_until_someone_else_releases_them(): void
    {
        $this->settings(['refusals' => ['count' => 3, 'response' => 'pause']]);
        DB::table('project_members')->insert(['project_id' => $this->projects[0], 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->refusals(3);
        $r = $this->getJson('/api/admin/projects')->assertForbidden()->json();
        $this->assertTrue($r['paused']);
        $this->assertStringStartsWith('Your access to Projects is paused after unusual activity.', $r['message']);
        $this->getJson('/api/admin/projects/' . $this->projects[0])->assertForbidden();
        $this->getJson('/api/admin/projects/names')->assertOk();   // the words still load, so the page can say what happened
        Carbon::setTestNow('2026-11-17 10:00:00');
        $this->getJson('/api/admin/projects')->assertForbidden();   // a pause does not run out by itself

        $row = collect($this->as($this->kamau)->getJson('/api/admin/projects/' . $this->projects[0] . '/access')->json('people'))->firstWhere('name', 'Njeri');
        $this->assertSame(['paused', 'Paused by Projects security', 'problem'], [$row['state'], $row['state_words'], $row['status']]);

        $id = (int) DB::table('project_security_events')->value('id');
        $page = $this->as($this->amina)->getJson('/api/admin/projects/security')->json();
        $this->assertSame([true, 1], [$page['events'][0]['held'], $page['summary']['paused']]);
        $this->putJson("/api/admin/projects/security/events/{$id}", ['note' => '', 'release' => true])->assertStatus(422);
        $page = $this->putJson("/api/admin/projects/security/events/{$id}", ['note' => 'Was fixing links after the reorganisation', 'release' => true])->assertOk()->json();
        $this->assertSame([false, 'Amina', 0], [$page['events'][0]['held'], $page['events'][0]['released_by'], $page['summary']['paused']]);
        $this->assertSame(['Njeri', 'project_security', 'Your access to Projects is back'], end($this->sent));
        $this->assertSame('security.released', DB::table('project_log')->orderByDesc('id')->value('action'));
        $this->as($this->njeri)->getJson('/api/admin/projects')->assertOk();
    }

    public function test_the_people_who_can_release_a_pause_are_never_held_themselves(): void
    {
        $this->settings(['refusals' => ['count' => 3, 'response' => 'pause']]);
        $bob = $this->staff('Bob', ['projects.use', 'projects.security.view']);
        $this->grant($this->amina, ['admin.access', 'projects.use', 'projects.view_all', 'projects.security.view', 'projects.config.actions', 'projects.edit']);
        $this->as($this->amina);
        for ($i = 0; $i < 3; $i++) {
            $this->putJson('/api/admin/projects/' . $this->projects[$i], ['title' => 'Mine now'])->assertForbidden();
        }
        $e = DB::table('project_security_events')->first();
        $this->assertSame('alert', $e->response, 'reported, not paused: otherwise the company could be locked out of its own Projects');
        $this->assertSame(['Bob', 'project_security', 'Projects security: Amina, many refusals'], end($this->sent));
        $this->getJson('/api/admin/projects')->assertOk();
        $this->putJson("/api/admin/projects/security/events/{$e->id}", ['note' => 'It was only me'])->assertForbidden();   // nor do they review themselves
        $this->as($bob)->putJson("/api/admin/projects/security/events/{$e->id}", ['note' => 'Checked with her'])->assertOk();
    }

    public function test_wrong_lock_passwords_tries_outside_hours_and_opening_sprees_are_signals_too(): void
    {
        $this->settings(['lock_tries' => ['count' => 3], 'outside_hours' => ['count' => 2], 'opening_spree' => ['count' => 3, 'minutes' => 5], 'refusals' => ['on' => false]]);
        $p = $this->projects[0];
        DB::table('project_members')->insert(['project_id' => $p, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->as($this->kamau)->putJson("/api/admin/projects/{$p}/locks/phases", ['password' => 'blue-kettle-42'])->assertOk();

        $this->as($this->njeri);
        foreach ([1, 2, 3] as $try) {
            $this->postJson("/api/admin/projects/{$p}/locks/phases/open", ['password' => "guess-{$try}"])->assertStatus(422);
        }
        $e = DB::table('project_security_events')->where('signal', 'lock_tries')->first();
        $this->assertSame(['3 wrong lock passwords in 15 minutes', $p], [$e->detail, (int) $e->project_id]);

        $this->as($this->kamau)->putJson("/api/admin/projects/{$p}/access/hours", ['days' => [['day' => 2, 'opens' => '09:00', 'closes' => '10:00']]])->assertOk();   // Tuesdays only; today is Monday
        $this->as($this->njeri)->getJson("/api/admin/projects/{$p}")->assertForbidden();
        $this->getJson("/api/admin/projects/{$p}")->assertForbidden();
        $this->assertSame('2 tries outside hours in 30 minutes', DB::table('project_security_events')->where('signal', 'outside_hours')->value('detail'));
        $this->assertSame(0, DB::table('project_security_events')->where('signal', 'refusals')->count(), 'a signal that is switched off never fires');

        $this->as($this->kamau)->putJson("/api/admin/projects/{$p}/access/hours", ['days' => []])->assertOk();
        $this->as($this->njeri);
        foreach ([0, 1, 0, 1] as $i) {
            $this->getJson('/api/admin/projects/' . $this->projects[$i])->assertOk();   // the same two again and again is not a spree
        }
        $this->assertSame(0, DB::table('project_security_events')->where('signal', 'opening_spree')->count());
        $this->getJson('/api/admin/projects/' . $this->projects[2])->assertOk();
        $this->assertSame('Opened 3 projects in 5 minutes', DB::table('project_security_events')->where('signal', 'opening_spree')->value('detail'));
    }

    public function test_the_settings_are_checked_and_the_screen_is_only_for_those_who_hold_the_permission(): void
    {
        $page = $this->as($this->amina)->getJson('/api/admin/projects/security')->assertOk()->json();
        $this->assertSame([5, ['alert'], 15, 1, true], [count($page['signals']), array_values(array_unique(array_column(array_filter($page['settings'], 'is_array'), 'response'))), $page['settings']['cool_off_minutes'], $page['watchers'], $page['can']['settings']]);
        $bad = fn (array $o) => $this->putJson('/api/admin/projects/configuration/security', ['settings' => array_replace_recursive($page['settings'], $o)])->assertStatus(422);
        $bad(['refusals' => ['count' => 1]]);
        $bad(['refusals' => ['minutes' => 0]]);
        $bad(['refusals' => ['response' => 'dismiss them']]);
        $bad(['cool_off_minutes' => 0]);

        $this->as($this->kamau)->getJson('/api/admin/projects/security')->assertForbidden();
        $bob = $this->staff('Bob', ['projects.use', 'projects.security.view']);
        $this->as($bob)->getJson('/api/admin/projects/security')->assertOk()->assertJsonPath('can.settings', false);
        $this->putJson('/api/admin/projects/configuration/security', ['settings' => $page['settings']])->assertForbidden();
    }
}

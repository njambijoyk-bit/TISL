<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Projects\ProjectAccessList;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 2.1 (docs/PROJECTS_STAGE2_SPEC.md): who can get into a project and why, extending an end date, and the warning before one. */
class ProjectsAccessTabTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const LEAD = ['projects.use', 'projects.create', 'projects.edit', 'projects.members.view', 'projects.members.manage', 'projects.confidential', 'projects.access.rules'];

    private User $kamau;
    private User $njeri;
    private int $project;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', self::LEAD);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.members.view']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id'), 'title' => 'Stock system'])->assertCreated()->json('project.id');
    }

    private function place(User $u, string $role, array $o = []): int
    {
        return (int) DB::table('project_members')->insertGetId($o + ['project_id' => $this->project, 'user_id' => $u->id, 'project_role_id' => DB::table('project_roles')->where('key', $role)->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function tab(): array
    {
        return $this->getJson("/api/admin/projects/{$this->project}/access")->assertOk()->json();
    }

    public function test_each_person_is_listed_with_the_reason_and_whether_they_can_get_in_now(): void
    {
        $this->place($this->njeri, 'member', ['ends_at' => now()->addDays(4)->format('Y-m-d H:i:s')]);
        $this->place($this->staff('Mwangi'), 'finance', ['ends_at' => now()->subDays(3)->format('Y-m-d H:i:s')]);
        $this->place($this->staff('Amina'), 'reviewer', ['starts_at' => now()->addDays(10)->format('Y-m-d H:i:s')]);
        $this->place($this->staff('Wambui'), 'member', ['status' => 'invited']);
        $this->place($this->staff('Otieno', []), 'member');   // lost Projects with a role change
        $this->place($this->staff('Gone'), 'member', ['status' => 'removed']);

        $t = $this->tab();
        $by = collect($t['people'])->keyBy('name');
        $this->assertSame(['Kamau', 'Njeri', 'Otieno', 'Wambui', 'Mwangi', 'Amina'], array_column($t['people'], 'name'), 'by project role, then by name; someone removed is not listed');
        $this->assertSame(['On it as Lead', 'in', 'Can get in', 'good', true], [$by['Kamau']['reason'], $by['Kamau']['state'], $by['Kamau']['state_words'], $by['Kamau']['status'], $by['Kamau']['is_lead']]);
        $this->assertContains('Set its hours, end dates and locked areas', $by['Kamau']['can']);
        $this->assertSame(['Open it', 'Add and change its phases', 'Add and remove links', 'Add, change and assign its tasks', 'Log time on it', 'Write in its conversations', 'Plan its meetings', 'Keep its files: add, share, ask for sign-off, give guest links', 'Work its site: materials, plant, subcontracts, daily record, inspections, snags'], $by['Njeri']['can']);   // a Member works on tasks and logs time since stage 5, talks and meets since stage 6, keeps files since stage 9 and works the site since stage 10
        $this->assertSame(['in', true], [$by['Njeri']['state'], $by['Njeri']['ending_soon']]);
        $this->assertContains($by['Njeri']['ends_in_days'], [3, 4]);
        $this->assertSame(['Was on it as Finance', 'ended', 'problem'], [$by['Mwangi']['reason'], $by['Mwangi']['state'], $by['Mwangi']['status']]);
        $this->assertStringStartsWith('Ended ', $by['Mwangi']['state_words']);
        $this->assertSame([], $by['Mwangi']['can'], 'a place that has ended gives nothing');
        $this->assertSame(['Will be on it as Reviewer', 'not_started'], [$by['Amina']['reason'], $by['Amina']['state']]);
        $this->assertSame(['Invited as Member', 'invited', 'Invited, has not answered'], [$by['Wambui']['reason'], $by['Wambui']['state'], $by['Wambui']['state_words']]);
        $this->assertSame(['no_permission', 'Their TISL role no longer opens Projects'], [$by['Otieno']['state'], $by['Otieno']['state_words']]);
        $this->assertSame(['ending_soon' => 1, 'warn_days' => 7], $t['summary']);
        $this->assertTrue($t['can']['access']);
    }

    public function test_it_shows_who_gets_in_without_being_on_it_and_who_a_confidential_one_is_hidden_from(): void
    {
        $this->staff('Zawadi', ['projects.use', 'projects.view_all']);
        $this->staff('NoProjects', ['projects.view_all']);   // sees all, but cannot open Projects at all
        $this->place($this->staff('Baraka', ['projects.use', 'projects.view_all']), 'member');   // on it: listed above, not here

        $t = $this->tab();
        $this->assertSame(['gets_in', ['Zawadi']], [$t['others']['kind'], array_column($t['others']['people'], 'name')]);

        $this->putJson("/api/admin/projects/{$this->project}", ['confidential' => true])->assertOk();
        $t = $this->tab();
        $this->assertSame(['kept_out', ['Zawadi']], [$t['others']['kind'], array_column($t['others']['people'], 'name')]);
    }

    public function test_an_end_date_is_extended_by_someone_who_may_set_access_and_it_is_logged(): void
    {
        $old = now()->addDays(2)->format('Y-m-d H:i:s');
        $id = $this->place($this->njeri, 'member', ['ends_at' => $old]);
        $t = $this->putJson("/api/admin/projects/{$this->project}/access/members/{$id}", ['ends_at' => now()->addDays(40)->format('Y-m-d')])->assertOk()->json();
        $row = collect($t['people'])->firstWhere('name', 'Njeri');
        $this->assertSame([false, now()->addDays(40)->format('Y-m-d') . ' 23:59:59'], [$row['ending_soon'], $row['ends_at']]);
        $log = DB::table('project_log')->where('action', 'member.extended')->first();
        $this->assertSame([$old, $row['ends_at']], [json_decode($log->old_values, true)['ends_at'], json_decode($log->new_values, true)['ends_at']]);

        $this->putJson("/api/admin/projects/{$this->project}/access/members/{$id}", ['ends_at' => null])->assertOk();
        $this->assertNull(DB::table('project_members')->where('id', $id)->value('ends_at'), 'no end');
        $this->putJson("/api/admin/projects/{$this->project}/access/members/{$id}", ['ends_at' => now()->subDay()->format('Y-m-d')])->assertStatus(422)->assertJson(['message' => 'Choose a date that has not passed.']);
        $this->putJson("/api/admin/projects/{$this->project}/access/members/{$id}", ['ends_at' => 'soon-ish'])->assertStatus(422);
        $this->putJson("/api/admin/projects/{$this->project}/access/members/99999", ['ends_at' => null])->assertNotFound();
    }

    public function test_someone_whose_place_ended_gets_back_in_when_it_is_extended(): void
    {
        $id = $this->place($this->njeri, 'member', ['ends_at' => now()->subDay()->format('Y-m-d H:i:s')]);
        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson("/api/admin/projects/{$this->project}")->assertNotFound();
        Sanctum::actingAs($this->kamau, ['*']);
        $this->putJson("/api/admin/projects/{$this->project}/access/members/{$id}", ['ends_at' => now()->addDays(5)->format('Y-m-d')])->assertOk();
        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson("/api/admin/projects/{$this->project}")->assertOk();
    }

    public function test_both_questions_are_asked_before_an_end_date_moves(): void
    {
        $id = $this->place($this->njeri, 'member', ['ends_at' => now()->addDays(2)->format('Y-m-d H:i:s')]);
        $far = ['ends_at' => now()->addDays(40)->format('Y-m-d')];

        // on it as a Member with the permission: the project role does not set access
        $this->grant($this->njeri, ['admin.access', 'projects.use', 'projects.members.view', 'projects.access.rules']);
        Sanctum::actingAs($this->njeri, ['*']);
        $this->assertFalse($this->tab()['can']['access']);
        $this->putJson("/api/admin/projects/{$this->project}/access/members/{$id}", $far)->assertForbidden();
        $this->assertSame(1, DB::table('project_log')->where('action', 'project.access')->where('result', 'refused')->count(), 'the refusal is logged');

        // the lead without the permission: the route refuses
        $this->grant($this->kamau, array_diff(array_merge(['admin.access'], self::LEAD), ['projects.access.rules']));
        Sanctum::actingAs($this->kamau, ['*']);
        $this->putJson("/api/admin/projects/{$this->project}/access/members/{$id}", $far)->assertForbidden();

        // not on it: it does not exist for them
        Sanctum::actingAs($this->staff('Stranger', ['projects.use', 'projects.members.view', 'projects.access.rules']), ['*']);
        $this->getJson("/api/admin/projects/{$this->project}/access")->assertNotFound();
        $this->putJson("/api/admin/projects/{$this->project}/access/members/{$id}", $far)->assertNotFound();
    }

    public function test_the_lead_is_told_once_before_someones_place_ends(): void
    {
        $sent = [];
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$to->name, $type, $title, $o['action_url'] ?? null];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $id = $this->place($this->njeri, 'member', ['ends_at' => now()->addDays(4)->format('Y-m-d H:i:s')]);
        $this->place($this->staff('Later'), 'member', ['ends_at' => now()->addDays(30)->format('Y-m-d H:i:s')]);
        DB::table('project_members')->where('user_id', $this->kamau->id)->update(['ends_at' => now()->addDays(2)->format('Y-m-d H:i:s')]);   // the lead is not told about themselves

        $list = app(ProjectAccessList::class);
        $this->assertSame(1, $list->warnOfEndings());
        $this->assertSame(['Kamau', 'project_access', "/admin/projects/{$this->project}?tab=access"], [$sent[0][0], $sent[0][1], $sent[0][3]]);
        $this->assertStringContainsString("Njeri's access to P-0001 ends on", $sent[0][2]);
        $this->assertSame(0, $list->warnOfEndings(), 'only once for that date');

        DB::table('project_members')->where('id', $id)->update(['ends_at' => now()->addDays(6)->format('Y-m-d H:i:s')]);
        $this->assertSame(1, $list->warnOfEndings(), 'a moved date is a new warning');

        app(\App\Services\Projects\ProjectSettings::class)->save('access', ['warn_days' => 0], $this->kamau);
        DB::table('project_members')->where('id', $id)->update(['ends_at' => now()->addDays(1)->format('Y-m-d H:i:s')]);
        $this->assertSame(0, $list->warnOfEndings(), 'warnings can be switched off');
    }
}

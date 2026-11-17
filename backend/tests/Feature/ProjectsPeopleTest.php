<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Projects, build 1.5 (docs/PROJECTS_STAGE1_SPEC.md): the people on a project (invite, accept, role, dates, remove), handing it to another lead,
 * and the project roles an owner defines.
 */
class ProjectsPeopleTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const LEAD = ['projects.use', 'projects.create', 'projects.edit', 'projects.members.view', 'projects.members.manage', 'projects.transfer', 'projects.confidential'];

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
        $this->project = $this->start('Stock system');
    }

    private function start(string $title, array $o = []): int
    {
        return (int) $this->postJson('/api/admin/projects', $o + ['type_id' => DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id'), 'title' => $title])->assertCreated()->json('project.id');
    }

    private function role(string $key): int
    {
        return (int) DB::table('project_roles')->where('key', $key)->value('id');
    }

    private function memberId(User $u, ?int $project = null): int
    {
        return (int) DB::table('project_members')->where('project_id', $project ?? $this->project)->where('user_id', $u->id)->value('id');
    }

    public function test_someone_invited_is_on_the_project_only_once_they_accept(): void
    {
        $r = $this->postJson("/api/admin/projects/{$this->project}/members", ['user_id' => $this->njeri->id, 'project_role_id' => $this->role('member')])->assertCreated()->json();
        $row = collect($r['members'])->firstWhere('name', 'Njeri');
        $this->assertSame(['invited', false, 'Member', 'Kamau'], [$row['status'], $row['on_it'], $row['role']['name'], $row['invited_by']]);
        $this->assertNotContains('Njeri', array_column($r['candidates'], 'name'), 'someone already asked is not offered again');
        $this->postJson("/api/admin/projects/{$this->project}/members", ['user_id' => $this->njeri->id, 'project_role_id' => $this->role('member')])->assertStatus(422);

        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson("/api/admin/projects/{$this->project}")->assertNotFound();   // invited is not on it
        $inv = $this->getJson('/api/admin/projects/invitations')->assertOk()->json('invitations');
        $this->assertSame([['P-0001', 'Stock system', 'Member', 'Kamau']], array_map(fn ($i) => [$i['number'], $i['title'], $i['role'], $i['invited_by']], $inv));

        $this->putJson("/api/admin/projects/{$this->project}/invitation", ['accept' => true])->assertOk()->assertJsonCount(0, 'invitations');
        $this->getJson("/api/admin/projects/{$this->project}")->assertOk();
        $this->putJson("/api/admin/projects/{$this->project}/invitation", ['accept' => true])->assertNotFound();   // nothing left to answer
        $this->assertSame(['project.created', 'member.invited', 'member.accepted'], DB::table('project_log')->where('result', 'done')->orderBy('id')->pluck('action')->all());
    }

    public function test_declining_keeps_them_off_and_they_can_be_asked_again(): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/members", ['user_id' => $this->njeri->id, 'project_role_id' => $this->role('member')])->assertCreated();
        Sanctum::actingAs($this->njeri, ['*']);
        $this->putJson("/api/admin/projects/{$this->project}/invitation", ['accept' => false])->assertOk();
        $this->getJson("/api/admin/projects/{$this->project}")->assertNotFound();

        Sanctum::actingAs($this->kamau, ['*']);
        $again = $this->postJson("/api/admin/projects/{$this->project}/members", ['user_id' => $this->njeri->id, 'project_role_id' => $this->role('reviewer')])->assertCreated()->json('members');
        $this->assertSame('invited', collect($again)->firstWhere('name', 'Njeri')['status']);
        $this->assertSame(1, DB::table('project_members')->where('user_id', $this->njeri->id)->count(), 'the same row is reused');
    }

    public function test_an_invitation_to_a_confidential_project_does_not_give_its_title_away(): void
    {
        $secret = $this->start('Secret takeover', ['confidential' => true]);
        $this->postJson("/api/admin/projects/{$secret}/members", ['user_id' => $this->njeri->id, 'project_role_id' => $this->role('member')])->assertCreated();
        Sanctum::actingAs($this->njeri, ['*']);
        $inv = $this->getJson('/api/admin/projects/invitations')->json('invitations')[0];
        $this->assertSame([null, true, 'P-0002'], [$inv['title'], $inv['confidential'], $inv['number']]);
    }

    public function test_only_someone_who_can_open_projects_and_only_a_role_that_is_on_can_be_used(): void
    {
        $post = fn (array $d) => $this->postJson("/api/admin/projects/{$this->project}/members", $d);
        $post(['user_id' => $this->staff('Outsider', ['admin.access'])->id, 'project_role_id' => $this->role('member')])->assertStatus(422);
        $post(['user_id' => 9999, 'project_role_id' => $this->role('member')])->assertStatus(422);
        $post(['user_id' => $this->njeri->id, 'project_role_id' => 9999])->assertStatus(422);
        DB::table('project_roles')->where('key', 'reviewer')->update(['is_active' => 0]);
        $post(['user_id' => $this->njeri->id, 'project_role_id' => $this->role('reviewer')])->assertStatus(422);
        $post(['user_id' => $this->njeri->id, 'project_role_id' => $this->role('member'), 'starts_at' => '2027-02-01', 'ends_at' => '2027-01-01'])->assertStatus(422);
        $this->assertSame(1, DB::table('project_members')->count());
    }

    public function test_access_can_be_given_for_dates_and_a_day_means_the_whole_day(): void
    {
        $today = now()->toDateString();
        $this->postJson("/api/admin/projects/{$this->project}/members", ['user_id' => $this->njeri->id, 'project_role_id' => $this->role('member'), 'starts_at' => $today, 'ends_at' => $today])->assertCreated();
        $row = DB::table('project_members')->where('user_id', $this->njeri->id)->first();
        $this->assertSame([$today . ' 00:00:00', $today . ' 23:59:59'], [$row->starts_at, $row->ends_at]);
        Sanctum::actingAs($this->njeri, ['*']);
        $this->putJson("/api/admin/projects/{$this->project}/invitation", ['accept' => true])->assertOk();
        $this->getJson("/api/admin/projects/{$this->project}")->assertOk();

        Sanctum::actingAs($this->kamau, ['*']);
        $yesterday = now()->subDay()->toDateString();
        $r = $this->putJson("/api/admin/projects/{$this->project}/members/" . $this->memberId($this->njeri), ['starts_at' => null, 'ends_at' => $yesterday])->assertOk()->json('members');
        $this->assertFalse(collect($r)->firstWhere('name', 'Njeri')['on_it']);
        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson("/api/admin/projects/{$this->project}")->assertNotFound();
    }

    public function test_only_someone_whose_role_manages_people_changes_roles_or_removes_and_the_lead_cannot_be_removed(): void
    {
        $this->postJson("/api/admin/projects/{$this->project}/members", ['user_id' => $this->njeri->id, 'project_role_id' => $this->role('member')])->assertCreated();
        Sanctum::actingAs($this->njeri, ['*']);
        $this->putJson("/api/admin/projects/{$this->project}/invitation", ['accept' => true])->assertOk();
        $this->grant($this->njeri, ['admin.access', 'projects.use', 'projects.members.view', 'projects.members.manage']);   // holds the permission, but is only a Member here
        $list = $this->getJson("/api/admin/projects/{$this->project}/members")->assertOk()->json();
        $this->assertSame(['members' => false, 'transfer' => false], $list['can']);
        $this->assertSame([], $list['candidates']);
        $this->putJson("/api/admin/projects/{$this->project}/members/" . $this->memberId($this->njeri), ['project_role_id' => $this->role('lead')])->assertForbidden();
        $this->deleteJson("/api/admin/projects/{$this->project}/members/" . $this->memberId($this->kamau))->assertForbidden();

        Sanctum::actingAs($this->kamau, ['*']);
        $this->deleteJson("/api/admin/projects/{$this->project}/members/" . $this->memberId($this->kamau))->assertStatus(422)->assertJsonPath('message', 'This is the lead. Transfer it to someone else first.');
        $this->putJson("/api/admin/projects/{$this->project}/members/" . $this->memberId($this->kamau), ['project_role_id' => $this->role('reviewer')])->assertStatus(422);   // would leave nobody managing its people
        $this->assertSame($this->role('lead'), (int) DB::table('project_members')->where('id', $this->memberId($this->kamau))->value('project_role_id'), 'the refused change was undone');

        $this->putJson("/api/admin/projects/{$this->project}/members/" . $this->memberId($this->njeri), ['project_role_id' => $this->role('finance')])->assertOk();
        $left = $this->deleteJson("/api/admin/projects/{$this->project}/members/" . $this->memberId($this->njeri))->assertOk()->json('members');
        $this->assertSame(['Kamau'], array_column($left, 'name'));
        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson("/api/admin/projects/{$this->project}")->assertNotFound();
    }

    public function test_transfer_hands_the_project_to_a_new_lead_keeps_the_old_one_on_it_and_leaves_a_note(): void
    {
        $r = $this->postJson("/api/admin/projects/{$this->project}/transfer", ['user_id' => $this->njeri->id, 'note' => 'Kamau is on leave from Monday'])->assertOk()->json('project');
        $this->assertSame('Njeri', $r['lead']['name']);
        $this->assertFalse($r['can']['edit'], 'the old lead is now a Member');
        $roles = DB::table('project_members as m')->join('project_roles as r', 'r.id', '=', 'm.project_role_id')->where('m.project_id', $this->project)->pluck('r.key', 'm.user_id')->all();
        $this->assertEquals([$this->kamau->id => 'member', $this->njeri->id => 'lead'], $roles);
        $log = DB::table('project_log')->where('action', 'project.transferred')->first();
        $this->assertSame('Kamau is on leave from Monday', json_decode($log->new_values, true)['note']);

        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson("/api/admin/projects/{$this->project}")->assertOk()->assertJsonPath('project.can.open', true);   // on it at once, no invitation to accept
        $this->postJson("/api/admin/projects/{$this->project}/transfer", ['user_id' => $this->kamau->id])->assertForbidden();   // she does not hold projects.transfer
    }

    public function test_transfer_is_checked(): void
    {
        $t = fn (int $to) => $this->postJson("/api/admin/projects/{$this->project}/transfer", ['user_id' => $to]);
        $t($this->kamau->id)->assertStatus(422);
        $t(9999)->assertStatus(422);
        $t($this->staff('Outsider', ['admin.access'])->id)->assertStatus(422);
        $this->assertSame($this->kamau->id, (int) DB::table('projects')->where('id', $this->project)->value('lead_user_id'));
    }

    public function test_a_project_whose_lead_is_gone_can_be_rescued_by_someone_who_sees_all_and_may_transfer_but_never_a_confidential_one(): void
    {
        $secret = $this->start('Secret', ['confidential' => true]);
        $boss = $this->staff('Boss', ['projects.use', 'projects.view_all', 'projects.transfer', 'projects.members.view', 'projects.members.manage']);   // on nothing
        Sanctum::actingAs($boss, ['*']);
        $list = $this->getJson("/api/admin/projects/{$this->project}/members")->assertOk()->json();
        $this->assertSame(['members' => false, 'transfer' => true], $list['can']);
        $this->postJson("/api/admin/projects/{$this->project}/members", ['user_id' => $boss->id, 'project_role_id' => $this->role('lead')])->assertForbidden();   // cannot simply add themselves
        $this->postJson("/api/admin/projects/{$this->project}/transfer", ['user_id' => $this->njeri->id, 'note' => 'Kamau has left'])->assertOk()->assertJsonPath('project.lead.name', 'Njeri');
        $this->postJson("/api/admin/projects/{$secret}/transfer", ['user_id' => $this->njeri->id])->assertNotFound();
        $this->assertSame($this->kamau->id, (int) DB::table('projects')->where('id', $secret)->value('lead_user_id'));
    }

    // ------------------------------------------------------------------ project roles

    public function test_an_owner_adds_a_project_role_changes_what_it_allows_and_it_takes_effect(): void
    {
        $this->grant($this->kamau, array_merge(['admin.access', 'projects.config.view', 'projects.config.roles', 'projects.phases'], self::LEAD));
        $page = $this->getJson('/api/admin/projects/configuration/roles')->assertOk()->json();
        $this->assertSame(['Lead', 'Member', 'Finance', 'Reviewer', 'Client', 'Guest'], array_column($page['roles'], 'name'));
        $this->assertSame(['open', 'edit', 'stage', 'phases', 'members', 'links', 'log', 'access', 'money', 'tasks', 'time', 'approve_time'], $page['roles'][0]['abilities']);
        $this->assertSame(1, $page['roles'][0]['people']);
        $this->assertArrayHasKey('open_shared', $page['abilities']);

        $roles = $this->postJson('/api/admin/projects/configuration/roles', ['name' => 'Site agent', 'description' => 'Runs the site day to day', 'abilities' => ['open', 'phases']])->assertCreated()->json('roles');
        $agent = collect($roles)->firstWhere('name', 'Site agent');
        $this->assertSame(['site_agent', false, ['open', 'phases']], [$agent['key'], $agent['is_system'], $agent['abilities']]);

        $this->grant($this->njeri, ['admin.access', 'projects.use', 'projects.phases', 'projects.edit']);
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => $agent['id'], 'status' => 'active']);
        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson("/api/admin/projects/{$this->project}/phases", ['name' => 'Foundations'])->assertCreated();
        $this->putJson("/api/admin/projects/{$this->project}", ['title' => 'Renamed'])->assertForbidden();

        Sanctum::actingAs($this->kamau, ['*']);
        $this->putJson("/api/admin/projects/configuration/roles/{$agent['id']}", ['name' => 'Site manager', 'abilities' => ['open', 'phases', 'edit']])->assertOk();
        Sanctum::actingAs($this->njeri, ['*']);
        $this->putJson("/api/admin/projects/{$this->project}", ['title' => 'Renamed'])->assertOk();   // what a role allows is read afresh every time
        $this->assertSame(['project_role.added', 'project_role.changed'], DB::table('project_log')->where('subject_type', 'project_role')->orderBy('id')->pluck('action')->all());
    }

    public function test_project_roles_are_checked_and_the_lead_role_cannot_be_broken(): void
    {
        $this->grant($this->kamau, array_merge(['admin.access', 'projects.config.view', 'projects.config.roles'], self::LEAD));
        $lead = $this->role('lead');
        $this->putJson("/api/admin/projects/configuration/roles/{$lead}", ['abilities' => ['open', 'edit']])->assertStatus(422);       // would stop leads managing people
        $this->putJson("/api/admin/projects/configuration/roles/{$lead}", ['is_active' => false])->assertStatus(422);
        $this->putJson("/api/admin/projects/configuration/roles/{$lead}", ['name' => 'Partner in charge'])->assertOk();              // renaming is fine
        $this->putJson("/api/admin/projects/configuration/roles/{$lead}", ['is_active' => false, 'name' => 'x'])->assertStatus(422);
        $this->postJson('/api/admin/projects/configuration/roles', ['name' => ' ', 'abilities' => ['open']])->assertStatus(422);
        $this->postJson('/api/admin/projects/configuration/roles', ['name' => 'Odd', 'abilities' => ['open', 'launch_rockets']])->assertStatus(422);
        $this->putJson('/api/admin/projects/configuration/roles/9999', ['name' => 'x'])->assertNotFound();

        // a role people hold cannot be switched off under them; an unused one can
        $this->postJson("/api/admin/projects/{$this->project}/members", ['user_id' => $this->njeri->id, 'project_role_id' => $this->role('member')])->assertCreated();
        $this->putJson('/api/admin/projects/configuration/roles/' . $this->role('member'), ['is_active' => false])->assertStatus(422);
        $this->putJson('/api/admin/projects/configuration/roles/' . $this->role('guest'), ['is_active' => false])->assertOk();
        // two roles with the same name get different keys
        $a = $this->postJson('/api/admin/projects/configuration/roles', ['name' => 'Guest', 'abilities' => ['open_shared']])->assertCreated()->json('roles');
        $this->assertContains('guest_2', array_column($a, 'key'));

        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson('/api/admin/projects/configuration/roles', ['name' => 'Mine', 'abilities' => ['open']])->assertForbidden();
    }
}

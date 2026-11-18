<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 2.4 (docs/PROJECTS_STAGE2_SPEC.md): serious actions that wait for a supervisor, and the table in Configuration that says which they are. */
class ProjectsSeriousTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const LEAD = ['projects.use', 'projects.create', 'projects.edit', 'projects.delete', 'projects.purge', 'projects.close', 'projects.stage', 'projects.freeze', 'projects.confidential', 'projects.transfer',
        'projects.members.view', 'projects.members.manage', 'projects.config.view', 'projects.config.actions', 'projects.config.roles', 'projects.approve'];
    private const ASK = ['X-Projects-Ask' => '1'];

    private User $kamau;
    private User $amina;
    private int $project;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-16 10:00:00');
        $this->createProjectsWorld();
        $this->app->instance(\App\Services\Notify\Notifier::class, new class extends \App\Services\Notify\Notifier {
            public function __construct() {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', self::LEAD);
        $this->amina = $this->staff('Amina', ['projects.use', 'projects.view_all', 'projects.approve', 'projects.delete']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id'), 'title' => 'Stock system', 'confidential' => true])->assertCreated()->json('project.id');
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

    private function rules(array $rules): \Illuminate\Testing\TestResponse
    {
        return $this->putJson('/api/admin/projects/configuration/serious', ['rules' => $rules]);
    }

    private function approve(): int
    {
        $id = (int) DB::table('project_approvals')->where('status', 'waiting')->max('id');
        $this->as($this->amina)->putJson("/api/admin/projects/approvals/{$id}", ['approve' => true])->assertOk();
        $this->as($this->kamau);

        return $id;
    }

    public function test_out_of_the_box_nothing_is_serious_and_the_table_is_changed_only_with_the_permission(): void
    {
        $page = $this->getJson('/api/admin/projects/configuration/serious')->assertOk()->json();
        $this->assertSame(16, count($page['actions']));   // 8 from stage 2, paying out held money and switching off its guard (4.5), posting a bill (4.6), releasing retention (4.7), approving a change (5.5), reopening approved time (5.7), writing off time or costs (5.8), handing over someone's work (6.8)
        $this->assertSame(['none'], array_values(array_unique(array_column($page['rules'], 'needs'))));
        $this->assertSame(['both', true], [$page['suggested']['project.purge']['needs'], $page['suggested']['project.purge']['reason']]);
        $this->assertSame([false, 2, true], [$page['identity_ready'], $page['approvers'], $page['can']['change']]);
        $this->putJson("/api/admin/projects/{$this->project}", ['confidential' => false])->assertOk();   // nothing asked

        $page = $this->rules(['project.unfreeze' => ['needs' => 'supervisor', 'on_project' => true, 'reason' => true], 'role.change' => ['needs' => 'supervisor', 'on_project' => true], 'project.delete' => ['needs' => 'none', 'reason' => true]])->assertOk()->json('rules');
        $this->assertSame(['needs' => 'supervisor', 'on_project' => true, 'reason' => true], $page['project.unfreeze']);
        $this->assertFalse($page['role.change']['on_project'], 'a role is not about one project');
        $this->assertFalse($page['project.delete']['reason'], 'an action that needs nothing asks for no reason');
        $this->rules(['project.delete' => ['needs' => 'a quick prayer']])->assertStatus(422);
        $this->assertSame('settings.saved', DB::table('project_log')->orderByDesc('id')->value('action'), 'changing the table is logged');

        $this->as($this->amina)->rules(['project.delete' => ['needs' => 'supervisor']])->assertForbidden();
    }

    public function test_an_action_that_needs_a_supervisor_waits_and_happens_only_after_approval(): void
    {
        $this->rules(['project.open_up' => ['needs' => 'supervisor', 'reason' => true]])->assertOk();
        $url = "/api/admin/projects/{$this->project}";

        $r = $this->putJson($url, ['confidential' => false])->assertStatus(428)->json();
        $this->assertSame(['ask', 'project.open_up', 'supervisor', true], [$r['serious']['state'], $r['serious']['action'], $r['serious']['needs'], $r['serious']['reason_required']]);
        $this->putJson($url, ['confidential' => false], self::ASK)->assertStatus(428);   // a reason is required
        $this->assertSame(0, DB::table('project_approvals')->count());

        $r = $this->putJson($url, ['confidential' => false], self::ASK + ['X-Projects-Reason' => rawurlencode('Client agreed, 100% sure')])->assertStatus(409)->json();
        $this->assertSame(['asked', 0], [$r['serious']['state'], $r['serious']['approvers']], 'it is confidential and no supervisor is on it yet');
        $a = DB::table('project_approvals')->first();
        $this->assertSame(['action', 'project.open_up', 'Make P-0001 (Stock system) open to everyone who sees all projects', 'Client agreed, 100% sure'], [$a->kind, $a->action, $a->summary, $a->reason]);
        $this->assertSame(1, (int) DB::table('projects')->where('id', $this->project)->value('confidential'), 'nothing has changed');
        $this->assertSame('waiting', $this->putJson($url, ['confidential' => false])->assertStatus(409)->json('serious.state'));
        $this->putJson($url, ['title' => 'Renamed meanwhile'])->assertOk();   // other changes are not held up

        // Amina sees every project, but this one is confidential and she is not on it: she cannot answer for it
        $this->assertSame([], $this->as($this->amina)->getJson('/api/admin/projects/approvals')->json('waiting'));
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->amina->id, 'project_role_id' => DB::table('project_roles')->where('key', 'reviewer')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->assertSame(1, count($this->getJson('/api/admin/projects/approvals')->json('waiting')));
        $id = $this->approve();
        $this->assertSame(1, (int) DB::table('projects')->where('id', $this->project)->value('confidential'), 'approval alone changes nothing');

        $this->assertFalse($this->putJson($url, ['confidential' => false])->assertOk()->json('project.confidential'));
        $this->assertSame('used', DB::table('project_approvals')->where('id', $id)->value('status'));
        $this->putJson($url, ['confidential' => true])->assertOk();
        $this->putJson($url, ['confidential' => false])->assertStatus(428);   // an approval is used once
    }

    public function test_the_approval_is_for_exactly_what_was_asked(): void
    {
        $this->rules(['member.remove' => ['needs' => 'supervisor'], 'project.transfer' => ['needs' => 'supervisor']])->assertOk();
        $njeri = $this->staff('Njeri');
        $otieno = $this->staff('Otieno');
        $place = fn (User $u) => (int) DB::table('project_members')->insertGetId(['project_id' => $this->project, 'user_id' => $u->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $n = $place($njeri);
        $o = $place($otieno);
        $place($this->amina);

        $this->deleteJson("/api/admin/projects/{$this->project}/members/{$n}", [], self::ASK)->assertStatus(409);
        $this->assertSame('Remove Njeri from P-0001 (Stock system)', DB::table('project_approvals')->value('summary'));
        $this->approve();
        $this->deleteJson("/api/admin/projects/{$this->project}/members/{$o}")->assertStatus(428);   // approved for Njeri, not for Otieno
        $this->deleteJson("/api/admin/projects/{$this->project}/members/{$n}")->assertOk();
        $this->assertSame('removed', DB::table('project_members')->where('id', $n)->value('status'));

        $this->postJson("/api/admin/projects/{$this->project}/transfer", ['user_id' => $otieno->id], self::ASK)->assertStatus(409);
        $this->approve();
        $this->postJson("/api/admin/projects/{$this->project}/transfer", ['user_id' => $this->amina->id])->assertStatus(428);   // a different new lead is a different request
        $this->assertSame('Otieno', $this->postJson("/api/admin/projects/{$this->project}/transfer", ['user_id' => $otieno->id])->assertOk()->json('project.lead.name'));
    }

    public function test_nobody_is_asked_for_approval_for_something_they_may_not_do(): void
    {
        $this->rules(['project.unfreeze' => ['needs' => 'supervisor'], 'project.delete' => ['needs' => 'supervisor']])->assertOk();
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.delete', 'projects.freeze']);
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $this->as($njeri)->deleteJson("/api/admin/projects/{$this->project}", [], self::ASK)->assertForbidden();   // a Member's project role does not change it
        $this->assertSame(0, DB::table('project_approvals')->count());
    }

    public function test_each_listed_action_can_be_made_to_wait(): void
    {
        $this->rules(array_fill_keys(['project.delete', 'project.purge', 'project.reopen', 'project.unfreeze', 'role.change'], ['needs' => 'supervisor']))->assertOk();
        $url = "/api/admin/projects/{$this->project}";
        DB::table('projects')->where('id', $this->project)->update(['confidential' => 0]);   // so Amina, who sees all projects, can answer

        $closed = (int) DB::table('project_stages')->where('type_id', DB::table('projects')->where('id', $this->project)->value('type_id'))->where('state', 'closed')->value('id');
        $this->putJson("{$url}/stage", ['stage_id' => $closed])->assertOk();
        $this->putJson("{$url}/freeze", ['frozen' => true])->assertOk();   // freezing is not on the list, unfreezing is
        $this->putJson("{$url}/freeze", ['frozen' => false], self::ASK)->assertStatus(409);
        $this->approve();
        $this->putJson("{$url}/freeze", ['frozen' => false])->assertOk();

        $open = (int) DB::table('project_stages')->where('type_id', DB::table('projects')->where('id', $this->project)->value('type_id'))->where('state', 'open')->value('id');
        $this->putJson("{$url}/stage", ['stage_id' => $open], self::ASK)->assertStatus(409);   // a closed project moved back to an open stage is a reopening
        $this->approve();
        $this->putJson("{$url}/stage", ['stage_id' => $open])->assertOk();
        $this->putJson("{$url}/state", ['action' => 'cancel'])->assertOk();
        $this->putJson("{$url}/state", ['action' => 'reopen'], self::ASK)->assertStatus(409);   // and so is bringing back a cancelled one
        $this->approve();
        $this->putJson("{$url}/state", ['action' => 'reopen'])->assertOk();

        $this->deleteJson($url, [], self::ASK)->assertStatus(409);
        $this->approve();
        $this->deleteJson($url)->assertOk();

        $this->postJson('/api/admin/projects/trash/purge', ['type' => 'project', 'id' => $this->project], self::ASK)->assertStatus(409);
        $this->assertSame('Delete P-0001 (Stock system) for good', DB::table('project_approvals')->orderByDesc('id')->value('summary'));
        $this->approve();   // Amina holds projects.delete, which is what lets her see the trash
        $this->postJson('/api/admin/projects/trash/purge', ['type' => 'project', 'id' => $this->project])->assertOk();
        $this->assertNull(DB::table('projects')->where('id', $this->project)->first());

        $role = (int) DB::table('project_roles')->where('key', 'reviewer')->value('id');
        $this->putJson("/api/admin/projects/configuration/roles/{$role}", ['name' => 'Second reader'])->assertOk();   // a new name is not a change of what it can do
        $this->putJson("/api/admin/projects/configuration/roles/{$role}", ['abilities' => ['open', 'log', 'links']], self::ASK)->assertStatus(409);
        $this->approve();
        $this->putJson("/api/admin/projects/configuration/roles/{$role}", ['abilities' => ['open', 'edit']])->assertStatus(428);   // not what was approved
        $this->putJson("/api/admin/projects/configuration/roles/{$role}", ['abilities' => ['links', 'open', 'log']])->assertOk();   // the same abilities in any order
    }

    public function test_the_supervisor_can_be_required_to_be_on_the_project_and_identity_needs_core_to_be_ready(): void
    {
        DB::table('projects')->where('id', $this->project)->update(['confidential' => 0]);
        $this->rules(['project.delete' => ['needs' => 'supervisor', 'on_project' => true], 'project.transfer' => ['needs' => 'identity']])->assertOk();
        $r = $this->deleteJson("/api/admin/projects/{$this->project}", [], self::ASK)->assertStatus(409)->json();
        $this->assertSame('Asked, but nobody can approve this right now. Nothing has changed. Tell whoever manages Projects.', $r['message']);
        $this->assertSame([], $this->as($this->amina)->getJson('/api/admin/projects/approvals')->json('waiting'), 'she can open it, but is not on it');

        // this test world has no Core step-up tables, so identity cannot be confirmed: the action is refused, never waved through
        $r = $this->as($this->kamau)->postJson("/api/admin/projects/{$this->project}/transfer", ['user_id' => $this->amina->id])->assertStatus(409)->json('message');
        $this->assertStringStartsWith('This needs you to confirm who you are, and that is not set up on this system yet.', $r);
        $this->assertSame($this->kamau->id, (int) DB::table('projects')->where('id', $this->project)->value('lead_user_id'));
    }
}

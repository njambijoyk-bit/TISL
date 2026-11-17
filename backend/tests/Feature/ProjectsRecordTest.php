<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Projects\ProjectCostCentres;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Projects, build 1.3 (docs/PROJECTS_STAGE1_SPEC.md): the project record. Starting one makes its number and its cost centre in the books in one
 * step; who may see and change it is two questions (their TISL role, and their role on the project); a confidential one exists only for the
 * people on it; stages, hold, cancel, close and freeze. On the tables and starter rows exactly as script 257 makes them.
 */
class ProjectsRecordTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const LEAD = ['projects.use', 'projects.create', 'projects.edit', 'projects.stage', 'projects.close', 'projects.freeze', 'projects.confidential', 'projects.log.view', 'projects.members.view'];

    private User $kamau;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', self::LEAD);
        Sanctum::actingAs($this->kamau, ['*']);
    }

    private function type(string $industry, string $name): int
    {
        return (int) DB::table('project_types')->where('industry_key', $industry)->where('name', $name)->value('id');
    }

    private function stage(int $typeId, string $name): int
    {
        return (int) DB::table('project_stages')->where('type_id', $typeId)->where('name', $name)->value('id');
    }

    /** Start a project as whoever is signed in and give back what the screen gets. */
    private function start(array $o = []): array
    {
        return $this->postJson('/api/admin/projects', $o + ['type_id' => $this->type('general', 'Client project'), 'title' => 'Stock system', 'location_id' => 1])->assertCreated()->json('project');
    }

    private function as(User $u): void
    {
        Sanctum::actingAs($u, ['*']);
    }

    private function refusals(): array
    {
        return DB::table('project_log')->where('result', 'refused')->orderBy('id')->get(['actor_id', 'action', 'reason'])->map(fn ($r) => (array) $r)->all();
    }

    // ------------------------------------------------------------------ starting

    public function test_starting_a_project_gives_it_a_number_a_cost_centre_a_first_stage_and_its_lead_in_one_step(): void
    {
        $p = $this->start(['customer_id' => 1, 'reference' => 'PO 4471', 'priority' => 'high', 'start_date' => '2026-11-14', 'due_date' => '2027-06-30']);
        $this->assertSame('P-0001', $p['number']);
        $this->assertSame(['id' => 1, 'name' => 'Imara Sacco'], $p['customer']);
        $this->assertSame('Planning', $p['stage']['name']);
        $this->assertSame('open', $p['state']);
        $this->assertSame('Kamau', $p['lead']['name']);
        $this->assertSame('Nairobi › Projects › P-0001 Stock system', $p['cost_centre_path']);
        $this->assertSame(['Planning', 'Active', 'Closing', 'Closed'], array_column($p['stages'], 'name'));
        $this->assertTrue($p['can']['edit']);

        $cc = DB::table('cost_centres')->where('id', $p['cost_centre_id'])->first();
        $this->assertSame(['P-0001', 'project', 1], [$cc->code, $cc->purpose, (int) $cc->location_id]);
        $parent = DB::table('cost_centres')->where('id', $cc->parent_id)->first();
        $this->assertSame(['Projects', 'projects', 1], [$parent->name, $parent->purpose, (int) $parent->parent_id]);

        $this->assertSame(['lead'], DB::table('project_members as m')->join('project_roles as r', 'r.id', '=', 'm.project_role_id')->where('m.project_id', $p['id'])->pluck('r.key')->all());
        $log = DB::table('project_log')->where('project_id', $p['id'])->first();
        $this->assertSame(['project.created', 'done', $this->kamau->id], [$log->action, $log->result, (int) $log->actor_id]);
        $this->assertSame(2, (int) DB::table('project_series')->where('prefix', 'P')->value('next_number'));

        // the next one takes the next number and shares the branch's "Projects" cost centre
        $q = $this->start(['title' => 'POS rollout']);
        $this->assertSame('P-0002', $q['number']);
        $this->assertSame(1, DB::table('cost_centres')->where('purpose', 'projects')->count());
    }

    public function test_whoever_starts_a_project_for_another_lead_stays_on_it_as_a_member(): void
    {
        $njeri = $this->staff('Njeri');
        $p = $this->start(['lead_user_id' => $njeri->id]);
        $this->assertSame('Njeri', $p['lead']['name']);
        $roles = DB::table('project_members as m')->join('project_roles as r', 'r.id', '=', 'm.project_role_id')->where('m.project_id', $p['id'])->pluck('r.key', 'm.user_id')->all();
        $this->assertEquals([$njeri->id => 'lead', $this->kamau->id => 'member'], $roles);
        $this->assertFalse($p['can']['edit'], 'a member does not change the details');
        $this->assertTrue($p['can']['open']);
    }

    public function test_a_project_can_use_another_industry_only_while_the_setting_allows_it_and_is_shown_in_its_own_words(): void
    {
        $p = $this->start(['industry_key' => 'legal', 'type_id' => $this->type('legal', 'Litigation'), 'title' => 'Imara v. Baraka']);
        $this->assertSame('M-0001', $p['number']);
        $this->assertSame('Opening', $p['stage']['name']);
        $this->assertSame('Matter', $p['words']['project']['name'], 'the company works in General, but this one is a matter');
        $this->assertSame('Case number', $p['words']['reference']['name']);

        $this->grant($this->kamau, array_merge(['admin.access', 'projects.config.view', 'projects.config.manage'], self::LEAD));
        $this->putJson('/api/admin/projects/configuration/general', ['project_may_use_other_industry' => false])->assertOk();
        $this->postJson('/api/admin/projects', ['industry_key' => 'legal', 'type_id' => $this->type('legal', 'Litigation'), 'title' => 'Another'])->assertStatus(422);
        $this->assertSame(['general'], array_column($this->getJson('/api/admin/projects/options')->json('industries'), 'key'));
    }

    public function test_what_is_sent_is_checked_before_anything_is_made(): void
    {
        $general = $this->type('general', 'Client project');
        $bad = fn (array $d) => $this->postJson('/api/admin/projects', $d + ['type_id' => $general, 'title' => 'X'])->assertStatus(422);
        $bad(['title' => '   ']);
        $bad(['type_id' => $this->type('legal', 'Litigation')]);                       // a kind of work from another industry
        $bad(['type_id' => 99999]);
        $bad(['industry_key' => 'astrology']);
        $bad(['customer_id' => 999]);
        $bad(['priority' => 'whenever']);
        $bad(['start_date' => '2026-12-01', 'due_date' => '2026-11-01']);
        $bad(['start_date' => 'next week sometime maybe']);
        $bad(['location_id' => 77]);
        $bad(['lead_user_id' => 4242]);
        $bad(['lead_user_id' => $this->staff('NoProjects', ['admin.access'])->id]);  // the lead must be able to open Projects
        $this->assertSame(0, DB::table('projects')->count());
        $this->assertSame(1, (int) DB::table('project_series')->where('prefix', 'P')->value('next_number'), 'no number was used up');
        $this->assertSame(1, DB::table('cost_centres')->count(), 'and no cost centre was made');

        $this->assertSame('Stock system', $this->start(['title' => "  <b>Stock</b>\n system "])['title'], 'a title is plain text on one line');
    }

    public function test_if_the_books_cannot_make_the_cost_centre_no_project_is_made_and_no_number_is_used(): void
    {
        $this->app->instance(ProjectCostCentres::class, new class(app(\App\Services\CostCentres\CostCentreService::class)) extends ProjectCostCentres {
            public function forProject(string $number, string $title, ?int $locationId): ?\App\Models\CostCentre
            {
                throw new \RuntimeException('the books said no');
            }
        });
        app()->forgetInstance(\App\Services\Projects\ProjectService::class);
        try {
            $this->withoutExceptionHandling()->postJson('/api/admin/projects', ['type_id' => $this->type('general', 'Client project'), 'title' => 'Stock system']);
            $this->fail('the failure must not be swallowed');
        } catch (\RuntimeException $e) {
            $this->assertSame('the books said no', $e->getMessage());
        }
        $this->assertSame(0, DB::table('projects')->count());
        $this->assertSame(0, DB::table('project_members')->count());
        $this->assertSame(1, (int) DB::table('project_series')->where('prefix', 'P')->value('next_number'));
    }

    public function test_a_branch_without_its_own_cost_centre_and_a_project_with_no_branch_share_a_free_standing_projects_one(): void
    {
        $a = $this->start(['location_id' => 2]);
        $b = $this->start(['location_id' => null, 'title' => 'No branch']);
        $this->assertSame('Projects › P-0001 Stock system', $a['cost_centre_path']);
        $this->assertSame('Projects › P-0002 No branch', $b['cost_centre_path']);
        $this->assertNull($b['branch']);
    }

    public function test_starting_needs_the_permission_and_confidential_needs_its_own(): void
    {
        $this->as($this->staff('Njeri'));
        $this->postJson('/api/admin/projects', ['type_id' => $this->type('general', 'Client project'), 'title' => 'X'])->assertForbidden();

        $amina = $this->staff('Amina', ['projects.use', 'projects.create']);
        $this->as($amina);
        $this->postJson('/api/admin/projects', ['type_id' => $this->type('general', 'Client project'), 'title' => 'Secret', 'confidential' => true])->assertForbidden();
        $this->assertSame(0, DB::table('projects')->count());
        $this->assertSame([['actor_id' => $amina->id, 'action' => 'project.confidential', 'reason' => 'Does not hold projects.confidential']], $this->refusals());
    }

    // ------------------------------------------------------------------ who sees what

    public function test_a_person_sees_the_projects_they_are_on_and_with_view_all_every_one_that_is_not_confidential(): void
    {
        $open = $this->start(['title' => 'Open work']);
        $secret = $this->start(['title' => 'Secret matter', 'confidential' => true]);

        $njeri = $this->staff('Njeri');                                   // on nothing
        $this->as($njeri);
        $this->assertSame([], $this->getJson('/api/admin/projects?scope=all')->json('data'));
        $this->getJson("/api/admin/projects/{$open['id']}")->assertNotFound();

        $boss = $this->staff('Boss', ['projects.use', 'projects.view_all', 'projects.edit', 'projects.stage']);   // sees all, on nothing
        $this->as($boss);
        $this->assertSame(['Open work'], array_column($this->getJson('/api/admin/projects?scope=all')->json('data'), 'title'));
        $this->assertSame([], $this->getJson('/api/admin/projects?scope=mine')->json('data'));
        $this->getJson("/api/admin/projects/{$open['id']}")->assertOk()->assertJsonPath('project.can.open', true)->assertJsonPath('project.can.edit', false);
        $this->getJson("/api/admin/projects/{$secret['id']}")->assertNotFound();   // not "forbidden": its existence is not given away
        $this->putJson("/api/admin/projects/{$secret['id']}", ['title' => 'Mine now'])->assertNotFound();

        // seeing is not changing: both questions must say yes
        $this->putJson("/api/admin/projects/{$open['id']}", ['title' => 'Changed by the boss'])->assertForbidden();
        $this->assertSame('Open work', DB::table('projects')->where('id', $open['id'])->value('title'));

        $reasons = array_column(array_filter($this->refusals(), fn ($r) => (int) $r['actor_id'] === $boss->id), 'reason');
        $this->assertSame(['Confidential, and not on it', 'Confidential, and not on it', 'Not on it'], $reasons);

        $this->as($this->kamau);
        $this->assertSame(['Secret matter', 'Open work'], array_column($this->getJson('/api/admin/projects?scope=all')->json('data'), 'title'));
        $this->getJson("/api/admin/projects/{$secret['id']}")->assertOk();
        $this->assertSame(1, DB::table('project_log')->where('project_id', $secret['id'])->where('action', 'project.opened')->count(), 'opening a confidential project is always recorded');
        $this->assertSame(0, DB::table('project_log')->where('project_id', $open['id'])->where('action', 'project.opened')->count());
    }

    public function test_access_through_a_project_role_ends_when_its_dates_do_or_the_person_is_removed(): void
    {
        $p = $this->start();
        $njeri = $this->staff('Njeri');
        $member = (int) DB::table('project_roles')->where('key', 'member')->value('id');
        DB::table('project_members')->insert(['project_id' => $p['id'], 'user_id' => $njeri->id, 'project_role_id' => $member, 'status' => 'active', 'ends_at' => now()->addDay()]);
        $this->as($njeri);
        $this->getJson("/api/admin/projects/{$p['id']}")->assertOk();
        $this->assertCount(1, $this->getJson('/api/admin/projects')->json('data'));

        DB::table('project_members')->where('user_id', $njeri->id)->update(['ends_at' => now()->subMinute()]);
        $this->as($njeri);
        $this->getJson("/api/admin/projects/{$p['id']}")->assertNotFound();
        $this->assertCount(0, $this->getJson('/api/admin/projects')->json('data'));

        DB::table('project_members')->where('user_id', $njeri->id)->update(['ends_at' => null, 'starts_at' => now()->addDay()]);
        $this->as($njeri);
        $this->getJson("/api/admin/projects/{$p['id']}")->assertNotFound();

        DB::table('project_members')->where('user_id', $njeri->id)->update(['starts_at' => null, 'status' => 'removed']);
        $this->as($njeri);
        $this->getJson("/api/admin/projects/{$p['id']}")->assertNotFound();

        // a Client or Guest role opens only what is shared with them, which is not the staff screens
        DB::table('project_members')->where('user_id', $njeri->id)->update(['status' => 'active', 'project_role_id' => DB::table('project_roles')->where('key', 'client')->value('id')]);
        $this->as($njeri);
        $this->getJson("/api/admin/projects/{$p['id']}")->assertNotFound();
    }

    // ------------------------------------------------------------------ changing

    public function test_the_lead_changes_the_details_the_cost_centre_follows_the_title_and_the_log_keeps_old_and_new(): void
    {
        $p = $this->start(['reference' => 'PO 1']);
        $r = $this->putJson("/api/admin/projects/{$p['id']}", ['title' => 'Stock and tills', 'reference' => 'PO 2', 'customer_id' => 2, 'priority' => 'urgent'])->assertOk()->json('project');
        $this->assertSame(['Stock and tills', 'PO 2', 'Brian Kariuki', 'urgent'], [$r['title'], $r['reference'], $r['customer']['name'], $r['priority']]);
        $this->assertSame('P-0001 Stock and tills', DB::table('cost_centres')->where('id', $p['cost_centre_id'])->value('name'));
        $this->assertSame('P-0001', DB::table('cost_centres')->where('id', $p['cost_centre_id'])->value('code'), 'the code vouchers carry never changes');

        $log = DB::table('project_log')->where('action', 'project.changed')->first();
        $this->assertSame(['title' => 'Stock system', 'customer_id' => null, 'priority' => 'medium', 'reference' => 'PO 1'], json_decode($log->old_values, true));
        $this->assertSame(['title' => 'Stock and tills', 'customer_id' => 2, 'priority' => 'urgent', 'reference' => 'PO 2'], json_decode($log->new_values, true));

        $this->putJson("/api/admin/projects/{$p['id']}", ['title' => 'Stock and tills'])->assertOk();   // nothing changed: no new log line
        $this->assertSame(1, DB::table('project_log')->where('action', 'project.changed')->count());
        $this->putJson("/api/admin/projects/{$p['id']}", ['title' => ''])->assertStatus(422);
        $this->putJson("/api/admin/projects/{$p['id']}", ['start_date' => '2027-01-10', 'due_date' => '2027-01-01'])->assertStatus(422);
        // what is set when it starts cannot be slipped in later
        $this->putJson("/api/admin/projects/{$p['id']}", ['number' => 'HACK-1', 'type_id' => 3, 'cost_centre_id' => 1, 'lead_user_id' => 99, 'state' => 'closed'])->assertOk();
        $row = DB::table('projects')->where('id', $p['id'])->first();
        $this->assertSame(['P-0001', (int) $p['type']['id'], (int) $p['cost_centre_id'], $this->kamau->id, 'open'], [$row->number, (int) $row->type_id, (int) $row->cost_centre_id, (int) $row->lead_user_id, $row->state]);
    }

    public function test_making_a_project_confidential_or_open_again_needs_that_permission_too(): void
    {
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.create', 'projects.edit']);
        $this->as($njeri);
        $p = $this->start();
        $this->putJson("/api/admin/projects/{$p['id']}", ['confidential' => true])->assertForbidden();
        $this->assertSame(0, (int) DB::table('projects')->where('id', $p['id'])->value('confidential'));

        $this->grant($njeri, ['admin.access', 'projects.use', 'projects.edit', 'projects.confidential']);
        $this->as($njeri);
        $this->putJson("/api/admin/projects/{$p['id']}", ['confidential' => true])->assertOk()->assertJsonPath('project.confidential', true);
    }

    public function test_a_project_moves_through_the_stages_of_its_kind_of_work(): void
    {
        $type = $this->type('general', 'Client project');
        $p = $this->start();
        $r = $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($type, 'Active')])->assertOk()->json('project');
        $this->assertSame(['Active', 'open'], [$r['stage']['name'], $r['state']]);
        // a stage of another kind of work is not a stage of this one
        $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($this->type('legal', 'Litigation'), 'Pleadings')])->assertStatus(422);

        // a stage can ask for things to be filled in first, named in the industry's words
        DB::table('project_stages')->where('id', $this->stage($type, 'Closing'))->update(['required_fields' => json_encode(['customer_id', 'reference', 'due_date'])]);
        $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($type, 'Closing')])->assertStatus(422)->assertJsonPath('message', 'Fill these in first: Client, Reference, Expected end.');
        $this->putJson("/api/admin/projects/{$p['id']}", ['customer_id' => 1, 'reference' => 'PO 9', 'due_date' => '2027-03-01'])->assertOk();
        $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($type, 'Closing')])->assertOk();

        $closed = $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($type, 'Closed')])->assertOk()->json('project');
        $this->assertSame('closed', $closed['state']);
        $this->assertNotNull($closed['closed_at']);
        $reopened = $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($type, 'Active')])->assertOk()->json('project');
        $this->assertSame(['open', null], [$reopened['state'], $reopened['closed_at']]);
        $this->assertSame(['project.created', 'stage.moved', 'project.changed', 'stage.moved', 'project.closed', 'project.reopened'], DB::table('project_log')->where('result', 'done')->orderBy('id')->pluck('action')->all());
    }

    public function test_closing_and_reopening_need_their_own_permission(): void
    {
        $type = $this->type('general', 'Client project');
        $njeri = $this->staff('Njeri', ['projects.use', 'projects.create', 'projects.stage']);
        $this->as($njeri);
        $p = $this->start();
        $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($type, 'Active')])->assertOk();
        $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($type, 'Closed')])->assertForbidden();
        $this->putJson("/api/admin/projects/{$p['id']}/state", ['action' => 'cancel'])->assertForbidden();
        $this->assertSame('open', DB::table('projects')->where('id', $p['id'])->value('state'));
        $this->assertSame(['Does not hold projects.close', 'Does not hold projects.close'], array_column($this->refusals(), 'reason'));
    }

    public function test_hold_resume_cancel_and_reopen(): void
    {
        $type = $this->type('general', 'Client project');
        $p = $this->start();
        $state = fn (string $action) => $this->putJson("/api/admin/projects/{$p['id']}/state", ['action' => $action, 'reason' => 'Client asked']);
        $state('resume')->assertStatus(422);                       // it is not on hold
        $state('hold')->assertOk()->assertJsonPath('project.state', 'on_hold');
        $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($type, 'Active')])->assertStatus(422)->assertJsonPath('message', 'It is on hold. Resume it before moving it on.');
        $state('resume')->assertOk()->assertJsonPath('project.state', 'open');
        $state('cancel')->assertOk()->assertJsonPath('project.state', 'cancelled');
        $this->assertNotNull(DB::table('projects')->where('id', $p['id'])->value('closed_at'));
        $state('hold')->assertStatus(422);
        $state('reopen')->assertOk()->assertJsonPath('project.state', 'open')->assertJsonPath('project.stage.name', 'Planning');
        $state('explode')->assertStatus(422);
        $held = DB::table('project_log')->where('action', 'project.held')->first();
        $this->assertSame(['state' => 'on_hold', 'reason' => 'Client asked'], json_decode($held->new_values, true));
    }

    public function test_only_finished_work_can_be_frozen_and_a_frozen_project_can_be_read_and_unfrozen_and_nothing_else(): void
    {
        $type = $this->type('general', 'Client project');
        $p = $this->start();
        $this->putJson("/api/admin/projects/{$p['id']}/freeze", ['frozen' => true])->assertStatus(422);
        $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($type, 'Closed')])->assertOk();
        $f = $this->putJson("/api/admin/projects/{$p['id']}/freeze", ['frozen' => true])->assertOk()->json('project');
        $this->assertTrue($f['frozen']);
        $this->assertSame(['open' => true, 'edit' => false, 'stage' => false, 'close' => false, 'freeze' => true], array_intersect_key($f['can'], array_flip(['open', 'edit', 'stage', 'close', 'freeze'])));

        $this->getJson("/api/admin/projects/{$p['id']}")->assertOk();
        $this->putJson("/api/admin/projects/{$p['id']}", ['title' => 'Changed'])->assertForbidden()->assertJsonPath('message', 'This is frozen. Unfreeze it before changing anything.');
        $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $this->stage($type, 'Active')])->assertForbidden();
        $this->putJson("/api/admin/projects/{$p['id']}/state", ['action' => 'hold'])->assertForbidden();
        $this->assertSame('Stock system', DB::table('projects')->where('id', $p['id'])->value('title'));

        $this->putJson("/api/admin/projects/{$p['id']}/freeze", ['frozen' => false])->assertOk()->assertJsonPath('project.frozen', false);
        $this->putJson("/api/admin/projects/{$p['id']}", ['title' => 'Changed'])->assertOk();

        $njeri = $this->staff('Njeri', ['projects.use', 'projects.edit']);   // no freeze permission
        DB::table('project_members')->insert(['project_id' => $p['id'], 'user_id' => $njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'lead')->value('id'), 'status' => 'active']);
        $this->as($njeri);
        $this->putJson("/api/admin/projects/{$p['id']}/freeze", ['frozen' => true])->assertForbidden();
    }

    // ------------------------------------------------------------------ the list and the form

    public function test_the_list_filters_searches_counts_and_pages(): void
    {
        $type = $this->type('general', 'Client project');
        $a = $this->start(['title' => 'Stock system', 'reference' => 'PO 4471', 'customer_id' => 1]);
        $b = $this->start(['title' => 'POS rollout', 'type_id' => $this->type('general', 'Internal project')]);
        $c = $this->start(['title' => 'Website refresh']);
        $this->putJson("/api/admin/projects/{$b['id']}/state", ['action' => 'hold'])->assertOk();
        $this->putJson("/api/admin/projects/{$c['id']}/stage", ['stage_id' => $this->stage($type, 'Closed')])->assertOk();

        $list = fn (string $query) => $this->getJson('/api/admin/projects?' . $query)->assertOk()->json();
        $all = $list('');
        $this->assertSame(['Website refresh', 'POS rollout', 'Stock system'], array_column($all['data'], 'title'), 'newest first');
        $this->assertSame(['open' => 1, 'on_hold' => 1, 'closed' => 1, 'cancelled' => 0], $all['counts']);
        $this->assertSame(['POS rollout', 'Stock system'], array_column($list('state=active')['data'], 'title'));
        $this->assertSame(['Website refresh'], array_column($list('state=closed')['data'], 'title'));
        $this->assertSame(['POS rollout'], array_column($list('type_id=' . $b['type']['id'])['data'], 'title'));
        $this->assertSame(['Stock system'], array_column($list('q=4471')['data'], 'title'));
        $this->assertSame(['POS rollout'], array_column($list('q=IN-0001')['data'], 'title'), 'an internal project has its own number series');
        $this->assertSame(['Stock system'], array_column($list('customer_id=1')['data'], 'title'));
        $this->assertSame([], $list('q=100%25')['data'], 'a percent sign is searched for, not treated as "anything"');
        $paged = $list('per_page=5&page=1');
        $this->assertSame([3, 1, 5], [$paged['total'], $paged['page'], $paged['per_page']]);
    }

    public function test_the_form_is_given_industries_kinds_of_work_branches_leads_and_the_words_of_each_industry(): void
    {
        $this->staff('Njeri');
        $this->staff('NoProjects', ['admin.access']);
        $o = $this->getJson('/api/admin/projects/options')->assertOk()->json();
        $this->assertSame('general', $o['default_industry']);
        $this->assertCount(15, $o['industries']);
        $this->assertCount(40, $o['types']);
        $this->assertSame(['Mombasa', 'Nairobi'], array_column($o['branches'], 'name'));
        $this->assertSame(['Kamau', 'Njeri'], array_column($o['leads'], 'name'));
        $this->assertSame('Contract number', $o['words']['construction']['reference']['name']);
        $this->assertSame(['create' => true, 'confidential' => true], $o['can']);
        $this->assertTrue($o['cost_centres']);

        $this->assertSame([['id' => 1, 'name' => 'Imara Sacco', 'detail' => 'C-001', 'flags' => []]], $this->getJson('/api/admin/projects/options/customers?q=imara')->json('customers'));
        $this->assertSame(['Brian Kariuki'], array_column($this->getJson('/api/admin/projects/options/customers?q=brian')->json('customers'), 'name'));
        $this->assertCount(2, $this->getJson('/api/admin/projects/options/customers')->json('customers'));
    }
}

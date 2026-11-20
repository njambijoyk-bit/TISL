<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 11.2 (docs/PROJECTS_STAGE11_SPEC.md): the opening check, signed with a typed name, required before the work leaves its first stage, and who else is involved. */
class ProjectsOpeningCheckTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private int $type;
    private object $work;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.edit', 'projects.stage', 'projects.config.view', 'projects.config.stages']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
        // the mechanism alone: the starter content script 268 gives General projects (11.5) is taken away here
        DB::table('project_opening_questions')->where('industry_key', 'general')->delete();
        DB::table('project_template_items')->whereIn('template_id', DB::table('project_work_templates')->whereIn('type_id', DB::table('project_types')->where('industry_key', 'general')->pluck('id'))->pluck('id'))->delete();
        DB::table('project_work_templates')->whereIn('type_id', DB::table('project_types')->where('industry_key', 'general')->pluck('id'))->delete();
        DB::table('project_date_rules')->where('industry_key', 'general')->delete();
        $this->postJson('/api/admin/projects/configuration/opening-questions', ['industry' => 'general', 'question' => 'Engagement letter signed', 'must_be_yes' => true])->assertCreated();
        $this->postJson('/api/admin/projects/configuration/opening-questions', ['type_id' => $this->type, 'question' => 'Deposit asked for', 'must_be_yes' => false])->assertCreated();
        $this->putJson("/api/admin/projects/configuration/types/{$this->type}/settings", ['opening_required' => true])->assertOk();
        $id = (int) $this->postJson('/api/admin/projects', ['type_id' => $this->type, 'title' => 'Imara website', 'customer_id' => 1])->assertCreated()->json('project.id');
        $this->work = DB::table('projects')->find($id);
    }

    private function url(string $more = ''): string
    {
        return "/api/admin/projects/{$this->work->id}/opening-check{$more}";
    }

    private function next(): int
    {
        return (int) DB::table('project_stages')->where('type_id', $this->type)->orderBy('sort_order')->skip(1)->value('id');
    }

    public function test_the_work_cannot_leave_its_first_stage_until_the_check_passes(): void
    {
        $page = $this->getJson($this->url())->assertOk()->json();
        $this->assertSame(['Approval to start', true, ['Engagement letter signed', 'Deposit asked for']], [$page['name'], $page['required'], array_column($page['questions'], 'question')], 'the industry\'s name for it; industry questions, then the kind of work\'s');
        $this->assertSame('Do the Approval to start first: it must pass before the work moves on.', $this->putJson("/api/admin/projects/{$this->work->id}/stage", ['stage_id' => $this->next()])->assertStatus(422)->json('message'));
        [$a, $b] = array_column($page['questions'], 'key');
        $this->putJson($this->url(), ['answers' => [$a => ['answer' => 'no', 'note' => 'Sent, not back yet']]])->assertOk();
        $this->postJson($this->url('/sign'), ['name' => 'Kamau Njoroge'])->assertStatus(422)->assertJsonPath('message', 'One question has no answer yet.');
        $this->putJson($this->url(), ['answers' => [$b => ['answer' => 'no']]])->assertOk();
        $this->postJson($this->url('/sign'), ['name' => 'Kamau Njoroge'])->assertOk()->assertJsonPath('passed', false);
        $this->assertSame('The Approval to start did not pass. It must pass before the work moves on.', $this->putJson("/api/admin/projects/{$this->work->id}/stage", ['stage_id' => $this->next()])->assertStatus(422)->json('message'));
        $this->putJson($this->url(), ['answers' => [$a => ['answer' => 'yes']]])->assertStatus(422);   // signed: start it again first
        $this->postJson($this->url('/redo'), [])->assertStatus(422);
        $this->postJson($this->url('/redo'), ['reason' => 'The letter came back signed'])->assertOk()->assertJsonPath('state', 'draft');
        $this->putJson($this->url(), ['answers' => [$a => ['answer' => 'yes']]])->assertOk();
        $this->postJson($this->url('/sign'), ['name' => 'Kamau Njoroge'])->assertOk()->assertJsonPath('passed', true)->assertJsonPath('signed.name', 'Kamau Njoroge');
        $this->putJson("/api/admin/projects/{$this->work->id}/stage", ['stage_id' => $this->next()])->assertOk();   // "Deposit asked for" need not be yes
        $this->assertSame(['opening_check.signed', 'opening_check.reopened', 'opening_check.signed'], DB::table('project_log')->where('project_id', $this->work->id)->where('action', 'like', 'opening_check.%')->orderBy('id')->pluck('action')->all());
    }

    public function test_without_the_setting_it_is_advice_only_and_a_signed_check_keeps_its_questions(): void
    {
        $this->putJson("/api/admin/projects/configuration/types/{$this->type}/settings", ['opening_required' => false])->assertOk();
        $this->putJson("/api/admin/projects/{$this->work->id}/stage", ['stage_id' => $this->next()])->assertOk();
        $keys = array_column($this->getJson($this->url())->json('questions'), 'key');
        $this->putJson($this->url(), ['answers' => array_fill_keys($keys, ['answer' => 'yes'])])->assertOk();
        $this->postJson($this->url('/sign'), ['name' => 'Kamau Njoroge'])->assertOk();
        $this->postJson('/api/admin/projects/configuration/opening-questions', ['industry' => 'general', 'question' => 'A question added later'])->assertCreated();
        $this->assertCount(2, $this->getJson($this->url())->json('questions'), 'what was signed stays as it was signed');
    }

    public function test_a_party_who_is_already_a_client_is_shown_as_a_possible_conflict(): void
    {
        $role = (int) DB::table('project_lists')->where('list', 'party_role')->value('id');
        $party = DB::table('project_parties')->insertGetId(['name' => 'Brian Kariuki', 'kind' => 'person', 'created_at' => now()]);
        DB::table('project_party_links')->insert(['project_id' => $this->work->id, 'party_id' => $party, 'role_id' => $role, 'created_at' => now()]);
        $involved = collect($this->getJson($this->url())->assertOk()->json('involved'))->keyBy('who');
        $brian = $involved['Brian Kariuki'];
        $this->assertSame('Party', $brian['as']);
        $this->assertTrue(collect($brian['matches'])->contains(fn ($m) => $m['type'] === 'customer' && $m['conflict']), 'the other side is already our client');
        $this->assertSame('Client', $involved->first()['as'], 'the client is searched first');
    }
}

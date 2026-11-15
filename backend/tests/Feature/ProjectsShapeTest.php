<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Projects, build 1.8 (docs/PROJECTS_STAGE1_SPEC.md): the shape of the work an owner sets: kinds of work with their own number series, the
 * stages of each, and extra fields (required, sensitive) that show on the form and can be asked for by a stage.
 */
class ProjectsShapeTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const OWNER = ['projects.use', 'projects.create', 'projects.edit', 'projects.stage', 'projects.close', 'projects.config.view', 'projects.config.stages', 'projects.config.fields', 'projects.fields.sensitive', 'projects.log.view'];

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->owner = $this->staff('Owner', self::OWNER);
        Sanctum::actingAs($this->owner, ['*']);
    }

    private function shape(string $industry = 'legal'): array
    {
        return $this->getJson("/api/admin/projects/configuration/shape?industry={$industry}")->assertOk()->json();
    }

    private function type(array $shape, string $name): array
    {
        return collect($shape['types'])->firstWhere('name', $name);
    }

    private function field(array $d): array
    {
        $r = $this->postJson('/api/admin/projects/configuration/fields?industry=legal', $d + ['scope' => 'industry', 'industry_key' => 'legal'])->assertCreated()->json('fields');

        return collect($r)->firstWhere('label', $d['label']);
    }

    private function start(array $o = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/admin/projects', $o + ['industry_key' => 'legal', 'type_id' => DB::table('project_types')->where('industry_key', 'legal')->where('name', 'Litigation')->value('id'), 'title' => 'Imara v. Baraka']);
    }

    // ------------------------------------------------------------------ kinds of work

    public function test_the_shape_page_shows_each_kind_of_work_with_its_stages_series_and_how_much_work_it_has(): void
    {
        $this->start()->assertCreated();
        $s = $this->shape();
        $this->assertSame(['Litigation', 'Conveyancing', 'Corporate and commercial', 'Advisory'], array_column($s['types'], 'name'));
        $lit = $this->type($s, 'Litigation');
        $this->assertSame(['M', 1, 2], [$lit['prefix'], $lit['projects'], $lit['next_number']]);
        $this->assertSame(['Opening', 'Pleadings', 'Discovery', 'Hearing', 'Judgment', 'Closed'], array_column($lit['stages'], 'name'));
        $this->assertSame(1, $lit['stages'][0]['projects']);
        $this->assertSame(['stages' => true, 'fields' => true], $s['can']);
        $this->assertArrayHasKey('pick_many', $s['field_kinds']);
    }

    public function test_a_new_kind_of_work_gets_its_own_series_two_starter_stages_and_is_usable_at_once(): void
    {
        $s = $this->postJson('/api/admin/projects/configuration/types', ['industry_key' => 'legal', 'name' => 'Family law', 'prefix' => 'fam'])->assertCreated()->json();
        $fam = $this->type($s, 'Family law');
        $this->assertSame(['FAM', ['Open', 'Closed'], ['open', 'closed']], [$fam['prefix'], array_column($fam['stages'], 'name'), array_column($fam['stages'], 'state')]);
        $p = $this->start(['type_id' => $fam['id'], 'title' => 'Custody of A.'])->assertCreated()->json('project');
        $this->assertSame(['FAM-0001', 'Open'], [$p['number'], $p['stage']['name']]);

        $bad = fn (array $d) => $this->postJson('/api/admin/projects/configuration/types', $d + ['industry_key' => 'legal', 'name' => 'X', 'prefix' => 'X'])->assertStatus(422);
        $bad(['name' => 'Family law', 'prefix' => 'FL']);          // the name is taken in this industry
        $bad(['name' => 'Probate', 'prefix' => 'M']);              // the prefix is taken (Litigation)
        $bad(['name' => 'Probate', 'prefix' => 'BW']);             // ... even by another industry: no two pieces of work may share a number
        $bad(['name' => 'Probate', 'prefix' => '9A']);
        $bad(['name' => 'Probate', 'prefix' => 'TOOLONGPREFIX']);
        $bad(['name' => '  ', 'prefix' => 'PB']);
        $this->postJson('/api/admin/projects/configuration/types', ['industry_key' => 'astrology', 'name' => 'Charts', 'prefix' => 'AS'])->assertNotFound();
    }

    public function test_a_kind_of_work_can_be_renamed_and_switched_off_but_keeps_its_prefix_once_work_carries_it(): void
    {
        $this->start()->assertCreated();
        $lit = $this->type($this->shape(), 'Litigation');
        $this->putJson("/api/admin/projects/configuration/types/{$lit['id']}?industry=legal", ['name' => 'Disputes'])->assertOk();
        $this->putJson("/api/admin/projects/configuration/types/{$lit['id']}?industry=legal", ['prefix' => 'DSP'])->assertStatus(422);
        $conv = $this->type($this->shape(), 'Conveyancing');
        $this->putJson("/api/admin/projects/configuration/types/{$conv['id']}?industry=legal", ['prefix' => 'cnv'])->assertOk();   // none started yet
        $this->assertSame('CNV-0001', $this->start(['type_id' => $conv['id']])->assertCreated()->json('project.number'));

        $this->putJson("/api/admin/projects/configuration/types/{$lit['id']}?industry=legal", ['is_active' => false])->assertOk();
        $this->start()->assertStatus(422);   // no new work of a kind that is switched off
        $this->assertNotContains($lit['id'], array_column($this->getJson('/api/admin/projects/options')->json('types'), 'id'));
        $this->assertSame(1, DB::table('projects')->where('type_id', $lit['id'])->count(), 'the work already there is untouched');
    }

    // ------------------------------------------------------------------ stages

    public function test_stages_are_added_before_the_closed_one_renamed_reordered_and_shown_with_a_named_status(): void
    {
        $lit = $this->type($this->shape(), 'Litigation');
        $s = $this->postJson("/api/admin/projects/configuration/types/{$lit['id']}/stages?industry=legal", ['name' => 'Mediation', 'status' => 'warning'])->assertCreated()->json();
        $stages = $this->type($s, 'Litigation')['stages'];
        $this->assertSame(['Opening', 'Pleadings', 'Discovery', 'Hearing', 'Judgment', 'Mediation', 'Closed'], array_column($stages, 'name'));
        $med = collect($stages)->firstWhere('name', 'Mediation');
        $this->assertSame(['open', 'warning'], [$med['state'], $med['status']]);

        $put = fn (array $d) => $this->putJson("/api/admin/projects/configuration/stages/{$med['id']}?industry=legal", $d);
        $put(['move' => 'up'])->assertOk();
        $put(['move' => 'up'])->assertOk();
        $this->assertSame(['Opening', 'Pleadings', 'Discovery', 'Mediation', 'Hearing', 'Judgment', 'Closed'], array_column($this->type($this->shape(), 'Litigation')['stages'], 'name'));
        $put(['name' => 'Settlement talks'])->assertOk();
        $put(['name' => 'Hearing'])->assertStatus(422);            // the name is taken in this kind of work
        $put(['status' => '#ff0000'])->assertStatus(422);          // a status is one of the theme's named ones, never a colour
        $put(['state' => 'paused'])->assertStatus(422);
        $this->postJson("/api/admin/projects/configuration/types/{$lit['id']}/stages", ['name' => ' '])->assertStatus(422);
    }

    public function test_a_stage_with_work_on_it_cannot_be_removed_or_flipped_and_a_kind_of_work_keeps_one_stage(): void
    {
        $p = $this->start()->assertCreated()->json('project');
        $opening = $p['stage']['id'];
        $this->deleteJson("/api/admin/projects/configuration/stages/{$opening}?industry=legal")->assertStatus(422);
        $this->putJson("/api/admin/projects/configuration/stages/{$opening}?industry=legal", ['state' => 'closed'])->assertStatus(422);

        $pleadings = collect($p['stages'])->firstWhere('name', 'Pleadings')['id'];
        $left = $this->deleteJson("/api/admin/projects/configuration/stages/{$pleadings}?industry=legal")->assertOk()->json();
        $this->assertNotContains('Pleadings', array_column($this->type($left, 'Litigation')['stages'], 'name'));
        $this->assertNotContains('Pleadings', array_column($this->getJson("/api/admin/projects/{$p['id']}")->json('project.stages'), 'name'));

        $fam = $this->type($this->postJson('/api/admin/projects/configuration/types', ['industry_key' => 'legal', 'name' => 'Family law', 'prefix' => 'FAM'])->json(), 'Family law');
        $this->deleteJson("/api/admin/projects/configuration/stages/{$fam['stages'][0]['id']}")->assertOk();
        $this->deleteJson("/api/admin/projects/configuration/stages/{$fam['stages'][1]['id']}")->assertStatus(422);   // the last one stays
    }

    // ------------------------------------------------------------------ extra fields

    public function test_extra_fields_of_every_kind_show_on_the_form_are_checked_and_are_shown_back(): void
    {
        $this->field(['label' => 'Practice area', 'kind' => 'pick_one', 'options' => ['Commercial', 'Land', 'Family'], 'required' => true]);
        $this->field(['label' => 'Opposing party', 'kind' => 'text']);
        $this->field(['label' => 'Witnesses', 'kind' => 'number']);
        $this->field(['label' => 'Limitation date', 'kind' => 'date']);
        $this->field(['label' => 'Legal aid', 'kind' => 'yes_no']);
        $this->field(['label' => 'Remedies sought', 'kind' => 'pick_many', 'options' => ['Damages', 'Injunction', 'Costs']]);
        $this->field(['label' => 'Supervising partner', 'kind' => 'person']);

        $lit = DB::table('project_types')->where('industry_key', 'legal')->where('name', 'Litigation')->value('id');
        $offered = $this->getJson('/api/admin/projects/options')->json('fields')[$lit];
        $this->assertSame(['practice_area', 'opposing_party', 'witnesses', 'limitation_date', 'legal_aid', 'remedies_sought', 'supervising_partner'], array_column($offered, 'key'));

        $this->start()->assertStatus(422)->assertJsonPath('message', 'Fill in Practice area.');
        $this->assertSame(0, DB::table('projects')->count(), 'a required field left empty undoes the whole start');
        $this->assertSame(1, (int) DB::table('project_series')->where('prefix', 'M')->value('next_number'));

        $bad = fn (array $f, string $says) => $this->start(['fields' => $f + ['practice_area' => 'Land']])->assertStatus(422)->assertJsonPath('message', $says);
        $bad(['practice_area' => 'Tax'], 'Choose Practice area from its list.');
        $bad(['witnesses' => 'several'], 'Witnesses must be a number.');
        $bad(['limitation_date' => 'not a day'], 'Limitation date must be a date.');
        $bad(['remedies_sought' => ['Damages', 'Revenge']], 'Choose Remedies sought from its list.');
        $bad(['supervising_partner' => 9999], 'Choose a member of staff for Supervising partner.');

        $p = $this->start(['fields' => ['practice_area' => 'Land', 'opposing_party' => ' <b>Baraka</b> Traders ', 'witnesses' => '3', 'limitation_date' => '2027-06-30', 'legal_aid' => true,
            'remedies_sought' => ['Damages', 'Costs'], 'supervising_partner' => $this->owner->id, 'not_a_field' => 'ignored']])->assertCreated()->json('project');
        $got = array_column($p['fields'], 'value', 'key');
        $this->assertSame(['practice_area' => 'Land', 'opposing_party' => 'Baraka Traders', 'witnesses' => 3, 'limitation_date' => '2027-06-30', 'legal_aid' => true,
            'remedies_sought' => ['Damages', 'Costs'], 'supervising_partner' => $this->owner->id], $got);

        // changing one leaves the others alone, and the log names what changed by its label
        $r = $this->putJson("/api/admin/projects/{$p['id']}", ['fields' => ['witnesses' => 5, 'legal_aid' => false]])->assertOk()->json('project');
        $got = array_column($r['fields'], 'value', 'key');
        $this->assertSame([5, false, 'Land'], [$got['witnesses'], $got['legal_aid'], $got['practice_area']]);
        $log = DB::table('project_log')->where('action', 'project.changed')->first();
        $this->assertSame(['Witnesses' => 3, 'Legal aid' => true], json_decode($log->old_values, true));
        $this->assertSame(['Witnesses' => 5, 'Legal aid' => false], json_decode($log->new_values, true));
        $this->putJson("/api/admin/projects/{$p['id']}", ['fields' => ['practice_area' => '']])->assertStatus(422);   // a required one cannot be emptied
    }

    public function test_a_field_shows_only_where_it_was_set_to_show(): void
    {
        $lit = (int) DB::table('project_types')->where('industry_key', 'legal')->where('name', 'Litigation')->value('id');
        $conv = (int) DB::table('project_types')->where('industry_key', 'legal')->where('name', 'Conveyancing')->value('id');
        $bw = (int) DB::table('project_types')->where('industry_key', 'construction')->where('name', 'Building works')->value('id');
        $this->field(['label' => 'Everywhere', 'kind' => 'text', 'scope' => 'all']);
        $this->field(['label' => 'All legal', 'kind' => 'text']);
        $this->field(['label' => 'Litigation only', 'kind' => 'text', 'scope' => 'type', 'type_id' => $lit]);
        $offered = $this->getJson('/api/admin/projects/options')->json('fields');
        $this->assertSame(['Everywhere', 'All legal', 'Litigation only'], array_column($offered[$lit], 'label'));
        $this->assertSame(['Everywhere', 'All legal'], array_column($offered[$conv], 'label'));
        $this->assertSame(['Everywhere'], array_column($offered[$bw], 'label'));
        $this->assertSame(['Everywhere', 'All legal', 'Litigation only'], array_column($this->shape()['fields'], 'label'));
        $this->assertSame(['Everywhere'], array_column($this->shape('construction')['fields'], 'label'));
    }

    public function test_a_sensitive_field_is_absent_not_blank_for_someone_who_may_not_see_it_and_they_cannot_change_it(): void
    {
        $this->field(['label' => 'Settlement ceiling', 'kind' => 'text', 'sensitive' => true]);
        $this->field(['label' => 'Opposing party', 'kind' => 'text']);
        $p = $this->start(['fields' => ['settlement_ceiling' => 'Up to 2.5M', 'opposing_party' => 'Baraka']])->assertCreated()->json('project');
        $this->assertSame('Up to 2.5M', array_column($p['fields'], 'value', 'key')['settlement_ceiling']);

        $njeri = $this->staff('Njeri', ['projects.use', 'projects.create', 'projects.edit']);   // no projects.fields.sensitive
        DB::table('project_members')->insert(['project_id' => $p['id'], 'user_id' => $njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'lead')->value('id'), 'status' => 'active']);
        Sanctum::actingAs($njeri, ['*']);
        $seen = $this->getJson("/api/admin/projects/{$p['id']}")->json('project.fields');
        $this->assertSame(['opposing_party'], array_column($seen, 'key'));
        $this->assertStringNotContainsString('2.5M', json_encode($seen));
        $lit = DB::table('project_types')->where('industry_key', 'legal')->where('name', 'Litigation')->value('id');
        $this->assertSame(['opposing_party'], array_column($this->getJson('/api/admin/projects/options')->json('fields')[$lit], 'key'));

        $this->putJson("/api/admin/projects/{$p['id']}", ['fields' => ['settlement_ceiling' => 'Overwritten', 'opposing_party' => 'Baraka Ltd']])->assertOk();
        $this->assertSame('Up to 2.5M', DB::table('project_field_values')->where('field_id', DB::table('project_fields')->where('key', 'settlement_ceiling')->value('id'))->value('value'), 'what they sent for a field they cannot see is ignored');

        // and when someone who may see it changes it, the log says that it changed, never what it says
        Sanctum::actingAs($this->owner, ['*']);
        $this->putJson("/api/admin/projects/{$p['id']}", ['fields' => ['settlement_ceiling' => 'Up to 3M']])->assertOk();
        $log = DB::table('project_log')->where('action', 'project.changed')->orderByDesc('id')->first();
        $this->assertSame(['Settlement ceiling' => '(changed)'], json_decode($log->new_values, true));
        $this->assertStringNotContainsString('3M', $log->new_values . $log->old_values);
    }

    public function test_a_stage_can_ask_for_an_extra_field_and_names_it_when_it_is_empty(): void
    {
        $this->field(['label' => 'Opposing party', 'kind' => 'text']);
        $p = $this->start()->assertCreated()->json('project');
        $pleadings = collect($p['stages'])->firstWhere('name', 'Pleadings')['id'];
        $this->putJson("/api/admin/projects/configuration/stages/{$pleadings}?industry=legal", ['required_fields' => ['reference', 'field:opposing_party']])->assertOk();
        $this->putJson("/api/admin/projects/configuration/stages/{$pleadings}?industry=legal", ['required_fields' => ['field:no_such_field']])->assertStatus(422);
        $this->putJson("/api/admin/projects/configuration/stages/{$pleadings}?industry=legal", ['required_fields' => ['salary']])->assertStatus(422);

        $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $pleadings])->assertStatus(422)->assertJsonPath('message', 'Fill these in first: Case number, Opposing party.');
        $this->putJson("/api/admin/projects/{$p['id']}", ['reference' => 'HCCC E1', 'fields' => ['opposing_party' => 'Baraka']])->assertOk();
        $this->putJson("/api/admin/projects/{$p['id']}/stage", ['stage_id' => $pleadings])->assertOk()->assertJsonPath('project.stage.name', 'Pleadings');
    }

    public function test_a_field_can_be_renamed_and_switched_off_but_its_kind_stays_and_the_values_are_kept(): void
    {
        $f = $this->field(['label' => 'Practice area', 'kind' => 'pick_one', 'options' => ['Commercial', 'Land']]);
        $p = $this->start(['fields' => ['practice_area' => 'Land']])->assertCreated()->json('project');
        $put = fn (array $d) => $this->putJson("/api/admin/projects/configuration/fields/{$f['id']}?industry=legal", $d);
        $put(['label' => 'Area of law', 'options' => ['Commercial', 'Land', 'Family'], 'required' => true])->assertOk();
        $put(['kind' => 'number'])->assertOk();
        $this->assertSame('pick_one', DB::table('project_fields')->where('id', $f['id'])->value('kind'), 'the kind of a field never changes: values already hold that kind');
        $put(['options' => ['Only one']])->assertStatus(422);
        $put(['label' => ''])->assertStatus(422);

        $put(['is_active' => false])->assertOk();
        $this->assertSame([], $this->getJson("/api/admin/projects/{$p['id']}")->json('project.fields'));
        $this->assertSame(1, DB::table('project_field_values')->count(), 'the value is kept');
        $put(['is_active' => true])->assertOk();
        $this->assertSame('Land', $this->getJson("/api/admin/projects/{$p['id']}")->json('project.fields')[0]['value']);
        $this->postJson('/api/admin/projects/configuration/fields', ['label' => 'X', 'kind' => 'hologram', 'scope' => 'all'])->assertStatus(422);
        $this->postJson('/api/admin/projects/configuration/fields', ['label' => 'X', 'kind' => 'pick_one', 'scope' => 'all', 'options' => ['One']])->assertStatus(422);
    }

    public function test_the_shape_is_changed_only_by_those_who_hold_each_permission(): void
    {
        $lit = $this->type($this->shape(), 'Litigation');
        Sanctum::actingAs($this->staff('Viewer', ['projects.use', 'projects.config.view']), ['*']);
        $this->assertSame(['stages' => false, 'fields' => false], $this->shape()['can']);
        $this->postJson('/api/admin/projects/configuration/types', ['industry_key' => 'legal', 'name' => 'Mine', 'prefix' => 'MI'])->assertForbidden();
        $this->postJson("/api/admin/projects/configuration/types/{$lit['id']}/stages", ['name' => 'Mine'])->assertForbidden();
        $this->deleteJson("/api/admin/projects/configuration/stages/{$lit['stages'][1]['id']}")->assertForbidden();
        $this->postJson('/api/admin/projects/configuration/fields', ['label' => 'Mine', 'kind' => 'text', 'scope' => 'all'])->assertForbidden();
        Sanctum::actingAs($this->staff('Nobody'), ['*']);
        $this->getJson('/api/admin/projects/configuration/shape')->assertForbidden();
    }
}

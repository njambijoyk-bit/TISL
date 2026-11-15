<?php

namespace Tests\Feature;

use App\Services\Projects\ProjectNames;
use App\Services\Projects\ProjectSettings;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Projects, build 1.2 (docs/PROJECTS_STAGE1_SPEC.md): what things are called, the default industry, a person's own naming, and settings that
 * keep every version. The tables and starter rows are exactly what script 257 makes.
 */
class ProjectsConfigurationTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const CONFIG = ['projects.use', 'projects.config.view', 'projects.config.manage', 'projects.config.industry', 'projects.config.names'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
    }

    public function test_the_starter_rows_of_script_257_load_and_name_every_term_in_every_industry(): void
    {
        $this->assertSame(15, DB::table('project_industries')->count());
        $this->assertSame(30, DB::table('project_terms')->count());
        $this->assertSame(450, DB::table('project_term_names')->count());
        $this->assertSame(40, DB::table('project_types')->count());
        $this->assertSame(212, DB::table('project_stages')->count());
        $this->assertSame(40, DB::table('project_series')->count());
        $names = app(ProjectNames::class);
        $this->assertSame('Matter', $names->word('legal', 'project'));
        $this->assertSame('Bill of quantities', $names->word('construction', 'scope_line', true));
        $this->assertSame('Care plans', $names->word('healthcare', 'project', true));
        $this->assertSame('Project', $names->word('general', 'project'));
        $this->assertSame('Something new', $names->word('legal', 'something_new'), 'a term nobody named yet still reads as words');
    }

    public function test_everyone_in_projects_gets_the_company_words(): void
    {
        Sanctum::actingAs($this->staff('Wanjiru'), ['*']);
        $r = $this->getJson('/api/admin/projects/names')->assertOk()->json();
        $this->assertTrue($r['ready']);
        $this->assertSame('general', $r['industry']);
        $this->assertSame(['name' => 'Project', 'plural' => 'Projects'], $r['names']['project']);
        $this->assertCount(30, $r['names']);
    }

    public function test_projects_is_closed_to_someone_without_the_permission_and_when_the_module_is_off(): void
    {
        Sanctum::actingAs($this->staff('Outsider', ['admin.access']), ['*']);
        $this->getJson('/api/admin/projects/names')->assertForbidden();

        Sanctum::actingAs($this->staff('Wanjiru'), ['*']);
        $this->getJson('/api/admin/projects/configuration')->assertForbidden();
        $this->projectsLicensed = false;
        $this->getJson('/api/admin/projects/names')->assertNotFound();
    }

    public function test_changing_the_default_industry_changes_the_words_for_everyone(): void
    {
        Sanctum::actingAs($this->staff('Owner', self::CONFIG), ['*']);
        $this->putJson('/api/admin/projects/configuration/general', ['default_industry' => 'legal'])->assertOk()->assertJsonPath('value.default_industry', 'legal')->assertJsonPath('version', 2);
        $this->assertSame('Matter', $this->getJson('/api/admin/projects/names')->json('names.project.name'));

        app()->forgetInstance(ProjectSettings::class);
        app()->forgetInstance(ProjectNames::class);
        Sanctum::actingAs($this->staff('Wanjiru'), ['*']);
        $this->assertSame('Matters', $this->getJson('/api/admin/projects/names')->json('names.project.plural'));
    }

    public function test_the_default_industry_needs_its_own_permission_and_the_refusal_is_logged(): void
    {
        $u = $this->staff('Manager', ['projects.use', 'projects.config.view', 'projects.config.manage']);
        Sanctum::actingAs($u, ['*']);
        $this->putJson('/api/admin/projects/configuration/general', ['default_industry' => 'legal'])->assertForbidden();
        $this->assertSame(1, (int) DB::table('project_settings')->where('part', 'general')->value('version'), 'nothing was saved');
        $log = DB::table('project_log')->where('result', 'refused')->first();
        $this->assertNotNull($log);
        $this->assertSame($u->id, (int) $log->actor_id);
        $this->assertSame('settings.default_industry', $log->action);

        // the other general settings are theirs to change
        $this->putJson('/api/admin/projects/configuration/general', ['trash_days' => 45])->assertOk()->assertJsonPath('value.trash_days', 45)->assertJsonPath('changed', ['trash_days']);
        $this->assertFalse($this->getJson('/api/admin/projects/configuration')->json('can.industry'));
    }

    public function test_general_settings_are_checked(): void
    {
        Sanctum::actingAs($this->staff('Owner', self::CONFIG), ['*']);
        $this->putJson('/api/admin/projects/configuration/general', ['default_industry' => 'astrology'])->assertStatus(422);
        $this->putJson('/api/admin/projects/configuration/general', ['trash_days' => 0])->assertStatus(422);
        DB::table('project_industries')->where('key', 'fashion')->update(['is_active' => 0]);
        $this->putJson('/api/admin/projects/configuration/general', ['default_industry' => 'fashion'])->assertStatus(422);
        $this->assertSame(1, (int) DB::table('project_settings')->where('part', 'general')->value('version'), 'nothing was saved');
    }

    public function test_every_save_is_a_version_and_an_earlier_one_can_be_brought_back(): void
    {
        Sanctum::actingAs($this->staff('Owner', self::CONFIG), ['*']);
        $this->putJson('/api/admin/projects/configuration/general', ['trash_days' => 60])->assertOk()->assertJsonPath('version', 2);
        $this->putJson('/api/admin/projects/configuration/general', ['trash_days' => 60])->assertOk()->assertJsonPath('version', 2)->assertJsonPath('changed', []);   // saving the same again is not a version
        $this->putJson('/api/admin/projects/configuration/general', ['default_industry' => 'construction'])->assertOk()->assertJsonPath('version', 3);

        $versions = $this->getJson('/api/admin/projects/configuration/history')->assertOk()->json('versions');
        $this->assertSame([3, 2, 1], array_column($versions, 'version'));
        $this->assertTrue($versions[0]['is_current']);
        $this->assertSame('Owner', $versions[0]['saved_by']);

        $this->postJson('/api/admin/projects/configuration/rollback', ['version' => 1])->assertOk()->assertJsonPath('version', 4)->assertJsonPath('value.trash_days', 30)->assertJsonPath('value.default_industry', 'general');
        $this->assertSame(4, DB::table('project_setting_versions')->where('part', 'general')->count(), 'a roll back adds a version; history is never rewritten');
        $this->assertSame(['saved', 'saved', 'rolled_back'], DB::table('project_setting_logs')->orderBy('id')->pluck('action')->all());
        $this->postJson('/api/admin/projects/configuration/rollback', ['version' => 99])->assertNotFound();
    }

    public function test_a_roll_back_that_would_change_the_default_industry_needs_that_permission_too(): void
    {
        Sanctum::actingAs($this->staff('Owner', self::CONFIG), ['*']);
        $this->putJson('/api/admin/projects/configuration/general', ['default_industry' => 'legal'])->assertOk();
        Sanctum::actingAs($this->staff('Manager', ['projects.use', 'projects.config.view', 'projects.config.manage']), ['*']);
        $this->postJson('/api/admin/projects/configuration/rollback', ['version' => 1])->assertForbidden();
        $this->assertSame('legal', json_decode((string) DB::table('project_settings')->where('part', 'general')->value('value'), true)['default_industry']);
    }

    public function test_the_company_can_rename_a_term_and_put_it_back(): void
    {
        Sanctum::actingAs($this->staff('Owner', self::CONFIG), ['*']);
        $this->putJson('/api/admin/projects/configuration/names/legal/progress_bill', ['name' => '  Fee   note ', 'plural' => 'Fee notes'])
            ->assertOk()->assertJsonPath('term.name', 'Fee note')->assertJsonPath('term.changed', true)->assertJsonPath('term.shipped_name', 'Interim fee note');
        $this->assertSame('Fee notes', app(ProjectNames::class)->word('legal', 'progress_bill', true));
        $this->assertSame('Invoice', app(ProjectNames::class)->word('general', 'progress_bill'), 'only that industry changed');

        $page = $this->getJson('/api/admin/projects/configuration?industry=legal')->assertOk()->json();
        $this->assertSame('legal', $page['viewing']);
        $row = collect($page['terms'])->firstWhere('key', 'progress_bill');
        $this->assertTrue($row['changed']);
        $this->assertNotEmpty($row['description']);

        // typing the shipped name back removes the company's own name instead of keeping a copy of it
        $this->putJson('/api/admin/projects/configuration/names/legal/progress_bill', ['name' => 'Interim fee note', 'plural' => 'Interim fee notes'])->assertOk()->assertJsonPath('term.changed', false);
        $this->assertSame(0, DB::table('project_term_overrides')->count());

        $this->putJson('/api/admin/projects/configuration/names/legal/project', ['name' => 'File', 'plural' => 'Files'])->assertOk();
        $this->deleteJson('/api/admin/projects/configuration/names/legal/project')->assertOk()->assertJsonPath('term.name', 'Matter');
        $this->assertSame(['names.renamed', 'names.reset', 'names.renamed', 'names.reset'], DB::table('project_log')->orderBy('id')->pluck('action')->all());
    }

    public function test_a_name_is_plain_text_and_must_exist(): void
    {
        Sanctum::actingAs($this->staff('Owner', self::CONFIG), ['*']);
        $this->putJson('/api/admin/projects/configuration/names/legal/project', ['name' => '<b>Case</b>', 'plural' => "Cases\n<script>x</script>"])->assertOk()->assertJsonPath('term.name', 'Case')->assertJsonPath('term.plural', 'Cases x');
        $this->putJson('/api/admin/projects/configuration/names/legal/project', ['name' => '   ', 'plural' => 'Cases'])->assertStatus(422);
        $this->putJson('/api/admin/projects/configuration/names/legal/project', ['name' => str_repeat('a', 81), 'plural' => 'Cases'])->assertStatus(422);
        $this->putJson('/api/admin/projects/configuration/names/legal/no_such_term', ['name' => 'A', 'plural' => 'As'])->assertNotFound();
        $this->putJson('/api/admin/projects/configuration/names/astrology/project', ['name' => 'A', 'plural' => 'As'])->assertNotFound();

        Sanctum::actingAs($this->staff('Viewer', ['projects.use', 'projects.config.view']), ['*']);
        $this->putJson('/api/admin/projects/configuration/names/legal/project', ['name' => 'A', 'plural' => 'As'])->assertForbidden();
    }

    public function test_a_person_with_the_permission_chooses_their_own_words_and_only_their_screens_change(): void
    {
        $amina = $this->staff('Amina', ['projects.use', 'projects.config.view', 'projects.naming.personal']);
        Sanctum::actingAs($amina, ['*']);
        $this->putJson('/api/admin/projects/my/naming', ['industry' => 'construction'])->assertOk()->assertJsonPath('industry', 'construction')->assertJsonPath('company_industry', 'general')->assertJsonPath('names.project.name', 'Contract');
        $this->assertSame(['industry' => 'construction', 'in_use' => 'construction'], $this->getJson('/api/admin/projects/configuration')->json('personal'));

        $names = app(ProjectNames::class);
        $this->assertSame('Contract', $names->term($amina, 'project'));
        $this->assertSame('Project', $names->companyTerm('project'), 'exports and documents keep the company words');

        Sanctum::actingAs($this->staff('Wanjiru'), ['*']);
        $this->assertSame('Project', $this->getJson('/api/admin/projects/names')->json('names.project.name'), 'nobody else is affected');

        Sanctum::actingAs($amina, ['*']);
        $this->putJson('/api/admin/projects/my/naming', ['industry' => 'astrology'])->assertStatus(422);
        $this->putJson('/api/admin/projects/my/naming', ['industry' => null])->assertOk()->assertJsonPath('industry', 'general');
    }

    public function test_without_the_permission_the_choice_is_refused_ignored_and_not_even_sent_to_the_screen(): void
    {
        $w = $this->staff('Wanjiru', ['projects.use', 'projects.config.view']);
        Sanctum::actingAs($w, ['*']);
        $this->putJson('/api/admin/projects/my/naming', ['industry' => 'legal'])->assertForbidden();
        $this->assertNull($this->getJson('/api/admin/projects/configuration')->json('personal'));

        // a choice made while they held the permission stops counting when it is taken away
        DB::table('project_user_prefs')->insert(['user_id' => $w->id, 'naming_industry_key' => 'legal']);
        $this->assertSame('general', app(ProjectNames::class)->industryFor($w));
        $this->grant($w, ['admin.access', 'projects.use', 'projects.naming.personal']);
        $this->assertSame('legal', app(ProjectNames::class)->industryFor($w));
        // and an industry that was switched off falls back to the company's
        DB::table('project_industries')->where('key', 'legal')->update(['is_active' => 0]);
        $this->assertSame('general', app(ProjectNames::class)->industryFor($w));
    }

    public function test_an_industry_can_be_switched_off_but_not_the_default_one(): void
    {
        Sanctum::actingAs($this->staff('Owner', self::CONFIG), ['*']);
        $this->putJson('/api/admin/projects/configuration/industries/fashion', ['is_active' => false])->assertOk();
        $this->assertSame(0, (int) DB::table('project_industries')->where('key', 'fashion')->value('is_active'));
        $this->putJson('/api/admin/projects/configuration/industries/general', ['is_active' => false])->assertStatus(422);
        $this->putJson('/api/admin/projects/configuration/industries/astrology', ['is_active' => false])->assertNotFound();
        $this->assertSame('industry.switched_off', DB::table('project_log')->orderByDesc('id')->value('action'));
    }
}

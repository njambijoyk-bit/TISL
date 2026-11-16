<?php

namespace Tests\Feature;

use App\Services\Projects\ProjectKeys;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 1.9 (docs/PROJECTS_STAGE1_SPEC.md): the shortcut keys are settings: the company's, and each person's own on top. */
class ProjectsShortcutsTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
    }

    public function test_everyone_gets_the_shipped_keys_until_someone_changes_them(): void
    {
        Sanctum::actingAs($this->staff('Njeri'), ['*']);
        $this->assertSame(ProjectKeys::defaults(), $this->getJson('/api/admin/projects/names')->assertOk()->json('keys'));
        $page = $this->getJson('/api/admin/projects/shortcuts')->assertOk()->json();
        $this->assertSame(['group' => 'go', 'what' => 'The list of work', 'shipped' => 'P'], $page['keys']['go_list']);
        $this->assertSame([[], false], [$page['mine'], $page['can']['company']]);
        $this->assertSame(['A', 'U', 'M', 'N', 'R', 'T', 'V'], $page['taken_with_shift']);
        $this->assertNull(ProjectKeys::problem(ProjectKeys::defaults()), 'the keys that ship must themselves be a valid set');
    }

    public function test_the_company_changes_its_keys_with_the_permission_and_every_change_is_a_version(): void
    {
        Sanctum::actingAs($this->staff('Njeri'), ['*']);
        $this->putJson('/api/admin/projects/configuration/shortcuts', ['keys' => ['go_list' => 'W']])->assertForbidden();

        Sanctum::actingAs($this->staff('Owner', ['projects.use', 'projects.shortcuts']), ['*']);
        $r = $this->putJson('/api/admin/projects/configuration/shortcuts', ['keys' => ['go_list' => 'w', 'act_edit' => ' c ']])->assertOk()->json();
        $this->assertSame(['W', 'C', 'N'], [$r['company']['go_list'], $r['company']['act_edit'], $r['company']['go_new']], 'letters are upper-cased; what was not sent stays');
        $this->assertSame(1, DB::table('project_setting_versions')->where('part', 'shortcuts')->count());
        $this->assertSame('settings.saved', DB::table('project_log')->orderByDesc('id')->value('action'));

        Sanctum::actingAs($this->staff('Kamau'), ['*']);
        $this->assertSame('W', $this->getJson('/api/admin/projects/names')->json('keys.go_list'), 'everyone gets the company keys');
    }

    public function test_a_set_of_keys_is_checked(): void
    {
        Sanctum::actingAs($this->staff('Owner', ['projects.use', 'projects.shortcuts']), ['*']);
        $bad = fn (array $keys, string $says) => $this->putJson('/api/admin/projects/configuration/shortcuts', ['keys' => $keys])->assertStatus(422)->assertJsonPath('message', $says);
        $bad(['go_list' => 'N'], 'N is used twice: for "The list of work" and "Start a new one".');
        $bad(['go_list' => 'G'], 'G starts every "go to" key, so it cannot be the letter that follows.');
        $bad(['act_edit' => 'T'], 'Shift+T already does something everywhere in TISL. Choose another letter for "Edit it".');
        $bad(['act_edit' => 'EE'], '"Edit it" needs one letter, A to Z.');
        $bad(['act_edit' => '7'], '"Edit it" needs one letter, A to Z.');
        $bad(['act_edit' => ''], '"Edit it" needs one letter, A to Z.');
        // the same letter in the two groups is fine: G then P goes to the list, Shift+P opens the phases
        $this->putJson('/api/admin/projects/configuration/shortcuts', ['keys' => ['go_list' => 'P', 'tab_phases' => 'P']])->assertOk();
        $this->assertSame(0, DB::table('project_setting_versions')->where('part', 'shortcuts')->count(), 'nothing changed, so no version was made');
    }

    public function test_a_person_sets_their_own_keys_on_top_and_only_their_screens_change(): void
    {
        $njeri = $this->staff('Njeri');
        Sanctum::actingAs($njeri, ['*']);
        $r = $this->putJson('/api/admin/projects/my/shortcuts', ['keys' => ['go_list' => 'W', 'act_edit' => 'E', 'not_a_key' => 'Z']])->assertOk()->json();
        $this->assertSame(['go_list' => 'W'], $r['mine'], 'only what differs from the company is kept');
        $this->assertSame('W', $r['in_use']['go_list']);
        $this->assertSame('P', $r['company']['go_list']);
        $this->putJson('/api/admin/projects/my/shortcuts', ['keys' => ['act_edit' => 'M']])->assertStatus(422);
        $this->putJson('/api/admin/projects/my/shortcuts', ['keys' => ['go_list' => 'W', 'go_new' => 'W']])->assertStatus(422);   // one letter for two things
        $this->assertSame('W', $this->getJson('/api/admin/projects/names')->json('keys.go_list'), 'a refused set leaves what they had');

        Sanctum::actingAs($this->staff('Kamau'), ['*']);
        $this->assertSame('P', $this->getJson('/api/admin/projects/names')->json('keys.go_list'));

        Sanctum::actingAs($njeri, ['*']);
        $this->putJson('/api/admin/projects/my/shortcuts', ['keys' => null])->assertOk()->assertJsonPath('mine', [])->assertJsonPath('in_use.go_list', 'P');
    }

    public function test_when_the_company_takes_a_letter_someone_uses_they_fall_back_to_the_company_keys(): void
    {
        $njeri = $this->staff('Njeri');
        Sanctum::actingAs($njeri, ['*']);
        $this->putJson('/api/admin/projects/my/shortcuts', ['keys' => ['go_list' => 'W']])->assertOk();
        Sanctum::actingAs($this->staff('Owner', ['projects.use', 'projects.shortcuts']), ['*']);
        $this->putJson('/api/admin/projects/configuration/shortcuts', ['keys' => ['go_new' => 'W']])->assertOk();   // now W would be used twice for Njeri
        Sanctum::actingAs($njeri, ['*']);
        $keys = $this->getJson('/api/admin/projects/names')->json('keys');
        $this->assertSame(['P', 'W'], [$keys['go_list'], $keys['go_new']], 'a set that no longer fits is never half-applied');
    }
}

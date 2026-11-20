<?php

namespace Tests\Feature;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 11.3 (docs/PROJECTS_STAGE11_SPEC.md): date rules that make key dates from other dates and from stages, and move them along. */
class ProjectsDateRulesTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;
    private object $work;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.dates', 'projects.stage', 'projects.config.view', 'projects.config.stages']);
        Sanctum::actingAs($this->kamau, ['*']);
        $type = (int) DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id');
        $this->work = DB::table('projects')->find((int) $this->postJson('/api/admin/projects', ['type_id' => $type, 'title' => 'Imara website', 'template_id' => 0])->assertCreated()->json('project.id'));
    }

    private function rule(array $d): void
    {
        $this->postJson('/api/admin/projects/configuration/date-rules', $d + ['industry' => 'general'])->assertCreated();
    }

    private function dates(): array
    {
        return $this->getJson("/api/admin/projects/{$this->work->id}/key-dates?past=1")->assertOk()->json('dates');
    }

    public function test_a_date_follows_from_another_and_moves_with_it_until_someone_moves_it_by_hand(): void
    {
        $this->rule(['trigger_kind' => 'date_set', 'trigger_value' => 'handover', 'make_kind' => 'renewal', 'make_title' => 'End of the warranty', 'offset_days' => 90, 'warn_days' => '30,7']);
        $this->rule(['trigger_kind' => 'date_set', 'trigger_value' => 'renewal', 'make_kind' => 'meeting', 'make_title' => 'Warranty review meeting', 'offset_days' => 7]);
        $this->postJson("/api/admin/projects/{$this->work->id}/key-dates", ['title' => 'Handover', 'kind' => 'handover', 'date' => '2026-12-01'])->assertCreated();
        $by = collect($this->dates())->keyBy('title');
        $this->assertSame(['2027-03-01', 'End of the warranty', '30,7'], [substr($by['End of the warranty']['starts_at'], 0, 10), $by['End of the warranty']['made_by_rule'], $by['End of the warranty']['warn_days']]);
        $this->assertSame('2027-03-08', substr($by['Warranty review meeting']['starts_at'], 0, 10), 'a made date starts its own rule');

        $this->putJson("/api/admin/projects/{$this->work->id}/key-dates/{$by['Handover']['id']}", ['date' => '2026-12-15', 'reason' => 'Client asked for two more weeks'])->assertOk();
        $by = collect($this->dates())->keyBy('title');
        $this->assertSame(['2027-03-15', '2027-03-22'], [substr($by['End of the warranty']['starts_at'], 0, 10), substr($by['Warranty review meeting']['starts_at'], 0, 10)], 'moved with it, all the way down');
        $this->assertSame('Moved with Handover', $by['End of the warranty']['move_reason']);

        $this->putJson("/api/admin/projects/{$this->work->id}/key-dates/{$by['End of the warranty']['id']}", ['date' => '2027-04-01', 'reason' => 'The supplier gives longer'])->assertOk();
        $this->putJson("/api/admin/projects/{$this->work->id}/key-dates/{$by['Handover']['id']}", ['date' => '2026-12-20', 'reason' => 'Again'])->assertOk();
        $this->assertSame('2027-04-01', substr(collect($this->dates())->firstWhere('title', 'End of the warranty')['starts_at'], 0, 10), 'moved by hand: it stays where it was put');
        $this->assertSame(1, DB::table('project_key_dates')->where('project_id', $this->work->id)->where('title', 'End of the warranty')->count(), 'made once from each date');
    }

    public function test_a_done_date_and_a_stage_can_start_a_rule_and_working_days_skip_the_weekend(): void
    {
        $this->rule(['trigger_kind' => 'date_done', 'trigger_value' => 'meeting', 'make_kind' => 'deadline', 'make_title' => 'Send the minutes', 'offset_days' => 3, 'working_days' => true]);
        $this->rule(['trigger_kind' => 'stage', 'trigger_value' => 'Active', 'make_kind' => 'payment', 'make_title' => 'First invoice due', 'offset_days' => 30]);
        Carbon::setTestNow('2026-11-20 10:00:00');   // a Friday
        $this->postJson("/api/admin/projects/{$this->work->id}/key-dates", ['title' => 'Kick-off', 'kind' => 'meeting', 'date' => '2026-11-20'])->assertCreated();
        $this->assertNull(collect($this->dates())->firstWhere('title', 'Send the minutes'), 'not until it is done');
        $id = collect($this->dates())->firstWhere('title', 'Kick-off')['id'];
        $this->putJson("/api/admin/projects/{$this->work->id}/key-dates/{$id}", ['done' => true])->assertOk();
        $this->assertSame('2026-11-25', substr(collect($this->dates())->firstWhere('title', 'Send the minutes')['starts_at'], 0, 10), 'three working days after a Friday is the Wednesday');

        $active = (int) DB::table('project_stages')->where('type_id', $this->work->type_id)->where('name', 'Active')->value('id');
        $this->putJson("/api/admin/projects/{$this->work->id}/stage", ['stage_id' => $active])->assertOk();
        $this->assertSame('2026-12-20', substr(collect($this->dates())->firstWhere('title', 'First invoice due')['starts_at'], 0, 10));
        $this->assertTrue(DB::table('project_log')->where('action', 'key_date.made_by_rule')->exists());
        Carbon::setTestNow();
    }

    public function test_rules_are_checked_in_configuration(): void
    {
        $bad = fn (array $d) => $this->postJson('/api/admin/projects/configuration/date-rules', $d + ['industry' => 'general', 'make_title' => 'X', 'offset_days' => 1])->assertStatus(422)->json('message');
        $this->assertSame('Choose a kind of key date from the list.', $bad(['trigger_kind' => 'date_set', 'trigger_value' => 'no_such']));
        $this->assertSame('A rule cannot make a date of the kind that starts it.', $bad(['trigger_kind' => 'date_set', 'trigger_value' => 'handover', 'make_kind' => 'handover']));
        $this->assertSame('Choose what starts the rule.', $bad(['trigger_kind' => 'sometimes', 'trigger_value' => 'x']));
        $page = $this->getJson('/api/admin/projects/configuration/date-rules?industry=general')->assertOk()->json();
        $this->assertContains('Active', $page['stages']);
        Sanctum::actingAs($this->staff('Njeri', ['projects.use', 'projects.config.view']), ['*']);
        $this->postJson('/api/admin/projects/configuration/date-rules', ['industry' => 'general', 'trigger_kind' => 'stage', 'trigger_value' => 'Active', 'make_title' => 'X', 'offset_days' => 1])->assertForbidden();
    }
}

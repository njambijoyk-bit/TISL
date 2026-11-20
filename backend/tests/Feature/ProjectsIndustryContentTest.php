<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, builds 11.4 and 11.5 (docs/PROJECTS_STAGE11_SPEC.md): the starter content of script 268 holds together, and a work started in an industry gets it. */
class ProjectsIndustryContentTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private User $kamau;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createProjectsWorld();
        $this->kamau = $this->staff('Kamau', ['projects.use', 'projects.create', 'projects.edit', 'projects.stage', 'projects.dates']);
        Sanctum::actingAs($this->kamau, ['*']);
    }

    private function kinds(string $industry): array
    {
        return DB::table('project_lists')->where('list', 'key_date')->where(fn ($q) => $q->whereNull('industry_key')->orWhere('industry_key', $industry))->pluck('key')->all();
    }

    public function test_every_template_rule_question_and_document_refers_to_things_that_exist(): void
    {
        $industries = DB::table('project_industries')->pluck('key')->all();
        foreach (DB::table('project_template_items as i')->join('project_work_templates as t', 't.id', '=', 'i.template_id')->join('project_types as y', 'y.id', '=', 't.type_id')->get(['i.*', 'y.industry_key']) as $i) {
            if ($i->date_kind) {
                $this->assertContains($i->date_kind, $this->kinds($i->industry_key), "{$i->industry_key}: the date \"{$i->title}\" has an unknown kind");
            }
            if ($i->parent_ref) {
                $this->assertTrue(DB::table('project_template_items')->where('template_id', $i->template_id)->where('kind', 'phase')->where('ref', $i->parent_ref)->exists(), "\"{$i->title}\" sits under a phase that is not there");
            }
        }
        foreach (DB::table('project_date_rules')->get() as $r) {
            $this->assertContains($r->industry_key, $industries);
            if ($r->trigger_kind === 'stage') {
                $this->assertTrue(DB::table('project_stages as s')->join('project_types as y', 'y.id', '=', 's.type_id')->where('y.industry_key', $r->industry_key)->where('s.name', $r->trigger_value)->exists(), "{$r->key}: no stage \"{$r->trigger_value}\"");
            } else {
                $this->assertContains($r->trigger_value, $this->kinds($r->industry_key), "{$r->key}: unknown kind {$r->trigger_value}");
            }
            if ($r->make_kind) {
                $this->assertContains($r->make_kind, $this->kinds($r->industry_key), "{$r->key}: unknown kind {$r->make_kind}");
            }
        }
        foreach (DB::table('project_opening_questions')->get() as $q) {
            $this->assertContains($q->industry_key, $industries);
        }
        $known = array_keys(app(\App\Services\Projects\ProjectDocTemplates::class)->catalogue());
        $fields = DB::table('project_fields')->pluck('key')->all();
        foreach (DB::table('project_doc_templates')->get() as $d) {
            preg_match_all('/\{\{\s*([a-z_.]+)\s*\}\}/', $d->body, $m);
            foreach ($m[1] as $f) {
                $this->assertTrue(in_array($f, $known, true) || (str_starts_with($f, 'field.') && in_array(substr($f, 6), $fields, true)), "{$d->industry_key} \"{$d->name}\": unknown field {{{$f}}}");
            }
        }
        $this->assertSame(1, DB::table('project_doc_templates')->where('industry_key', 'legal')->where('name', 'Engagement letter')->count(), 'seeded once');
    }

    public function test_a_litigation_matter_starts_with_its_template_and_its_conflict_check_required(): void
    {
        $type = (int) DB::table('project_types')->where('industry_key', 'legal')->where('name', 'Litigation')->value('id');
        $id = (int) $this->postJson('/api/admin/projects', ['industry_key' => 'legal', 'type_id' => $type, 'title' => 'Imara v Baraka', 'customer_id' => 1, 'start_date' => '2026-12-01'])->assertCreated()->json('project.id');
        $this->assertSame(['Opening', 'Pleadings', 'Discovery', 'Hearing'], DB::table('project_phases')->where('project_id', $id)->orderBy('sort_order')->pluck('name')->all());
        $this->assertSame(['Mention', '2026-12-31'], [DB::table('project_key_dates')->where('project_id', $id)->value('title'), substr(DB::table('project_key_dates')->where('project_id', $id)->value('starts_at'), 0, 10)]);
        $check = $this->getJson("/api/admin/projects/{$id}/opening-check")->assertOk()->json();
        $this->assertSame([true, 4], [$check['required'], count($check['questions'])]);
        $pleadings = (int) DB::table('project_stages')->where('type_id', $type)->where('name', 'Pleadings')->value('id');
        $this->putJson("/api/admin/projects/{$id}/stage", ['stage_id' => $pleadings])->assertStatus(422);

        $this->postJson("/api/admin/projects/{$id}/key-dates", ['title' => 'Papers served', 'kind' => 'service', 'date' => '2026-12-05'])->assertCreated();
        $this->assertSame('2026-12-20', substr(DB::table('project_key_dates')->where('project_id', $id)->where('title', 'Defence due')->value('starts_at'), 0, 10), 'the defence falls due 15 days after service');
    }
}

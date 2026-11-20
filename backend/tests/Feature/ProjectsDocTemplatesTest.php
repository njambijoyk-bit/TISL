<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

/** Projects, build 9.2 (docs/PROJECTS_STAGE9_SPEC.md): documents from templates, kept on the work's files as PDFs. */
class ProjectsDocTemplatesTest extends ProjectsFilesTestCase
{
    private function template(string $body = "Dear {{contact.name}},\n\nRe: {{project.title}} ({{project.number}})\n\n<b>Not bold</b>. Yours, {{lead.name}}, {{company.name}}, {{today}}."): int
    {
        $this->postJson('/api/admin/projects/configuration/templates', ['name' => 'Engagement letter', 'body' => $body])->assertOk();

        return (int) DB::table('project_doc_templates')->where('name', 'Engagement letter')->orderByDesc('id')->value('id');   // the one just made (script 268 ships its own engagement letters)
    }

    public function test_a_template_is_filled_from_the_work_and_its_own_text_is_kept_as_written(): void
    {
        DB::table('project_contacts')->insert(['owner_type' => 'customer', 'owner_id' => 1, 'name' => 'Grace Wambua', 'is_main' => 1, 'created_at' => now()]);
        $t = $this->template();
        $p = $this->postJson($this->url("/templates/{$t}/preview"))->assertOk()->json();
        $number = DB::table('projects')->where('id', $this->project)->value('number');
        $this->assertStringContainsString('Dear Grace Wambua,', $p['html']);
        $this->assertStringContainsString("Re: Imara v Baraka ({$number})", $p['html']);
        $this->assertStringContainsString('&lt;b&gt;Not bold&lt;/b&gt;', $p['html'], 'the template\'s own text is shown as written, never as markup');
        $this->assertStringContainsString('Yours, Kamau', $p['html']);
        $this->assertSame([], $p['missing']);
        $this->assertSame("Engagement letter {$number}", $p['name']);
    }

    public function test_making_a_document_keeps_it_on_the_works_files_as_a_pdf(): void
    {
        $t = $this->template('Hello {{client.name}} about {{project.place}}');
        $this->assertSame(['project.place'], $this->postJson($this->url("/templates/{$t}/preview"))->json('missing'), 'a field with nothing in it is named');
        $r = $this->postJson($this->url("/templates/{$t}/make"), ['name' => 'Letter to Imara'])->assertCreated()->json();
        $f = collect($r['files'])->firstWhere('id', $r['file_id']);
        $this->assertSame(['Letter to Imara.pdf', 'template', 'application/pdf'], [$f['name'], $f['source'], $f['mime']]);
        $this->assertStringStartsWith('%PDF', $this->get($this->url("/files/{$r['file_id']}/download"))->streamedContent());
        $this->assertSame(1, DB::table('project_log')->where('action', 'document.made')->count());
    }

    public function test_templates_are_a_company_list_that_names_unknown_fields_and_need_their_permission(): void
    {
        $this->postJson('/api/admin/projects/configuration/templates', ['name' => 'Bad', 'body' => 'Hello {{client.nickname}}'])->assertStatus(422)->assertJson(['message' => 'These fields are not known: {{client.nickname}}. Choose from the list.']);
        $this->postJson('/api/admin/projects/configuration/templates', ['name' => 'Custom', 'body' => 'Plot {{field.plot_number}}'])->assertOk();
        $this->assertArrayHasKey('client.name', $this->getJson('/api/admin/projects/configuration/templates')->json('fields'));
        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson('/api/admin/projects/configuration/templates', ['name' => 'X', 'body' => 'Y'])->assertForbidden();
        $this->postJson($this->url('/templates/' . DB::table('project_doc_templates')->value('id') . '/make'))->assertForbidden();
    }
}

<?php

namespace Tests\Feature;

use App\Models\VaultDocument;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;

/** Projects, build 9.1 (docs/PROJECTS_STAGE9_SPEC.md): the files of a piece of work, kept in the Core vault. */
class ProjectsFilesTest extends ProjectsFilesTestCase
{
    public function test_a_file_is_kept_in_the_vault_under_the_works_folder_and_listed_on_the_work(): void
    {
        $this->assertSame(0, DB::table('vault_folders')->count(), 'nothing is made for work with no files');
        $folder = collect($this->postJson($this->url('/folders'), ['name' => 'Pleadings'])->assertOk()->json('folders'))->firstWhere('name', 'Pleadings')['id'];
        $r = $this->upload('defence.pdf', '%PDF-1.4 the defence', $folder);
        $f = $r['files'][0];
        $this->assertSame(['defence.pdf', $folder, 1, false, 'Kamau'], [$f['name'], $f['folder_id'], $f['versions'], $f['shared'], $f['uploaded_by']]);
        $number = DB::table('projects')->where('id', $this->project)->value('number');
        $this->assertSame(['Projects', "{$number} Imara v Baraka"], DB::table('vault_folders')->orderBy('id')->pluck('name')->all());
        $doc = VaultDocument::first();
        $this->assertSame([['projects', $number], ['project_id' => $this->project]], [$doc->tags, $doc->metadata]);
        Storage::disk('local')->assertExists($doc->file_path);
        $this->assertSame(1, DB::table('vault_access_logs')->where('action', 'upload')->count(), 'the vault keeps its own record');
        $this->upload('second.pdf');
        $this->assertSame(2, DB::table('vault_folders')->count(), 'one folder per work, made once');
    }

    public function test_new_versions_keep_the_old_ones_and_any_version_can_be_downloaded(): void
    {
        $id = $this->upload('plan.pdf', 'version one')['files'][0]['id'];
        $this->post($this->url("/files/{$id}/versions"), ['file' => UploadedFile::fake()->createWithContent('plan-rev-b.pdf', 'version two'), 'note' => 'Revision B'], ['Accept' => 'application/json'])->assertCreated();
        $this->assertSame([[2, 'Revision B'], [1, 'First version']], array_map(fn ($v) => [$v['number'], $v['note']], $this->getJson($this->url("/files/{$id}/versions"))->json('versions')));
        $this->assertSame('version two', $this->get($this->url("/files/{$id}/download"))->assertOk()->streamedContent());
        $this->assertSame('version one', $this->get($this->url("/files/{$id}/download?version=1"))->assertOk()->streamedContent());
        $this->assertSame('plan.pdf', $this->getJson($this->url('/files'))->json('files.0.name'), 'the name on the work stays');
    }

    public function test_sharing_moving_renaming_expiry_removing_and_putting_back_are_logged_and_need_their_permissions(): void
    {
        $id = $this->upload()['files'][0]['id'];
        $folder = collect($this->postJson($this->url('/folders'), ['name' => 'Court'])->json('folders'))->firstWhere('name', 'Court')['id'];
        $this->putJson($this->url("/files/{$id}"), ['shared' => true])->assertOk()->assertJsonPath('files.0.shared', true);
        $this->putJson($this->url("/files/{$id}"), ['name' => 'Defence (filed)', 'folder_id' => $folder, 'expires_on' => '2027-01-31'])->assertOk();
        $f = $this->getJson($this->url('/files'))->json('files.0');
        $this->assertSame(['Defence (filed)', $folder, '2027-01-31'], [$f['name'], $f['folder_id'], $f['expires_on']]);
        $this->deleteJson($this->url("/folders/{$folder}"))->assertStatus(422)->assertJson(['message' => 'Move or remove what is in the folder first.']);
        $this->deleteJson($this->url("/files/{$id}"))->assertOk()->assertJsonPath('files', []);
        $this->assertSame(['Defence (filed)'], array_column($this->getJson($this->url('/files?removed=1'))->json('files'), 'name'));
        $this->postJson($this->url("/files/{$id}/restore"))->assertOk();
        $this->assertFalse($this->getJson($this->url('/files'))->json('files.0.shared'), 'a removed file comes back unshared');
        $this->assertSame(['file.added', 'folder.added', 'file.shared', 'file.changed', 'file.removed', 'file.restored'], DB::table('project_log')->whereIn('action', ['file.added', 'folder.added', 'file.shared', 'file.changed', 'file.removed', 'file.restored'])->orderBy('id')->pluck('action')->all());

        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson($this->url('/files'))->assertOk();
        $this->assertSame('%PDF-1.4 the defence', $this->get($this->url("/files/{$id}/download"))->assertOk()->streamedContent());
        $this->post($this->url('/files'), ['file' => UploadedFile::fake()->createWithContent('x.pdf', 'x')], ['Accept' => 'application/json'])->assertForbidden();
        $this->putJson($this->url("/files/{$id}"), ['shared' => true])->assertForbidden();
    }
}

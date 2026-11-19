<?php

namespace Tests\Feature;

use App\Services\Projects\ProjectRegisters;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

/** Projects, build 9.4 (docs/PROJECTS_STAGE9_SPEC.md): registers on a piece of work, and files running out. */
class ProjectsRegistersTest extends ProjectsFilesTestCase
{
    public function test_a_register_lists_numbered_lines_with_its_kinds_statuses_and_a_new_file_version_moves_the_revision(): void
    {
        $kind = (int) DB::table('project_register_kinds')->where('key', 'drawings')->value('id');
        $reg = $this->postJson($this->url('/registers'), ['kind_id' => $kind])->assertCreated()->json('registers.0');
        $this->assertSame(['Drawing register', ['For information', 'For comment', 'For construction', 'Superseded']], [$reg['name'], $reg['statuses']]);
        $file = $this->upload('A-101 ground floor.pdf', 'rev a')['files'][0]['id'];
        $this->postJson($this->url("/registers/{$reg['id']}/lines"), ['number' => 'A-101', 'title' => 'Ground floor plan', 'revision' => 'A', 'status' => 'For comment', 'file_id' => $file])->assertOk();
        $this->postJson($this->url("/registers/{$reg['id']}/lines"), ['number' => 'A-101', 'title' => 'Again'])->assertStatus(422)->assertJson(['message' => 'There is already a line A-101 in this register.']);
        $this->postJson($this->url("/registers/{$reg['id']}/lines"), ['number' => 'A-102', 'title' => 'First floor', 'status' => 'Approved'])->assertStatus(422);
        $this->post($this->url("/files/{$file}/versions"), ['file' => UploadedFile::fake()->createWithContent('a.pdf', 'rev b')], ['Accept' => 'application/json'])->assertCreated();
        $line = $this->getJson($this->url('/registers'))->json('registers.0.lines.0');
        $this->assertSame(['A-101', 'B', 'For comment', 'A-101 ground floor.pdf'], [$line['number'], $line['revision'], $line['status'], $line['file']['name']]);
        $this->deleteJson($this->url("/registers/{$reg['id']}/lines/{$line['id']}"))->assertOk()->assertJsonPath('registers.0.lines', []);
        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson($this->url('/registers'))->assertOk();
        $this->postJson($this->url("/registers/{$reg['id']}/lines"), ['number' => 'X', 'title' => 'Y'])->assertForbidden();
    }

    public function test_revisions_move_on_the_way_people_write_them(): void
    {
        $this->assertSame(['A', 'B', 'AA', 'P02', 'C4', '2', '10', 'b', 'Rev.1'], array_map([ProjectRegisters::class, 'nextRevision'], [null, 'A', 'Z', 'P01', 'C3', '1', '09', 'a', 'Rev']));
    }

    public function test_a_file_running_out_tells_the_lead_and_whoever_added_it_once_at_each_mark(): void
    {
        $told = [];
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($told) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$told) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->told[] = [$to->name, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $id = $this->upload('Building permit.pdf')['files'][0]['id'];
        $this->putJson($this->url("/files/{$id}"), ['expires_on' => '2026-12-31'])->assertOk();
        $svc = app(ProjectRegisters::class);
        $this->assertSame(0, $svc->warnExpiry(Carbon::parse('2026-10-01')), 'more than 60 days away');
        $this->assertSame(1, $svc->warnExpiry(Carbon::parse('2026-11-05')), 'within 60 days (a missed morning still warns)');
        $this->assertSame(0, $svc->warnExpiry(Carbon::parse('2026-11-06')));
        $this->assertSame(1, $svc->warnExpiry(Carbon::parse('2026-12-01')));
        $this->assertSame(1, $svc->warnExpiry(Carbon::parse('2026-12-31')));
        $number = DB::table('projects')->where('id', $this->project)->value('number');
        $this->assertSame([['Kamau', "Building permit.pdf runs out in 56 days · {$number}"], ['Kamau', "Building permit.pdf runs out in 30 days · {$number}"], ['Kamau', "Building permit.pdf runs out today · {$number}"]], $told, 'the lead and the uploader are the same person here');
        $this->putJson($this->url("/files/{$id}"), ['expires_on' => '2027-12-31'])->assertOk();
        $this->assertNull(DB::table('project_files')->where('id', $id)->value('warned'), 'a new date starts the warnings again');
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;

/** Projects, builds 10.6 and 10.7 (docs/PROJECTS_STAGE10_SPEC.md): inspection kinds and inspections, failed answers raising snags, and snags through to closed. */
class ProjectsInspectionsTest extends ProjectsFilesTestCase
{
    private User $achieng;
    private array $told = [];

    protected function setUp(): void
    {
        parent::setUp();
        $told = &$this->told;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($told) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$told) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->told[] = [$to->name, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->achieng = $this->staff('Achieng', ['projects.use', 'projects.inspections', 'projects.files.view', 'projects.config.view', 'projects.config.manage']);
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->achieng->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        Sanctum::actingAs($this->achieng, ['*']);
    }

    private function work(string $more = ''): string
    {
        return "/api/admin/projects/{$this->project}{$more}";
    }

    public function test_an_inspection_is_answered_and_finished_and_each_failed_answer_becomes_a_snag(): void
    {
        $kinds = $this->getJson('/api/admin/projects/configuration/inspections')->assertOk()->json('kinds');
        $quality = collect($kinds)->firstWhere('name', 'Quality check');
        $this->assertSame(3, count($quality['questions']), 'the kind script 267 starts with');
        $this->postJson('/api/admin/projects/configuration/inspections', ['name' => 'Waterproofing', 'questions' => "Membrane laps 100 mm\n\nNo punctures\nFlood test 24 hours"])->assertCreated();
        $kind = (int) DB::table('project_inspection_kinds')->where('name', 'Waterproofing')->value('id');
        $i = $this->postJson($this->work('/inspections'), ['kind_id' => $kind, 'area' => 'Roof, block B'])->assertCreated()->json();
        $this->assertSame(['Membrane laps 100 mm', 'No punctures', 'Flood test 24 hours'], array_column($i['answers'], 'question'));
        $id = $i['inspection']['id'];
        $this->putJson($this->work("/inspections/{$id}/answers/1"), ['answer' => 'pass'])->assertOk();
        $this->putJson($this->work("/inspections/{$id}/answers/2"), ['answer' => 'fail', 'note' => 'Puncture by the outlet'])->assertOk();
        $this->post($this->work("/inspections/{$id}/answers/2/photo"), ['photo' => UploadedFile::fake()->createWithContent('outlet.jpg', 'jpeg')], ['Accept' => 'application/json'])->assertOk();
        $this->postJson($this->work("/inspections/{$id}/finish"), ['name' => 'Achieng Otieno'])->assertStatus(422)->assertJsonPath('message', 'One question has no answer yet.');
        $this->putJson($this->work("/inspections/{$id}/answers/3"), ['answer' => 'na'])->assertOk();
        $done = $this->postJson($this->work("/inspections/{$id}/finish"), ['name' => 'Achieng Otieno'])->assertOk()->json();
        $this->assertSame(['done', 'failed', 'Achieng Otieno'], [$done['inspection']['state'], $done['inspection']['outcome'], $done['inspection']['inspector']]);
        $this->assertSame(['number' => 1, 'state' => 'open'], $done['answers'][1]['snag']);
        $snag = DB::table('project_snags')->first();
        $this->assertSame(['No punctures: Puncture by the outlet', 'Roof, block B'], [$snag->title, $snag->area]);
        $this->assertNotNull($snag->file_id, 'the photo goes with the snag');
        $this->assertSame('Inspections', DB::table('project_folders')->where('id', DB::table('project_files')->where('id', $snag->file_id)->value('folder_id'))->value('name'));
        $this->assertSame(['Kamau', 'Inspection failed · ' . DB::table('projects')->where('id', $this->project)->value('number')], end($this->told), 'the lead is told');
        $this->putJson($this->work("/inspections/{$id}/answers/1"), ['answer' => 'fail'])->assertStatus(422);   // finished: locked
    }

    public function test_a_snag_is_given_fixed_by_whoever_has_it_closed_or_opened_again_and_the_client_sees_shared_ones(): void
    {
        $page = $this->postJson($this->work('/snags'), ['title' => 'Chipped tile at the entrance', 'area' => 'Lobby', 'user_id' => $this->njeri->id, 'due_on' => now()->subDay()->toDateString(), 'shared' => true])->assertCreated()->json();
        $snag = $page['snags'][0];
        $this->assertSame([1, 'Njeri', true, 'open'], [$snag['number'], $snag['given']['name'], $snag['late'], $snag['state']]);
        $this->assertSame('Njeri', end($this->told)[0], 'whoever it is given to is told');

        Sanctum::actingAs($this->njeri, ['*']);   // it is theirs: they may mark it fixed without inspecting
        $this->postJson($this->work("/snags/{$snag['id']}/fix"), ['note' => 'Tile replaced'])->assertOk()->assertJsonPath('snags.0.state', 'fixed');
        $this->postJson($this->work("/snags/{$snag['id']}/close"))->assertForbidden();
        Sanctum::actingAs($this->achieng, ['*']);
        $this->postJson($this->work("/snags/{$snag['id']}/reopen"), [])->assertStatus(422);
        $this->postJson($this->work("/snags/{$snag['id']}/reopen"), ['note' => 'Grout missing'])->assertOk()->assertJsonPath('snags.0.state', 'open');
        Sanctum::actingAs($this->njeri, ['*']);
        $this->postJson($this->work("/snags/{$snag['id']}/fix"))->assertOk();
        Sanctum::actingAs($this->achieng, ['*']);
        $this->postJson($this->work("/snags/{$snag['id']}/close"))->assertOk()->assertJsonPath('counts', ['open' => 0, 'fixed' => 0, 'closed' => 1]);
        $this->assertSame([['number' => 1, 'title' => 'Chipped tile at the entrance', 'area' => 'Lobby', 'state' => 'closed', 'due_on' => now()->subDay()->toDateString()]],
            app(\App\Services\Projects\ProjectSnags::class)->forClient(DB::table('projects')->find($this->project)), 'shared with the client portal');
        $this->assertSame(['snag.raised', 'snag.fixed', 'snag.reopened', 'snag.fixed', 'snag.closed'], DB::table('project_log')->where('project_id', $this->project)->where('action', 'like', 'snag.%')->orderBy('id')->pluck('action')->all());
    }

    public function test_a_subcontractor_fixes_snags_given_to_them_on_their_portal_and_late_ones_are_told_once_a_day(): void
    {
        if (! Schema::hasTable('vendors')) {
            Schema::create('vendors', function ($t) { $t->id(); $t->string('vendor_number')->nullable(); $t->string('company_name')->nullable(); $t->string('contact_name')->nullable(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('status')->default('approved'); $t->timestamps(); $t->softDeletes(); });
        }
        $grace = User::forceCreate(['name' => 'Grace (Juja Electrical)', 'email' => 'grace@juja.test', 'role' => 'vendor']);
        DB::table('vendors')->insert(['id' => 3, 'company_name' => 'Juja Electrical', 'user_id' => $grace->id]);
        $sub = DB::table('project_subcontracts')->insertGetId(['project_id' => $this->project, 'vendor_id' => 3, 'title' => 'Electrical works', 'state' => 'active', 'created_at' => now()]);
        $snag = $this->postJson($this->work('/snags'), ['title' => 'Socket loose in kitchen', 'subcontract_id' => $sub, 'due_on' => now()->subDays(2)->toDateString()])->assertCreated()->json('snags.0');
        $this->assertSame(['subcontract', 'Juja Electrical'], [$snag['given']['kind'], $snag['given']['name']]);
        $this->assertSame('Grace (Juja Electrical)', end($this->told)[0], 'the subcontractor is told');

        $snags = app(\App\Services\Projects\ProjectSnags::class);
        $this->assertSame(1, $snags->remind());
        $this->assertSame(0, $snags->remind(), 'once a day');

        Sanctum::actingAs($grace, ['*']);
        $mine = $this->getJson('/api/vendor-portal/subcontracts')->assertOk()->json('snags');
        $this->assertSame([['Socket loose in kitchen', true]], array_map(fn ($s) => [$s['title'], $s['late']], $mine));
        $this->postJson("/api/vendor-portal/subcontracts/snags/{$snag['id']}/fix", ['note' => 'Tightened and tested'])->assertOk()->assertJsonPath('snags.0.state', 'fixed');
        $this->assertSame(['fixed', 'Juja Electrical'], [DB::table('project_snags')->value('state'), DB::table('project_snags')->value('fixed_by_name')]);
        $other = DB::table('project_snags')->insertGetId(['project_id' => $this->project, 'number' => 2, 'title' => 'Not theirs', 'user_id' => $this->njeri->id, 'state' => 'open', 'created_at' => now()]);
        $this->postJson("/api/vendor-portal/subcontracts/snags/{$other}/fix")->assertNotFound();
    }
}

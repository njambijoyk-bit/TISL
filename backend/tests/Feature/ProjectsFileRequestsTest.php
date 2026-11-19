<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

/** Projects, build 9.3 (docs/PROJECTS_STAGE9_SPEC.md): asking for files and sign-off, in the app and on an outsider's link. */
class ProjectsFileRequestsTest extends ProjectsFilesTestCase
{
    private array $out = [];
    private int $grace;

    protected function setUp(): void
    {
        parent::setUp();
        $out = &$this->out;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($out) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$out) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->out[] = ['staff', $to->name, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }

            public function sendToContact(array $contact, string $type, string $title, string $message, array $o = []): array
            {
                $this->out[] = ['contact', $contact['email'], $title, $o['action_url'] ?? null];

                return ['notification' => null, 'channels' => ['email'], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->grace = DB::table('project_contacts')->insertGetId(['owner_type' => 'customer', 'owner_id' => 1, 'name' => 'Grace Wambua', 'email' => 'grace@example.test', 'created_at' => now()]);
    }

    public function test_a_contact_sends_a_file_on_their_link_and_it_lands_in_the_works_files(): void
    {
        $folder = collect($this->postJson($this->url('/folders'), ['name' => 'From the client'])->json('folders'))->first()['id'];
        $this->postJson($this->url('/requests'), ['kind' => 'file', 'what' => 'A copy of the title deed', 'contact_id' => $this->grace, 'folder_id' => $folder, 'due_on' => '2026-12-01'])->assertCreated();
        $r = DB::table('project_file_requests')->first();
        $this->assertSame(48, strlen($r->token));
        $this->assertSame(['contact', 'grace@example.test', 'A file is asked of you · ' . DB::table('projects')->where('id', $this->project)->value('number'), "/request/{$r->token}"], $this->out[0]);

        auth()->forgetGuards();
        $pub = $this->getJson("/api/requests/{$r->token}")->assertOk()->json();
        $this->assertSame(['file', 'A copy of the title deed', 'Grace Wambua', 'open'], [$pub['kind'], $pub['what'], $pub['who'], $pub['state']]);
        $this->post("/api/requests/{$r->token}/answer", ['file' => UploadedFile::fake()->createWithContent('deed.pdf', 'the deed'), 'note' => 'Certified copy'], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('state', 'done');
        $this->postJson("/api/requests/{$r->token}/answer", [])->assertStatus(422);
        $f = DB::table('project_files')->where('source', 'request')->first();
        $this->assertSame(['deed.pdf', $folder, null], [$f->name, (int) $f->folder_id, $f->uploaded_by]);
        $this->assertSame('Kamau', collect($this->out)->last()[1], 'whoever asked is told');
    }

    public function test_a_sign_off_is_on_one_exact_version_with_a_typed_name_and_a_new_version_needs_a_new_one(): void
    {
        $file = $this->upload('contract.pdf', 'version one')['files'][0]['id'];
        $this->postJson($this->url('/requests'), ['kind' => 'signoff', 'what' => 'Sign off the contract', 'contact_id' => $this->grace, 'file_id' => $file])->assertCreated();
        $token = DB::table('project_file_requests')->value('token');
        $this->assertSame('version one', $this->get("/api/requests/{$token}/file")->assertOk()->streamedContent());
        $this->postJson("/api/requests/{$token}/answer", ['decision' => 'approve', 'name' => 'G'])->assertStatus(422)->assertJson(['message' => 'Type your full name to sign.']);
        $this->postJson("/api/requests/{$token}/answer", ['decision' => 'decline'])->assertStatus(422);
        $this->postJson("/api/requests/{$token}/answer", ['decision' => 'approve', 'name' => 'Grace Wambua', 'note' => 'Agreed'])->assertOk()->assertJsonPath('state', 'done');
        $r = $this->getJson($this->url('/requests'))->json('requests.0');
        $this->assertSame(['done', 'Grace Wambua', 'Agreed', 1, false], [$r['state'], $r['answer']['name'], $r['answer']['note'], $r['version'], $r['newer']]);
        $this->assertNotNull($r['answer']['ip']);

        $this->post($this->url("/files/{$file}/versions"), ['file' => UploadedFile::fake()->createWithContent('contract.pdf', 'version two')], ['Accept' => 'application/json'])->assertCreated();
        $this->assertTrue($this->getJson($this->url('/requests'))->json('requests.0.newer'), 'signed version 1; the file is now version 2');
        $this->postJson($this->url('/requests'), ['kind' => 'signoff', 'what' => 'Sign off again', 'contact_id' => $this->grace, 'file_id' => $file])->assertCreated();
        $again = DB::table('project_file_requests')->orderByDesc('id')->first();
        $this->assertSame(2, (int) $again->version_number);
        $this->post($this->url("/files/{$file}/versions"), ['file' => UploadedFile::fake()->createWithContent('contract.pdf', 'version three')], ['Accept' => 'application/json']);
        $this->postJson("/api/requests/{$again->token}/answer", ['decision' => 'approve', 'name' => 'Grace Wambua'])->assertStatus(422)->assertJson(['message' => 'The file has changed since this was asked. A new sign-off is needed.']);
    }

    public function test_a_colleague_answers_in_the_app_only_their_own_and_reminders_go_once_a_day(): void
    {
        $this->postJson($this->url('/requests'), ['kind' => 'file', 'what' => 'The site photos', 'user_id' => $this->njeri->id, 'due_on' => '2026-11-20'])->assertCreated();
        $id = DB::table('project_file_requests')->value('id');
        $this->post($this->url("/requests/{$id}/answer"), ['file' => UploadedFile::fake()->createWithContent('p.jpg', 'x')], ['Accept' => 'application/json'])->assertForbidden();
        Sanctum::actingAs($this->njeri, ['*']);
        $this->assertTrue($this->getJson($this->url('/requests'))->json('requests.0.mine'));
        $this->postJson($this->url('/requests'), ['kind' => 'file', 'what' => 'x', 'user_id' => $this->kamau->id])->assertForbidden();
        $svc = app(\App\Services\Projects\ProjectFileRequests::class);
        $this->out = [];
        $this->assertSame(1, $svc->remind(\Carbon\Carbon::parse('2026-11-20')));
        $this->assertSame(0, $svc->remind(\Carbon\Carbon::parse('2026-11-20')));
        $this->assertSame(['staff', 'Njeri'], array_slice($this->out[0], 0, 2));
        $this->post($this->url("/requests/{$id}/answer"), ['file' => UploadedFile::fake()->createWithContent('photos.zip', 'x')], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame('done', DB::table('project_file_requests')->value('state'));
        $this->getJson('/api/requests/' . str_repeat('a', 48))->assertNotFound();
    }
}

<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

/** Projects, build 9.6 (docs/PROJECTS_STAGE9_SPEC.md): guest links, read-only to shared files and their own requests, ending by themselves. */
class ProjectsGuestLinksTest extends ProjectsFilesTestCase
{
    private array $out = [];

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
    }

    private function give(array $d = []): array
    {
        return $this->postJson($this->url('/guests'), $d + ['name' => 'Dr Otieno', 'email' => 'otieno@example.test', 'ends_on' => now()->addDays(30)->toDateString()])->assertCreated()->json('links');
    }

    public function test_a_guest_sees_only_shared_files_and_every_opening_is_logged(): void
    {
        $shared = $this->upload('Expert brief.pdf', 'the brief')['files'][0]['id'];
        $this->upload('Strategy notes.pdf', 'team only');
        $this->putJson($this->url("/files/{$shared}"), ['shared' => true])->assertOk();
        $links = $this->give();
        $token = DB::table('project_guest_links')->value('token');
        $this->assertSame(["/guest/{$token}", 'live'], [$links[0]['link'], $links[0]['state']]);
        $this->assertSame(['contact', 'otieno@example.test', "/guest/{$token}"], [$this->out[0][0], $this->out[0][1], $this->out[0][3]], 'the guest is emailed the link');

        auth()->forgetGuards();
        $page = $this->getJson("/api/guests/{$token}")->assertOk()->json();
        $this->assertSame(['Dr Otieno', ['Expert brief.pdf']], [$page['name'], array_column($page['files'], 'name')], 'never a team-only file');
        $this->assertSame('the brief', $this->get("/api/guests/{$token}/files/{$shared}")->assertOk()->streamedContent());
        $teamOnly = DB::table('project_files')->where('name', 'Strategy notes.pdf')->value('id');
        $this->getJson("/api/guests/{$token}/files/{$teamOnly}")->assertNotFound();
        $this->getJson('/api/guests/' . str_repeat('x', 48))->assertNotFound();

        Sanctum::actingAs($this->kamau, ['*']);
        $link = DB::table('project_guest_links')->value('id');
        $this->assertSame([['file', 'Expert brief.pdf'], ['opened', null]], array_map(fn ($v) => [$v['what'], $v['file']], $this->getJson($this->url("/guests/{$link}/visits"))->assertOk()->json('visits')));
        $this->assertSame(2, $this->getJson($this->url('/guests'))->json('links.0.visits'));
    }

    public function test_a_link_lasts_ninety_days_at_most_ends_by_itself_and_can_be_ended_early(): void
    {
        $this->postJson($this->url('/guests'), ['name' => 'Dr Otieno', 'ends_on' => now()->addDays(91)->toDateString()])->assertStatus(422)->assertJsonPath('message', 'A guest link can last 90 days at most.');
        $this->postJson($this->url('/guests'), ['name' => 'Dr Otieno', 'ends_on' => now()->subDay()->toDateString()])->assertStatus(422);
        $this->give(['email' => null]);
        $this->assertSame([], $this->out, 'no email, nothing sent');
        $token = DB::table('project_guest_links')->value('token');
        $id = DB::table('project_guest_links')->value('id');

        $this->travel(31)->days();
        $this->getJson("/api/guests/{$token}")->assertStatus(410);
        $this->assertSame('ran_out', $this->getJson($this->url('/guests'))->json('links.0.state'));
        $this->travelBack();

        $this->postJson($this->url("/guests/{$id}/end"))->assertOk()->assertJsonPath('links.0.state', 'ended');
        $this->getJson("/api/guests/{$token}")->assertStatus(410);
        $this->postJson($this->url("/guests/{$id}/end"))->assertStatus(422);
        $this->assertSame(['guest.given', 'guest.ended'], DB::table('project_log')->whereIn('action', ['guest.given', 'guest.ended'])->orderBy('id')->pluck('action')->all());

        Sanctum::actingAs($this->njeri, ['*']);
        $this->getJson($this->url('/guests'))->assertOk()->assertJsonPath('can.give', false)->assertJsonPath('links.0.link', null);
        $this->postJson($this->url('/guests'), ['name' => 'Someone', 'ends_on' => now()->addDays(5)->toDateString()])->assertForbidden();
    }

    public function test_a_guest_is_asked_for_a_file_on_their_page_and_giving_a_link_is_a_serious_action(): void
    {
        $this->give();
        $link = (int) DB::table('project_guest_links')->value('id');
        $token = DB::table('project_guest_links')->value('token');
        $this->assertSame([['id' => $link, 'name' => 'Dr Otieno']], $this->getJson($this->url('/requests'))->json('guests'));
        $this->postJson($this->url('/requests'), ['kind' => 'file', 'what' => 'Your expert report', 'guest_link_id' => $link])->assertCreated()->assertJsonPath('requests.0.of', 'Dr Otieno');
        $r = DB::table('project_file_requests')->first();
        $this->assertSame("/request/{$r->token}", collect($this->out)->last()[3], 'emailed to the guest');

        auth()->forgetGuards();
        $this->assertSame([['Your expert report', 'open', "/request/{$r->token}"]], array_map(fn ($q) => [$q['what'], $q['state'], $q['link']], $this->getJson("/api/guests/{$token}")->json('requests')));
        $this->assertSame('Dr Otieno', $this->getJson("/api/requests/{$r->token}")->json('who'));
        $this->post("/api/requests/{$r->token}/answer", ['file' => UploadedFile::fake()->createWithContent('report.pdf', 'the report')], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('state', 'done');
        $this->assertTrue(DB::table('project_guest_visits')->where('what', 'answered')->exists());

        Sanctum::actingAs($this->kamau, ['*']);
        $this->postJson($this->url("/guests/{$link}/end"))->assertOk();
        $this->postJson($this->url('/requests'), ['kind' => 'file', 'what' => 'More', 'guest_link_id' => $link])->assertStatus(422);
        auth()->forgetGuards();
        $this->getJson("/api/requests/{$r->token}")->assertStatus(410);

        Sanctum::actingAs($this->kamau, ['*']);
        Sanctum::actingAs($this->staff('Wanjiru', ['projects.use', 'projects.config.view', 'projects.config.actions']), ['*']);
        $this->putJson('/api/admin/projects/configuration/serious', ['rules' => ['guest.link' => ['needs' => 'supervisor', 'on_project' => false, 'reason' => false]]])->assertOk();
        Sanctum::actingAs($this->kamau, ['*']);
        $this->postJson($this->url('/guests'), ['name' => 'Auditor', 'ends_on' => now()->addDays(10)->toDateString()])->assertStatus(428)->assertJsonPath('serious.action', 'guest.link');
        $this->assertSame(1, DB::table('project_guest_links')->count(), 'nothing given before it is approved');
    }
}

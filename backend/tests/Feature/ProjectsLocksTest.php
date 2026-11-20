<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Projects, build 2.3 (docs/PROJECTS_STAGE2_SPEC.md): locked areas with their own password, timed unlock, wrong-try limit and supervised reset. */
class ProjectsLocksTest extends TestCase
{
    use Concerns\CreatesProjectsWorld;

    private const LEAD = ['projects.use', 'projects.create', 'projects.edit', 'projects.phases', 'projects.links', 'projects.log.view', 'projects.members.view', 'projects.members.manage', 'projects.access.rules', 'projects.config.fields', 'projects.config.view', 'projects.fields.sensitive'];

    private User $kamau;
    private User $njeri;
    private int $project;
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-16 10:00:00');
        $this->createProjectsWorld();
        DB::table('project_fields')->delete();   // this test makes its own fields; the industry fields of script 268 are taken away
        $sent = &$this->sent;
        $this->app->instance(\App\Services\Notify\Notifier::class, new class($sent) extends \App\Services\Notify\Notifier {
            public function __construct(private array &$sent) {}

            public function send(\Illuminate\Database\Eloquent\Model $to, string $type, string $title, string $message, array $o = []): array
            {
                $this->sent[] = [$to->name, $type, $title];

                return ['notification' => null, 'channels' => [], 'skipped' => [], 'staff_list' => false];
            }
        });
        $this->kamau = $this->staff('Kamau', self::LEAD);
        $this->njeri = $this->staff('Njeri', ['projects.use', 'projects.phases', 'projects.members.view']);
        Sanctum::actingAs($this->kamau, ['*']);
        $this->project = (int) $this->postJson('/api/admin/projects', ['type_id' => DB::table('project_types')->where('industry_key', 'general')->where('name', 'Client project')->value('id'), 'title' => 'Stock system'])->assertCreated()->json('project.id');
        DB::table('project_members')->insert(['project_id' => $this->project, 'user_id' => $this->njeri->id, 'project_role_id' => DB::table('project_roles')->where('key', 'member')->value('id'), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function as(User $u): static
    {
        Sanctum::actingAs($u, ['*']);

        return $this;
    }

    private function url(string $rest = ''): string
    {
        return "/api/admin/projects/{$this->project}{$rest}";
    }

    public function test_a_locked_area_needs_its_password_even_from_the_lead_and_opens_for_a_few_minutes(): void
    {
        $this->putJson($this->url('/locks/phases'), ['password' => 'short'])->assertStatus(422)->assertJson(['message' => 'Use at least 8 characters for the password.']);
        $locks = $this->putJson($this->url('/locks/phases'), ['password' => 'blue-kettle-42'])->assertOk()->json('locks');
        $row = collect($locks)->firstWhere('area', 'phases');
        $this->assertSame([true, 'Kamau'], [$row['locked'], $row['set_by']]);
        $this->assertStringNotContainsString('blue-kettle', json_encode(DB::table('project_locks')->get()) . json_encode(DB::table('project_log')->get()), 'the password is stored hashed and never logged');

        $state = $this->getJson($this->url())->assertOk()->json('project.locks.phases');
        $this->assertSame(['Phases', true, false], [$state['label'], $state['locked'], $state['open']]);
        $r = $this->getJson($this->url('/phases'))->assertStatus(423)->json();
        $this->assertSame(['Phases is locked here. Enter its password to open it.', 'phases'], [$r['message'], $r['locked']['area']]);
        $this->postJson($this->url('/phases'), ['name' => 'Design'])->assertStatus(423);   // the lead too
        $this->getJson($this->url('/links'))->assertOk();   // other areas are untouched

        $r = $this->postJson($this->url('/locks/phases/open'), ['password' => 'blue-kettle-42'])->assertOk()->json();
        $this->assertSame(['2026-11-16 10:15:00', true], [$r['until'], $r['locks']['phases']['open']]);
        $this->postJson($this->url('/phases'), ['name' => 'Design'])->assertCreated();
        $this->as($this->njeri)->getJson($this->url('/phases'))->assertStatus(423);   // it opened for Kamau only

        $this->as($this->kamau);
        Carbon::setTestNow('2026-11-16 10:16:00');
        $this->getJson($this->url('/phases'))->assertStatus(423);   // and closed by itself
        $this->postJson($this->url('/locks/phases/open'), ['password' => 'blue-kettle-42'])->assertOk();
        $this->postJson($this->url('/locks/phases/close'))->assertOk();
        $this->getJson($this->url('/phases'))->assertStatus(423);   // or when asked to
        $this->assertSame(['lock.set', 'lock.opened', 'lock.opened'], DB::table('project_log')->where('action', 'like', 'lock.%')->where('result', 'done')->orderBy('id')->pluck('action')->all());
    }

    public function test_every_area_stands_in_front_of_its_own_part(): void
    {
        foreach (['people', 'links', 'activity'] as $area) {
            $this->putJson($this->url("/locks/{$area}"), ['password' => 'blue-kettle-42'])->assertOk();
        }
        $this->getJson($this->url('/members'))->assertStatus(423);
        $this->postJson($this->url('/members'), ['user_id' => $this->njeri->id, 'project_role_id' => 1])->assertStatus(423);
        $this->getJson($this->url('/links'))->assertStatus(423);
        $this->getJson($this->url('/log'))->assertStatus(423);
        $this->getJson($this->url())->assertOk();
        $this->putJson($this->url('/locks/money'), ['password' => 'blue-kettle-42'])->assertNotFound();

        // the Access tab stays reachable so the lock can be managed, but names nobody until People is opened
        $t = $this->getJson($this->url('/access'))->assertOk()->json();
        $this->assertSame([true, [], []], [$t['people_locked'], $t['people'], $t['others']['people']]);
        $this->assertSame(['people', 'links', 'activity'], array_column(array_filter($t['locks'], fn ($l) => $l['locked']), 'area'));
        $this->postJson($this->url('/locks/people/open'), ['password' => 'blue-kettle-42'])->assertOk();
        $this->assertSame(['Kamau', 'Njeri'], array_column($this->getJson($this->url('/access'))->json('people'), 'name'));
    }

    public function test_sensitive_fields_behind_a_lock_are_absent_until_it_is_opened(): void
    {
        $this->postJson('/api/admin/projects/configuration/fields', ['label' => 'Settlement ceiling', 'kind' => 'text', 'scope' => 'all', 'sensitive' => true])->assertCreated();
        $key = DB::table('project_fields')->where('label', 'Settlement ceiling')->value('key');
        $this->putJson($this->url(), ['fields' => [$key => 'KES 4m']])->assertOk();
        $this->assertSame(['Settlement ceiling'], array_column($this->getJson($this->url())->json('project.fields'), 'label'));

        $this->putJson($this->url('/locks/sensitive_fields'), ['password' => 'blue-kettle-42'])->assertOk();
        $this->assertSame([], $this->getJson($this->url())->json('project.fields'));
        $this->putJson($this->url(), ['fields' => [$key => 'Overwritten blind']])->assertOk();
        $this->postJson($this->url('/locks/sensitive_fields/open'), ['password' => 'blue-kettle-42'])->assertOk();
        $this->assertSame('KES 4m', $this->getJson($this->url())->json('project.fields.0.value'), 'what was sent while it was locked was ignored');
    }

    public function test_wrong_passwords_are_counted_and_too_many_mean_a_wait_and_an_alert(): void
    {
        $this->putJson($this->url('/locks/phases'), ['password' => 'blue-kettle-42'])->assertOk();
        $this->as($this->njeri);
        $r = $this->postJson($this->url('/locks/phases/open'), ['password' => 'guess-one'])->assertStatus(422)->json();
        $this->assertSame(['That is not the password. 4 tries left before a wait.', 4], [$r['message'], $r['locked']['tries_left']]);
        foreach ([3, 2, 1] as $left) {
            $this->assertSame($left, $this->postJson($this->url('/locks/phases/open'), ['password' => 'guess'])->assertStatus(422)->json('locked.tries_left'));
        }
        $this->postJson($this->url('/locks/phases/open'), ['password' => 'guess'])->assertStatus(429)->assertJson(['message' => 'That is not the password. That was 5 wrong tries: wait 15 minutes before trying again.']);
        $this->assertSame(['Kamau', 'project_security', 'Njeri entered a wrong password 5 times on P-0001'], end($this->sent));
        $this->postJson($this->url('/locks/phases/open'), ['password' => 'blue-kettle-42'])->assertStatus(429)->assertJson(['message' => 'Too many wrong tries. Wait 15 minutes and try again.']);   // even the right one, during the wait
        $this->assertSame(6, DB::table('project_log')->where('result', 'refused')->where('action', 'like', 'lock.%')->count(), 'five tries and the block');

        Carbon::setTestNow('2026-11-16 10:16:00');
        $this->postJson($this->url('/locks/phases/open'), ['password' => 'guess'])->assertStatus(422)->assertJsonPath('locked.tries_left', 4);   // the count starts again
        $this->postJson($this->url('/locks/phases/open'), ['password' => 'blue-kettle-42'])->assertOk();
        $this->postJson($this->url('/locks/phases/close'))->assertOk();
        $this->postJson($this->url('/locks/phases/open'), ['password' => 'guess'])->assertStatus(422)->assertJsonPath('locked.tries_left', 4);   // a right password cleared it
    }

    public function test_changing_or_removing_a_lock_needs_its_password_and_the_right_to_set_access(): void
    {
        $this->putJson($this->url('/locks/phases'), ['password' => 'blue-kettle-42'])->assertOk();
        $this->postJson($this->url('/locks/phases/open'), ['password' => 'blue-kettle-42'])->assertOk();
        $this->putJson($this->url('/locks/phases'), ['password' => 'green-ladder-77', 'current' => 'not-it'])->assertStatus(422);
        $this->putJson($this->url('/locks/phases'), ['password' => 'green-ladder-77', 'current' => 'blue-kettle-42'])->assertOk();
        $this->getJson($this->url('/phases'))->assertStatus(423);   // a new password closes it for everyone who had it open
        $this->postJson($this->url('/locks/phases/open'), ['password' => 'blue-kettle-42'])->assertStatus(422);

        $this->deleteJson($this->url('/locks/phases'), ['password' => 'blue-kettle-42'])->assertStatus(422);
        $this->as($this->njeri)->deleteJson($this->url('/locks/phases'), ['password' => 'green-ladder-77'])->assertForbidden();
        $this->putJson($this->url('/locks/links'), ['password' => 'green-ladder-77'])->assertForbidden();
        $this->as($this->kamau)->deleteJson($this->url('/locks/phases'), ['password' => 'green-ladder-77'])->assertOk();
        $this->getJson($this->url('/phases'))->assertOk();
        $this->assertSame(0, DB::table('project_unlocks')->count());
    }

    public function test_a_lost_password_is_reset_only_when_someone_else_approves(): void
    {
        $this->putJson($this->url('/locks/phases'), ['password' => 'blue-kettle-42'])->assertOk();
        $amina = $this->staff('Amina', ['projects.use', 'projects.locks.reset']);
        $this->grant($this->kamau, array_merge(['admin.access', 'projects.locks.reset'], self::LEAD));   // Kamau may approve resets too, but never his own

        $this->postJson($this->url('/locks/phases/reset'), ['reason' => ''])->assertStatus(422);
        $locks = $this->postJson($this->url('/locks/phases/reset'), ['reason' => 'The person who set it has left'])->assertCreated()->json('locks');
        $this->assertSame(['status' => 'waiting', 'mine' => true, 'asked_by' => 'Kamau'], collect($locks)->firstWhere('area', 'phases')['reset']);
        $this->assertSame(['Amina', 'project_access', 'Kamau needs your approval in Projects'], end($this->sent));
        $this->postJson($this->url('/locks/phases/reset'), ['reason' => 'Again'])->assertStatus(422)->assertJson(['message' => 'You have already asked for this. It is waiting for an answer.']);
        $this->putJson($this->url('/locks/phases'), ['password' => 'green-ladder-77', 'after_reset' => true])->assertForbidden();   // not approved yet

        $page = $this->getJson('/api/admin/projects/approvals')->assertOk()->json();
        $this->assertSame([[], 1], [$page['waiting'], count($page['mine'])], 'his own request is not his to answer');
        $id = $page['mine'][0]['id'];
        $this->putJson("/api/admin/projects/approvals/{$id}", ['approve' => true])->assertNotFound();

        $page = $this->as($amina)->getJson('/api/admin/projects/approvals')->assertOk()->json();
        $this->assertSame(['Reset the password of Phases on P-0001 (Stock system)', 'The person who set it has left', 'Kamau', 24], [$page['waiting'][0]['summary'], $page['waiting'][0]['reason'], $page['waiting'][0]['asked_by'], $page['waiting'][0]['hours_left']]);
        $this->putJson("/api/admin/projects/approvals/{$id}", ['approve' => false])->assertStatus(422)->assertJson(['message' => 'Say why you are declining.']);
        $this->putJson("/api/admin/projects/approvals/{$id}", ['approve' => true, 'note' => 'Confirmed with HR'])->assertOk();
        $this->assertSame(['Kamau', 'project_access', 'Amina approved your request'], end($this->sent));
        $this->putJson("/api/admin/projects/approvals/{$id}", ['approve' => true])->assertStatus(422);   // answered once

        $this->as($this->kamau)->postJson($this->url('/locks/phases/open'), ['password' => 'blue-kettle-42'])->assertOk();   // approval alone changes nothing
        $this->putJson($this->url('/locks/phases'), ['password' => 'green-ladder-77', 'after_reset' => true])->assertOk();
        $this->getJson($this->url('/phases'))->assertStatus(423);
        $this->postJson($this->url('/locks/phases/open'), ['password' => 'blue-kettle-42'])->assertStatus(422);
        $this->postJson($this->url('/locks/phases/open'), ['password' => 'green-ladder-77'])->assertOk();
        $this->putJson($this->url('/locks/phases'), ['password' => 'third-password-9', 'after_reset' => true])->assertForbidden();   // an approval is used once
        $log = DB::table('project_log')->where('action', 'lock.reset')->first();
        $this->assertSame('Amina', json_decode($log->new_values, true)['approved_by']);
    }

    public function test_a_request_can_be_declined_withdrawn_or_lapse(): void
    {
        $this->putJson($this->url('/locks/phases'), ['password' => 'blue-kettle-42'])->assertOk();
        $this->putJson($this->url('/locks/links'), ['password' => 'blue-kettle-42'])->assertOk();
        $amina = $this->staff('Amina', ['projects.use', 'projects.locks.reset']);

        $this->postJson($this->url('/locks/phases/reset'), ['reason' => 'Lost'])->assertCreated();
        $id = (int) DB::table('project_approvals')->value('id');
        $this->as($amina)->putJson("/api/admin/projects/approvals/{$id}", ['approve' => false, 'note' => 'Ask the lead first'])->assertOk();
        $mine = $this->as($this->kamau)->getJson('/api/admin/projects/approvals')->json('mine.0');
        $this->assertSame(['declined', 'Amina', 'Ask the lead first'], [$mine['status'], $mine['answered_by'], $mine['answer_note']]);
        $this->putJson($this->url('/locks/phases'), ['password' => 'green-ladder-77', 'after_reset' => true])->assertForbidden();

        $this->postJson($this->url('/locks/links/reset'), ['reason' => 'Lost'])->assertCreated();
        $id2 = (int) DB::table('project_approvals')->max('id');
        $this->as($amina)->deleteJson("/api/admin/projects/approvals/{$id2}")->assertNotFound();   // only the asker withdraws
        $this->as($this->kamau)->deleteJson("/api/admin/projects/approvals/{$id2}")->assertOk();
        $this->assertSame([], $this->as($amina)->getJson('/api/admin/projects/approvals')->json('waiting'));

        $this->as($this->kamau)->postJson($this->url('/locks/links/reset'), ['reason' => 'Lost again'])->assertCreated();
        $id3 = (int) DB::table('project_approvals')->max('id');
        Carbon::setTestNow('2026-11-17 10:01:00');   // 24 hours and a minute
        $this->assertSame([], $this->as($amina)->getJson('/api/admin/projects/approvals')->json('waiting'));
        $this->putJson("/api/admin/projects/approvals/{$id3}", ['approve' => true])->assertStatus(422)->assertJson(['message' => 'This request has lapsed.']);
        $this->assertSame('lapsed', $this->as($this->kamau)->getJson('/api/admin/projects/approvals')->json('mine.0.status'));
    }
}

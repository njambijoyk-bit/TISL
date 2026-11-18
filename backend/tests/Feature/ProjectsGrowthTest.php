<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

/** Projects, build 8.3 (docs/PROJECTS_STAGE8_SPEC.md): goals, reviews and one-to-ones, seen only by the person and the managers above them. */
class ProjectsGrowthTest extends ProjectsTeamTest
{
    private function url(int $user, string $more = ''): string
    {
        return "/api/admin/projects/team/{$user}{$more}";
    }

    public function test_a_manager_sets_goals_and_the_person_updates_only_how_far_along_they_are(): void
    {
        $this->postJson($this->url($this->njeri->id, '/goals'), ['title' => 'File every bundle on time', 'measure' => 'No late filings', 'due_on' => '2026-12-31'])->assertOk();
        $g = $this->getJson($this->url($this->njeri->id, '/growth'))->json('goals.0');
        $this->assertSame(['File every bundle on time', 0, 'on_track', 'Wanjiru'], [$g['title'], $g['progress'], $g['state'], $g['set_by']], 'two levels above her, with the permission');

        Sanctum::actingAs($this->njeri, ['*']);
        $this->putJson($this->url($this->njeri->id, "/goals/{$g['id']}"), ['progress' => 40, 'state' => 'at_risk'])->assertOk()->assertJsonPath('goals.0.progress', 40);
        $this->putJson($this->url($this->njeri->id, "/goals/{$g['id']}"), ['title' => 'Something easier'])->assertForbidden();
        $this->postJson($this->url($this->njeri->id, '/goals'), ['title' => 'Mine'])->assertForbidden();
        $this->assertTrue($this->getJson($this->url($this->njeri->id))->assertOk()->json('person.me'), 'her own page needs no team permission');

        // Kamau is above Njeri but cannot manage; Otieno is in another line
        Sanctum::actingAs($this->kamau, ['*']);
        $this->getJson($this->url($this->njeri->id, '/growth'))->assertNotFound();
        Sanctum::actingAs($this->otieno, ['*']);
        $this->getJson($this->url($this->njeri->id, '/growth'))->assertNotFound();
        $this->getJson($this->url($this->njeri->id))->assertNotFound();
    }

    public function test_a_review_is_a_draft_until_shared_then_the_person_comments_and_acknowledges(): void
    {
        $this->postJson($this->url($this->kamau->id, '/reviews'), ['period' => '2026, second half', 'body' => 'Strong court work.'])->assertOk();
        Sanctum::actingAs($this->kamau, ['*']);
        $this->assertSame([], $this->getJson($this->url($this->kamau->id, '/growth'))->json('reviews'), 'a draft is not his to read yet');
        Sanctum::actingAs($this->wanjiru, ['*']);
        $id = $this->getJson($this->url($this->kamau->id, '/growth'))->json('reviews.0.id');
        $this->putJson($this->url($this->kamau->id, "/reviews/{$id}"), ['share' => true])->assertOk();
        Sanctum::actingAs($this->kamau, ['*']);
        $r = $this->putJson($this->url($this->kamau->id, "/reviews/{$id}"), ['comment' => 'Thank you. I want more drafting.', 'acknowledge' => true])->assertOk()->json('reviews.0');
        $this->assertSame(['Strong court work.', 'Thank you. I want more drafting.'], [$r['body'], $r['comment']]);
        $this->assertNotNull($r['acknowledged_at']);
        Sanctum::actingAs($this->wanjiru, ['*']);
        $this->putJson($this->url($this->kamau->id, "/reviews/{$id}"), ['body' => 'Changed'])->assertStatus(422);
    }

    public function test_one_to_ones_share_notes_keep_each_writers_private_note_and_actions_become_tasks(): void
    {
        $this->postJson($this->url($this->kamau->id, '/one-to-ones'), ['held_on' => '2026-11-17', 'notes' => 'Talked about the trial.', 'actions' => [['text' => 'Shadow the hearing', 'who' => $this->kamau->id], ['text' => '  ']],
            'private_note' => 'Ready for more responsibility.'])->assertOk();
        $o = $this->getJson($this->url($this->kamau->id, '/growth'))->json('one_to_ones.0');
        $this->assertSame(['Talked about the trial.', [['text' => 'Shadow the hearing', 'who' => $this->kamau->id, 'task_id' => null]], 'Ready for more responsibility.'], [$o['notes'], $o['actions'], $o['private_note']]);

        Sanctum::actingAs($this->kamau, ['*']);
        $mine = $this->putJson($this->url($this->kamau->id, "/one-to-ones/{$o['id']}"), ['notes' => "Talked about the trial.\nI will read the file first.", 'private_note' => 'Nervous.'])->assertOk()->json('one_to_ones.0');
        $this->assertSame('Nervous.', $mine['private_note'], 'his own private note, not hers');
        $this->postJson($this->url($this->kamau->id, '/one-to-ones'), ['held_on' => '2026-11-18'])->assertForbidden();
        Sanctum::actingAs($this->wanjiru, ['*']);
        $back = $this->getJson($this->url($this->kamau->id, '/growth'))->json('one_to_ones.0');
        $this->assertSame(["Talked about the trial.\nI will read the file first.", 'Ready for more responsibility.'], [$back['notes'], $back['private_note']]);

        $t = $this->postJson($this->url($this->kamau->id, "/one-to-ones/{$o['id']}/actions/0/task"), ['project_id' => $this->project])->assertCreated()->json();
        $this->assertSame('Shadow the hearing', DB::table('project_work_tasks')->where('id', $t['task_id'])->value('title'));
        $this->assertSame([$this->kamau->id], DB::table('project_task_people')->where('task_id', $t['task_id'])->pluck('user_id')->map(fn ($v) => (int) $v)->all());
        $this->assertSame($t['task_id'], $t['one_to_ones'][0]['actions'][0]['task_id']);
        $this->postJson($this->url($this->kamau->id, "/one-to-ones/{$o['id']}/actions/0/task"), ['project_id' => $this->project])->assertStatus(422);
        $this->assertSame(0, DB::table('project_log')->where('action', 'like', '%one%')->count(), 'nothing of it in the work\'s log');
    }
}

<?php

namespace Tests\Feature;

use App\Models\Courses\Attempt;
use App\Models\Courses\Enrolment;
use App\Models\Courses\Lesson;
use App\Models\Courses\Offering;
use App\Models\Courses\Progress;
use App\Models\Courses\Question;
use App\Models\Courses\Quiz;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\QuizService;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Courses step 7: quizzes (building, taking with a timer and attempts, marking by the platform and the teacher, what the student sees afterwards). "Now" is Monday 12 Oct 2026, 12:00. */
class CoursesQuizTest extends TestCase
{
    use Concerns\CreatesCoursesWorld;

    private Offering $o;
    private Lesson $l;
    private Quiz $quiz;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCoursesWorld();
        $this->o = $this->offering(['title' => 'Bread']);
        $this->l = $this->lesson($this->o, ['kind' => 'quiz', 'title' => 'Check']);
        $this->quiz = $this->svc()->quizFor($this->l);
    }

    private function fails(callable $fn, string $msg): void
    {
        try {
            $fn();
            $this->fail("Expected: {$msg}");
        } catch (BooksException $e) {
            $this->assertStringContainsString($msg, $e->getMessage());
        }
    }

    private function svc(): QuizService
    {
        return app(QuizService::class);
    }

    private function student(string $name = 'Amina'): User
    {
        $u = $this->person($name);
        app(CourseAccess::class)->grant($u->id, $this->o->id, 'staff', 'test');

        return $u;
    }

    /** @return Question[] one of each kind: single (o2 right), multiple (a and c right), true/false (true), short (accepted "Yeast"), worth 1, 2, 1, 1 */
    private function questions(): array
    {
        $q = $this->quiz;

        return [
            $this->svc()->saveQuestion($q, ['kind' => 'single', 'body' => 'Which flour?', 'options' => ['Cake', 'Bread', 'Rice'], 'correct' => ['o2']]),
            $this->svc()->saveQuestion($q, ['kind' => 'multiple', 'body' => 'Which rise?', 'options' => [['id' => 'a', 'text' => 'Dough'], ['id' => 'b', 'text' => 'Stone'], ['id' => 'c', 'text' => 'Batter']], 'correct' => ['a', 'c'], 'points' => 2]),
            $this->svc()->saveQuestion($q, ['kind' => 'truefalse', 'body' => 'Salt slows yeast', 'correct' => 'true']),
            $this->svc()->saveQuestion($q, ['kind' => 'short', 'body' => 'What makes bread rise?', 'correct' => [' Yeast ', 'yeast', '']]),
        ];
    }

    private function answers(array $qs, array $over = []): array
    {
        return array_replace([$qs[0]->id => 'o2', $qs[1]->id => ['c', 'a'], $qs[2]->id => 'true', $qs[3]->id => '  YEAST  '], $over);
    }

    // ── building ─────────────────────────────────────────────────────────

    public function test_a_quiz_has_settings_within_limits(): void
    {
        $this->assertSame([70, null, null, false, 'after_pass'], [$this->quiz->fresh()->pass_pct, $this->quiz->fresh()->max_attempts, $this->quiz->fresh()->time_limit_minutes, (bool) $this->quiz->fresh()->shuffle, $this->quiz->fresh()->show_answers]);
        $q = $this->svc()->saveSettings($this->quiz, ['pass_pct' => 100, 'max_attempts' => 50, 'time_limit_minutes' => 600, 'shuffle' => 1, 'show_answers' => 'after_each', 'instructions' => '  Take your time ']);
        $this->assertSame([100, 50, 600, true, 'after_each', 'Take your time'], [$q->pass_pct, $q->max_attempts, $q->time_limit_minutes, $q->shuffle, $q->show_answers, $q->instructions]);
        $q = $this->svc()->saveSettings($q, ['pass_pct' => 1, 'max_attempts' => 1, 'time_limit_minutes' => 1]);
        $this->assertSame([1, 1, 1, true, 'Take your time'], [$q->pass_pct, $q->max_attempts, $q->time_limit_minutes, $q->shuffle, $q->instructions]);   // what is left out stays
        $q = $this->svc()->saveSettings($q, ['max_attempts' => '', 'time_limit_minutes' => null, 'instructions' => '']);
        $this->assertSame([null, null, null], [$q->max_attempts, $q->time_limit_minutes, $q->instructions]);
        foreach ([['pass_pct' => 0], ['pass_pct' => 101]] as $bad) {
            $this->fails(fn () => $this->svc()->saveSettings($this->quiz, $bad), 'pass mark is between 1 and 100');
        }
        foreach ([['max_attempts' => 0], ['max_attempts' => 51], ['max_attempts' => 'x']] as $bad) {
            $this->fails(fn () => $this->svc()->saveSettings($this->quiz, $bad), 'number of attempts is between 1 and 50');
        }
        foreach ([['time_limit_minutes' => 0], ['time_limit_minutes' => 601]] as $bad) {
            $this->fails(fn () => $this->svc()->saveSettings($this->quiz, $bad), 'time limit is between 1 and 600');
        }
        $this->fails(fn () => $this->svc()->saveSettings($this->quiz, ['show_answers' => 'always']), 'when the answers are shown');
        $this->fails(fn () => $this->svc()->quizFor($this->lesson($this->o)), 'not a quiz');
        $this->assertSame($this->quiz->id, $this->svc()->quizFor($this->l)->id);   // one quiz per lesson
    }

    public function test_questions_are_checked_for_their_kind(): void
    {
        $q = $this->quiz;
        [$single, $multi, $tf, $short] = $this->questions();
        $this->assertSame([['id' => 'o1', 'text' => 'Cake'], ['id' => 'o2', 'text' => 'Bread'], ['id' => 'o3', 'text' => 'Rice']], $single->options);
        $this->assertSame([['o2'], ['a', 'c'], ['true'], ['Yeast', 'yeast']], [$single->correct, $multi->correct, $tf->correct, $short->correct]);
        $this->assertSame([10, 20, 30, 40], [$single->sort_order, $multi->sort_order, $tf->sort_order, $short->sort_order]);
        $this->assertNull($tf->options);
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'essay', 'body' => 'X']), 'kind of question');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'short', 'body' => '  ']), 'up to 2000 letters');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'short', 'body' => str_repeat('q', 2001)]), 'up to 2000 letters');
        $this->assertSame(2000, mb_strlen($this->svc()->saveQuestion($q, ['kind' => 'short', 'body' => str_repeat('q', 2000)])->body));
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'short', 'body' => 'X', 'points' => 0]), 'between 1 and 100 points');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'short', 'body' => 'X', 'points' => 101]), 'between 1 and 100 points');
        $this->assertSame(100, $this->svc()->saveQuestion($q, ['kind' => 'short', 'body' => 'X', 'points' => 100])->points);
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'single', 'body' => 'X', 'options' => ['Only', ' '], 'correct' => ['o1']]), 'between 2 and 10');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'single', 'body' => 'X', 'options' => range(1, 11), 'correct' => ['o1']]), 'between 2 and 10');
        $this->assertCount(10, $this->svc()->saveQuestion($q, ['kind' => 'single', 'body' => 'X', 'options' => range(1, 10), 'correct' => ['o10']])->options);
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'single', 'body' => 'X', 'options' => [['id' => 'a', 'text' => 'A'], ['id' => 'a', 'text' => 'B']], 'correct' => ['a']]), 'different choices');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'single', 'body' => 'X', 'options' => ['A', 'B'], 'correct' => ['o1', 'o2']]), 'exactly one');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'single', 'body' => 'X', 'options' => ['A', 'B'], 'correct' => []]), 'exactly one');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'single', 'body' => 'X', 'options' => ['A', 'B'], 'correct' => ['o9']]), 'exactly one');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'multiple', 'body' => 'X', 'options' => ['A', 'B'], 'correct' => []]), 'at least one');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'truefalse', 'body' => 'X', 'correct' => 'maybe']), 'true or false');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'truefalse', 'body' => 'X', 'correct' => ['true', 'false']]), 'true or false');
        $this->fails(fn () => $this->svc()->saveQuestion($q, ['kind' => 'short', 'body' => 'X', 'correct' => range(1, 21)]), 'at most 20');
        $this->assertCount(20, $this->svc()->saveQuestion($q, ['kind' => 'short', 'body' => 'X', 'correct' => range(1, 20)])->correct);
        $this->assertSame('Why?', $this->svc()->saveQuestion($q, ['explanation' => ' Why? '], $single)->explanation);
        $this->assertSame(['o2'], $this->svc()->saveQuestion($q, ['body' => 'Which flour, again?'], $single->fresh())->correct);   // what is left out stays
        $other = $this->svc()->quizFor($this->lesson($this->o, ['kind' => 'quiz']));
        $this->fails(fn () => $this->svc()->saveQuestion($other, ['body' => 'Steal'], $single), 'another quiz');
        $this->fails(fn () => $this->svc()->deleteQuestion($other, $single), 'another quiz');
    }

    public function test_questions_are_reordered_and_removed_until_someone_takes_the_quiz(): void
    {
        [$a, $b, $c] = $this->questions();
        $this->svc()->reorder($this->quiz, [$c->id, $a->id, $b->id]);
        $this->assertSame([$c->id, $a->id, $b->id], array_slice(array_column($this->svc()->staffView($this->quiz)['questions'], 'id'), 0, 3));
        $theirs = $this->svc()->saveQuestion($this->svc()->quizFor($this->lesson($this->o, ['kind' => 'quiz'])), ['kind' => 'short', 'body' => 'Theirs']);
        $this->fails(fn () => $this->svc()->reorder($this->quiz, [$theirs->id]), 'not part of this quiz');
        $this->svc()->deleteQuestion($this->quiz, $c);
        $this->svc()->start($this->student(), $this->l);
        $this->fails(fn () => $this->svc()->deleteQuestion($this->quiz, $a), 'change the question instead');
        $this->assertSame(1, $this->svc()->staffView($this->quiz)['attempts']);
    }

    // ── taking ───────────────────────────────────────────────────────────

    public function test_a_student_starts_carries_on_and_never_sees_the_answers_while_taking_it(): void
    {
        $u = $this->student();
        $this->fails(fn () => $this->svc()->start($u, $this->l), 'no questions yet');
        $qs = $this->questions();
        $this->fails(fn () => $this->svc()->start($this->person('Stranger'), $this->l), 'not open to you');
        $a = $this->svc()->start($u, $this->l);
        $this->assertSame([1, 'open', null], [$a->attempt_no, $a->status, $a->expires_at]);
        $this->assertSame($a->id, $this->svc()->start($u, $this->l)->id);   // carries on
        $t = $this->svc()->take($u, $a);
        $this->assertSame([$qs[0]->id, $qs[1]->id, $qs[2]->id, $qs[3]->id], array_column($t['questions'], 'id'));
        $this->assertStringNotContainsString('correct', json_encode($t));
        $this->assertStringNotContainsString('Yeast', json_encode($t));
        $this->assertSame(['o1', 'o2', 'o3'], array_column($t['questions'][0]['options'], 'id'));   // not shuffled: as written
        $this->fails(fn () => $this->svc()->take($this->person('Other'), $a), 'not your attempt');
        $saved = $this->svc()->save($u, $a, [$qs[0]->id => 'o9', (string) $qs[1]->id => ['a', 'z'], $qs[2]->id => 'maybe', $qs[3]->id => str_repeat('x', 2100), 999 => 'x']);
        $this->assertSame([$qs[1]->id => ['a'], $qs[3]->id => str_repeat('x', 2000)], $saved->answers);   // only real answers to its own questions
        $this->assertSame([$qs[0]->id => 'o1'], $this->svc()->save($u, $a, [$qs[0]->id => ['o1', 'o2']])->answers);
        $info = $this->svc()->info($u, $this->l);
        $this->assertSame([4, 5, 70, $a->id, 0, null], [$info['questions'], $info['points'], $info['pass_pct'], $info['open_attempt_id'], $info['attempts_used'], $info['best_pct']]);
        $this->assertSame(['ready' => false], $this->svc()->info($u, $this->lesson($this->o, ['kind' => 'quiz'])));
    }

    public function test_the_platform_marks_what_it_can_and_a_pass_finishes_the_lesson(): void
    {
        $qs = $this->questions();
        $qs[3] = $this->svc()->saveQuestion($this->quiz, ['correct' => ['yeast']], $qs[3]);
        $u = $this->student();
        $a = $this->svc()->submit($u, $this->svc()->start($u, $this->l), $this->answers($qs));
        $this->assertSame(['marked', 5.0, 5.0, 100.0, true], [$a->status, (float) $a->score, (float) $a->max_score, (float) $a->score_pct, $a->passed]);
        $this->assertSame('done', Progress::where('user_id', $u->id)->where('lesson_id', $this->l->id)->value('status'));
        $this->fails(fn () => $this->svc()->submit($u, $a, []), 'handed this in already');
        $this->fails(fn () => $this->svc()->start($u, $this->l), 'passed this quiz already');
        $this->assertTrue($this->svc()->info($u, $this->l)['passed']);
        $v = $this->student('Bob');
        $b = $this->svc()->submit($v, $this->svc()->start($v, $this->l), $this->answers($qs, [$qs[1]->id => ['a'], $qs[2]->id => 'false']));   // half of the multiple is wrong
        $this->assertSame([2.0, 40.0, false], [(float) $b->score, (float) $b->score_pct, $b->passed]);
        $this->assertNull(Progress::where('user_id', $v->id)->value('status'));
        $w = $this->student('Cy');
        $c = $this->svc()->submit($w, $this->svc()->start($w, $this->l), $this->answers($qs, [$qs[1]->id => ['a', 'b', 'c']]));   // one too many
        $this->assertSame(3.0, (float) $c->score);
        $z = $this->student('Dee');
        $d = $this->svc()->submit($z, $this->svc()->start($z, $this->l), []);   // nothing answered
        $this->assertSame([0.0, 0.0, false], [(float) $d->score, (float) $d->score_pct, $d->passed]);
        $this->svc()->saveSettings($this->quiz, ['pass_pct' => 60]);
        $y = $this->student('Eve');
        $e = $this->svc()->submit($y, $this->svc()->start($y, $this->l), $this->answers($qs, [$qs[1]->id => []]));   // 3 of 5: exactly the pass mark
        $this->assertSame([60.0, true], [(float) $e->score_pct, $e->passed]);
    }

    public function test_a_timed_attempt_ignores_answers_sent_after_the_time_and_is_handed_in_when_it_runs_out(): void
    {
        $qs = $this->questions();
        $this->svc()->saveSettings($this->quiz, ['time_limit_minutes' => 10]);
        $u = $this->student();
        $a = $this->svc()->start($u, $this->l);
        $this->assertSame('2026-10-12 12:10', $a->expires_at->timezone('Africa/Nairobi')->format('Y-m-d H:i'));
        $t = fn (string $at) => Carbon::parse($at, 'Africa/Nairobi');
        $this->svc()->save($u, $a, [$qs[0]->id => 'o2'], $t('2026-10-12 12:10:30'));   // a short grace
        $this->fails(fn () => $this->svc()->save($u, $a->fresh(), [$qs[0]->id => 'o1'], $t('2026-10-12 12:10:31')), 'closed');
        $late = $this->svc()->submit($u, $a->fresh(), $this->answers($qs), $t('2026-10-12 12:10:31'));
        $this->assertSame([$qs[0]->id => 'o2'], $late->answers);   // only what was saved in time
        $this->assertSame(1.0, (float) $late->score);
        $v = $this->student('Bob');
        $b = $this->svc()->start($v, $this->l, $t('2026-10-12 12:00'));
        $this->svc()->save($v, $b, [$qs[2]->id => 'true'], $t('2026-10-12 12:05'));
        $this->assertSame($b->id, $this->svc()->start($v, $this->l, $t('2026-10-12 12:09:59'))->id);
        $this->assertNull($this->svc()->info($v, $this->l)['open_attempt_id'] === $b->id ? null : 'x');
        $next = $this->svc()->start($v, $this->l, $t('2026-10-12 12:10:01'));   // the time ran out: the first is handed in, a second begins
        $this->assertSame([2, 'marked', 1.0], [$next->attempt_no, $b->fresh()->status, (float) $b->fresh()->score]);
        $w = $this->student('Cy');
        $c = $this->svc()->start($w, $this->l, $t('2026-10-12 12:00'));
        $this->assertSame(5.0, (float) $this->svc()->submit($w, $c, $this->answers($qs), $t('2026-10-12 12:10:30'))->score);   // on time, within the grace
    }

    public function test_attempts_are_limited(): void
    {
        $qs = $this->questions();
        $this->svc()->saveSettings($this->quiz, ['max_attempts' => 2]);
        $u = $this->student();
        $this->svc()->submit($u, $this->svc()->start($u, $this->l), []);
        $this->assertSame(1, $this->svc()->info($u, $this->l)['attempts_left']);
        $this->svc()->submit($u, $this->svc()->start($u, $this->l), []);
        $this->fails(fn () => $this->svc()->start($u, $this->l), 'used all 2 attempts');
        $info = $this->svc()->info($u, $this->l);
        $this->assertSame([2, 0, 0.0, false], [$info['attempts_used'], $info['attempts_left'], $info['best_pct'], $info['passed']]);
        $this->assertSame([1, 2], array_column($info['attempts'], 'no'));
        unset($qs);
    }

    // ── the teacher marks ────────────────────────────────────────────────

    public function test_a_written_answer_waits_for_the_teacher_who_marks_every_question(): void
    {
        $qs = $this->questions();
        $essay = $this->svc()->saveQuestion($this->quiz, ['kind' => 'short', 'body' => 'Describe kneading', 'points' => 4]);   // no accepted answers: the teacher marks it
        $teacher = $this->person('Teacher', false);
        $this->o->update(['instructor_user_id' => $teacher->id]);
        $u = $this->student();
        $a = $this->svc()->submit($u, $this->svc()->start($u, $this->l), $this->answers($qs, [$essay->id => 'Push and fold']));
        $this->assertSame(['submitted', null], [$a->status, $a->passed]);
        $this->assertSame(['course_quiz_to_mark'], $this->sentTo($teacher->id));
        $this->assertTrue($this->svc()->info($u, $this->l)['waiting_for_teacher']);
        $this->fails(fn () => $this->svc()->start($u, $this->l), 'waiting for your teacher');
        $r = $this->svc()->result($u, $a);
        $this->assertSame([true, null], [$r['attempt']['waiting_for_teacher'], $r['questions'][4]['earned']]);
        $this->fails(fn () => $this->svc()->mark($this->o, $a, [['question_id' => $qs[0]->id, 'points' => 1]]), 'has no points yet');
        $this->fails(fn () => $this->svc()->mark($this->o, $a, [['question_id' => $essay->id, 'points' => 5]]), 'between 0 and 4');
        $this->fails(fn () => $this->svc()->mark($this->o, $a, [['question_id' => $essay->id, 'points' => -1]]), 'between 0 and 4');
        $this->fails(fn () => $this->svc()->mark($this->o, $a, [['question_id' => $essay->id, 'points' => 'lots']]), 'between 0 and 4');
        $this->fails(fn () => $this->svc()->mark($this->o, $a, [['question_id' => 999, 'points' => 1]]), 'not part of this quiz');
        $this->fails(fn () => $this->svc()->mark($this->offering(), $a, []), 'another offering');
        $a = $this->svc()->mark($this->o, $a, [['question_id' => $essay->id, 'points' => 3.5, 'comment' => ' Good '], ['question_id' => $qs[2]->id, 'points' => 0]], 7);
        $this->assertSame(['marked', 7.5, 9.0, 83.33, true, 7], [$a->status, (float) $a->score, (float) $a->max_score, (float) $a->score_pct, $a->passed, (int) $a->marked_by]);   // the teacher took a point off too
        $this->assertSame('Good', $a->marks[$essay->id]['comment']);
        $this->assertSame(['course_quiz_marked'], $this->sentTo($u->id));
        $this->assertSame('done', Progress::where('user_id', $u->id)->value('status'));
        $open = $this->svc()->start($this->student('Bob'), $this->l);
        $this->fails(fn () => $this->svc()->mark($this->o, $open, []), 'not been handed in');
    }

    // ── afterwards ───────────────────────────────────────────────────────

    public function test_answers_are_shown_afterwards_only_as_the_quiz_allows(): void
    {
        $qs = $this->questions();
        $qs[0] = $this->svc()->saveQuestion($this->quiz, ['explanation' => 'Bread flour has more gluten'], $qs[0]);
        $u = $this->student();
        $fail = $this->svc()->submit($u, $this->svc()->start($u, $this->l), []);
        $r = $this->svc()->result($u, $fail);
        $this->assertFalse($r['answers_shown']);   // after a pass only
        $this->assertArrayNotHasKey('correct', $r['questions'][0]);
        $pass = $this->svc()->submit($u, $this->svc()->start($u, $this->l), $this->answers($qs));
        $r = $this->svc()->result($u, $pass);
        $this->assertSame([true, ['o2'], 'o2', 'Bread flour has more gluten'], [$r['answers_shown'], $r['questions'][0]['correct'], $r['questions'][0]['given'], $r['questions'][0]['explanation']]);
        $this->svc()->saveSettings($this->quiz, ['show_answers' => 'never']);
        $this->assertFalse($this->svc()->result($u, $pass)['answers_shown']);
        $this->svc()->saveSettings($this->quiz, ['show_answers' => 'after_each']);
        $this->assertTrue($this->svc()->result($u, $fail)['answers_shown']);
        $v = $this->student('Bob');
        $open = $this->svc()->start($v, $this->l);
        $this->assertSame([false, []], [$this->svc()->result($v, $open)['answers_shown'], $this->svc()->result($v, $open)['questions']]);
        $this->fails(fn () => $this->svc()->result($v, $pass), 'not your attempt');
    }

    public function test_shuffled_questions_keep_one_order_per_attempt(): void
    {
        foreach (range(1, 8) as $i) {
            $this->svc()->saveQuestion($this->quiz, ['kind' => 'single', 'body' => "Q{$i}", 'options' => ['A', 'B', 'C', 'D'], 'correct' => ['o1']]);
        }
        $this->svc()->saveSettings($this->quiz, ['shuffle' => true]);
        $u = $this->student();
        $a = $this->svc()->start($u, $this->l);
        $once = $this->svc()->take($u, $a);
        $this->assertSame($once, $this->svc()->take($u, $a));   // the same order every time it is opened
        $this->assertEqualsCanonicalizing(Question::where('quiz_id', $this->quiz->id)->pluck('id')->all(), array_column($once['questions'], 'id'));
        $orders = [];
        foreach (range(1, 6) as $i) {
            $x = Attempt::forceCreate(['quiz_id' => $this->quiz->id, 'offering_id' => $this->o->id, 'user_id' => $u->id, 'attempt_no' => $i + 1, 'status' => 'open', 'started_at' => now()]);
            $orders[] = implode(',', array_column($this->svc()->take($u, $x)['questions'], 'id'));
        }
        $this->assertGreaterThan(1, count(array_unique($orders)));   // attempts differ
    }

    // ── the screens (HTTP) ───────────────────────────────────────────────

    public function test_a_student_takes_a_quiz_through_my_learning_and_only_their_own_attempts(): void
    {
        $qs = $this->questions();
        $qs[3] = $this->svc()->saveQuestion($this->quiz, ['correct' => ['yeast']], $qs[3]);
        $u = $this->student();
        Sanctum::actingAs($u, ['*']);
        $this->postJson('/api/courses/my/quizzes/'.$this->lesson($this->o)->id.'/start')->assertNotFound();   // not a quiz lesson
        $t = $this->postJson("/api/courses/my/quizzes/{$this->l->id}/start")->assertOk()->json();
        $id = $t['attempt']['id'];
        $this->putJson("/api/courses/my/attempts/{$id}", ['answers' => [$qs[0]->id => 'o2']])->assertOk()->assertJsonPath('saved', true);
        $this->getJson("/api/courses/my/attempts/{$id}")->assertOk()->assertJsonPath('attempt.answers.'.$qs[0]->id, 'o2');
        $r = $this->postJson("/api/courses/my/attempts/{$id}/submit", ['answers' => $this->answers($qs)])->assertOk()->json();
        $this->assertSame([true, true], [$r['attempt']['passed'], $r['answers_shown']]);
        $v = $this->student('Bob');
        $theirs = $this->svc()->start($v, $this->l);
        $this->getJson("/api/courses/my/attempts/{$theirs->id}")->assertNotFound();
        $this->putJson("/api/courses/my/attempts/{$theirs->id}", ['answers' => []])->assertNotFound();
        $this->postJson("/api/courses/my/attempts/{$theirs->id}/submit")->assertNotFound();
    }

    public function test_the_teacher_builds_and_marks_only_the_quizzes_of_their_own_offerings(): void
    {
        $teacher = $this->staff('Teacher', ['courses.teach']);
        $this->o->update(['instructor_user_id' => $teacher->id]);
        $other = $this->offering();
        $theirs = $this->lesson($other, ['kind' => 'quiz']);
        Sanctum::actingAs($teacher, ['*']);
        $base = "/api/admin/courses/offerings/{$this->o->id}/quizzes/{$this->l->id}";
        $this->putJson($base, ['pass_pct' => 50])->assertOk()->assertJsonPath('quiz.pass_pct', 50);
        $qid = $this->postJson("{$base}/questions", ['kind' => 'short', 'body' => 'Describe it'])->assertOk()->json('questions.0.id');
        $this->putJson("{$base}/questions/{$qid}", ['body' => 'Describe it well'])->assertOk()->assertJsonPath('questions.0.body', 'Describe it well');
        $this->getJson("/api/admin/courses/offerings/{$other->id}/quizzes/{$theirs->id}")->assertForbidden();
        $this->getJson("/api/admin/courses/offerings/{$this->o->id}/quizzes/{$theirs->id}")->assertNotFound();   // another offering's lesson
        $u = $this->student();
        $a = $this->svc()->submit($u, $this->svc()->start($u, $this->l), [$qid => 'Like this']);
        $this->assertSame([['id' => $a->id, 'status' => 'submitted']], array_map(fn ($r) => ['id' => $r['id'], 'status' => $r['status']], $this->getJson("/api/admin/courses/offerings/{$this->o->id}/attempts")->assertOk()->json('attempts')));
        $this->getJson("/api/admin/courses/offerings/{$this->o->id}/attempts/{$a->id}")->assertOk()->assertJsonPath('questions.0.given', 'Like this');
        $this->postJson("/api/admin/courses/offerings/{$this->o->id}/attempts/{$a->id}/marks", ['marks' => [['question_id' => $qid, 'points' => 1]]])->assertOk()->assertJsonPath('message', 'Marked: passed.');
        $this->postJson("/api/admin/courses/offerings/{$other->id}/attempts/{$a->id}/marks", ['marks' => [['question_id' => $qid, 'points' => 0]]])->assertForbidden();
        $this->deleteJson("{$base}/questions/{$qid}")->assertStatus(422);
        $this->assertTrue(Attempt::find($a->id)->passed);
        Enrolment::query()->delete();
    }
}

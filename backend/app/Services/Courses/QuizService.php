<?php

namespace App\Services\Courses;

use App\Models\Courses\Attempt;
use App\Models\Courses\Lesson;
use App\Models\Courses\Offering;
use App\Models\Courses\Question;
use App\Models\Courses\Quiz;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Quizzes. A teacher builds the questions; a student takes the quiz (a timer if there is a limit, a limited number of attempts), the platform marks what it can, and the teacher marks short text answers that
 * have no list of accepted answers. A score at or above the pass mark passes the quiz and finishes its lesson for the student. Answers are never sent to a student while they are taking a quiz, and are shown
 * afterwards only as the quiz allows.
 */
class QuizService
{
    public function __construct(private CourseAccess $access, private CourseNotices $notices)
    {
    }

    public static function installed(): bool
    {
        return Schema::hasTable('course_quizzes') && Schema::hasTable('course_questions') && Schema::hasTable('course_attempts');
    }

    // ── building ──────────────────────────────────────────────────────────

    /** The quiz of a quiz lesson (made with defaults the first time). */
    public function quizFor(Lesson $l): Quiz
    {
        if ($l->kind !== 'quiz') {
            throw new BooksException('That lesson is not a quiz.');
        }

        return Quiz::firstOrCreate(['lesson_id' => $l->id], ['offering_id' => $l->offering_id]);
    }

    /** @param array{pass_pct?: mixed, max_attempts?: mixed, time_limit_minutes?: mixed, shuffle?: mixed, show_answers?: mixed, instructions?: mixed} $d */
    public function saveSettings(Quiz $q, array $d): Quiz
    {
        $pass = array_key_exists('pass_pct', $d) ? (int) $d['pass_pct'] : (int) $q->pass_pct;
        if ($pass < 1 || $pass > 100) {
            throw new BooksException('The pass mark is between 1 and 100 percent.');
        }
        $int = function (string $k, int $lo, int $hi, string $what) use ($d, $q) {
            $v = array_key_exists($k, $d) ? $d[$k] : $q->{$k};
            if ($v === null || $v === '') {
                return null;
            }
            if (! is_numeric($v) || (int) $v < $lo || (int) $v > $hi) {
                throw new BooksException(ucfirst($what)." is between {$lo} and {$hi}.");
            }

            return (int) $v;
        };
        $show = (string) ($d['show_answers'] ?? $q->show_answers ?? 'after_pass');
        if (! isset(Quiz::SHOW[$show])) {
            throw new BooksException('Choose when the answers are shown.');
        }
        $q->update(['pass_pct' => $pass, 'max_attempts' => $int('max_attempts', 1, 50, 'the number of attempts'), 'time_limit_minutes' => $int('time_limit_minutes', 1, 600, 'the time limit'), 'shuffle' => array_key_exists('shuffle', $d) ? (bool) $d['shuffle'] : (bool) $q->shuffle,
            'show_answers' => $show, 'instructions' => array_key_exists('instructions', $d) ? (trim((string) $d['instructions']) === '' ? null : mb_substr(trim((string) $d['instructions']), 0, 1000)) : $q->instructions]);

        return $q->fresh();
    }

    /** @param array{kind?: mixed, body?: mixed, options?: mixed, correct?: mixed, points?: mixed, explanation?: mixed} $d */
    public function saveQuestion(Quiz $quiz, array $d, ?Question $q = null): Question
    {
        if ($q && (int) $q->quiz_id !== (int) $quiz->id) {
            throw new BooksException('That question belongs to another quiz.');
        }
        $kind = (string) ($d['kind'] ?? $q?->kind ?? '');
        if (! isset(Question::KINDS[$kind])) {
            throw new BooksException('Choose the kind of question.');
        }
        $body = trim((string) ($d['body'] ?? $q?->body ?? ''));
        if ($body === '' || mb_strlen($body) > 2000) {
            throw new BooksException('Write the question (up to 2000 letters).');
        }
        $points = (int) ($d['points'] ?? $q?->points ?? 1);
        if ($points < 1 || $points > 100) {
            throw new BooksException('A question is worth between 1 and 100 points.');
        }
        $options = null;
        $correct = $d['correct'] ?? $q?->correct ?? [];
        $correct = is_array($correct) ? array_values($correct) : [$correct];
        if (in_array($kind, ['single', 'multiple'], true)) {
            $raw = $d['options'] ?? $q?->options ?? [];
            $options = [];
            foreach (array_values((array) $raw) as $i => $o) {
                $text = trim((string) (is_array($o) ? ($o['text'] ?? '') : $o));
                if ($text === '') {
                    continue;
                }
                $options[] = ['id' => (string) (is_array($o) && ! empty($o['id']) ? preg_replace('/[^A-Za-z0-9_-]/', '', (string) $o['id']) : 'o'.($i + 1)), 'text' => mb_substr($text, 0, 300)];
            }
            $ids = array_column($options, 'id');
            if (count($options) < 2 || count($options) > 10 || count(array_unique($ids)) !== count($ids)) {
                throw new BooksException('Give between 2 and 10 different choices.');
            }
            $correct = array_values(array_unique(array_map('strval', $correct)));
            if (array_diff($correct, $ids) || ($kind === 'single' && count($correct) !== 1) || ($kind === 'multiple' && count($correct) < 1)) {
                throw new BooksException($kind === 'single' ? 'Mark exactly one choice as right.' : 'Mark at least one choice as right.');
            }
        } elseif ($kind === 'truefalse') {
            $correct = array_map('strval', $correct);
            if (count($correct) !== 1 || ! in_array($correct[0], ['true', 'false'], true)) {
                throw new BooksException('Say whether the statement is true or false.');
            }
        } else {
            $correct = array_values(array_unique(array_filter(array_map(fn ($a) => mb_substr(trim((string) $a), 0, 200), $correct), fn ($a) => $a !== '')));
            if (count($correct) > 20) {
                throw new BooksException('Give at most 20 accepted answers.');
            }
        }
        $row = ['kind' => $kind, 'body' => $body, 'options' => $options, 'correct' => $correct, 'points' => $points, 'explanation' => array_key_exists('explanation', $d) ? (trim((string) $d['explanation']) === '' ? null : mb_substr(trim((string) $d['explanation']), 0, 1000)) : $q?->explanation];
        $q ??= new Question(['quiz_id' => $quiz->id, 'sort_order' => (int) Question::where('quiz_id', $quiz->id)->max('sort_order') + 10]);
        $q->fill($row)->save();

        return $q->fresh();
    }

    public function deleteQuestion(Quiz $quiz, Question $q): void
    {
        if ((int) $q->quiz_id !== (int) $quiz->id) {
            throw new BooksException('That question belongs to another quiz.');
        }
        if (Attempt::where('quiz_id', $quiz->id)->exists()) {
            throw new BooksException('Students have taken this quiz: change the question instead of removing it.');
        }
        $q->delete();
    }

    /** @param int[] $ids */
    public function reorder(Quiz $quiz, array $ids): void
    {
        $own = Question::where('quiz_id', $quiz->id)->pluck('id')->all();
        foreach ($ids as $id) {
            if (! in_array((int) $id, $own, true)) {
                throw new BooksException('One of the questions is not part of this quiz.');
            }
        }
        foreach (array_values($ids) as $i => $id) {
            Question::whereKey((int) $id)->update(['sort_order' => ($i + 1) * 10]);
        }
    }

    /** @return array<string, mixed> everything for the teacher, answers included */
    public function staffView(Quiz $quiz): array
    {
        return ['quiz' => $this->settings($quiz), 'questions' => $quiz->questions()->get()->map(fn (Question $q) => ['id' => $q->id, 'kind' => $q->kind, 'kind_label' => Question::KINDS[$q->kind] ?? $q->kind, 'body' => $q->body, 'options' => $q->options ?? [],
            'correct' => $q->correct ?? [], 'points' => $q->points, 'explanation' => $q->explanation])->values()->all(), 'attempts' => Attempt::where('quiz_id', $quiz->id)->count()];
    }

    /** @return array<string, mixed> */
    private function settings(Quiz $q): array
    {
        return ['id' => $q->id, 'lesson_id' => $q->lesson_id, 'pass_pct' => $q->pass_pct, 'max_attempts' => $q->max_attempts, 'time_limit_minutes' => $q->time_limit_minutes, 'shuffle' => $q->shuffle, 'show_answers' => $q->show_answers, 'instructions' => $q->instructions];
    }

    // ── taking ────────────────────────────────────────────────────────────

    /** What the student sees about a quiz lesson: the rules, their attempts, their best result. @return array<string, mixed> */
    public function info(User $u, Lesson $l): array
    {
        $quiz = Quiz::where('lesson_id', $l->id)->first();
        if (! $quiz) {
            return ['ready' => false];
        }
        $attempts = Attempt::where('quiz_id', $quiz->id)->where('user_id', $u->id)->orderBy('attempt_no')->get();
        $done = $attempts->whereIn('status', ['submitted', 'marked']);
        $best = $attempts->where('status', 'marked')->max(fn (Attempt $a) => (float) $a->score_pct);
        $open = $attempts->firstWhere('status', 'open');

        return ['ready' => true, 'questions' => Question::where('quiz_id', $quiz->id)->count(), 'points' => (int) Question::where('quiz_id', $quiz->id)->sum('points'), 'pass_pct' => $quiz->pass_pct, 'max_attempts' => $quiz->max_attempts, 'time_limit_minutes' => $quiz->time_limit_minutes,
            'instructions' => $quiz->instructions, 'attempts_used' => $done->count(), 'attempts_left' => $quiz->max_attempts ? max(0, $quiz->max_attempts - $done->count()) : null, 'best_pct' => $best !== null ? round((float) $best, 1) : null, 'passed' => $attempts->contains(fn (Attempt $a) => $a->passed === true),
            'waiting_for_teacher' => $attempts->contains('status', 'submitted'), 'open_attempt_id' => $open && (! $open->expires_at || $open->expires_at->gt(now())) ? $open->id : null,
            'attempts' => $attempts->where('status', '!=', 'open')->map(fn (Attempt $a) => ['id' => $a->id, 'no' => $a->attempt_no, 'status' => $a->status, 'score_pct' => $a->score_pct !== null ? (float) $a->score_pct : null, 'passed' => $a->passed, 'submitted_at' => $a->submitted_at?->toIso8601String()])->values()->all()];
    }

    /** Begin an attempt (or carry on with the one that is open). */
    public function start(User $u, Lesson $l, ?Carbon $now = null): Attempt
    {
        $now = ($now ?? now())->copy();
        $o = Offering::findOrFail($l->offering_id);
        app(Learning::class)->assertLessonOpen($u, $l);
        $quiz = $this->quizFor($l);
        if (! Question::where('quiz_id', $quiz->id)->exists()) {
            throw new BooksException('This quiz has no questions yet.');
        }
        $open = Attempt::where('quiz_id', $quiz->id)->where('user_id', $u->id)->where('status', 'open')->first();
        if ($open) {
            if (! $open->expires_at || $open->expires_at->gt($now)) {
                return $open;
            }
            $this->grade($open, $quiz, $open->answers ?? [], $now);   // the time ran out: what was saved is handed in
        }
        $mine = Attempt::where('quiz_id', $quiz->id)->where('user_id', $u->id)->get();
        if ($mine->contains(fn (Attempt $a) => $a->passed === true)) {
            throw new BooksException('You have passed this quiz already.');
        }
        if ($quiz->max_attempts && $mine->whereIn('status', ['submitted', 'marked'])->count() >= $quiz->max_attempts) {
            throw new BooksException('You have used all '.$quiz->max_attempts.' attempts.');
        }
        if ($mine->contains('status', 'submitted')) {
            throw new BooksException('Your last attempt is waiting for your teacher to mark it.');
        }

        return Attempt::create(['quiz_id' => $quiz->id, 'offering_id' => $o->id, 'user_id' => $u->id, 'attempt_no' => (int) $mine->max('attempt_no') + 1, 'status' => 'open', 'answers' => [], 'started_at' => $now,
            'expires_at' => $quiz->time_limit_minutes ? $now->copy()->addMinutes($quiz->time_limit_minutes) : null]);
    }

    /** The questions of an open attempt, without the answers, in the attempt's own order. @return array<string, mixed> */
    public function take(User $u, Attempt $a): array
    {
        $this->own($u, $a);
        $quiz = Quiz::findOrFail($a->quiz_id);
        $qs = Question::where('quiz_id', $quiz->id)->orderBy('sort_order')->orderBy('id')->get();
        if ($quiz->shuffle) {
            $qs = $qs->sortBy(fn (Question $q) => crc32($a->id.'-'.$q->id))->values();
        }

        return ['attempt' => ['id' => $a->id, 'status' => $a->status, 'attempt_no' => $a->attempt_no, 'expires_at' => $a->expires_at?->toIso8601String(), 'answers' => $a->answers ?? []],
            'quiz' => ['pass_pct' => $quiz->pass_pct, 'instructions' => $quiz->instructions],
            'questions' => $qs->map(function (Question $q) use ($quiz, $a) {
                $opts = $q->options ?? [];
                if ($quiz->shuffle && $opts) {
                    usort($opts, fn ($x, $y) => crc32($a->id.'-'.$q->id.'-'.$x['id']) <=> crc32($a->id.'-'.$q->id.'-'.$y['id']));
                }

                return ['id' => $q->id, 'kind' => $q->kind, 'body' => $q->body, 'options' => $opts, 'points' => $q->points];
            })->values()->all()];
    }

    private function own(User $u, Attempt $a): void
    {
        if ((int) $a->user_id !== (int) $u->id) {
            throw new BooksException('This is not your attempt.');
        }
    }

    /** Only answers to this quiz's questions, each shaped as its question needs. @return array<int, mixed> */
    private function clean(Quiz $quiz, array $answers): array
    {
        $out = [];
        foreach (Question::where('quiz_id', $quiz->id)->get() as $q) {
            if (! array_key_exists($q->id, $answers) && ! array_key_exists((string) $q->id, $answers)) {
                continue;
            }
            $v = $answers[$q->id] ?? $answers[(string) $q->id];
            $ids = array_column($q->options ?? [], 'id');
            if ($q->kind === 'single') {
                $v = (string) (is_array($v) ? ($v[0] ?? '') : $v);
                if (in_array($v, $ids, true)) {
                    $out[$q->id] = $v;
                }
            } elseif ($q->kind === 'multiple') {
                $out[$q->id] = array_values(array_intersect($ids, array_map('strval', (array) $v)));
            } elseif ($q->kind === 'truefalse') {
                if (in_array((string) $v, ['true', 'false'], true)) {
                    $out[$q->id] = (string) $v;
                }
            } else {
                $out[$q->id] = mb_substr(trim((string) $v), 0, 2000);
            }
        }

        return $out;
    }

    /** Keep the answers so far (a student who loses their connection carries on). Not accepted once the time has run out. */
    public function save(User $u, Attempt $a, array $answers, ?Carbon $now = null): Attempt
    {
        $this->own($u, $a);
        $now = ($now ?? now())->copy();
        if ($a->status !== 'open' || ($a->expires_at && $now->gt($a->expires_at->copy()->addSeconds(30)))) {
            throw new BooksException('This attempt is closed.');
        }
        $a->update(['answers' => $this->clean(Quiz::findOrFail($a->quiz_id), $answers)]);

        return $a->fresh();
    }

    /** Hand it in. Answers sent after the time (and a short grace) are ignored: what was saved before is marked. */
    public function submit(User $u, Attempt $a, ?array $answers = null, ?Carbon $now = null): Attempt
    {
        $this->own($u, $a);
        $now = ($now ?? now())->copy();
        if ($a->status !== 'open') {
            throw new BooksException('You have handed this in already.');
        }
        $quiz = Quiz::findOrFail($a->quiz_id);
        $onTime = ! $a->expires_at || $now->lte($a->expires_at->copy()->addSeconds(30));

        return $this->grade($a, $quiz, $onTime && $answers !== null ? $this->clean($quiz, $answers) : ($a->answers ?? []), $now);
    }

    private function norm(string $s): string
    {
        return preg_replace('/\s+/', ' ', mb_strtolower(trim($s))) ?? '';
    }

    /** Mark what can be marked by the platform; leave the rest for the teacher. */
    private function grade(Attempt $a, Quiz $quiz, array $answers, Carbon $now): Attempt
    {
        $marks = [];
        $pending = false;
        $max = 0;
        foreach (Question::where('quiz_id', $quiz->id)->get() as $q) {
            $max += $q->points;
            $given = $answers[$q->id] ?? null;
            $correct = $q->correct ?? [];
            if ($q->kind === 'short' && count($correct) === 0) {
                $marks[$q->id] = ['points' => null, 'auto' => false];
                $pending = true;

                continue;
            }
            $right = match ($q->kind) {
                'single', 'truefalse' => $given !== null && (string) $given === (string) ($correct[0] ?? ''),
                'multiple' => is_array($given) && $given !== [] && array_values(array_diff($correct, $given)) === [] && array_values(array_diff($given, $correct)) === [],
                default => is_string($given) && $given !== '' && in_array($this->norm($given), array_map(fn ($c) => $this->norm((string) $c), $correct), true),
            };
            $marks[$q->id] = ['points' => $right ? $q->points : 0, 'auto' => true];
        }
        $a->fill(['answers' => $answers, 'marks' => $marks, 'max_score' => $max, 'submitted_at' => $now, 'status' => 'submitted'])->save();
        if ($pending) {
            $this->notices->quizToMark($a, Offering::find($a->offering_id));

            return $a->fresh();
        }

        return $this->finalize($a, $quiz, null);
    }

    private function finalize(Attempt $a, Quiz $quiz, ?int $by, bool $manual = false): Attempt
    {
        $score = round((float) collect($a->marks ?? [])->sum(fn ($m) => (float) ($m['points'] ?? 0)), 2);
        $pct = (float) $a->max_score > 0 ? round($score / (float) $a->max_score * 100, 2) : 0.0;
        $passed = $pct >= $quiz->pass_pct;
        $a->update(['status' => 'marked', 'score' => $score, 'score_pct' => $pct, 'passed' => $passed, 'marked_by' => $by, 'marked_at' => now()]);
        $a = $a->fresh();
        if ($passed && ($lesson = Lesson::find($quiz->lesson_id)) && ($u = User::find($a->user_id))) {
            app(Learning::class)->finishLesson($u, $lesson);
        }
        if ($manual && ($o = Offering::find($a->offering_id))) {   // a teacher marked it: the student is told (an attempt the platform marked is shown on the spot)
            $this->notices->quizMarked($a, $o);
        }

        return $a;
    }

    // ── marking ───────────────────────────────────────────────────────────

    /**
     * The teacher marks an attempt: points for each question (a short answer without a list of accepted answers needs one). Any question may be adjusted.
     *
     * @param array<int, array{question_id: int, points: mixed, comment?: ?string}> $given
     */
    public function mark(Offering $o, Attempt $a, array $given, ?int $by = null): Attempt
    {
        if ((int) $a->offering_id !== (int) $o->id) {
            throw new BooksException('That attempt belongs to another offering.');
        }
        if (! in_array($a->status, ['submitted', 'marked'], true)) {
            throw new BooksException('This attempt has not been handed in.');
        }
        $quiz = Quiz::findOrFail($a->quiz_id);
        $qs = Question::where('quiz_id', $quiz->id)->get()->keyBy('id');
        $marks = $a->marks ?? [];
        foreach ($given as $g) {
            $q = $qs[(int) ($g['question_id'] ?? 0)] ?? throw new BooksException('One of the questions is not part of this quiz.');
            if (! is_numeric($g['points'] ?? null) || (float) $g['points'] < 0 || (float) $g['points'] > $q->points) {
                throw new BooksException("Points for a question are between 0 and {$q->points}.");
            }
            $marks[$q->id] = ['points' => round((float) $g['points'], 2), 'auto' => false, 'comment' => filled($g['comment'] ?? null) ? mb_substr(trim((string) $g['comment']), 0, 500) : null];
        }
        foreach ($qs as $id => $q) {
            if (! isset($marks[$id]) || ($marks[$id]['points'] ?? null) === null) {
                throw new BooksException('Mark every question before saving: "'.mb_substr($q->body, 0, 50).'" has no points yet.');
            }
        }
        $a->update(['marks' => $marks]);

        return $this->finalize($a->fresh(), $quiz, $by, true);
    }

    // ── what the screens show ─────────────────────────────────────────────

    /** The result of an attempt for the student who took it, with answers only as the quiz allows. @return array<string, mixed> */
    public function result(User $u, Attempt $a): array
    {
        $this->own($u, $a);
        $quiz = Quiz::findOrFail($a->quiz_id);
        $show = $a->status !== 'open' && ($quiz->show_answers === 'after_each' || ($quiz->show_answers === 'after_pass' && $a->passed === true));
        $out = ['attempt' => ['id' => $a->id, 'no' => $a->attempt_no, 'status' => $a->status, 'score' => (float) $a->score, 'max_score' => (float) $a->max_score, 'score_pct' => $a->score_pct !== null ? (float) $a->score_pct : null, 'passed' => $a->passed, 'pass_pct' => $quiz->pass_pct,
            'waiting_for_teacher' => $a->status === 'submitted'], 'answers_shown' => $show, 'questions' => []];
        if ($a->status === 'open') {
            return $out;
        }
        foreach (Question::where('quiz_id', $quiz->id)->orderBy('sort_order')->orderBy('id')->get() as $q) {
            $m = ($a->marks ?? [])[$q->id] ?? [];
            $row = ['id' => $q->id, 'body' => $q->body, 'kind' => $q->kind, 'points' => $q->points, 'earned' => $m['points'] ?? null, 'comment' => $m['comment'] ?? null];
            if ($show) {
                $row += ['options' => $q->options ?? [], 'given' => ($a->answers ?? [])[$q->id] ?? null, 'correct' => $q->kind === 'short' && ! ($q->correct ?? []) ? null : ($q->correct ?? []), 'explanation' => $q->explanation];
            }
            $out['questions'][] = $row;
        }

        return $out;
    }

    /** @return array<int, array<string, mixed>> the attempts of an offering for staff (waiting ones first) */
    public function attempts(Offering $o, ?string $status = null): array
    {
        $rows = Attempt::where('offering_id', $o->id)->where('status', '!=', 'open')->when($status, fn ($q) => $q->where('status', $status))->orderByRaw("CASE status WHEN 'submitted' THEN 0 ELSE 1 END")->orderByDesc('id')->limit(300)->get();
        $names = User::whereIn('id', $rows->pluck('user_id'))->pluck('name', 'id');
        $titles = Lesson::whereIn('id', Quiz::whereIn('id', $rows->pluck('quiz_id'))->pluck('lesson_id'))->pluck('title', 'id');
        $lessonOf = Quiz::whereIn('id', $rows->pluck('quiz_id'))->pluck('lesson_id', 'id');

        return $rows->map(fn (Attempt $a) => ['id' => $a->id, 'student' => $names[$a->user_id] ?? null, 'quiz' => $titles[$lessonOf[$a->quiz_id] ?? 0] ?? null, 'attempt_no' => $a->attempt_no, 'status' => $a->status, 'score_pct' => $a->score_pct !== null ? (float) $a->score_pct : null,
            'passed' => $a->passed, 'submitted_at' => $a->submitted_at?->toIso8601String()])->values()->all();
    }

    /** One attempt for the teacher to mark or review: every question, the student's answer, the right answer and the points so far. @return array<string, mixed> */
    public function review(Attempt $a): array
    {
        $quiz = Quiz::findOrFail($a->quiz_id);
        $marks = $a->marks ?? [];

        return ['attempt' => ['id' => $a->id, 'student' => User::whereKey($a->user_id)->value('name'), 'status' => $a->status, 'attempt_no' => $a->attempt_no, 'score_pct' => $a->score_pct !== null ? (float) $a->score_pct : null, 'passed' => $a->passed, 'pass_pct' => $quiz->pass_pct],
            'questions' => Question::where('quiz_id', $quiz->id)->orderBy('sort_order')->orderBy('id')->get()->map(fn (Question $q) => ['id' => $q->id, 'kind' => $q->kind, 'body' => $q->body, 'options' => $q->options ?? [], 'correct' => $q->correct ?? [], 'points' => $q->points,
                'given' => ($a->answers ?? [])[$q->id] ?? null, 'earned' => $marks[$q->id]['points'] ?? null, 'auto' => $marks[$q->id]['auto'] ?? false, 'comment' => $marks[$q->id]['comment'] ?? null])->values()->all()];
    }
}

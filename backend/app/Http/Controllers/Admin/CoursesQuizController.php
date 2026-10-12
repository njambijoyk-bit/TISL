<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Courses\Attempt;
use App\Models\Courses\Lesson;
use App\Models\Courses\Offering;
use App\Models\Courses\Question;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\QuizService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Courses → quizzes: building them and marking what students hand in. A manager does any offering, a teacher their own. */
class CoursesQuizController extends Controller
{
    public function __construct(private QuizService $quizzes, private CourseAccess $access)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(QuizService::installed(), 422, 'Run database script 158_courses_quizzes.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function offering(Request $request, int $id): Offering
    {
        $o = Offering::findOrFail($id);
        abort_unless($this->access->staffMay($request->user(), $o), 403, 'You can only work on the quizzes of the offerings you teach.');

        return $o;
    }

    private function quizOf(Offering $o, int $lesson)
    {
        return $this->quizzes->quizFor(Lesson::where('offering_id', $o->id)->findOrFail($lesson));
    }

    public function show(Request $request, int $id, int $lesson): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(fn () => response()->json($this->quizzes->staffView($this->quizOf($o, $lesson))));
    }

    public function settings(Request $request, int $id, int $lesson): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['pass_pct' => 'sometimes|integer', 'max_attempts' => 'sometimes|nullable|integer', 'time_limit_minutes' => 'sometimes|nullable|integer', 'shuffle' => 'sometimes|boolean', 'show_answers' => 'sometimes|string|max:10', 'instructions' => 'sometimes|nullable|string|max:1000']);

        return $this->guard(function () use ($o, $lesson, $d) { $this->quizzes->saveSettings($this->quizOf($o, $lesson), $d); return response()->json(['message' => 'Quiz settings saved.'] + $this->quizzes->staffView($this->quizOf($o, $lesson))); });
    }

    public function saveQuestion(Request $request, int $id, int $lesson, ?int $question = null): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['kind' => 'sometimes|string|max:10', 'body' => 'sometimes|string|max:2000', 'options' => 'sometimes|nullable|array|max:10', 'options.*.id' => 'nullable|string|max:20', 'options.*.text' => 'nullable|string|max:300',
            'correct' => 'sometimes|nullable|array|max:20', 'correct.*' => 'nullable|string|max:200', 'points' => 'sometimes|integer', 'explanation' => 'sometimes|nullable|string|max:1000']);

        return $this->guard(function () use ($o, $lesson, $question, $d) {
            $quiz = $this->quizOf($o, $lesson);
            $this->quizzes->saveQuestion($quiz, $d, $question ? Question::where('quiz_id', $quiz->id)->findOrFail($question) : null);

            return response()->json(['message' => 'Question saved.'] + $this->quizzes->staffView($quiz));
        });
    }

    public function deleteQuestion(Request $request, int $id, int $lesson, int $question): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(function () use ($o, $lesson, $question) {
            $quiz = $this->quizOf($o, $lesson);
            $this->quizzes->deleteQuestion($quiz, Question::where('quiz_id', $quiz->id)->findOrFail($question));

            return response()->json(['message' => 'Question removed.'] + $this->quizzes->staffView($quiz));
        });
    }

    public function reorder(Request $request, int $id, int $lesson): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['ids' => 'required|array|max:500', 'ids.*' => 'integer']);

        return $this->guard(function () use ($o, $lesson, $d) { $quiz = $this->quizOf($o, $lesson); $this->quizzes->reorder($quiz, $d['ids']); return response()->json($this->quizzes->staffView($quiz)); });
    }

    public function attempts(Request $request, int $id): JsonResponse
    {
        $o = $this->offering($request, $id);
        if (! QuizService::installed()) {
            return response()->json(['ready' => false, 'attempts' => []]);
        }

        return response()->json(['ready' => true, 'attempts' => $this->quizzes->attempts($o, $request->query('status') ?: null)]);
    }

    public function review(Request $request, int $id, int $attempt): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(fn () => response()->json($this->quizzes->review(Attempt::where('offering_id', $o->id)->findOrFail($attempt))));
    }

    public function mark(Request $request, int $id, int $attempt): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['marks' => 'present|array|max:500', 'marks.*.question_id' => 'required|integer', 'marks.*.points' => 'required|numeric', 'marks.*.comment' => 'nullable|string|max:500']);

        return $this->guard(function () use ($request, $o, $attempt, $d) {
            $a = $this->quizzes->mark($o, Attempt::where('offering_id', $o->id)->findOrFail($attempt), $d['marks'], $request->user()?->id);

            return response()->json(['message' => $a->passed ? 'Marked: passed.' : 'Marked: not passed.'] + $this->quizzes->review($a));
        });
    }
}

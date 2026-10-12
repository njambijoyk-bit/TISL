<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Courses\Attempt;
use App\Models\Courses\Lesson;
use App\Services\Books\BooksException;
use App\Services\Courses\QuizService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A student taking a quiz. Everything is about the student's own attempts; answers are never sent while the quiz is open. */
class CoursesQuizController extends Controller
{
    public function __construct(private QuizService $quizzes)
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

    public function start(Request $request, int $lesson): JsonResponse
    {
        return $this->guard(function () use ($request, $lesson) {
            $a = $this->quizzes->start($request->user(), Lesson::where('kind', 'quiz')->findOrFail($lesson));

            return response()->json($this->quizzes->take($request->user(), $a));
        });
    }

    public function show(Request $request, int $attempt): JsonResponse
    {
        return $this->guard(function () use ($request, $attempt) {
            $a = Attempt::where('user_id', $request->user()->id)->findOrFail($attempt);

            return response()->json($a->status === 'open' ? $this->quizzes->take($request->user(), $a) : $this->quizzes->result($request->user(), $a));
        });
    }

    public function save(Request $request, int $attempt): JsonResponse
    {
        $d = $request->validate(['answers' => 'present|array']);

        return $this->guard(function () use ($request, $attempt, $d) {
            $this->quizzes->save($request->user(), Attempt::where('user_id', $request->user()->id)->findOrFail($attempt), $d['answers']);

            return response()->json(['saved' => true]);
        });
    }

    public function submit(Request $request, int $attempt): JsonResponse
    {
        $d = $request->validate(['answers' => 'nullable|array']);

        return $this->guard(function () use ($request, $attempt, $d) {
            $a = $this->quizzes->submit($request->user(), Attempt::where('user_id', $request->user()->id)->findOrFail($attempt), $d['answers'] ?? null);

            return response()->json($this->quizzes->result($request->user(), $a));
        });
    }
}

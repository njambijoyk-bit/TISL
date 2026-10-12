<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Courses\Lesson;
use App\Models\Courses\LiveSession;
use App\Models\Courses\Offering;
use App\Services\Books\BooksException;
use App\Services\Courses\Learning;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** My learning: the signed-in person's library, one offering's player, progress, and calendar files. Everything is about the person asking and checked against their access. */
class CoursesLearnController extends Controller
{
    public function __construct(private Learning $learning)
    {
    }

    private function guard(callable $fn)
    {
        try {
            abort_unless(Learning::installed(), 422, 'Run database script 155_courses_learning.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function library(Request $request): JsonResponse
    {
        return response()->json($this->learning->library($request->user()));
    }

    public function player(Request $request, string $slug): JsonResponse
    {
        return $this->guard(function () use ($request, $slug) {
            $o = Offering::where('slug', $slug)->whereIn('status', ['published', 'archived', 'draft'])->firstOrFail();

            return response()->json($this->learning->player($request->user(), $o));
        });
    }

    public function progress(Request $request, int $lesson): JsonResponse
    {
        $d = $request->validate(['status' => 'required|string|in:started,done', 'position_seconds' => 'nullable|integer|min:0|max:864000']);

        return $this->guard(fn () => response()->json($this->learning->mark($request->user(), Lesson::findOrFail($lesson), $d['status'], $d['position_seconds'] ?? null)));
    }

    public function ics(Request $request, int $live)
    {
        return $this->guard(function () use ($request, $live) {
            $l = LiveSession::findOrFail($live);

            return response($this->learning->ics($request->user(), $l), 200, ['Content-Type' => 'text/calendar; charset=utf-8', 'Content-Disposition' => 'attachment; filename="live-class.ics"', 'X-Content-Type-Options' => 'nosniff']);
        });
    }
}

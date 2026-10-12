<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Courses\ClassSession;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAttendance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A student checking themselves in to a class or asking to be excused. Everything is checked against their own access and the roll. */
class CoursesAttendanceController extends Controller
{
    public function __construct(private CourseAttendance $attendance)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(CourseAttendance::installed(), 422, 'Attendance is not set up yet.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function checkin(Request $request, int $session): JsonResponse
    {
        $d = $request->validate(['code' => 'required|string|max:12']);

        return $this->guard(function () use ($request, $session, $d) {
            $e = $this->attendance->checkIn($request->user(), ClassSession::findOrFail($session), $d['code']);

            return response()->json(['message' => $e->status === 'late' ? 'You are checked in (late).' : 'You are checked in.', 'status' => $e->status]);
        });
    }

    public function excuse(Request $request, int $session): JsonResponse
    {
        $d = $request->validate(['reason' => 'required|string|max:300']);

        return $this->guard(function () use ($request, $session, $d) {
            $this->attendance->askExcuse($request->user(), ClassSession::findOrFail($session), $d['reason']);

            return response()->json(['message' => 'Your teacher will look at your request.']);
        });
    }
}

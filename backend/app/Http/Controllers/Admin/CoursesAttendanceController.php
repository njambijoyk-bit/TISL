<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Courses\ClassSession;
use App\Models\Courses\Offering;
use App\Models\Courses\RegisterEntry;
use App\Services\Books\BooksException;
use App\Services\Courses\CourseAccess;
use App\Services\Courses\CourseAttendance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Courses → classes and the register. A manager does any offering, a teacher their own. */
class CoursesAttendanceController extends Controller
{
    public function __construct(private CourseAttendance $attendance, private CourseAccess $access)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            abort_unless(CourseAttendance::installed(), 422, 'Run database script 157_courses_attendance.sql first.');

            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function offering(Request $request, int $id): Offering
    {
        $o = Offering::findOrFail($id);
        abort_unless($this->access->staffMay($request->user(), $o), 403, 'You can only keep the register of the offerings you teach.');

        return $o;
    }

    public function overview(Request $request, int $id): JsonResponse
    {
        $o = $this->offering($request, $id);
        if (! CourseAttendance::installed()) {
            return response()->json(['ready' => false, 'sessions' => [], 'report' => [], 'min_attendance_pct' => $o->min_attendance_pct]);
        }
        $asked = RegisterEntry::where('offering_id', $o->id)->where('status', 'asked')->get();
        $names = \App\Models\User::whereIn('id', $asked->pluck('user_id'))->pluck('name', 'id');
        $titles = ClassSession::where('offering_id', $o->id)->pluck('title', 'id');

        return response()->json(['ready' => true, 'min_attendance_pct' => $o->min_attendance_pct, 'sessions' => $this->attendance->sessions($o), 'report' => $this->attendance->report($o),
            'excuses' => $asked->map(fn (RegisterEntry $e) => ['entry_id' => $e->id, 'user_id' => $e->user_id, 'name' => $names[$e->user_id] ?? null, 'session' => $titles[$e->session_id] ?? null, 'reason' => $e->note])->values()]);
    }

    public function saveSession(Request $request, int $id, ?int $session = null): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['title' => 'sometimes|string|max:160', 'starts_at' => 'sometimes|nullable|string|max:40', 'ends_at' => 'sometimes|nullable|string|max:40', 'mode' => 'sometimes|string|max:10', 'location_id' => 'sometimes|nullable|integer',
            'makeup_for_id' => 'sometimes|nullable|integer', 'self_checkin' => 'sometimes|boolean', 'notes' => 'sometimes|nullable|string|max:300']);

        return $this->guard(function () use ($request, $o, $d, $session) {
            $this->attendance->saveSession($o, $d, $session ? ClassSession::where('offering_id', $o->id)->findOrFail($session) : null, $request->user()?->id);

            return response()->json(['message' => 'Class saved.', 'sessions' => $this->attendance->sessions($o)]);
        });
    }

    public function cancelSession(Request $request, int $id, int $session): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(function () use ($o, $session) { $this->attendance->cancelSession($o, ClassSession::where('offering_id', $o->id)->findOrFail($session)); return response()->json(['message' => 'Class cancelled.', 'sessions' => $this->attendance->sessions($o)]); });
    }

    public function deleteSession(Request $request, int $id, int $session): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(function () use ($o, $session) { $this->attendance->deleteSession($o, ClassSession::where('offering_id', $o->id)->findOrFail($session)); return response()->json(['message' => 'Class removed.', 'sessions' => $this->attendance->sessions($o)]); });
    }

    public function roll(Request $request, int $id, int $session): JsonResponse
    {
        $o = $this->offering($request, $id);

        return $this->guard(fn () => response()->json($this->attendance->rollCall(ClassSession::where('offering_id', $o->id)->findOrFail($session))));
    }

    public function mark(Request $request, int $id, int $session): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['marks' => 'required|array|min:1|max:500', 'marks.*.user_id' => 'required|integer', 'marks.*.status' => 'nullable|string|max:8', 'marks.*.note' => 'nullable|string|max:300']);

        return $this->guard(function () use ($request, $o, $session, $d) {
            $s = ClassSession::where('offering_id', $o->id)->findOrFail($session);
            $n = $this->attendance->mark($o, $s, $d['marks'], $request->user()?->id);

            return response()->json(['message' => "{$n} mark(s) saved.", 'roll' => $this->attendance->rollCall($s->fresh()), 'sessions' => $this->attendance->sessions($o)]);
        });
    }

    public function decideExcuse(Request $request, int $id, int $entry): JsonResponse
    {
        $o = $this->offering($request, $id);
        $d = $request->validate(['approve' => 'required|boolean', 'note' => 'nullable|string|max:300']);

        return $this->guard(function () use ($request, $o, $entry, $d) {
            $this->attendance->decideExcuse($o, RegisterEntry::where('offering_id', $o->id)->findOrFail($entry), (bool) $d['approve'], $request->user()?->id, $d['note'] ?? null);

            return response()->json(['message' => $d['approve'] ? 'Excused.' : 'Marked absent.']);
        });
    }
}

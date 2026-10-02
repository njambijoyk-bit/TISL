<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceDay;
use App\Models\AttendanceDispute;
use App\Models\AttendanceMarker;
use App\Models\AttendanceSetting;
use App\Models\User;
use App\Services\Attendance\AttendanceService;
use App\Services\Books\BooksException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Attendance: sign in and out, the staff calendar, marking and verifying days, disputes, and who marks whom. See AttendanceService for the rules. */
class AttendanceController extends Controller
{
    public function __construct(private AttendanceService $svc) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function index(Request $request): JsonResponse
    {
        $u = $request->user();
        $ym = preg_match('/^\d{4}-\d{2}$/', (string) $request->query('month')) ? $request->query('month') : now()->format('Y-m');
        $me = AttendanceService::ready() ? AttendanceDay::where('user_id', $u->id)->where('work_date', today()->toDateString())->first() : null;
        $s = AttendanceSetting::current();

        return response()->json(['table_ready' => AttendanceService::ready(), 'is_super' => AttendanceService::isSuper($u), 'can_configure' => in_array($u->role, ['admin', 'super_admin'], true), 'kinds' => AttendanceDispute::KINDS,
            'me' => ['user_id' => $u->id, 'in' => $me?->sign_in_at?->format('H:i'), 'out' => $me?->sign_out_at?->format('H:i'), 'status' => $me?->status],
            'settings' => ['work_start' => substr($s->work_start, 0, 5), 'work_end' => substr($s->work_end, 0, 5), 'grace_minutes' => (int) $s->grace_minutes, 'workdays' => $s->days()],
            'calendar' => $this->svc->calendar($u, $ym), 'disputes' => $this->svc->disputes($u, $ym)]);
    }

    public function day(Request $request): JsonResponse
    {
        $d = $request->validate(['user_id' => 'required|integer|exists:users,id', 'date' => 'required|date']);

        return response()->json($this->svc->day($request->user(), (int) $d['user_id'], substr($d['date'], 0, 10)));
    }

    public function signIn(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $d = $this->svc->signIn($request->user());

            return response()->json(['message' => 'Signed in at ' . $d->sign_in_at->format('H:i') . ($d->status === 'late' ? ' (late).' : '.')]);
        });
    }

    public function signOut(Request $request): JsonResponse
    {
        return $this->guard(function () use ($request) {
            $d = $this->svc->signOut($request->user());

            return response()->json(['message' => 'Signed out at ' . $d->sign_out_at->format('H:i') . '.']);
        });
    }

    public function mark(Request $request): JsonResponse
    {
        $d = $request->validate(['user_id' => 'required|integer|exists:users,id', 'date' => 'required|date', 'status' => 'required|in:' . implode(',', AttendanceDay::STATUSES),
            'sign_in' => 'nullable|date_format:H:i', 'sign_out' => 'nullable|date_format:H:i', 'note' => 'nullable|string|max:255']);

        return $this->guard(function () use ($request, $d) {
            $this->svc->mark($request->user(), (int) $d['user_id'], substr($d['date'], 0, 10), array_intersect_key($request->all(), array_flip(['status', 'sign_in', 'sign_out', 'note'])));

            return response()->json(['message' => 'Marked — it counts once it is verified.']);
        });
    }

    public function acceptInferred(Request $request): JsonResponse
    {
        $d = $request->validate(['user_id' => 'required|integer|exists:users,id', 'date' => 'required|date']);

        return $this->guard(function () use ($request, $d) {
            $this->svc->acceptInferred($request->user(), (int) $d['user_id'], substr($d['date'], 0, 10));

            return response()->json(['message' => 'Marked from their activity — verify it when you have checked.']);
        });
    }

    public function verify(Request $request): JsonResponse
    {
        $d = $request->validate(['user_id' => 'required|integer|exists:users,id', 'date' => 'required|date', 'note' => 'nullable|string|max:255']);

        return $this->guard(function () use ($request, $d) {
            $this->svc->verify($request->user(), (int) $d['user_id'], substr($d['date'], 0, 10), $d['note'] ?? null);

            return response()->json(['message' => 'Verified.']);
        });
    }

    public function verifyMonth(Request $request): JsonResponse
    {
        $d = $request->validate(['user_id' => 'required|integer|exists:users,id', 'month' => ['required', 'regex:/^\d{4}-\d{2}$/']]);

        return $this->guard(function () use ($request, $d) {
            $r = $this->svc->verifyMonth($request->user(), (int) $d['user_id'], $d['month']);

            return response()->json($r + ['message' => "Verified {$r['verified']} day(s)." . ($r['disputed'] ? " {$r['disputed']} disputed day(s) were left." : '') . ($r['unmarked'] ? " {$r['unmarked']} working day(s) have nothing marked." : '')]);
        });
    }

    public function dispute(Request $request): JsonResponse
    {
        $d = $request->validate(['user_id' => 'required|integer|exists:users,id', 'date' => 'required|date', 'kind' => 'required|in:' . implode(',', array_keys(AttendanceDispute::KINDS)), 'note' => 'nullable|string|max:255']);

        return $this->guard(function () use ($request, $d) {
            $this->svc->dispute($request->user(), (int) $d['user_id'], substr($d['date'], 0, 10), $d['kind'], $d['note'] ?? null);

            return response()->json(['message' => 'Reported to the super admin. Your name is not shown to anyone but them.'], 201);
        });
    }

    public function resolve(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['outcome' => 'required|in:upheld,dismissed', 'note' => 'nullable|string|max:255']);

        return $this->guard(function () use ($request, $id, $d) {
            $this->svc->resolve($request->user(), $id, $d['outcome'], $d['note'] ?? null);

            return response()->json(['message' => $d['outcome'] === 'upheld' ? 'Upheld — the day was changed and verified.' : 'Dismissed.']);
        });
    }

    // ── settings and who marks whom (admin, super admin) ──────────────────

    public function config(Request $request): JsonResponse
    {
        abort_unless(in_array($request->user()->role, ['admin', 'super_admin'], true), 403);
        $markers = AttendanceService::ready() && \Illuminate\Support\Facades\Schema::hasTable('attendance_markers') ? AttendanceMarker::all()->groupBy('staff_user_id')->map(fn ($g) => $g->pluck('marker_user_id')->values()) : collect();

        return response()->json(['staff' => $this->svc->staff()->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'marker_ids' => $markers[$p->id] ?? []])->values(), 'candidates' => User::whereHas('employee')->orderBy('name')->get(['id', 'name'])]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        abort_unless(in_array($request->user()->role, ['admin', 'super_admin'], true), 403);
        $d = $request->validate(['work_start' => 'required|date_format:H:i', 'work_end' => 'required|date_format:H:i|after:work_start', 'grace_minutes' => 'required|integer|min:0|max:240', 'workdays' => 'required|array|min:1', 'workdays.*' => 'integer|between:0,6']);
        if (! \Illuminate\Support\Facades\Schema::hasTable('attendance_settings')) {
            return response()->json(['message' => 'Run script 63_attendance.sql first.'], 422);
        }
        AttendanceSetting::current()->update(['work_start' => $d['work_start'] . ':00', 'work_end' => $d['work_end'] . ':00', 'grace_minutes' => $d['grace_minutes'], 'workdays' => implode(',', array_unique($d['workdays'])), 'updated_by' => $request->user()->id]);

        return response()->json(['message' => 'Saved.']);
    }

    public function saveMarkers(Request $request, int $staffId): JsonResponse
    {
        abort_unless(in_array($request->user()->role, ['admin', 'super_admin'], true), 403);
        $d = $request->validate(['marker_ids' => 'present|array|max:20', 'marker_ids.*' => 'integer|exists:users,id']);
        if (! \Illuminate\Support\Facades\Schema::hasTable('attendance_markers')) {
            return response()->json(['message' => 'Run script 63_attendance.sql first.'], 422);
        }
        AttendanceMarker::where('staff_user_id', $staffId)->delete();
        foreach (array_unique($d['marker_ids']) as $m) {
            if ((int) $m !== $staffId) {   // nobody marks themselves
                AttendanceMarker::create(['staff_user_id' => $staffId, 'marker_user_id' => $m]);
            }
        }

        return response()->json(['message' => 'Saved.']);
    }
}

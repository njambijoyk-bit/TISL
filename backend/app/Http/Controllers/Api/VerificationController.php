<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\VoucherType;
use App\Models\User;
use App\Models\VerificationAssignment;
use App\Models\VerificationItem;
use App\Services\Books\BooksException;
use App\Services\Verification\VerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Verification: the verifier's monthly register, items and statuses; and (admin, finance) who verifies what, the hand-picked sample and the workload. See VerificationService. */
class VerificationController extends Controller
{
    public function __construct(private VerificationService $svc) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function month(Request $r): string
    {
        return preg_match('/^\d{4}-\d{2}$/', (string) $r->query('month')) ? $r->query('month') : now()->subMonth()->format('Y-m');
    }

    public function index(Request $request): JsonResponse
    {
        if (! VerificationService::ready()) {
            return response()->json(['table_ready' => false, 'is_manager' => VerificationService::isManager($request->user()), 'months' => [], 'types' => []]);
        }
        $u = $request->user();
        $all = $request->boolean('all') && VerificationService::isManager($u);
        $m = $this->month($request);
        $reg = $this->svc->register($u, $m, $all);

        return response()->json(['table_ready' => true, 'is_manager' => VerificationService::isManager($u), 'all' => $all, 'month' => $m, 'due' => $reg['due'], 'types' => $reg['types'], 'months' => $this->svc->months($u, $all),
            'statuses' => VerificationItem::STATUSES]);
    }

    public function items(Request $request): JsonResponse
    {
        $request->validate(['type' => 'required|string|max:40']);
        $all = $request->boolean('all') && VerificationService::isManager($request->user());

        return response()->json(['items' => $this->svc->items($request->user(), $this->month($request), $request->query('type'), $all)]);
    }

    public function pickList(Request $request): JsonResponse
    {
        abort_unless(VerificationService::isManager($request->user()), 403);
        $request->validate(['type' => 'required|string|max:40']);

        return response()->json(['items' => $this->svc->pickList($this->month($request), $request->query('type'))]);
    }

    public function report(Request $request): JsonResponse
    {
        abort_unless(VerificationService::isManager($request->user()), 403);

        return $this->guard(fn () => response()->json($this->svc->report($this->month($request))));
    }

    public function reportType(Request $request): JsonResponse
    {
        abort_unless(VerificationService::isManager($request->user()), 403);
        $request->validate(['type' => ['required', 'regex:/^vt:\d+$/']]);

        return $this->guard(fn () => response()->json(['items' => $this->svc->reportType($this->month($request), $request->query('type'))]));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return $this->guard(fn () => response()->json($this->svc->show($request->user(), $id)));
    }

    public function mark(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['status' => 'required|string|max:24', 'note' => 'nullable|string|max:255', 'clarified_by' => 'nullable|string|max:120']);

        return $this->guard(function () use ($request, $id, $d) {
            $this->svc->mark($request->user(), $id, $d['status'], $d['note'] ?? null, $d['clarified_by'] ?? null);

            return response()->json(['message' => 'Recorded.'] + $this->svc->show($request->user(), $id));
        });
    }

    public function pick(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['selected' => 'required|boolean']);

        return $this->guard(function () use ($request, $id, $d) {
            $this->svc->pick($request->user(), $id, (bool) $d['selected']);

            return response()->json(['message' => $d['selected'] ? 'Picked for verification.' : 'Taken off the list.']);
        });
    }

    // ── set-up (admin, finance) ────────────────────────────────────────────

    public function config(Request $request): JsonResponse
    {
        abort_unless(VerificationService::isManager($request->user()), 403);

        return response()->json(['table_ready' => VerificationService::ready(), 'assignments' => $this->svc->assignments(), 'scopes' => VerificationAssignment::SCOPES, 'sampling' => VerificationAssignment::SAMPLING,
            'voucher_types' => VoucherType::where('is_active', true)->orderBy('name')->get(['id', 'name']), 'staff' => User::whereHas('employee')->orderBy('name')->get(['id', 'name']),
            'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name']), 'workload' => $this->svc->workload(), 'due_day' => $this->svc->dueDay()]);
    }

    public function saveAssignment(Request $request, ?int $id = null): JsonResponse
    {
        abort_unless(VerificationService::isManager($request->user()), 403);
        $d = $request->validate(['user_id' => 'required|integer|exists:users,id', 'scope_type' => 'required|string', 'scope_id' => 'nullable|integer', 'location_id' => 'nullable|integer', 'sampling' => 'required|string',
            'percent' => 'nullable|integer|min:1|max:100', 'from_month' => 'nullable|string|max:7', 'to_month' => 'nullable|string|max:7', 'is_active' => 'nullable|boolean']);

        return $this->guard(function () use ($request, $d, $id) {
            $a = $this->svc->saveAssignment($d, $id, $request->user());

            return response()->json(['id' => $a->id, 'message' => 'Saved.'], $id ? 200 : 201);
        });
    }

    public function deleteAssignment(Request $request, int $id): JsonResponse
    {
        abort_unless(VerificationService::isManager($request->user()), 403);
        if (VerificationItem::where('assignment_id', $id)->where('status', '!=', 'pending')->exists()) {
            VerificationAssignment::whereKey($id)->update(['is_active' => false]);

            return response()->json(['message' => 'Verification has started under this assignment, so it was switched off rather than deleted.']);
        }
        VerificationItem::where('assignment_id', $id)->delete();
        VerificationAssignment::whereKey($id)->delete();

        return response()->json(['message' => 'Deleted.']);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        abort_unless(VerificationService::isManager($request->user()), 403);
        $d = $request->validate(['due_day' => 'required|integer|min:1|max:28']);
        if (! \Illuminate\Support\Facades\Schema::hasTable('verification_settings')) {
            return response()->json(['message' => 'Run script 65_verification.sql first.'], 422);
        }
        DB::table('verification_settings')->exists() ? DB::table('verification_settings')->update(['due_day' => $d['due_day'], 'updated_at' => now()]) : DB::table('verification_settings')->insert(['due_day' => $d['due_day'], 'created_at' => now(), 'updated_at' => now()]);

        return response()->json(['message' => 'Saved.']);
    }
}

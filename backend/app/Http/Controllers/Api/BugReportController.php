<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BugReport;
use App\Models\DevNote;
use App\Services\BugReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class BugReportController extends Controller
{
    public function __construct(protected BugReportService $service) {}

    // ================================================================
    // PUBLIC — BUG REPORTS
    // ================================================================

    /**
     * POST /api/bug-reports
     * Anyone can submit: guest, customer, admin.
     */
    public function store(Request $request)
    {
        $request->validate([
            'title'          => 'required|string|max:255',
            'description'    => 'required|string|max:5000',
            'page_url'       => 'nullable|url|max:2048',
            'screenshot_url' => 'nullable|url|max:2048',
            'guest_name'     => 'nullable|string|max:120',
            'guest_email'    => 'nullable|email|max:180',
        ]);

        $customerId = null;
        $userId     = null;

        // Resolve reporter identity if authenticated
        if (Auth::check()) {
            $user = Auth::user();
            if ($user->customer) {
                $customerId = $user->customer->id;
            } else {
                $userId = $user->id;
            }
        }

        $report = $this->service->createBugReport($request->all(), $customerId, $userId);

        return response()->json([
            'message'        => 'Bug report submitted. Thank you!',
            'report_number'  => $report->report_number,
            'tracking_token' => $report->tracking_token,
            'status'         => $report->status,
        ], 201);
    }

    /**
     * GET /api/bug-reports/track/{token}
     * Public status check by tracking token (for guests).
     */
    public function track(string $token)
    {
        $report = $this->service->getByTrackingToken($token);

        if (!$report) {
            return response()->json(['message' => 'Report not found.'], 404);
        }

        return response()->json([
            'report_number' => $report->report_number,
            'title'         => $report->title,
            'status'        => $report->status,
            'priority'      => $report->priority,
            'created_at'    => $report->created_at,
            'history'       => $report->statusHistory->map(fn($h) => [
                'from'       => $h->from_status,
                'to'         => $h->to_status,
                'note'       => $h->note,
                'changed_at' => $h->created_at,
            ]),
        ]);
    }

    // ================================================================
    // CUSTOMER — BUG REPORTS
    // ================================================================

    /**
     * GET /customer/bug-reports
     * Customer sees their own reports + status history.
     */
    public function customerIndex(Request $request)
    {
        $customer = $request->user()->customer;

        if (!$customer) {
            return response()->json(['message' => 'Customer not found.'], 404);
        }

        $reports = BugReport::where('customer_id', $customer->id)
            ->with(['statusHistory'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($reports);
    }

    /**
     * GET /customer/bug-reports/{id}
     * Customer views one of their reports.
     */
    public function customerShow(Request $request, int $id)
    {
        $customer = $request->user()->customer;

        $report = BugReport::where('id', $id)
            ->where('customer_id', $customer->id)
            ->with(['statusHistory'])
            ->firstOrFail();

        return response()->json($report);
    }

    // ================================================================
    // ADMIN — BUG REPORTS
    // ================================================================

    /**
     * GET /admin/bug-reports
     */
    public function adminIndex(Request $request)
    {
        $query = BugReport::with(['customer', 'user', 'devNote'])
            ->withCount('statusHistory');

        if ($request->filled('status')) {
            $query->byStatus($request->status);
        }
        if ($request->filled('priority')) {
            $query->byPriority($request->priority);
        }
        if ($request->filled('search')) {
            $q = $request->search;
            $query->where(fn($sq) => $sq
                ->where('title', 'like', "%{$q}%")
                ->orWhere('report_number', 'like', "%{$q}%")
                ->orWhere('guest_email', 'like', "%{$q}%")
            );
        }

        $sortField = $request->input('sort', 'created_at');
        $sortDir   = $request->input('dir', 'desc');
        $query->orderBy($sortField, $sortDir);

        return response()->json(
            $query->paginate($request->integer('per_page', 20))
        );
    }

    /**
     * GET /admin/bug-reports/{id}
     */
    public function adminShow(int $id)
    {
        $report = BugReport::with([
            'customer',
            'user',
            'statusHistory.changedBy',
            'devNote.enteredBy',
        ])->findOrFail($id);

        return response()->json($report);
    }

    /**
     * PATCH /admin/bug-reports/{id}/status
     */
    public function updateStatus(Request $request, int $id)
    {
        $request->validate([
            'status' => 'required|in:open,in_progress,resolved,wont_fix',
            'note'   => 'nullable|string|max:1000',
        ]);

        $report = BugReport::findOrFail($id);
        $report = $this->service->updateStatus(
            $report,
            $request->status,
            $request->note,
            $request->user()->id
        );

        return response()->json(['message' => 'Status updated.', 'report' => $report]);
    }

    /**
     * PATCH /admin/bug-reports/{id}/priority
     */
    public function updatePriority(Request $request, int $id)
    {
        $request->validate([
            'priority' => 'required|in:low,medium,high,critical',
        ]);

        $report = BugReport::findOrFail($id);
        $report = $this->service->updatePriority($report, $request->priority);

        return response()->json(['message' => 'Priority updated.', 'report' => $report]);
    }

    /**
     * DELETE /admin/bug-reports/{id}
     * Soft delete.
     */
    public function adminDestroy(int $id)
    {
        BugReport::findOrFail($id)->delete();
        return response()->json(['message' => 'Bug report deleted.']);
    }

    // ================================================================
    // DEV ACCESS KEYS (admin-facing)
    // ================================================================

    /**
     * GET /admin/dev-keys/active
     * Admin board: see the current key + its stats.
     */
    public function activeKey()
    {
        $key = $this->service->getActiveKey();

        if (!$key) {
            $key = $this->service->generateNewKey();
        }

        return response()->json([
            'raw_key'         => $key->raw_key,
            'key_preview'     => $key->key_preview,
            'failed_attempts' => $key->failed_attempts,
            'remaining'       => 10 - $key->failed_attempts,
            'generated_at'    => $key->generated_at,
        ]);
    }

    /**
     * POST /admin/dev-keys/regenerate
     * Admin manually regenerates the key.
     */
    public function regenerateKey()
    {
        $key = $this->service->generateNewKey();

        return response()->json([
            'message'      => 'New key generated.',
            'raw_key'      => $key->raw_key,
            'key_preview'  => $key->key_preview,
            'generated_at' => $key->generated_at,
        ]);
    }

    /**
     * GET /admin/dev-keys/logs
     */
    public function keyLogs(Request $request)
    {
        $key = $this->service->getActiveKey();

        $logs = \App\Models\DevAccessKeyLog::with('accessKey')
            ->orderByDesc('attempted_at')
            ->paginate($request->integer('per_page', 30));

        return response()->json($logs);
    }

    // ================================================================
    // DEV AUTH (gated UX — no Laravel auth)
    // ================================================================

    /**
     * POST /api/dev/auth
     * Dev submits their one-time key. Returns a short-lived session token
     * stored server-side in cache.
     */
    public function devAuth(Request $request)
    {
        $request->validate([
            'key' => 'required|string',
        ]);

        $result = $this->service->attemptKeyAuth(
            $request->key,
            $request->ip(),
            $request->userAgent() ?? ''
        );

        if (!$result['success']) {
            return response()->json([
                'message'    => $result['message'],
                'key_reset'  => !is_null($result['new_key']),
            ], 401);
        }

        // Issue a short-lived dev session token (cached, not DB)
        $sessionToken = \Illuminate\Support\Str::random(64);
        cache()->put('dev_session:' . $sessionToken, true, now()->addHours(8));

        return response()->json([
            'message'       => $result['message'],
            'dev_token'     => $sessionToken,
            'expires_in'    => '8 hours',
        ]);
    }

    // ================================================================
    // DEV NOTES (via gated UX or admin)
    // ================================================================

    /**
     * GET /admin/dev-notes  OR  GET /api/dev/notes
     */
    public function devNoteIndex(Request $request)
    {
        $query = DevNote::with(['bugReport', 'enteredBy'])
            ->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->byStatus($request->status);
        }
        if ($request->filled('type')) {
            $query->byType($request->type);
        }
        if ($request->filled('linked')) {
            $request->boolean('linked') ? $query->linked() : $query->standalone();
        }
        if ($request->filled('bug_report_id')) {
            $query->where('bug_report_id', $request->bug_report_id);
        }

        return response()->json(
            $query->paginate($request->integer('per_page', 20))
        );
    }

    /**
     * POST /admin/dev-notes  OR  POST /api/dev/notes
     */
    public function devNoteStore(Request $request, bool $byDev = false)
    {
        $request->validate([
            'title'         => 'required|string|max:255',
            'description'   => 'nullable|string',
            'type'          => 'nullable|in:pr_opened,pr_closed,branch_created,branch_deleted,branch_changed,git_url,fix,cosmetic,general,observation',
            'status'        => 'nullable|in:pending,in_progress,done,cosmetic,no_error,wont_fix',
            'bug_report_id' => 'nullable|exists:bug_reports,id',
            'pr_number'     => 'nullable|string|max:30',
            'pr_url'        => 'nullable|url|max:2048',
            'branch_name'   => 'nullable|string|max:255',
            'git_url'       => 'nullable|url|max:2048',
            'commit_hash'   => 'nullable|string|max:64',
        ]);

        $adminId = Auth::check() ? Auth::id() : null;

        $note = $this->service->createDevNote($request->all(), $byDev, $adminId);

        return response()->json([
            'message' => 'Dev note created.',
            'note'    => $note->load(['bugReport', 'enteredBy']),
        ], 201);
    }

    /**
     * Dev-gated store — called from the dev UX after token auth.
     * POST /api/dev/notes
     */
    public function devNoteStoreByDev(Request $request)
    {
        $this->requireDevSession($request);
        return $this->devNoteStore($request, byDev: true);
    }

    /**
     * PUT /admin/dev-notes/{id}  OR  PUT /api/dev/notes/{id}
     */
    public function devNoteUpdate(Request $request, int $id)
    {
        $request->validate([
            'title'       => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'type'        => 'nullable|in:pr_opened,pr_closed,branch_created,branch_deleted,branch_changed,git_url,fix,cosmetic,general,observation',
            'status'      => 'nullable|in:pending,in_progress,done,cosmetic,no_error,wont_fix',
            'pr_number'   => 'nullable|string|max:30',
            'pr_url'      => 'nullable|url|max:2048',
            'branch_name' => 'nullable|string|max:255',
            'git_url'     => 'nullable|url|max:2048',
            'commit_hash' => 'nullable|string|max:64',
        ]);

        $note = DevNote::findOrFail($id);
        $note = $this->service->updateDevNote($note, $request->all());

        return response()->json(['message' => 'Dev note updated.', 'note' => $note]);
    }

    /**
     * Dev-gated update.
     * PUT /api/dev/notes/{id}
     */
    public function devNoteUpdateByDev(Request $request, int $id)
    {
        $this->requireDevSession($request);
        return $this->devNoteUpdate($request, $id);
    }

    /**
     * PATCH /admin/dev-notes/{id}/status
     */
    public function devNoteStatus(Request $request, int $id)
    {
        $request->validate([
            'status' => 'required|in:pending,in_progress,done,cosmetic,no_error,wont_fix',
        ]);

        $note = DevNote::findOrFail($id);
        $note = $this->service->updateDevNoteStatus($note, $request->status);

        return response()->json(['message' => 'Status updated.', 'note' => $note]);
    }

    /**
     * DELETE /admin/dev-notes/{id}
     */
    public function devNoteDestroy(int $id)
    {
        DevNote::findOrFail($id)->delete();
        return response()->json(['message' => 'Dev note deleted.']);
    }

    // ================================================================
    // PRIVATE HELPERS
    // ================================================================

    /**
     * Gate check for dev session token.
     */
    private function requireDevSession(Request $request): void
    {
        $token = $request->header('X-Dev-Token');

        if (!$token || !cache()->has('dev_session:' . $token)) {
            abort(401, 'Dev session expired or invalid. Please re-authenticate.');
        }
    }
}

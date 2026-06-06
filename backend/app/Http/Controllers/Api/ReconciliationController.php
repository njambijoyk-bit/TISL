<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ReconciliationSession;
use App\Models\ReconciliationLine;
use App\Services\ReconciliationPopulateService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;

class ReconciliationController extends Controller
{
    public function __construct(
        private ReconciliationPopulateService $populateService
    ) {}

    // ── Sessions ─────────────────────────────────────────────────

    // GET /admin/reconciliation/sessions
    public function indexSessions(Request $request)
    {
        $query = ReconciliationSession::with('openedBy', 'closedBy')
            ->withCount([
                'lines',
                'lines as pending_count'     => fn($q) => $q->where('status', 'pending'),
                'lines as disputed_count'    => fn($q) => $q->where('status', 'disputed'),
                'lines as confirmed_count'   => fn($q) => $q->where('status', 'confirmed'),
                'lines as written_off_count' => fn($q) => $q->where('status', 'written_off'),
            ])
            ->latest();

        if ($request->filled('ledger')) {
            $query->forLedger($request->ledger);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json($query->paginate($request->get('per_page', 20)));
    }

    // POST /admin/reconciliation/sessions
    public function createSession(Request $request)
    {
        $validated = $request->validate([
            'period_start' => 'required|date',
            'period_end'   => 'required|date|after_or_equal:period_start',
            'ledger'       => 'required|in:payments,store_credit,loyalty_points,credit_account,vat',
            'notes'        => 'nullable|string',
        ]);

        // Block overlap against ALL sessions — open or closed — for this ledger.
        // An existing closed session represents audited history that must not be
        // silently re-covered by a new session.
        $overlapping = ReconciliationSession::forLedger($validated['ledger'])
            ->where(function ($q) use ($validated) {
                $q->whereBetween('period_start', [$validated['period_start'], $validated['period_end']])
                  ->orWhereBetween('period_end',  [$validated['period_start'], $validated['period_end']])
                  ->orWhere(function ($q2) use ($validated) {
                      // existing session completely contains the new period
                      $q2->where('period_start', '<=', $validated['period_start'])
                         ->where('period_end',   '>=', $validated['period_end']);
                  });
            })
            ->orderBy('period_start')
            ->get(['id', 'session_number', 'period_start', 'period_end', 'status']);

        if ($overlapping->isNotEmpty()) {
            $suggestion = $this->findAvailableSlot(
                $validated['ledger'],
                $validated['period_start'],
                $validated['period_end']
            );

            return response()->json([
                'message'    => 'One or more sessions already exist for this ledger in the requested period.',
                'conflicts'  => $overlapping->map(fn($s) => [
                    'session_number' => $s->session_number,
                    'period_start'   => $s->period_start->toDateString(),
                    'period_end'     => $s->period_end->toDateString(),
                    'status'         => $s->status,
                ]),
                'suggestion' => $suggestion,  // null when the range is completely blocked
            ], 422);
        }

        $user    = Auth::user();
        $session = ReconciliationSession::create([
            ...$validated,
            'opened_by' => $user->id,
            'opened_at' => now(),
            'meta'      => [
                'events' => [[
                    'type' => 'session_created',
                    'by'   => $user->id,
                    'name' => $this->userName($user),
                    'at'   => now()->toISOString(),
                ]],
            ],
        ]);

        return response()->json($session->load('openedBy'), 201);
    }

    // GET /admin/reconciliation/sessions/{session}
    public function showSession(ReconciliationSession $session)
    {
        $session->load('openedBy', 'closedBy');
        $session->loadCount([
            'lines',
            'lines as pending_count'     => fn($q) => $q->where('status', 'pending'),
            'lines as disputed_count'    => fn($q) => $q->where('status', 'disputed'),
            'lines as confirmed_count'   => fn($q) => $q->where('status', 'confirmed'),
            'lines as written_off_count' => fn($q) => $q->where('status', 'written_off'),
            'lines as voided_count'      => fn($q) => $q->where('status', 'voided'),
        ]);

        return response()->json($session);
    }

    // POST /admin/reconciliation/sessions/{session}/populate
    public function populate(ReconciliationSession $session)
    {
        if (!$session->isOpen()) {
            return response()->json(['message' => 'Session is closed. Reopen it before populating.'], 422);
        }

        try {
            $count = $this->populateService->populate($session);
            $session->recalculateSummary();
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message'     => "Populated {$count} new lines.",
            'lines_added' => $count,
        ]);
    }

    // POST /admin/reconciliation/sessions/{session}/close
    public function closeSession(ReconciliationSession $session)
    {
        if (!$session->isOpen()) {
            return response()->json(['message' => 'Session is already closed.'], 422);
        }

        $pending  = $session->pendingLines()->count();
        $disputed = $session->disputedLines()->count();

        if ($pending > 0 || $disputed > 0) {
            $parts = [];
            if ($pending)  $parts[] = "{$pending} line" . ($pending  > 1 ? 's' : '') . ' still pending';
            if ($disputed) $parts[] = "{$disputed} line" . ($disputed > 1 ? 's' : '') . ' still disputed';

            return response()->json([
                'message'  => 'Cannot close session — ' . implode(' and ', $parts) . '.',
                'pending'  => $pending,
                'disputed' => $disputed,
            ], 422);
        }

        $user = Auth::user();
        $session->close($user->id, $this->userName($user));
        $session->recalculateSummary();
        return response()->json(['message' => 'Session closed.', 'session' => $session]);
    }

    // POST /admin/reconciliation/sessions/{session}/reopen
    public function reopenSession(ReconciliationSession $session)
    {
        if ($session->isOpen()) {
            return response()->json(['message' => 'Session is already open.'], 422);
        }

        $user = Auth::user();
        $session->reopen($user->id, $this->userName($user));

        return response()->json(['message' => 'Session reopened.', 'session' => $session]);
    }

    // ── Lines ─────────────────────────────────────────────────────

    // GET /admin/reconciliation/sessions/{session}/lines
    public function indexLines(Request $request, ReconciliationSession $session)
    {
        $query = $session->lines()
            ->with('note', 'reviewedBy')
            ->latest();

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->boolean('variance_only')) {
            $query->withVariance();
        }

        return response()->json($query->paginate($request->get('per_page', 50)));
    }

    // PUT /admin/reconciliation/lines/{line}
    // Allowed on both open and closed sessions — status changes are always auditable.
    // Populate is the only action gated on session being open.
    public function updateLine(Request $request, ReconciliationLine $line)
    {
        $session    = $line->session;
        $isPayments = $session->ledger === 'payments';
        $isCash     = in_array($session->ledger, ['payments', 'credit_account', 'vat']);
        $prevStatus = $line->status;

        $validated = $request->validate([
            'action'          => 'required|in:confirm,dispute,write_off,void',
            'actual_amount'   => $isPayments ? 'nullable|numeric' : 'prohibited',
            'disputed_amount' => $isCash ? 'nullable|numeric' : 'prohibited',
            'dispute_note'    => 'required_if:action,dispute|nullable|string',
            'resolution_note' => 'required_if:action,write_off|required_if:action,void|nullable|string',
        ]);

        $user      = Auth::user();
        $newStatus = match($validated['action']) {
            'confirm'   => 'confirmed',
            'dispute'   => 'disputed',
            'write_off' => 'written_off',
            'void'      => 'voided',
        };

        match($validated['action']) {
            'confirm'   => $line->confirm(
                            $user->id,
                            $isPayments ? ($validated['actual_amount'] ?? null) : null
                        ),
            'dispute'   => $line->dispute(
                            $user->id,
                            $validated['dispute_note'],
                            $isCash ? ($validated['disputed_amount'] ?? null) : null
                        ),
            'write_off' => $line->writeOff($user->id, $validated['resolution_note']),
            'void'      => $line->void($user->id, $validated['resolution_note'] ?? 'Voided'),
        };

        // Recalculate session summary amounts
        $session->recalculateSummary();

        // Log event
        $session->logEvent([
            'type'            => 'line_status_change',
            'line_id'         => $line->id,
            'subject_table'   => $line->subject_table,
            'subject_id'      => $line->subject_id,
            'from'            => $prevStatus,
            'to'              => $newStatus,
            'by'              => $user->id,
            'name'            => $this->userName($user),
            'at'              => now()->toISOString(),
            'dispute_note'    => $validated['dispute_note']    ?? null,
            'resolution_note' => $validated['resolution_note'] ?? null,
            'disputed_amount' => $validated['disputed_amount'] ?? null,
            'line_meta'       => array_filter([
                'order_number'   => $line->meta['order_number']   ?? null,
                'customer_name'  => $line->meta['customer_name']  ?? null,
                'payment_number' => $line->meta['payment_number'] ?? null,
            ]),
        ]);

        $line->load('note', 'reviewedBy');

        return response()->json($line);
    }

    // PUT /admin/reconciliation/lines/{line}/attach-note
    // Linking a financial note is only meaningful while the session is active.
    public function attachNote(Request $request, ReconciliationLine $line)
    {
        if (!$line->session->isOpen()) {
            return response()->json(['message' => 'Session is closed.'], 422);
        }

        $request->validate([
            'financial_note_id' => 'required|exists:financial_notes,id',
        ]);

        $line->update(['financial_note_id' => $request->financial_note_id]);
        $line->load('note');

        return response()->json($line);
    }

    // PATCH /admin/reconciliation/sessions/{session}/notes
    public function updateNotes(Request $request, ReconciliationSession $session)
    {
        $validated = $request->validate([
            'notes' => 'nullable|string|max:2000',
        ]);

        $session->update(['notes' => $validated['notes']]);

        return response()->json(['message' => 'Notes updated.', 'session' => $session]);
    }

    // ── Private helpers ───────────────────────────────────────────

    /**
     * Given a requested date range for a ledger, return the largest contiguous
     * free slot inside that range after subtracting all existing sessions.
     * Returns null when the range is completely blocked.
     *
     * Example:
     *   Existing: May 1–20, May 28–Jun 3
     *   Requested: May 19–29
     *   Returns: { from: '2026-05-21', to: '2026-05-27' }
     */
    private function findAvailableSlot(string $ledger, string $startDate, string $endDate): ?array
    {
        $rangeStart = Carbon::parse($startDate)->startOfDay();
        $rangeEnd   = Carbon::parse($endDate)->endOfDay();

        // All sessions for this ledger — regardless of overlap with the request —
        // so we can compute the full blocked map correctly.
        $allSessions = ReconciliationSession::forLedger($ledger)
            ->orderBy('period_start')
            ->get(['period_start', 'period_end']);

        // Collect blocked intervals clipped to [rangeStart, rangeEnd]
        $blocked = [];
        foreach ($allSessions as $s) {
            $sStart = Carbon::parse($s->period_start)->startOfDay();
            $sEnd   = Carbon::parse($s->period_end)->endOfDay();

            // Skip sessions completely outside the requested range
            if ($sEnd->lt($rangeStart) || $sStart->gt($rangeEnd)) continue;

            $blocked[] = [
                max($sStart->timestamp, $rangeStart->timestamp),
                min($sEnd->timestamp,   $rangeEnd->timestamp),
            ];
        }

        if (empty($blocked)) return null;

        // Sort by start timestamp
        usort($blocked, fn($a, $b) => $a[0] <=> $b[0]);

        // Walk through and collect free day-level gaps
        $gaps   = [];
        $cursor = $rangeStart->copy();

        foreach ($blocked as [$blockedStart, $blockedEnd]) {
            $bStart = Carbon::createFromTimestamp($blockedStart)->startOfDay();
            $bEnd   = Carbon::createFromTimestamp($blockedEnd)->endOfDay();

            if ($cursor->lt($bStart)) {
                // Gap found between cursor and start of this blocked range
                $gapEnd = $bStart->copy()->subDay()->endOfDay();
                if ($cursor->lte($gapEnd)) {
                    $gaps[] = [
                        'from' => $cursor->toDateString(),
                        'to'   => $gapEnd->toDateString(),
                        'days' => $cursor->diffInDays($gapEnd) + 1,
                    ];
                }
            }

            // Advance cursor past this blocked range
            $nextDay = $bEnd->copy()->addDay()->startOfDay();
            if ($nextDay->gt($cursor)) {
                $cursor = $nextDay;
            }
        }

        // Check for a gap at the end of the range
        if ($cursor->lte($rangeEnd)) {
            $gaps[] = [
                'from' => $cursor->toDateString(),
                'to'   => $rangeEnd->toDateString(),
                'days' => $cursor->diffInDays($rangeEnd) + 1,
            ];
        }

        if (empty($gaps)) return null;

        // Return the largest gap
        usort($gaps, fn($a, $b) => $b['days'] <=> $a['days']);

        $best = $gaps[0];
        unset($best['days']); // internal use only

        return $best;
    }

    private function userName($user): string
    {
        return trim(($user->name ?? '') ?: "User #{$user->id}");
    }
}
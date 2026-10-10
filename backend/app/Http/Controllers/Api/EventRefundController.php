<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Events\Event;
use App\Models\Events\EventRefundRequest;
use App\Models\Events\EventTicket;
use App\Services\Events\EventException;
use App\Services\Events\EventRefunds;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Staff deciding ticket refunds: the waiting requests, approving (money goes back in the books), declining with a reason, and refunding a ticket on someone's behalf. Needs events.refund. */
class EventRefundController extends Controller
{
    public function __construct(private EventRefunds $refunds)
    {
    }

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (EventException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** GET /admin/events/refunds?status=pending|approved|declined|all&event_id= */
    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['status' => 'nullable|in:pending,approved,declined,all', 'event_id' => 'nullable|integer']);
        $status = $d['status'] ?? EventRefundRequest::PENDING;

        return response()->json(['data' => $this->refunds->list($status === 'all' ? null : $status, $d['event_id'] ?? null)]);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['refund_ledger_id' => 'nullable|integer', 'note' => 'nullable|string|max:300']);

        return $this->guard(function () use ($request, $id, $d) {
            $credit = $this->refunds->approve(EventRefundRequest::findOrFail($id), $d['refund_ledger_id'] ?? null, $d['note'] ?? null, $request->user());

            return response()->json(['message' => $credit ? "Refunded: credit note {$credit->voucher_number}. The ticket is cancelled and the buyer has been told." : 'The ticket is cancelled and the buyer has been told.']);
        });
    }

    public function decline(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['note' => 'required|string|max:300']);

        return $this->guard(function () use ($request, $id, $d) {
            $this->refunds->decline(EventRefundRequest::findOrFail($id), $d['note'], $request->user());

            return response()->json(['message' => 'Declined: the buyer has been told why.']);
        });
    }

    /** POST /admin/events/{id}/refunds/approve-all {refund_ledger_id}: every request still waiting for one event (after it was cancelled). */
    public function approveAll(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['refund_ledger_id' => 'nullable|integer']);
        $r = $this->refunds->approveAll(Event::findOrFail($id), $d['refund_ledger_id'] ?? null, $request->user());

        return response()->json($r + ['message' => "{$r['done']} refunded" . ($r['failed'] ? ', ' . count($r['failed']) . ' need attention.' : '.')]);
    }

    /** POST /admin/events/{id}/tickets/{ticketId}/refund {refund_ledger_id, note}: staff refund a ticket for someone (a request and its approval in one step). */
    public function refundTicket(Request $request, int $id, int $ticketId): JsonResponse
    {
        $d = $request->validate(['refund_ledger_id' => 'nullable|integer', 'note' => 'nullable|string|max:300']);
        $t = EventTicket::where('event_id', $id)->findOrFail($ticketId);

        return $this->guard(function () use ($request, $t, $d) {
            $credit = $this->refunds->refundNow($t, $d['refund_ledger_id'] ?? null, $d['note'] ?? null, $request->user());

            return response()->json(['message' => $credit ? "Refunded: credit note {$credit->voucher_number}." : 'The ticket is cancelled.']);
        });
    }
}

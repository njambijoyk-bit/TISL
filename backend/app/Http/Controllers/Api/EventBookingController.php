<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\GuardsEventErrors;
use App\Http\Controllers\Api\Concerns\ScopesEvents;
use App\Http\Controllers\Controller;
use App\Models\Events\Event;
use App\Services\Access\Authorizer;
use App\Services\Events\EventBookings;
use App\Services\Events\EventMarketplace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Booking vendors and venues. The planner (a person who may work on the event) asks, accepts, confirms and reviews; the provider's owner or manager quotes, declines and marks delivery; TISL's staff with
 * events.admin record the money (deposits and balances are paid to TISL), refund it and pay providers out.
 */
class EventBookingController extends Controller
{
    use GuardsEventErrors;
    use ScopesEvents;

    public function __construct(private EventBookings $bookings, private EventMarketplace $market)
    {
    }

    private function on(): void
    {
        abort_unless(EventBookings::ready(), 409, 'Run script 255 to turn on bookings.');
    }

    private function isAdmin(Request $r): bool
    {
        return app(Authorizer::class)->allows($r->user(), 'events.admin');
    }

    /** The booking, if this person is its planner, its provider or TISL's admin. */
    private function mine(Request $r, int $id, string ...$as): object
    {
        $this->on();
        $b = $this->bookings->find($id);
        $planner = in_array('planner', $as, true) && ($b->requested_by == $r->user()->id || $this->eventAccess()->scope(Event::query(), $r->user())->whereKey($b->event_id)->exists());
        $provider = in_array('provider', $as, true) && $this->market->canManage($b->provider_type, $b->provider_id, $r->user(), false);
        abort_unless($planner || $provider || $this->isAdmin($r), 404);

        return $b;
    }

    // ── the planner ──────────────────────────────────────────────────────

    public function forEvent(int $id): JsonResponse
    {
        $this->on();

        return response()->json(['data' => $this->bookings->forEvent($this->scopedEvent($id))]);
    }

    public function request(Request $request, int $id): JsonResponse
    {
        $this->on();
        $d = $request->validate(['provider_type' => 'required|in:vendor,venue', 'provider_id' => 'required|integer', 'offer_id' => 'nullable|integer', 'starts_on' => 'required|date', 'ends_on' => 'nullable|date|after_or_equal:starts_on',
            'guests' => 'nullable|integer|min:1|max:100000', 'message' => 'nullable|string|max:1000']);
        $e = $this->scopedEvent($id);

        return $this->guard(fn () => response()->json(['data' => $this->bookings->request($request->user(), $e, $d['provider_type'], (int) $d['provider_id'], $d), 'message' => 'Your enquiry was sent.'], 201));
    }

    public function accept(Request $request, int $booking): JsonResponse
    {
        $this->mine($request, $booking, 'planner');

        return $this->guard(fn () => response()->json(['data' => $this->bookings->accept($booking), 'message' => 'Accepted. It is confirmed once the deposit is paid to TISL.']));
    }

    public function cancel(Request $request, int $booking): JsonResponse
    {
        $this->mine($request, $booking, 'planner', 'provider');
        $d = $request->validate(['reason' => 'nullable|string|max:300']);

        return $this->guard(fn () => response()->json(['data' => $this->bookings->cancel($booking, $d['reason'] ?? null)]));
    }

    public function complete(Request $request, int $booking): JsonResponse
    {
        $this->mine($request, $booking, 'planner');

        return $this->guard(fn () => response()->json(['data' => $this->bookings->complete($booking, $request->user()), 'message' => 'Confirmed. Thank you.']));
    }

    public function review(Request $request, int $booking): JsonResponse
    {
        $this->mine($request, $booking, 'planner');
        $d = $request->validate(['rating' => 'required|integer|min:1|max:5', 'comment' => 'nullable|string|max:1000']);

        return $this->guard(fn () => response()->json(['data' => $this->bookings->review($booking, $request->user(), (int) $d['rating'], $d['comment'] ?? null)]));
    }

    // ── the provider ─────────────────────────────────────────────────────

    private function myProvider(Request $r, string $plural, int $id): string
    {
        $this->on();
        $type = $plural === 'vendors' ? 'vendor' : 'venue';
        abort_unless($this->market->canManage($type, $id, $r->user(), $this->isAdmin($r)), 404);

        return $type;
    }

    public function providerBookings(Request $request, string $plural, int $id): JsonResponse
    {
        $type = $this->myProvider($request, $plural, $id);

        return response()->json(['data' => $this->bookings->forProvider($type, $id, $request->query('status')), 'owed' => $this->bookings->owed($type, $id)]);
    }

    public function quote(Request $request, int $booking): JsonResponse
    {
        $this->mine($request, $booking, 'provider');
        $d = $request->validate(['amount' => 'required|numeric|min:1', 'deposit_percent' => 'nullable|numeric|min:0|max:100', 'note' => 'nullable|string|max:500']);

        return $this->guard(fn () => response()->json(['data' => $this->bookings->quote($booking, (float) $d['amount'], isset($d['deposit_percent']) ? (float) $d['deposit_percent'] : null, $d['note'] ?? null)]));
    }

    public function decline(Request $request, int $booking): JsonResponse
    {
        $this->mine($request, $booking, 'provider');
        $d = $request->validate(['note' => 'nullable|string|max:500']);

        return $this->guard(fn () => response()->json(['data' => $this->bookings->decline($booking, $d['note'] ?? null)]));
    }

    public function deliver(Request $request, int $booking): JsonResponse
    {
        $this->mine($request, $booking, 'provider');

        return $this->guard(fn () => response()->json(['data' => $this->bookings->deliver($booking)]));
    }

    public function availability(Request $request, string $plural, int $id): JsonResponse
    {
        $this->on();
        $d = $request->validate(['from' => 'required|date', 'to' => 'required|date|after_or_equal:from']);

        return response()->json($this->bookings->availability($plural === 'vendors' ? 'vendor' : 'venue', $id, $d['from'], $d['to']));
    }

    public function block(Request $request, string $plural, int $id): JsonResponse
    {
        $type = $this->myProvider($request, $plural, $id);
        $d = $request->validate(['days' => 'required|array|max:366', 'days.*' => 'date', 'blocked' => 'required|boolean']);
        $this->bookings->block($type, $id, $d['days'], (bool) $d['blocked']);

        return response()->json(['message' => 'Saved.']);
    }

    // ── events.admin ─────────────────────────────────────────────────────

    public function adminList(Request $request): JsonResponse
    {
        $this->on();

        return response()->json(['data' => $this->bookings->adminList($request->query('status')), 'balances' => $this->bookings->balances()]);
    }

    public function payment(Request $request, int $booking): JsonResponse
    {
        $this->on();
        $d = $request->validate(['amount' => 'required|numeric|min:0.01', 'received_ledger_id' => 'required|integer|exists:ledgers,id', 'reference' => 'nullable|string|max:120']);

        return $this->guard(fn () => response()->json(['data' => $this->bookings->recordPayment($booking, (float) $d['amount'], (int) $d['received_ledger_id'], $d['reference'] ?? null, $request->user()), 'message' => 'Payment recorded.']));
    }

    public function refund(Request $request, int $booking): JsonResponse
    {
        $this->on();
        $d = $request->validate(['amount' => 'required|numeric|min:0.01', 'paid_from_ledger_id' => 'required|integer|exists:ledgers,id', 'reference' => 'nullable|string|max:120']);

        return $this->guard(fn () => response()->json(['data' => $this->bookings->refund($booking, (float) $d['amount'], (int) $d['paid_from_ledger_id'], $d['reference'] ?? null, $request->user()), 'message' => 'Refund recorded.']));
    }

    public function complete_admin(Request $request, int $booking): JsonResponse
    {
        $this->on();

        return $this->guard(fn () => response()->json(['data' => $this->bookings->complete($booking, $request->user()), 'message' => 'Completed.']));
    }

    public function payout(Request $request, string $plural, int $id): JsonResponse
    {
        $this->on();
        $d = $request->validate(['amount' => 'required|numeric|min:0.01', 'from_ledger_id' => 'required|integer|exists:ledgers,id', 'reference' => 'nullable|string|max:120']);

        return $this->guard(fn () => response()->json($this->bookings->payout($plural === 'vendors' ? 'vendor' : 'venue', $id, (float) $d['amount'], (int) $d['from_ledger_id'], $d['reference'] ?? null, $request->user()) + ['message' => 'Paid out.'], 201));
    }
}

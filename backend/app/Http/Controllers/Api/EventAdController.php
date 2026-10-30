<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\GuardsEventErrors;
use App\Http\Controllers\Api\Concerns\ScopesEvents;
use App\Http\Controllers\Controller;
use App\Models\Events\Event;
use App\Services\Events\EventAdvertising;
use App\Services\Events\EventPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Promoting events: the products the company sells, campaigns for an event, approval and invoicing (events.admin), and what the public sees and counts. */
class EventAdController extends Controller
{
    use GuardsEventErrors;
    use ScopesEvents;

    public function __construct(private EventAdvertising $ads, private EventPresenter $present)
    {
    }

    private function on(): void
    {
        abort_unless(EventAdvertising::ready(), 409, 'Run script 255 to turn on advertising.');
    }

    // ── public ───────────────────────────────────────────────────────────

    /** GET /events/promoted?kind=featured|banner|category|search&category_id= : events being promoted now, each with the campaign to count against. */
    public function promoted(Request $request): JsonResponse
    {
        $d = $request->validate(['kind' => 'required|in:featured,banner,category,search', 'category_id' => 'nullable|integer']);
        $live = $this->ads->live($d['kind'], $d['category_id'] ?? null);
        if (! $live) {
            return response()->json(['data' => []]);
        }
        $events = Event::public()->whereIn('id', array_keys($live))->with(['sessions', 'ticketTypes'])->get()->reject(fn ($e) => $e->isOver());

        return response()->json(['data' => $events->map(fn ($e) => $this->present->publicRow($e) + ['campaign_id' => $live[$e->id], 'sponsored' => true])->values()]);
    }

    public function track(string $what, int $campaign): JsonResponse
    {
        if (EventAdvertising::ready()) {
            $this->ads->count($campaign, $what === 'click' ? 'clicks' : 'impressions');
        }

        return response()->json(['ok' => true]);
    }

    // ── an organiser or staff ────────────────────────────────────────────

    public function products(): JsonResponse
    {
        $this->on();

        return response()->json(['data' => $this->ads->products(), 'kinds' => EventAdvertising::KINDS]);
    }

    public function request(Request $request, int $id): JsonResponse
    {
        $this->on();
        $d = $request->validate(['product_id' => 'required|integer', 'starts_on' => 'required|date', 'category_id' => 'nullable|integer']);
        $e = $this->scopedEvent($id);

        return $this->guard(fn () => response()->json(['data' => $this->ads->request($e, (int) $d['product_id'], $d['starts_on'], $d['category_id'] ?? null, $request->user()), 'message' => 'Sent to TISL for approval.'], 201));
    }

    public function campaigns(Request $request): JsonResponse
    {
        $this->on();
        $ids = $this->eventAccess()->scope(Event::query(), $request->user())->pluck('id')->all();

        return response()->json(['data' => $this->ads->campaigns($this->eventAccess()->isOutside($request->user()) ? $ids : null, $request->query('status'))]);
    }

    public function cancel(Request $request, int $campaign): JsonResponse
    {
        $this->on();
        $c = \Illuminate\Support\Facades\DB::table('event_ad_campaigns')->find($campaign) ?? abort(404);
        $this->scopedEvent((int) $c->event_id);

        return response()->json(['data' => $this->ads->cancel($campaign)]);
    }

    // ── events.admin ─────────────────────────────────────────────────────

    public function adminProducts(): JsonResponse
    {
        $this->on();

        return response()->json(['data' => $this->ads->products(true), 'kinds' => EventAdvertising::KINDS]);
    }

    public function saveProduct(Request $request, ?int $pid = null): JsonResponse
    {
        $this->on();
        $d = $request->validate(['name' => 'required|string|max:120', 'kind' => 'required|string|max:12', 'description' => 'nullable|string|max:300', 'price' => 'required|numeric|min:0', 'duration_days' => 'required|integer|min:1|max:365',
            'max_slots' => 'required|integer|min:1|max:100', 'is_active' => 'nullable|boolean']);

        return response()->json(['data' => $this->ads->saveProduct($d, $pid)], $pid ? 200 : 201);
    }

    public function deleteProduct(int $pid): JsonResponse
    {
        $this->on();
        $this->ads->deleteProduct($pid);

        return response()->json(['message' => 'Removed.']);
    }

    public function standardProducts(): JsonResponse
    {
        $this->on();

        return response()->json(['made' => $this->ads->addStandardProducts(), 'data' => $this->ads->products(true)]);
    }

    public function decide(Request $request, int $campaign): JsonResponse
    {
        $this->on();
        $d = $request->validate(['approve' => 'required|boolean', 'note' => 'nullable|string|max:300']);

        return $this->guard(fn () => response()->json(['data' => $this->ads->decide($campaign, (bool) $d['approve'], $d['note'] ?? null)]));
    }

    public function invoice(Request $request, int $campaign): JsonResponse
    {
        $this->on();

        return $this->guard(fn () => response()->json(['data' => $this->ads->invoice($campaign, $request->user()), 'message' => 'Invoice made in Books.']));
    }
}

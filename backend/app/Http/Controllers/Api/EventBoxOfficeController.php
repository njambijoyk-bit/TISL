<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Events\Event;
use App\Services\Events\EventBoxOffice;
use App\Services\Events\EventException;
use App\Services\Events\EventPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Selling at the door, for staff with events.sell: what is on offer (with what is left) and where the money can go, and the sale itself. */
class EventBoxOfficeController extends Controller
{
    public function __construct(private EventPresenter $present)
    {
    }

    /** made when needed: it reaches the books and the payment gateways, which a route listing does not need to build */
    private function box(): EventBoxOffice
    {
        return app(EventBoxOffice::class);
    }

    /** GET /admin/events/{id}/box-office */
    public function show(int $id): JsonResponse
    {
        $e = Event::findOrFail($id);
        $page = $this->present->admin($e);

        return response()->json(['event' => ['id' => $e->id, 'title' => $e->title, 'status' => $e->status, 'currency_id' => $e->currency_id],
            'ticket_types' => array_values(array_filter(array_map(fn ($t) => $t['is_active'] ? ['id' => $t['id'], 'name' => $t['name'], 'price' => $t['price'], 'remaining' => $t['remaining'], 'min_per_order' => $t['min_per_order'], 'max_per_order' => $t['max_per_order']] : null, $page['ticket_types']))),
            'ledgers' => $this->box()->ledgers()]);
    }

    /** POST /admin/events/{id}/sell {items, mode: cash|comp, ledger_id, name, email, phone, holders} */
    public function sell(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['items' => 'required|array|min:1|max:20', 'items.*.ticket_type_id' => 'required|integer', 'items.*.quantity' => 'required|integer|min:1|max:100', 'mode' => 'required|in:cash,comp',
            'ledger_id' => 'nullable|integer', 'name' => 'nullable|string|max:160', 'email' => 'nullable|string|max:190', 'phone' => 'nullable|string|max:40', 'holders' => 'nullable|array|max:100', 'holders.*' => 'nullable|string|max:160']);
        $event = Event::findOrFail($id);
        try {
            return response()->json($this->box()->sell($event, $d['items'], $request->only(['name', 'email', 'phone']), $request->user(), $d['mode'], isset($d['ledger_id']) ? (int) $d['ledger_id'] : null, (array) ($d['holders'] ?? [])), 201);
        } catch (EventException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}

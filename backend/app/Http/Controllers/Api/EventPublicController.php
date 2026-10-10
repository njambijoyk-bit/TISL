<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Books\PaymentMethod;
use App\Models\Events\Event;
use App\Services\Books\GatewayPaymentService;
use App\Services\Events\EventCheckout;
use App\Services\Events\EventException;
use App\Services\Events\EventPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The public side of events: the list, an event's page, the price of a basket of tickets, and buying. Open to everyone; a signed-in customer's token (if sent) links the purchase to them. */
class EventPublicController extends Controller
{
    public function __construct(private EventPresenter $present, private EventCheckout $checkout)
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

    /** GET /events?q=&when=week|month&free=1&online=1 */
    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['q' => 'nullable|string|max:100', 'when' => 'nullable|in:week,month', 'free' => 'nullable|boolean', 'online' => 'nullable|boolean']);
        $rows = Event::public()->with(['sessions', 'ticketTypes'])
            ->when($d['q'] ?? null, fn ($w, $s) => $w->where(fn ($x) => $x->where('title', 'like', "%{$s}%")->orWhere('venue_name', 'like', "%{$s}%")->orWhere('summary', 'like', "%{$s}%")))
            ->when($request->boolean('online'), fn ($w) => $w->whereIn('kind', ['online', 'hybrid']))->get()
            ->reject(fn ($e) => $e->isOver())->map(fn ($e) => $this->present->publicRow($e));
        if ($request->boolean('free')) {
            $rows = $rows->filter(fn ($r) => $r['is_free']);
        }
        if (($d['when'] ?? null) !== null) {
            $limit = now()->add($d['when'] === 'week' ? '7 days' : '1 month')->format('Y-m-d\TH:i');
            $rows = $rows->filter(fn ($r) => $r['next_at'] !== null && $r['next_at'] <= $limit);
        }

        return response()->json(['data' => $rows->sortBy('next_at')->values()]);
    }

    /** Draft events are not found; cancelled and postponed ones are shown (with the notice) so people who hold tickets can read it. */
    private function find(string $slug): Event
    {
        return Event::where('slug', $slug)->whereIn('status', [Event::PUBLISHED, Event::CANCELLED, Event::POSTPONED])->firstOrFail();
    }

    public function show(string $slug): JsonResponse
    {
        $e = $this->find($slug);
        $pay = PaymentMethod::offeredAtCheckout()->orderBy('sort_order')->get(['id', 'name', 'kind', 'gateway'])->filter(fn ($m) => GatewayPaymentService::isAutomatic($m))->values();

        return response()->json($this->present->publicShow($e) + ['payment_methods' => $pay]);
    }

    private function rules(): array
    {
        return ['items' => 'required|array|min:1|max:20', 'items.*.ticket_type_id' => 'required|integer', 'items.*.quantity' => 'required|integer|min:1|max:100'];
    }

    public function quote(Request $request, string $slug): JsonResponse
    {
        $request->validate($this->rules());
        $e = $this->find($slug);

        return $this->guard(fn () => response()->json($this->checkout->quote($e, $request->input('items'), $request->user('sanctum'))));
    }

    public function buy(Request $request, string $slug): JsonResponse
    {
        $request->validate($this->rules() + ['name' => 'required|string|max:160', 'email' => 'required|email|max:190', 'phone' => 'nullable|string|max:40', 'payment_method_id' => 'nullable|integer',
            'holders' => 'nullable|array|max:100', 'holders.*' => 'nullable|string|max:160']);
        $e = $this->find($slug);
        $method = $request->filled('payment_method_id') ? PaymentMethod::find($request->integer('payment_method_id')) : null;

        return $this->guard(fn () => response()->json($this->checkout->place($e, $request->input('items'), $request->only(['name', 'email', 'phone']), $request->user('sanctum'), $method, (array) $request->input('holders', [])), 201));
    }
}

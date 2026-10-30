<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\GuardsEventErrors;
use App\Http\Controllers\Controller;
use App\Services\Events\EventEnquiries;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** "Plan my event": a customer asks TISL to plan it (any signed-in person); staff with events.admin run the enquiry through quotation, order, invoice and the event project. */
class EventEnquiryController extends Controller
{
    use GuardsEventErrors;

    public function __construct(private EventEnquiries $enquiries)
    {
    }

    private function on(): void
    {
        abort_unless(EventEnquiries::ready(), 409, 'Run script 255 to turn on event planning requests.');
    }

    public function store(Request $request): JsonResponse
    {
        $this->on();
        $in = $request->validate(['event_type' => 'required|string|max:80', 'name' => 'nullable|string|max:160', 'email' => 'nullable|email|max:190', 'phone' => 'nullable|string|max:40', 'category_id' => 'nullable|integer',
            'event_date' => 'nullable|date|after_or_equal:today', 'guests' => 'nullable|integer|min:1|max:100000', 'budget_min' => 'nullable|numeric|min:0', 'budget_max' => 'nullable|numeric|min:0', 'location' => 'nullable|string|max:200',
            'notes' => 'nullable|string|max:5000', 'consultation_at' => 'nullable|date|after:now']);

        return response()->json(['data' => $this->enquiries->create($request->user(), $in), 'message' => 'Thank you. We will be in touch to talk it through.'], 201);
    }

    public function mine(Request $request): JsonResponse
    {
        return EventEnquiries::ready() ? response()->json(['data' => $this->enquiries->mine($request->user())]) : response()->json(['data' => []]);
    }

    /** The customer says yes to the quotation. */
    public function customerAccept(Request $request, int $id): JsonResponse
    {
        $this->on();
        $r = $this->enquiries->row($id);
        abort_unless($r->user_id == $request->user()->id, 404);

        return $this->guard(function () use ($r, $request) {
            abort_unless($r->status === 'quoted', 422, 'There is no quotation waiting for your answer.');

            return response()->json(['data' => $this->enquiries->accept($r->id, $request->user()), 'message' => 'Thank you. Your event project is open and your sales order is ready.']);
        });
    }

    // ── staff (events.admin) ─────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $this->on();

        return response()->json(['data' => $this->enquiries->adminList($request->query('status'))]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $this->on();
        $d = $request->validate(['status' => 'nullable|string|max:12', 'consultation_at' => 'nullable|date', 'assigned_to' => 'nullable|integer|exists:users,id', 'admin_notes' => 'nullable|string|max:5000', 'customer_id' => 'nullable|integer|exists:customers,id']);

        return response()->json(['data' => $this->enquiries->update($id, $d)]);
    }

    public function quote(Request $request, int $id): JsonResponse
    {
        $this->on();
        $d = $request->validate(['lines' => 'required|array|min:1|max:50', 'lines.*.description' => 'required|string|max:300', 'lines.*.quantity' => 'nullable|numeric|min:0.01', 'lines.*.rate' => 'required|numeric|min:0.01']);

        return $this->guard(fn () => response()->json(['data' => $this->enquiries->quote($id, $d['lines'], $request->user()), 'message' => 'The quotation was made and sent to the customer.']));
    }

    public function accept(Request $request, int $id): JsonResponse
    {
        $this->on();

        return $this->guard(fn () => response()->json(['data' => $this->enquiries->accept($id, $request->user()), 'message' => 'Accepted: sales order made and the event project opened.']));
    }

    public function invoice(Request $request, int $id): JsonResponse
    {
        $this->on();

        return $this->guard(fn () => response()->json(['data' => $this->enquiries->invoice($id, $request->user()), 'message' => 'Invoice made in Books.']));
    }

    public function project(Request $request, int $id): JsonResponse
    {
        $this->on();

        return $this->guard(function () use ($request, $id) {
            $e = $this->enquiries->openProject($id, $request->user());

            return response()->json(['data' => $this->enquiries->shape($this->enquiries->row($id), true), 'event_id' => $e->id]);
        });
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Service;
use App\Models\ServiceSetting;
use App\Models\ServiceVariant;
use App\Services\BookingTermsService;
use App\Services\Booking\BookingNoticeService;
use App\Services\Booking\BookingService;
use App\Services\Books\BooksException;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Bookings, customer side: see when a service can be booked, book it, see my bookings, cancel one. A customer only ever sees their own bookings,
 * and nothing about who else is booked — only which start times are free.
 */
class MyBookingController extends Controller
{
    public function __construct(private BookingService $svc, private BookingNoticeService $notice, private BookingTermsService $terms) {}

    private function mine(Request $request): \App\Models\Customer
    {
        return $request->user()?->customer ?? abort(403, 'Only customers can book.');
    }

    private function fail(\Throwable $e): JsonResponse
    {
        if ($e instanceof BooksException) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        throw $e;
    }

    /** Public: can this service be booked, with which packages, and (for a day) which start times are free. */
    public function availability(Request $request, int $service): JsonResponse
    {
        $s = Service::findOrFail($service);
        if (! $this->svc->bookable($s)) {
            // say why, so the page can show a note instead of nothing: a service that needs booking but has nobody set up yet
            return response()->json(['bookable' => false, 'booking_required' => (bool) $s->booking_required, 'reason' => ! $s->canBeBooked() ? 'unavailable' : 'not_set_up',
                'message' => 'This service is not open for online booking yet.']);
        }
        $variantId = $request->filled('service_variant_id') ? (int) $request->query('service_variant_id') : null;
        $out = ['bookable' => true, 'booking_required' => (bool) $s->booking_required, 'branches' => $this->svc->branchesFor($s, $variantId), 'terms' => $this->terms->status($request->user('sanctum')?->customer), 'window_hours' => ServiceSetting::current()->cancellation_window_hours, 'packages' => $s->variants()->where('status', '!=', 'inactive')->get(['id', 'name', 'price'])->map(fn ($v) => ['id' => $v->id, 'name' => $v->name, 'price' => (float) $v->price])];
        if ($request->filled('date') && $request->filled('service_variant_id')) {
            $v = ServiceVariant::with('durationUnit')->where('service_id', $s->id)->findOrFail($request->query('service_variant_id'));
            $day = Carbon::parse($request->query('date'));
            // staff names are not shown to customers: only the times
            $out['slots'] = collect($this->svc->slots($s, $v, $day, null, $request->filled('location_id') ? (int) $request->query('location_id') : null))->map(fn ($t) => ['time' => $t['time']])->values();
            $out['minutes'] = $this->svc->minutes($v);
        }

        return response()->json($out);
    }

    public function quote(Request $request): JsonResponse
    {
        $this->mine($request);
        try {
            $q = $this->svc->quote($request->only(['service_id', 'service_variant_id', 'starts_at', 'people', 'on_site']));
        } catch (\Throwable $e) {
            return $this->fail($e);
        }

        return response()->json($q);
    }

    private function row(Booking $b): array
    {
        $b->loadMissing(['service:id,name', 'variant:id,name', 'resource:id,name,type']);

        return ['id' => $b->id, 'number' => $b->number, 'status' => $b->status, 'service' => $b->service?->name, 'package' => $b->variant?->name, 'starts_at' => $b->starts_at->toIso8601String(), 'ends_at' => $b->ends_at->toIso8601String(),
            'with' => $b->resource?->type === 'staff' ? $b->resource->name : null, 'people' => $b->people, 'price' => (float) $b->price, 'deposit_amount' => (float) $b->deposit_amount, 'deposit_status' => $b->deposit_status,
            'can_cancel' => $b->status === 'confirmed' && $b->starts_at->isFuture(), 'cancel_is_late' => $b->status === 'confirmed' ? $this->svc->isLate($b) : false];
    }

    public function index(Request $request): JsonResponse
    {
        $c = $this->mine($request);
        if (! BookingService::ready()) {
            return response()->json(['rows' => []]);
        }

        return response()->json(['rows' => Booking::where('customer_id', $c->id)->orderByDesc('starts_at')->limit(100)->get()->map(fn ($b) => $this->row($b))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->mine($request);
        $d = $request->validate(['service_id' => 'required|integer', 'service_variant_id' => 'required|integer', 'starts_at' => 'required|date', 'people' => 'nullable|integer|min:1|max:50',
            'on_site' => 'nullable|boolean', 'address' => 'nullable|string|max:255', 'notes' => 'nullable|string|max:1000', 'location_id' => 'nullable|integer|exists:locations,id',
            'policy_acceptances' => 'nullable|array', 'policy_acceptances.*.key' => 'required_with:policy_acceptances|string|max:80', 'policy_acceptances.*.response' => 'nullable|in:accepted,disagreed']);
        try {
            $agreement = $this->terms->enforce($c, $request->all());   // before anything is booked or invoiced
            $b = $this->svc->create(['customer_id' => $c->id, 'source' => 'portal'] + array_diff_key($d, ['policy_acceptances' => 1]), $request->user());
            $this->terms->tie($agreement, $b);
        } catch (\Throwable $e) {
            return $this->fail($e);
        }
        $this->notice->tryEmail($b, 'booked');

        return response()->json(['booking' => $this->row($b), 'message' => "Booked — {$b->number}." . ((float) $b->deposit_amount > 0 ? ' Pay the deposit in My orders to hold it.' : '')], 201);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $c = $this->mine($request);
        $b = Booking::where('customer_id', $c->id)->findOrFail($id);
        try {
            $r = $this->svc->cancel($b, $request->input('reason') ?: 'Cancelled by the customer', $request->user());
        } catch (\Throwable $e) {
            return $this->fail($e);
        }
        $this->notice->tryEmail($r['booking'], 'cancelled');

        return response()->json(['booking' => $this->row($r['booking']), 'message' => $r['late'] ? 'Cancelled. This was inside the cancellation window, so a fee may apply — we will be in touch.' : 'Cancelled.']);
    }
}

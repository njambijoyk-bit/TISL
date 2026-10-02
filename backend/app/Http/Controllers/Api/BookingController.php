<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Books\Voucher;
use App\Models\Customer;
use App\Models\Service;
use App\Models\ServiceVariant;
use App\Services\Booking\BookingNoticeService;
use App\Services\Booking\BookingService;
use App\Services\Books\BooksException;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Bookings, staff side: the list, a new booking for a customer, and what happens to one — move, cancel, no-show, done. Customers use MyBookingController. */
class BookingController extends Controller
{
    public function __construct(private BookingService $svc, private BookingNoticeService $notice) {}

    public function row(Booking $b): array
    {
        $b->loadMissing(['customer:id,first_name,last_name,email,phone', 'service:id,name', 'variant:id,name', 'resource:id,name,type']);
        $v = fn ($id) => $id ? Voucher::with('type:id,name')->find($id, ['id', 'voucher_number', 'status', 'voucher_type_id', 'total_amount']) : null;
        $ref = fn ($x) => $x ? ['id' => $x->id, 'number' => $x->voucher_number, 'status' => $x->status, 'type' => $x->type?->name, 'total' => (float) $x->total_amount] : null;
        $upfront = $v($b->upfront_voucher_id);

        return [
            'id' => $b->id, 'number' => $b->number, 'status' => $b->status, 'source' => $b->source,
            'starts_at' => $b->starts_at->toIso8601String(), 'ends_at' => $b->ends_at->toIso8601String(), 'people' => $b->people, 'on_site' => $b->on_site, 'address' => $b->address, 'notes' => $b->notes,
            'customer' => $b->customer ? ['id' => $b->customer->id, 'name' => trim($b->customer->first_name . ' ' . $b->customer->last_name), 'email' => $b->customer->email, 'phone' => $b->customer->phone] : null,
            'service' => $b->service?->name, 'service_id' => $b->bookable_id, 'package' => $b->variant?->name, 'service_variant_id' => $b->service_variant_id,
            'resource' => $b->resource ? ['id' => $b->resource->id, 'name' => $b->resource->name, 'type' => $b->resource->type] : null,
            'price' => (float) $b->price, 'fees' => $b->fees ?? [], 'deposit_amount' => (float) $b->deposit_amount, 'deposit_status' => $b->deposit_status,
            'deposit_paid' => $upfront ? $this->svc->paidOnUpfront($b) >= (float) $b->deposit_amount - 0.005 && (float) $b->deposit_amount > 0 : false,
            'order' => $ref($v($b->order_voucher_id)), 'upfront' => $ref($upfront), 'invoice' => $ref($v($b->invoice_voucher_id)), 'fee_invoice' => $ref($v($b->fee_voucher_id)),
            'cancelled_at' => $b->cancelled_at?->toIso8601String(), 'cancel_reason' => $b->cancel_reason, 'cancelled_late' => $b->cancelled_late, 'moved_count' => $b->moved_count,
            'can_change' => $b->status === 'confirmed', 'is_late' => $b->status === 'confirmed' ? $this->svc->isLate($b) : false,
        ];
    }

    private function fail(\Throwable $e): JsonResponse
    {
        if ($e instanceof BooksException) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        throw $e;
    }

    public function index(Request $request): JsonResponse
    {
        if (! BookingService::ready()) {
            return response()->json(['table_ready' => false, 'rows' => [], 'counts' => []]);
        }
        $q = Booking::query()->orderBy('starts_at', $request->query('order') === 'desc' ? 'desc' : 'asc');
        foreach (['status', 'resource_id', 'customer_id'] as $f) {
            $q->when($request->filled($f), fn ($w) => $w->where($f, $request->query($f)));
        }
        $q->when($request->filled('from'), fn ($w) => $w->where('starts_at', '>=', Carbon::parse($request->query('from'))->startOfDay()))
            ->when($request->filled('to'), fn ($w) => $w->where('starts_at', '<=', Carbon::parse($request->query('to'))->endOfDay()))
            ->when($request->filled('search'), fn ($w) => $w->where(fn ($x) => $x->where('number', 'like', '%' . $request->query('search') . '%')
                ->orWhereHas('customer', fn ($c) => $c->where('first_name', 'like', '%' . $request->query('search') . '%')->orWhere('last_name', 'like', '%' . $request->query('search') . '%'))));

        return response()->json(['table_ready' => true, 'rows' => $q->limit(300)->get()->map(fn ($b) => $this->row($b))->values(), 'counts' => Booking::selectRaw('status, count(*) c')->groupBy('status')->pluck('c', 'status')]);
    }

    /** What someone would be shown before booking: length, price, fees, deposit — and who is free then. */
    public function quote(Request $request): JsonResponse
    {
        try {
            $q = $this->svc->quote($request->all());
        } catch (\Throwable $e) {
            return $this->fail($e);
        }

        return response()->json($q);
    }

    public function options(): JsonResponse
    {
        return response()->json(['services' => Service::with(['variants:id,service_id,name,price,status', 'currency:id,code'])->whereHas('variants')->orderBy('name')->get(['id', 'name', 'currency_id'])
            ->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'currency' => $s->currency?->code, 'packages' => $s->variants->where('status', '!=', 'inactive')->map(fn ($v) => ['id' => $v->id, 'name' => $v->name, 'price' => (float) $v->price])->values(),
                'has_resources' => \App\Models\ResourceService::where('service_id', $s->id)->exists()])->values()]);
    }

    public function slots(Request $request): JsonResponse
    {
        $d = $request->validate(['service_id' => 'required|integer', 'service_variant_id' => 'required|integer', 'date' => 'required|date', 'resource_id' => 'nullable|integer']);
        $s = Service::findOrFail($d['service_id']);
        $v = ServiceVariant::with('durationUnit')->where('service_id', $s->id)->findOrFail($d['service_variant_id']);

        return response()->json(['slots' => $this->svc->slots($s, $v, Carbon::parse($d['date']), $d['resource_id'] ?? null), 'minutes' => $this->svc->minutes($v)]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate(['customer_id' => 'required|integer|exists:customers,id', 'service_id' => 'required|integer', 'service_variant_id' => 'required|integer', 'starts_at' => 'required|date',
            'resource_id' => 'nullable|integer', 'people' => 'nullable|integer|min:1|max:500', 'on_site' => 'nullable|boolean', 'address' => 'nullable|string|max:255', 'notes' => 'nullable|string|max:2000', 'price' => 'nullable|numeric|min:0']);
        try {
            $b = $this->svc->create($d + ['source' => 'admin'], $request->user());
        } catch (\Throwable $e) {
            return $this->fail($e);
        }
        $mailed = $this->notice->tryEmail($b, 'booked');

        return response()->json(['booking' => $this->row($b), 'message' => "{$b->number} booked." . ($mailed ? ' The customer was e-mailed.' : ''), 'notice' => $this->notice->info($b)], 201);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(['booking' => $this->row(Booking::findOrFail($id))]);
    }

    public function reschedule(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['starts_at' => 'required|date', 'resource_id' => 'nullable|integer']);
        try {
            $b = $this->svc->reschedule(Booking::findOrFail($id), $d['starts_at'], $d['resource_id'] ?? null, $request->user());
        } catch (\Throwable $e) {
            return $this->fail($e);
        }

        return response()->json(['booking' => $this->row($b), 'message' => 'Moved.' . ($b->fee_voucher_id ? ' The late-move fee was invoiced.' : ''), 'notice' => $this->notice->info($b, 'moved')]);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|string|max:255']);
        try {
            $r = $this->svc->cancel(Booking::findOrFail($id), $request->input('reason'), $request->user());
        } catch (\Throwable $e) {
            return $this->fail($e);
        }

        return response()->json(['booking' => $this->row($r['booking']), 'message' => $r['message'], 'notice' => $this->notice->info($r['booking'], 'cancelled')]);
    }

    public function noShow(Request $request, int $id): JsonResponse
    {
        try {
            $r = $this->svc->noShow(Booking::findOrFail($id), $request->user());
        } catch (\Throwable $e) {
            return $this->fail($e);
        }

        return response()->json(['booking' => $this->row($r['booking']), 'message' => $r['message'], 'notice' => $this->notice->info($r['booking'], 'no_show')]);
    }

    /** The service is done. With ?preview=1 only the invoice figures are worked out. */
    public function complete(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['extra' => 'nullable|array|max:20', 'extra.*.description' => 'nullable|string|max:160', 'extra.*.amount' => 'nullable|numeric|min:0', 'extra.*.ledger_id' => 'nullable|integer']);
        $b = Booking::findOrFail($id);
        try {
            if ($request->boolean('preview')) {
                return response()->json(['preview' => $this->svc->complete($b, $d['extra'] ?? [], $request->user(), true)]);
            }
            $r = $this->svc->complete($b, $d['extra'] ?? [], $request->user());
        } catch (\Throwable $e) {
            return $this->fail($e);
        }
        $b = $b->fresh();

        return response()->json(['booking' => $this->row($b), 'invoice_id' => $r['invoice']->id, 'message' => "Done — invoice {$r['invoice']->voucher_number} raised." . ($r['deposit_released'] ? ' The deposit is on the customer\'s account.' : ''), 'notice' => $this->notice->info($b, 'done')]);
    }

    public function notice(Request $request, int $id): JsonResponse
    {
        return response()->json($this->notice->info(Booking::findOrFail($id), $request->query('event', 'booked')));
    }

    public function email(Request $request, int $id): JsonResponse
    {
        $request->validate(['event' => 'nullable|string', 'to' => 'nullable|email']);
        try {
            $to = $this->notice->email(Booking::findOrFail($id), $request->input('event', 'booked'), $request->input('to'));
        } catch (\Throwable $e) {
            return $this->fail($e);
        }

        return response()->json(['message' => "E-mailed to {$to}."]);
    }
}

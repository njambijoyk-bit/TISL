<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BookableResource;
use App\Models\ResourceHour;
use App\Models\ResourceService;
use App\Models\ResourceTimeOff;
use App\Models\Service;
use App\Models\User;
use App\Services\Calendar\AvailabilityService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Staff, rooms, tables and equipment that can be booked: their working hours, time off and the services each can do. */
class BookableResourceController extends Controller
{
    private function payload(BookableResource $r): array
    {
        $r->load(['hours', 'timeOff' => fn ($q) => $q->where('ends_at', '>=', now())->limit(30), 'services', 'user:id,name,email']);

        return [
            'id' => $r->id, 'type' => $r->type, 'name' => $r->name, 'user' => $r->user ? ['id' => $r->user->id, 'name' => $r->user->name, 'email' => $r->user->email] : null,
            'location_id' => $r->location_id, 'location' => $r->location_id ? DB::table('locations')->where('id', $r->location_id)->value('name') : null,
            'capacity' => $r->capacity, 'buffer_before_min' => $r->buffer_before_min, 'buffer_after_min' => $r->buffer_after_min, 'is_active' => $r->is_active, 'notes' => $r->notes,
            'hours' => $r->hours->map(fn ($h) => ['weekday' => $h->weekday, 'starts_at' => substr($h->starts_at, 0, 5), 'ends_at' => substr($h->ends_at, 0, 5)])->values(),
            'time_off' => $r->timeOff->map(fn ($t) => ['id' => $t->id, 'starts_at' => $t->starts_at->toIso8601String(), 'ends_at' => $t->ends_at->toIso8601String(), 'reason' => $t->reason])->values(),
            'services' => $r->services->map(fn ($s) => ['service_id' => $s->service_id, 'service_variant_id' => $s->service_variant_id])->values(),
            'has_hours' => $r->hours->isNotEmpty(),
        ];
    }

    public function index(): JsonResponse
    {
        $rows = BookableResource::orderBy('type')->orderBy('name')->get()->map(fn ($r) => $this->payload($r))->values();
        $taken = BookableResource::where('type', 'staff')->whereNotNull('user_id')->pluck('user_id');

        return response()->json([
            'rows' => $rows,
            'staff_candidates' => User::whereHas('employee')->whereNotIn('id', $taken)->orderBy('name')->get(['id', 'name', 'email']),
            'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name']),
            'services' => Service::with('variants:id,service_id,name')->orderBy('name')->get(['id', 'name'])->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'packages' => $s->variants->map(fn ($v) => ['id' => $v->id, 'name' => $v->name])->values()])->values(),
        ]);
    }

    private function rules(): array
    {
        return ['name' => 'required|string|max:120', 'location_id' => 'nullable|integer|exists:locations,id', 'capacity' => 'nullable|integer|min:1|max:500',
            'buffer_before_min' => 'nullable|integer|min:0|max:480', 'buffer_after_min' => 'nullable|integer|min:0|max:480', 'is_active' => 'nullable|boolean', 'notes' => 'nullable|string|max:255'];
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules() + ['type' => 'required|in:' . implode(',', BookableResource::TYPES), 'user_id' => 'nullable|integer|exists:users,id']);
        if ($d['type'] === 'staff') {
            if (empty($d['user_id'])) {
                return response()->json(['message' => 'Choose the staff member.'], 422);
            }
            if (BookableResource::where('type', 'staff')->where('user_id', $d['user_id'])->exists()) {
                return response()->json(['message' => 'That person is already bookable.'], 422);
            }
        } else {
            $d['user_id'] = null;
        }
        $r = BookableResource::create($d + ['capacity' => 1, 'buffer_before_min' => 0, 'buffer_after_min' => 0, 'is_active' => true]);

        return response()->json($this->payload($r) + ['message' => "{$r->name} can now be booked — set the working hours next."], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $r = BookableResource::findOrFail($id);
        $r->update($request->validate($this->rules()));

        return response()->json($this->payload($r->fresh()) + ['message' => 'Saved.']);
    }

    /** Switch off rather than delete: bookings may point at it. */
    public function destroy(int $id): JsonResponse
    {
        $r = BookableResource::findOrFail($id);
        $r->update(['is_active' => false]);

        return response()->json($this->payload($r->fresh()) + ['message' => "{$r->name} is switched off and takes no new bookings."]);
    }

    /** Replace the weekly hours. Body: hours[{weekday 0-6, starts_at HH:MM, ends_at HH:MM}]. */
    public function saveHours(Request $request, int $id): JsonResponse
    {
        $r = BookableResource::findOrFail($id);
        $d = $request->validate(['hours' => 'present|array|max:60', 'hours.*.weekday' => 'required|integer|min:0|max:6', 'hours.*.starts_at' => 'required|date_format:H:i', 'hours.*.ends_at' => 'required|date_format:H:i']);
        foreach ($d['hours'] as $h) {
            if ($h['ends_at'] <= $h['starts_at']) {
                return response()->json(['message' => 'Each stretch must end after it starts.'], 422);
            }
        }
        $byDay = collect($d['hours'])->groupBy('weekday');
        foreach ($byDay as $day => $rows) {
            $sorted = $rows->sortBy('starts_at')->values();
            for ($i = 1; $i < $sorted->count(); $i++) {
                if ($sorted[$i]['starts_at'] < $sorted[$i - 1]['ends_at']) {
                    return response()->json(['message' => 'Two stretches on the same day overlap.'], 422);
                }
            }
        }
        DB::transaction(function () use ($r, $d) {
            ResourceHour::where('resource_id', $r->id)->delete();
            foreach ($d['hours'] as $h) {
                ResourceHour::create(['resource_id' => $r->id, 'weekday' => $h['weekday'], 'starts_at' => $h['starts_at'] . ':00', 'ends_at' => $h['ends_at'] . ':00']);
            }
        });

        return response()->json($this->payload($r->fresh()) + ['message' => 'Working hours saved.']);
    }

    public function addTimeOff(Request $request, int $id): JsonResponse
    {
        $r = BookableResource::findOrFail($id);
        $d = $request->validate(['starts_at' => 'required|date', 'ends_at' => 'required|date|after:starts_at', 'reason' => 'nullable|string|max:160']);
        ResourceTimeOff::create($d + ['resource_id' => $r->id, 'created_by' => $request->user()->id]);

        return response()->json($this->payload($r->fresh()) + ['message' => 'Time off added.']);
    }

    public function removeTimeOff(int $id, int $offId): JsonResponse
    {
        ResourceTimeOff::where('resource_id', $id)->where('id', $offId)->delete();

        return response()->json($this->payload(BookableResource::findOrFail($id)) + ['message' => 'Removed.']);
    }

    /** Replace the services a resource can do. Body: services[{service_id, service_variant_id?}]. */
    public function saveServices(Request $request, int $id): JsonResponse
    {
        $r = BookableResource::findOrFail($id);
        $d = $request->validate(['services' => 'present|array|max:200', 'services.*.service_id' => 'required|integer|exists:services,id', 'services.*.service_variant_id' => 'nullable|integer|exists:service_variants,id']);
        DB::transaction(function () use ($r, $d) {
            ResourceService::where('resource_id', $r->id)->delete();
            foreach (collect($d['services'])->unique(fn ($s) => ($s['service_id']) . '-' . ($s['service_variant_id'] ?? 0)) as $s) {
                ResourceService::create(['resource_id' => $r->id, 'service_id' => $s['service_id'], 'service_variant_id' => $s['service_variant_id'] ?? null]);
            }
        });

        return response()->json($this->payload($r->fresh()) + ['message' => 'Services saved.']);
    }

    /** When could a booking of this length start on a day? (a preview of the availability rules) */
    public function slots(Request $request, int $id, AvailabilityService $availability): JsonResponse
    {
        $r = BookableResource::findOrFail($id);
        $d = $request->validate(['date' => 'required|date', 'duration' => 'required|integer|min:5|max:1440']);

        return response()->json(['date' => Carbon::parse($d['date'])->toDateString(), 'slots' => $availability->freeSlots($r, Carbon::parse($d['date']), (int) $d['duration'])]);
    }
}

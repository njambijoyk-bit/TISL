<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryItem;
use App\Models\DeliveryManifest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

/**
 * A customer's view of the manifest carrying their goods while it is on the road.
 * They see their own stop(s), how many stops are ahead of them, the driver and where the driver is — never another
 * customer's name, address or items (other stops show only as numbered points on the route).
 */
class CustomerEnrouteController extends Controller
{
    private const LIVE = ['dispatched', 'in_progress'];

    private function customerId(): int
    {
        $id = Auth::user()?->customer?->id;
        abort_unless($id, 403, 'No customer profile linked to this account.');

        return (int) $id;
    }

    /** Every delivery of theirs that is on a manifest now on the road. */
    public function index(): JsonResponse
    {
        $stops = DeliveryItem::where('customer_id', $this->customerId())
            ->whereNotIn('status', ['failed', 'returned'])
            ->whereHas('manifest', fn ($q) => $q->whereIn('status', self::LIVE))
            ->with(['manifest.driver:id,name,phone', 'notes.voucher:id,voucher_number'])
            ->get();

        $data = $stops->groupBy('manifest_id')->map(function ($mine) {
            $m = $mine->first()->manifest;

            return $this->summary($m, $mine);
        })->values();

        return response()->json(['data' => $data]);
    }

    /** One manifest on the road, from the point of view of the customer who has a stop on it. */
    public function show(int $manifestId): JsonResponse
    {
        $cid = $this->customerId();
        $m = DeliveryManifest::with(['driver:id,name,phone', 'items' => fn ($q) => $q->orderBy('sort_order')])->findOrFail($manifestId);
        $mine = $m->items->where('customer_id', $cid)->values();
        abort_if($mine->isEmpty(), 404, 'Not found.');   // not theirs: same answer as a missing one
        $mine->load('notes.voucher:id,voucher_number');

        $out = $this->summary($m, $mine);
        $out['route_preview'] = $m->items->map(fn ($i) => [
            'stop_number' => $i->sort_order, 'lat' => $i->delivery_latitude !== null ? (float) $i->delivery_latitude : null,
            'lng' => $i->delivery_longitude !== null ? (float) $i->delivery_longitude : null, 'status' => $i->status, 'is_yours' => $i->customer_id === $cid,
        ])->values();
        $out['trail'] = in_array($m->status, self::LIVE, true) && $m->delivery_method === 'internal_driver'
            ? $m->locationPings()->latest('pinged_at')->limit(60)->get()->map(fn ($p) => ['lat' => (float) $p->latitude, 'lng' => (float) $p->longitude, 'time' => $p->pinged_at?->toISOString()])->values()
            : [];

        return response()->json(['data' => $out]);
    }

    private function summary(DeliveryManifest $m, $mine): array
    {
        $all = $m->relationLoaded('items') ? $m->items : $m->items()->orderBy('sort_order')->get();
        $open = fn ($i) => ! in_array($i->status, ['delivered', 'failed', 'returned'], true);
        $first = $mine->sortBy('sort_order')->first();
        $internal = $m->delivery_method === 'internal_driver';
        $ping = $internal && in_array($m->status, self::LIVE, true) ? $m->locationPings()->latest('pinged_at')->first() : null;

        return [
            'manifest_id'     => $m->id,
            'manifest_number' => $m->manifest_number,
            'status'          => $m->status,
            'delivery_method' => $m->delivery_method,
            'scheduled_date'  => $m->scheduled_date?->toDateString(),
            'dispatched_at'   => $m->dispatched_at?->toISOString(),
            'started_at'      => $m->started_at?->toISOString(),
            'driver'          => $internal && $m->driver ? ['name' => $m->driver->name, 'phone' => $m->driver->phone] : null,
            'total_stops'     => $all->count(),
            'stops_done'      => $all->filter(fn ($i) => ! $open($i))->count(),
            'current_stop_number' => $all->first($open)?->sort_order,
            'driver_position' => $ping ? ['lat' => (float) $ping->latitude, 'lng' => (float) $ping->longitude, 'speed' => $ping->speed_kmh, 'time' => $ping->pinged_at?->toISOString()] : null,
            'your_stops'      => $mine->sortBy('sort_order')->map(fn ($i) => [
                'stop_id' => $i->id, 'stop_number' => $i->sort_order, 'status' => $i->status, 'address' => $i->address,
                'estimated_arrival' => $i->estimated_arrival?->toISOString(), 'delivered_at' => $i->delivered_at?->toISOString(),
                'stops_ahead' => $all->filter(fn ($o) => $open($o) && $o->sort_order < $i->sort_order && $o->id !== $i->id)->count(),
                'delivery_notes' => $i->notes->map->voucher->filter()->map(fn ($v) => ['id' => $v->id, 'number' => $v->voucher_number])->values(),
                'lat' => $i->delivery_latitude !== null ? (float) $i->delivery_latitude : null, 'lng' => $i->delivery_longitude !== null ? (float) $i->delivery_longitude : null,
            ])->values(),
            'next_stop_is_yours' => $first && $all->first($open)?->id === $first->id,
        ];
    }
}

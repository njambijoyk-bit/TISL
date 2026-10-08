<?php

namespace App\Services\Delivery;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\DeliveryItem;
use App\Models\DeliveryItemVoucher;
use App\Models\DeliveryManifest;
use Illuminate\Support\Collection;

/**
 * Manifests are built from Delivery Notes. A stop is one place a driver goes to; two Delivery Notes for the same
 * customer and address are ONE stop. A failed or returned stop leaves its Delivery Notes alone: they are simply free
 * for another manifest. Nothing here touches a voucher.
 */
class DeliveryStopService
{
    /** Stop statuses that hand the Delivery Note back (it can be put on another manifest). */
    public const RELEASED = ['failed', 'returned'];

    /** Delivery Notes that are on a live stop, keyed by voucher id => the stop (with its manifest). */
    public function taken(array $voucherIds): Collection
    {
        $links = DeliveryItemVoucher::whereIn('voucher_id', $voucherIds)
            ->whereHas('stop', fn ($q) => $q->whereNotIn('status', self::RELEASED)
                ->whereHas('manifest', fn ($m) => $m->where('status', '!=', 'cancelled')))
            ->with('stop.manifest:id,manifest_number,status')
            ->get();

        return $links->keyBy('voucher_id');
    }

    /** Per Delivery Note: can it go on a manifest, and if not, why (not_found | not_delivery_note | status | in_manifest | delivered). */
    public function eligibility(array $voucherIds): array
    {
        $vouchers = Voucher::with('type:id,base_type')->whereIn('id', $voucherIds)->get()->keyBy('id');
        $taken    = $this->taken($voucherIds);
        $out      = [];

        foreach ($voucherIds as $id) {
            $v    = $vouchers->get($id);
            $base = ['order_id' => (int) $id, 'voucher_id' => (int) $id, 'order_number' => $v?->voucher_number, 'voucher_number' => $v?->voucher_number];
            if (! $v) {
                $out[] = $base + ['eligible' => false, 'reason' => 'not_found'];
            } elseif ($v->type?->base_type !== VoucherType::DELIVERY_NOTE) {
                $out[] = $base + ['eligible' => false, 'reason' => 'not_delivery_note'];
            } elseif ($v->status !== Voucher::POSTED) {
                $out[] = $base + ['eligible' => false, 'reason' => 'status', 'status' => $v->status];
            } elseif ($link = $taken->get($id)) {
                $stop = $link->stop;
                $out[] = $base + ['eligible' => false, 'reason' => $stop->status === 'delivered' ? 'delivered' : 'in_manifest',
                    'manifest_number' => $stop->manifest?->manifest_number, 'manifest_status' => $stop->manifest?->status, 'manifest_id' => $stop->manifest_id];
            } else {
                $out[] = $base + ['eligible' => true, 'reason' => null];
            }
        }

        return $out;
    }

    /**
     * Put Delivery Notes on a manifest, one stop per customer + address (joining a pending stop already on it).
     *
     * @return array{added:int, stops:int, skipped:array}
     */
    public function attach(DeliveryManifest $manifest, array $voucherIds): array
    {
        $voucherIds = array_values(array_unique(array_map('intval', $voucherIds)));
        $check      = collect($this->eligibility($voucherIds));
        $skipped    = $check->where('eligible', false)->map(fn ($r) => array_intersect_key($r, array_flip(['order_id', 'voucher_id', 'voucher_number', 'reason', 'manifest_number', 'manifest_status', 'manifest_id', 'status'])))->values()->all();
        $okIds      = $check->where('eligible', true)->pluck('voucher_id')->all();
        if (! $okIds) {
            return ['added' => 0, 'stops' => 0, 'skipped' => $skipped];
        }

        $vouchers = Voucher::with('customer')->whereIn('id', $okIds)->orderBy('date')->orderBy('id')->get();
        $stops    = $manifest->items()->where('status', 'pending')->whereNotNull('stop_key')->get()->keyBy('stop_key');
        $sort     = (int) ($manifest->items()->max('sort_order') ?? 0);
        $added    = 0;
        $newStops = 0;

        foreach ($vouchers as $v) {
            $d    = $this->describe($v);
            $stop = $stops->get($d['stop_key']);
            if (! $stop) {
                $stop = DeliveryItem::create([
                    'manifest_id' => $manifest->id, 'status' => 'pending', 'sort_order' => ++$sort,
                    'customer_id' => $d['customer_id'], 'contact_name' => $d['contact_name'], 'contact_phone' => $d['contact_phone'],
                    'address' => $d['address'], 'stop_key' => $d['stop_key'],
                    'delivery_latitude' => $d['latitude'], 'delivery_longitude' => $d['longitude'],
                ]);
                $stops->put($d['stop_key'], $stop);
                $newStops++;
            }
            DeliveryItemVoucher::firstOrCreate(['delivery_item_id' => $stop->id, 'voucher_id' => $v->id]);
            $added++;
        }

        return ['added' => $added, 'stops' => $newStops, 'skipped' => $skipped];
    }

    /** Who, where and the grouping key for a Delivery Note. */
    public function describe(Voucher $v): array
    {
        $c       = $v->customer;
        $address = $this->clean($v->party_address);
        $addr    = null;
        if ($c) {
            $addrs = CustomerAddress::where('customer_id', $c->id)->get();
            $norm  = $this->normalise($address);
            $addr  = ($norm !== '' ? $addrs->first(fn ($a) => $this->normalise($a->full_address ?? '') === $norm) : null)
                ?? $addrs->firstWhere('is_default_shipping', true) ?? $addrs->first();
            if ($address === '' && $addr) {
                $address = $this->clean($addr->full_address ?? '');
            }
        }

        $name  = $this->clean($v->party_name) ?: ($c ? trim(($c->first_name ?? '') . ' ' . ($c->last_name ?? '')) : '');
        $phone = $this->clean($v->party_phone) ?: ($c->phone ?? null);
        $key   = ($c ? 'c' . $c->id : 'n' . $this->normalise($name)) . '|' . $this->normalise($address);

        return [
            'customer_id' => $c?->id, 'contact_name' => $name ?: null, 'contact_phone' => $phone ?: null,
            'address' => $address ?: null, 'stop_key' => mb_substr($key, 0, 250),
            'latitude' => $addr?->latitude, 'longitude' => $addr?->longitude,
        ];
    }

    /** Take a stop off its manifest (its Delivery Notes are not touched, so they are free again). */
    public function removeStop(DeliveryItem $stop): void
    {
        $stop->notes()->delete();
        $stop->delete();
    }

    /** The Delivery Notes on a set of stops. */
    public function voucherIdsOf($stops): array
    {
        return DeliveryItemVoucher::whereIn('delivery_item_id', collect($stops)->pluck('id'))->pluck('voucher_id')->unique()->values()->all();
    }

    /**
     * Delivery status of Delivery Notes for the register: delivered | out | on_manifest | failed | null (not on a manifest).
     * Latest stop wins; a failed or returned one only shows if nothing newer holds the note.
     *
     * @return array<int, array{status:string, manifest_number:?string, delivered_at:?string}>
     */
    public function statusFor(array $voucherIds): array
    {
        if (! $voucherIds) {
            return [];
        }
        $rows = DeliveryItemVoucher::whereIn('voucher_id', $voucherIds)->with(['stop.manifest:id,manifest_number,status'])->orderBy('id')->get();
        $out  = [];
        foreach ($rows as $r) {
            $stop = $r->stop;
            if (! $stop || $stop->manifest?->status === 'cancelled') {
                continue;
            }
            $s = match ($stop->status) {
                'delivered' => 'delivered', 'out_for_delivery' => 'out', 'failed', 'returned' => 'failed', default => 'on_manifest',
            };
            $out[$r->voucher_id] = ['status' => $s, 'manifest_number' => $stop->manifest?->manifest_number, 'delivered_at' => $stop->delivered_at?->toDateTimeString()];
        }

        return $out;
    }

    /**
     * The Delivery Notes behind a document the customer holds: the note itself, or the Sales Order / invoice it
     * came from or led to (up and down the source chain). A customer only reaches their own documents.
     *
     * @return int[]
     */
    public function noteIdsFor(int $voucherId, ?\App\Models\User $user = null): array
    {
        $v = Voucher::find($voucherId);
        abort_unless($v, 404, 'Not found.');
        if ($user && $user->holdsAny(['customer'])) {
            $cid = Customer::where('user_id', $user->id)->value('id');
            abort_unless($cid && (int) $v->customer_id === (int) $cid, 404, 'Not found.');
        }

        $seen = [$v->id];
        $edge = [$v->id];
        for ($i = 0; $i < 3 && $edge; $i++) {   // order → note → invoice is two steps either way
            $next = Voucher::whereIn('source_voucher_id', $edge)->pluck('id')
                ->merge(Voucher::whereIn('id', $edge)->whereNotNull('source_voucher_id')->pluck('source_voucher_id'))
                ->unique()->diff($seen)->values()->all();
            $seen = array_merge($seen, $next);
            $edge = $next;
        }

        return Voucher::whereIn('id', $seen)->whereHas('type', fn ($q) => $q->where('base_type', VoucherType::DELIVERY_NOTE))->pluck('id')->all();
    }

    private function clean(?string $s): string
    {
        return trim(preg_replace('/\s+/', ' ', (string) $s));
    }

    private function normalise(?string $s): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', ' ', mb_strtolower((string) $s)));
    }
}

<?php

namespace App\Services\Preorders;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\PreorderOffer;
use App\Models\VariantLocationStock;
use App\Services\Campaigns\CampaignStatus;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * The preorder overview (Orders → Preorder overview). Everything here is worked out from the offers, the orders and the purchase orders when the page is asked
 * for; nothing is stored. It answers: what is on offer and how full is it, what is owed and is there stock or stock on order to cover it, what is late,
 * what is waiting for a decision, how long deliveries take, and how many people cancel.
 */
class PreorderDashboard
{
    public const DAYS = 30;
    public const WINDOW_DAYS = 90;

    public function __construct(private PreorderService $preorders, private PreorderSupply $supply) {}

    /** @return array<string,mixed> */
    public function summary(CarbonInterface $today): array
    {
        $offers = $this->offers($today);
        $late = $this->preorders->overdue($today);
        $paid = $this->preorders->paidNotDelivered();

        return [
            'headline' => [
                'open_offers' => collect($offers)->where('status', 'open')->count(),
                'units_taken' => round(collect($offers)->sum('taken'), 4),
                'units_owed' => round(collect($offers)->sum('owed'), 4),
                'units_short' => round(collect($offers)->sum('short'), 4),
                'offers_short' => collect($offers)->where('short', '>', 0)->count(),
                'paid_not_delivered' => $paid,
                'late_orders' => count($late),
                'oldest_late_days' => $late ? max(array_column($late, 'days')) : 0,
                'cancel_requests' => $this->pendingCancels(),
                'avg_days_to_deliver' => $this->averageDaysToDeliver($today),
                'cancel_rate' => $this->cancelRate($today),
            ],
            'offers' => $offers,
            'per_day' => $this->perDay($today),
            'late' => collect($late)->sortByDesc('days')->take(10)->map(fn ($r) => ['order_id' => $r['order']->id, 'number' => $r['order']->voucher_number, 'promised' => $r['promised'], 'days' => $r['days'], 'owed' => $r['owed']])->values()->all(),
            'window_days' => self::WINDOW_DAYS,
        ];
    }

    /** Every offer with how full it is and whether what is owed on it is covered. @return array<int, array<string,mixed>> */
    private function offers(CarbonInterface $today): array
    {
        $offers = PreorderOffer::with(['campaign', 'variant.product:id,name'])->orderByDesc('id')->get();
        $ids = $offers->pluck('id')->all();
        $taken = $this->preorders->takenByOffer($ids);
        $supply = $this->supply->forOffers($ids);
        $out = [];
        foreach ($offers as $o) {
            $left = $o->limit_total === null ? null : max(0.0, round((float) $o->limit_total - ($taken[$o->id] ?? 0), 4));
            $owed = round(array_sum($this->preorders->committedByLocation((int) $o->variant_id)), 4);
            $stock = round((float) VariantLocationStock::where('product_variant_id', $o->variant_id)->sum('quantity'), 4);
            $incoming = $supply[$o->id]['incoming'];
            $v = $o->variant;
            $out[] = [
                'id' => $o->id, 'campaign_id' => $o->campaign_id, 'campaign' => $o->campaign?->title, 'item' => $v?->product?->name, 'option' => $v && $v->name && $v->name !== $v->product?->name ? $v->name : null,
                'status' => $this->status($o, $left, $today), 'limit_total' => $o->limit_total, 'taken' => round($taken[$o->id] ?? 0, 4), 'places_left' => $left === null ? null : (int) floor($left),
                'closes_at' => $o->closes_at?->toIso8601String(), 'expected' => $supply[$o->id]['date'] ?? ($o->expected_until ?? $o->expected_from)?->toDateString(), 'from_supply' => $supply[$o->id]['date'] !== null,
                'owed' => $owed, 'stock' => $stock, 'incoming' => $incoming, 'short' => max(0.0, round($owed - $stock - $incoming, 4)),
            ];
        }

        return $out;
    }

    /** open | full | stopped | closed | scheduled | ended */
    private function status(PreorderOffer $o, ?float $left, CarbonInterface $today): string
    {
        if (! $o->is_active) {
            return 'stopped';
        }
        $c = $o->campaign ? CampaignStatus::of($o->campaign, $today) : 'ended';
        if (in_array($c, ['scheduled', 'teaser'], true)) {
            return 'scheduled';
        }
        if ($c !== 'live') {
            return 'ended';
        }
        if ($o->closes_at && $today->gte($o->closes_at)) {
            return 'closed';
        }

        return $left !== null && $left <= 0.00005 ? 'full' : 'open';
    }

    /** The preorders themselves: Sales Orders flagged as preorders (what is made from them carries the flag too, but is not another preorder). */
    private function orders(string $alias): \Illuminate\Database\Query\Builder
    {
        return DB::table("vouchers as {$alias}")->join('voucher_types as ot', 'ot.id', '=', "{$alias}.voucher_type_id")->where('ot.base_type', VoucherType::SALES_ORDER)->whereNotNull("{$alias}.meta->preorder");
    }

    private function pendingCancels(): int
    {
        return Voucher::where('meta->cancel_request->status', 'requested')->count();
    }

    /** Preorders taken per day, for the last DAYS days, empty days included. @return array<int, array{date: string, orders: int, units: float}> */
    private function perDay(CarbonInterface $today): array
    {
        $from = $today->copy()->subDays(self::DAYS - 1)->startOfDay();
        $rows = $this->orders('v')->leftJoin('voucher_items as i', function ($j) {
            $j->on('i.voucher_id', '=', 'v.id')->where('i.is_header', 0);
        })->where('v.status', Voucher::POSTED)->whereDate('v.date', '>=', $from->toDateString())->whereDate('v.date', '<=', $today->toDateString())
            ->groupBy('v.date')->selectRaw('v.date AS d, COUNT(DISTINCT v.id) AS orders, COALESCE(SUM(i.quantity * i.unit_factor), 0) AS units')->get()->keyBy(fn ($r) => substr((string) $r->d, 0, 10));
        $out = [];
        for ($d = $from->copy(); $d->lte($today); $d->addDay()) {
            $r = $rows[$d->toDateString()] ?? null;
            $out[] = ['date' => $d->toDateString(), 'orders' => (int) ($r->orders ?? 0), 'units' => round((float) ($r->units ?? 0), 4)];
        }

        return $out;
    }

    /** From the day a preorder was taken to its first delivery note, averaged over the preorders first delivered in the last WINDOW_DAYS days. Null with none. */
    private function averageDaysToDeliver(CarbonInterface $today): ?float
    {
        $rows = DB::table('vouchers as dn')->join('voucher_types as t', 't.id', '=', 'dn.voucher_type_id')->join('vouchers as so', 'so.id', '=', 'dn.source_voucher_id')
            ->where('t.base_type', VoucherType::DELIVERY_NOTE)->where('dn.status', Voucher::POSTED)->whereNotNull('so.meta->preorder')
            ->groupBy('so.id', 'so.date')->selectRaw('so.date AS ordered, MIN(dn.date) AS delivered')->get();
        $days = [];
        foreach ($rows as $r) {
            $delivered = \Carbon\Carbon::parse($r->delivered);
            if ($delivered->lt($today->copy()->subDays(self::WINDOW_DAYS)->startOfDay())) {
                continue;
            }
            $days[] = max(0, (int) \Carbon\Carbon::parse($r->ordered)->startOfDay()->diffInDays($delivered->startOfDay()));
        }

        return $days ? round(array_sum($days) / count($days), 1) : null;
    }

    /** Preorders cancelled at the customer's request, as a share of the preorders taken in the last WINDOW_DAYS days. Null with none taken. */
    private function cancelRate(CarbonInterface $today): ?float
    {
        $since = $today->copy()->subDays(self::WINDOW_DAYS)->toDateString();
        $taken = $this->orders('v')->where('v.status', Voucher::POSTED)->whereDate('v.date', '>=', $since)->count();
        if ($taken === 0) {
            return null;
        }
        $cancelled = $this->orders('v')->where('v.meta->cancel_request->status', 'approved')->whereDate('v.date', '>=', $since)->count();

        return round($cancelled / $taken, 4);
    }
}

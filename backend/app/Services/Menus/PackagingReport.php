<?php

namespace App\Services\Menus;

use App\Models\Menus\OrderPackaging;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Why packaging was left off (Menus, Operations, Packaging): for a period and a branch, what the rules asked for against what the orders ended with, by item and by the reason the cashier gave
 * (the customer brought their own pot), what was waived and who by, and the latest orders. It is the evidence for a change such as moving to eco-friendly packaging. Cancelled orders are left out.
 */
class PackagingReport
{
    /**
     * @return array{ready: bool, from: string, to: string, totals: array<string, mixed>, by_item: array<int, array<string, mixed>>, by_reason: array<int, array<string, mixed>>, latest: array<int, array<string, mixed>>}
     */
    public function build(int $locationId, string $from, string $to): array
    {
        $empty = ['ready' => PackagingCheckout::installed(), 'from' => $from, 'to' => $to, 'totals' => ['orders' => 0, 'asked' => 0, 'given' => 0, 'left_off' => 0, 'lines_changed' => 0, 'swapped' => 0, 'added' => 0, 'waived' => 0.0], 'by_item' => [], 'by_reason' => [], 'latest' => []];
        if (! $empty['ready']) {
            return $empty;
        }
        $waivedCols = Schema::hasColumn('menus_order_packaging', 'waived_amount');
        $rows = OrderPackaging::query()->join('menus_orders as o', 'o.id', '=', 'menus_order_packaging.order_id')
            ->where('o.location_id', $locationId)->where('o.status', '!=', 'cancelled')
            ->whereDate('o.created_at', '>=', $from)->whereDate('o.created_at', '<=', $to)
            ->select('menus_order_packaging.*', 'o.number as order_number', 'o.created_at as order_at')->orderByDesc('menus_order_packaging.id')->get();
        if ($rows->isEmpty()) {
            return $empty;
        }
        $changed = $rows->filter(fn ($r) => $r->source !== 'rule' || (int) $r->quantity !== (int) $r->asked);   // a line the cashier did not touch is not in the story
        $short = fn ($r) => max(0, (int) $r->asked - (int) $r->quantity);
        $was = \App\Models\Menus\IngredientItem::with('ingredient')->whereIn('id', $rows->pluck('replaces_item_id')->filter()->unique())->get()->keyBy('id');
        $byItem = [];
        foreach ($rows as $r) {
            $key = $r->source === 'swapped' ? 'swap:'.$r->replaces_item_id.':'.$r->item_id : (string) $r->item_id;
            $original = $r->source === 'swapped' ? ($was[$r->replaces_item_id]?->ingredient?->name ?? 'the original item') : null;
            $byItem[$key] ??= ['name' => $original ? "{$original} swapped for {$r->name}" : $r->name, 'asked' => 0, 'given' => 0, 'times_changed' => 0, 'waived' => 0.0];
            $byItem[$key]['asked'] += (int) $r->asked;
            $byItem[$key]['given'] += (int) $r->quantity;
            $byItem[$key]['times_changed'] += $changed->contains('id', $r->id) ? 1 : 0;
            $byItem[$key]['waived'] += $waivedCols ? (float) $r->waived_amount : 0.0;
        }
        $reasons = [];
        foreach ($changed->filter(fn ($r) => $short($r) > 0) as $r) {   // a swap is counted on its own; the reasons are for what was left off
            $label = $r->reason !== null && trim($r->reason) !== '' ? mb_strtolower(trim(preg_replace('/\s+/', ' ', $r->reason))) : null;
            $key = $label ?? '';
            $reasons[$key] ??= ['reason' => $label, 'times' => 0, 'units' => 0];
            $reasons[$key]['times']++;
            $reasons[$key]['units'] += $short($r);
        }
        usort($reasons, fn ($a, $b) => [$b['times'], $b['units']] <=> [$a['times'], $a['units']]);
        $ids = $changed->pluck('created_by')->filter()->unique();
        $users = $ids->isEmpty() ? collect() : DB::table('users')->whereIn('id', $ids)->pluck('name', 'id');

        return ['ready' => true, 'from' => $from, 'to' => $to,
            'totals' => ['orders' => $rows->pluck('order_id')->unique()->count(), 'asked' => (int) $rows->sum('asked'), 'given' => (int) $rows->sum('quantity'), 'left_off' => (int) $changed->sum(fn ($r) => $short($r)),
                'lines_changed' => $changed->count(), 'swapped' => $rows->where('source', 'swapped')->count(), 'added' => $rows->where('source', 'added')->count(), 'waived' => round($waivedCols ? (float) $rows->sum('waived_amount') : 0.0, 2)],
            'by_item' => collect($byItem)->map(fn ($i) => $i + ['left_off' => max(0, $i['asked'] - $i['given'])])->sortByDesc('times_changed')->values()->all(),
            'by_reason' => $reasons,
            'latest' => $changed->take(60)->map(fn ($r) => ['at' => $r->order_at, 'order' => $r->order_number, 'item' => $r->name, 'asked' => (int) $r->asked, 'given' => (int) $r->quantity, 'source' => $r->source, 'reason' => $r->reason,
                'waived' => $waivedCols ? (float) $r->waived_amount : 0.0, 'by' => $users[$r->created_by] ?? null])->values()->all()];
    }
}

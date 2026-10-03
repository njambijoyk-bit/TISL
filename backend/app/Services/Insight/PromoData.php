<?php

namespace App\Services\Insight;

use App\Services\Books\RestatedBase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** What the promo and customer insights read: logged promo uses, and plain sales for a baseline. Read-only. */
class PromoData
{
    /** Completed promo uses in the window (amounts are base currency already), with their code. */
    public static function uses(Lookback $lb, ?int $codeId = null): Collection
    {
        return DB::table('referral_code_usage as u')->join('referral_codes as c', 'c.id', '=', 'u.referral_code_id')
            ->where('u.status', 'completed')->whereBetween(DB::raw('DATE(u.completed_at)'), [$lb->from->toDateString(), $lb->to->toDateString()])
            ->when($codeId, fn ($q) => $q->where('u.referral_code_id', $codeId))
            ->get(['u.referral_code_id', 'u.customer_id', 'u.discount_amount', 'u.order_value', 'u.final_price', 'u.completed_at', 'c.name', 'c.code', 'c.reward_type', 'c.reward_value'])
            ->map(function ($r) { foreach (['discount_amount', 'order_value', 'final_price', 'reward_value'] as $k) { $r->$k = (float) $r->$k; } return $r; });
    }

    /** Every posted sale in the window (guests too): count and the average, in today's base currency. */
    public static function baseline(Lookback $lb): array
    {
        $q = RestatedBase::join(DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id'))
            ->where('v.status', 'posted')->whereIn('t.base_type', ['sales', 'cash_sale'])->whereBetween('v.date', [$lb->from->toDateString(), $lb->to->toDateString()])
            ->selectRaw('COUNT(*) as n, COALESCE(SUM(' . RestatedBase::total('v', 'cu') . '), 0) as total')->first();

        return ['orders' => (int) $q->n, 'revenue' => round((float) $q->total, 2), 'aov' => $q->n ? round((float) $q->total / $q->n, 2) : 0.0];
    }

    public static function pct(float $part, float $whole): float
    {
        return $whole > 0 ? round($part / $whole * 100, 2) : 0.0;
    }

    /** Four order-size bands (quartiles) with how many orders and what the discount was as a share of them. */
    public static function bands(Collection $uses): array
    {
        $sorted = $uses->sortBy('order_value')->values();
        $n = $sorted->count();
        if ($n < 4) {
            return [];
        }
        $out = [];
        foreach ([[0, 0.25, 'Smallest quarter'], [0.25, 0.5, 'Lower middle'], [0.5, 0.75, 'Upper middle'], [0.75, 1.0001, 'Largest quarter']] as [$a, $b, $label]) {
            $g = $sorted->slice((int) floor($n * $a), (int) (ceil($n * min($b, 1)) - floor($n * $a)));
            if ($g->isEmpty()) {
                continue;
            }
            $out[] = ['label' => $label, 'orders' => $g->count(), 'avg_order' => round($g->avg('order_value'), 2), 'avg_discount' => round($g->avg('discount_amount'), 2), 'pct' => self::pct((float) $g->sum('discount_amount'), (float) $g->sum('order_value'))];
        }

        return $out;
    }
}

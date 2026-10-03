<?php

namespace App\Services\Insight;

use App\Models\Currency;
use App\Models\CustomerTier;
use App\Models\LoyaltySetting;
use App\Services\Books\RestatedBase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** What the loyalty insights read: real sales in the look-back window, each customer's tier multiplier, points held, gift vouchers. Read-only. */
class LoyaltyData
{
    /** Posted sales and cash sales of customers in the window, in today's base currency, with the customer's tier multiplier. */
    public static function sales(Lookback $lb): Collection
    {
        $mult = CustomerTier::pluck('loyalty_points_multiplier', 'slug');
        $q = RestatedBase::join(DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->join('customers as c', 'c.id', '=', 'v.customer_id'))
            ->where('v.status', 'posted')->whereIn('t.base_type', ['sales', 'cash_sale'])
            ->whereBetween('v.date', [$lb->from->toDateString(), $lb->to->toDateString()])
            ->whereNull('c.deleted_at')
            ->selectRaw('v.id, v.customer_id, v.date, ' . RestatedBase::total('v', 'cu') . ' as amount, c.tier, c.first_name, c.last_name, c.loyalty_points');

        return $q->get()->map(function ($r) use ($mult) {
            $r->amount = (float) $r->amount;
            $r->multiplier = (float) ($mult[$r->tier] ?? 1.0);
            $r->name = trim($r->first_name . ' ' . $r->last_name);

            return $r;
        });
    }

    /** Points a sale earns at a given rate: whole hundreds × rate × the customer's tier multiplier. */
    public static function points(float $amount, int $rate, float $multiplier): int
    {
        return (int) round((int) floor($amount / 100) * $rate * $multiplier);
    }

    /** @return array{revenue:float, orders:int, aov:float, avg_multiplier:float, tiers:array, customers:Collection} */
    public static function summary(Collection $sales): array
    {
        $rev = (float) $sales->sum('amount');
        $orders = $sales->count();
        $weighted = $rev > 0 ? $sales->sum(fn ($s) => $s->amount * $s->multiplier) / $rev : 1.0;
        $tiers = $sales->groupBy(fn ($s) => $s->tier ?: '—')->map(fn ($g, $slug) => ['tier' => $slug, 'customers' => $g->pluck('customer_id')->unique()->count(), 'orders' => $g->count(),
            'revenue' => round($g->sum('amount'), 2), 'share' => $rev > 0 ? round($g->sum('amount') / $rev * 100, 1) : 0.0, 'multiplier' => (float) $g->first()->multiplier])->sortByDesc('revenue')->values()->all();
        $customers = $sales->groupBy('customer_id')->map(fn ($g) => (object) ['id' => $g->first()->customer_id, 'name' => $g->first()->name, 'tier' => $g->first()->tier, 'multiplier' => $g->first()->multiplier,
            'orders' => $g->count(), 'spend' => round($g->sum('amount'), 2), 'points_held' => (int) $g->first()->loyalty_points])->sortByDesc('spend')->values();

        return ['revenue' => round($rev, 2), 'orders' => $orders, 'aov' => $orders ? round($rev / $orders, 2) : 0.0, 'avg_multiplier' => round($weighted, 4), 'tiers' => $tiers, 'customers' => $customers];
    }

    /** The loyalty settings as saved, with any unsaved values the page has typed laid over them. */
    public static function settings(array $draft = []): array
    {
        $pick = fn ($k, $default) => isset($draft[$k]) && $draft[$k] !== '' ? $draft[$k] : LoyaltySetting::get($k, $default);

        return [
            'rate' => max(1, (int) $pick('points_per_100_kes', 1)),
            'min_points' => max(1, (int) $pick('min_redemption_points', 500)),
            'expiry_months' => ($e = $pick('points_expiry_months', null)) !== null && $e !== '' ? (int) $e : null,
            'cap_pct' => (float) $pick('store_credit_max_pct', 50),
        ];
    }

    /** Active gift vouchers with a balance: who holds them and how much, in base currency. */
    public static function giftBalances(): Collection
    {
        return DB::table('gift_vouchers as g')->leftJoin('customers as c', 'c.id', '=', 'g.customer_id')->where('g.status', 'active')->where('g.balance', '>', 0)->whereNotNull('g.customer_id')
            ->selectRaw('g.customer_id, SUM(COALESCE(g.base_balance, g.balance)) as balance, c.first_name, c.last_name')->groupBy('g.customer_id', 'c.first_name', 'c.last_name')->get()
            ->map(function ($r) { $r->name = trim($r->first_name . ' ' . $r->last_name); $r->balance = (float) $r->balance; return $r; });
    }

    public static function baseCode(): string
    {
        return (string) (Currency::where('is_base', true)->value('code') ?? '');
    }
}

<?php

namespace App\Services\Insight\Packs;

use App\Models\ReferralCode;
use App\Models\User;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use App\Services\Insight\LoyaltyData;
use App\Services\Insight\PromoData as P;

/** One promo code (or all of them): what its redemptions brought in and what the discount cost, and whether a fixed amount or a percentage suits next season. */
class PromoPack implements InsightPack
{
    public function key(): string { return 'promo.code'; }

    public function title(): string { return 'Did this promo pay for itself?'; }

    public function module(): ?string { return null; }

    public function roles(): array { return ['super_admin', 'admin', 'manager']; }

    public function contexts(): array { return ['promo', 'promos']; }

    public function applies(array $context): bool
    {
        return ($context['type'] ?? '') === 'promos' || ReferralCode::whereKey($context['id'] ?? 0)->exists();
    }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        $b = LoyaltyData::baseCode();
        $base = P::baseline($lb);
        $blocks = [['type' => 'facts', 'title' => 'All sales in the window (' . $lb->label() . ')', 'rows' => [['Sales', number_format($base['orders']) . ', average ' . $b . ' ' . number_format($base['aov'], 2)], ['Revenue', $b . ' ' . number_format($base['revenue'], 2)]]]];

        if (($context['type'] ?? '') === 'promos') {
            $uses = P::uses($lb);
            if ($uses->isEmpty()) {
                return ['title' => 'Promo codes', 'blocks' => array_merge($blocks, [['type' => 'note', 'text' => 'No promo code was used in this window.']]), 'basis' => 'Read from promo use.'];
            }
            $rows = $uses->groupBy('referral_code_id')->map(function ($g) use ($b) {
                $rev = $g->sum('order_value'); $disc = $g->sum('discount_amount'); $f = $g->first();

                return ['name' => $f->name . ' (' . $f->code . ')', 'kind' => $f->reward_type === 'percentage' ? rtrim(rtrim(number_format($f->reward_value, 2), '0'), '.') . '%' : $b . ' ' . number_format($f->reward_value, 0) . ' off',
                    'uses' => $g->count(), 'rev' => $rev, 'disc' => $disc, 'pct' => P::pct($disc, $rev), 'type' => $f->reward_type];
            })->sortByDesc('rev')->values();
            $blocks[] = ['type' => 'table', 'title' => 'Every code used', 'columns' => ['Code', 'Offer', 'Uses', 'Revenue', 'Discount given', 'Discount % of revenue'],
                'rows' => $rows->map(fn ($r) => [$r['name'], $r['kind'], (string) $r['uses'], number_format($r['rev'], 2), number_format($r['disc'], 2), $r['pct'] . '%'])->all()];
            $fx = $rows->where('type', 'fixed_amount'); $pc = $rows->where('type', 'percentage');
            if ($fx->isNotEmpty() && $pc->isNotEmpty()) {
                $f = P::pct($fx->sum('disc'), $fx->sum('rev')); $p = P::pct($pc->sum('disc'), $pc->sum('rev'));
                $blocks[] = ['type' => 'verdict', 'tone' => 'info', 'text' => 'Fixed-amount codes gave away ' . $f . '% of the revenue they touched; percentage codes ' . $p . '%. ' . ($f > $p ? 'Fixed amounts have been the more expensive way to discount.' : 'Percentage codes have been the more expensive way to discount.')];
            }

            return ['title' => 'Promo codes', 'subtitle' => $rows->count() . ' code(s) used', 'blocks' => $blocks, 'basis' => 'Read from promo use and sales over ' . $lb->label() . '.'];
        }

        $code = ReferralCode::findOrFail($context['id']);
        $uses = P::uses($lb, $code->id);
        $blocks[] = ['type' => 'facts', 'title' => $code->name . ' (' . $code->code . ')', 'rows' => array_values(array_filter([
            ['Offer', $code->reward_type === 'percentage' ? rtrim(rtrim(number_format((float) $code->reward_value, 2), '0'), '.') . '% off' : $b . ' ' . number_format((float) $code->reward_value, 2) . ' off'],
            $code->min_order_value ? ['Minimum order', $b . ' ' . number_format((float) $code->min_order_value, 2)] : null,
            ['Used (all time)', number_format((int) $code->times_used) . ($code->max_uses ? ' of ' . $code->max_uses : '')],
        ]))];
        if ($uses->isEmpty()) {
            return ['title' => $code->name, 'blocks' => array_merge($blocks, [['type' => 'note', 'text' => 'Not used in this window.']]), 'basis' => 'Read from promo use.'];
        }
        $rev = $uses->sum('order_value'); $disc = $uses->sum('discount_amount'); $n = $uses->count(); $aov = $rev / $n;
        $custs = $uses->pluck('customer_id')->filter()->unique()->count();
        $blocks[] = ['type' => 'facts', 'title' => 'In the window', 'rows' => [
            ['Orders that used it', $n . ' by ' . $custs . ' customer(s)'],
            ['Revenue (before the discount)', $b . ' ' . number_format($rev, 2)],
            ['Discount given', $b . ' ' . number_format($disc, 2), P::pct($disc, $rev) . '% of that revenue'],
            ['Collected', $b . ' ' . number_format($rev - $disc, 2)],
            ['Average order with the code', $b . ' ' . number_format($aov, 2), $base['aov'] > 0 ? ($aov >= $base['aov'] ? number_format(($aov / $base['aov'] - 1) * 100, 0) . '% above' : number_format((1 - $aov / $base['aov']) * 100, 0) . '% below') . ' the ' . $b . ' ' . number_format($base['aov'], 2) . ' average' : null],
        ]];
        $bands = P::bands($uses);
        if ($bands) {
            $blocks[] = ['type' => 'table', 'title' => 'Discount by order size', 'columns' => ['Orders', 'Count', 'Average order', 'Average discount', 'Discount %'], 'rows' => array_map(fn ($x) => [$x['label'], (string) $x['orders'], number_format($x['avg_order'], 2), number_format($x['avg_discount'], 2), $x['pct'] . '%'], $bands)];
            $first = $bands[0]['pct']; $last = end($bands)['pct'];
            if ($code->reward_type === 'fixed_amount' && $first > $last * 2 && $first > 15) {
                $blocks[] = ['type' => 'verdict', 'tone' => 'warn', 'text' => 'A fixed amount hits small orders hard: the smallest quarter got ' . $first . '% off, the largest only ' . $last . '%. A minimum order value, or a percentage, would keep the discount level (about ' . P::pct($disc, $rev) . '% overall).'];
            } elseif ($code->reward_type === 'percentage') {
                $blocks[] = ['type' => 'verdict', 'tone' => 'info', 'text' => 'A percentage scales with the order, so it gave about the same share (' . $first . '% to ' . $last . '%) on small and large orders. A fixed amount of about ' . $b . ' ' . number_format($disc / $n, 0) . ' would cost the same overall but give small orders far more than large ones.'];
            }
        }
        $tone = P::pct($disc, $rev) < 10 ? 'good' : (P::pct($disc, $rev) < 20 ? 'warn' : 'bad');
        $blocks[] = ['type' => 'verdict', 'tone' => $tone, 'text' => 'It cost ' . $b . ' ' . number_format($disc, 2) . ' to bring in ' . $b . ' ' . number_format($rev - $disc, 2) . ' of sales: ' . number_format($rev / max($disc, 0.01), 1) . ' of revenue for every 1 of discount. Whether that is a profit depends on your margin and on whether these customers would have bought anyway — this only sees what was redeemed.'];

        return ['title' => $code->name, 'subtitle' => 'Promo code ' . $code->code, 'blocks' => $blocks, 'basis' => 'Read from this code\'s uses and all sales over ' . $lb->label() . '. Nothing is changed.'];
    }
}

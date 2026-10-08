<?php

namespace App\Services\Insight\Packs;

use App\Models\User;
use App\Services\Books\RewardService;
use App\Services\Insight\InsightPack;
use App\Services\Insight\LoyaltyData as L;
use App\Services\Insight\Lookback;

/**
 * The loyalty settings page: what the values being typed would cost, against what customers actually buy.
 * Points per 100, the minimum to redeem, expiry and the gift voucher cap — each tried on the real sales of the look-back window.
 */
class LoyaltySettingsPack implements InsightPack
{
    public function key(): string { return 'loyalty.settings'; }

    public function title(): string { return 'Are these loyalty settings affordable?'; }

    public function module(): ?string { return null; }

    public function permission(): string { return 'loyalty.configure'; }   // who may change them

    public function contexts(): array { return ['loyalty_settings']; }

    public function applies(array $context): bool { return true; }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        $b = L::baseCode();
        $draft = (array) ($context['draft'] ?? []);
        $set = L::settings($draft);
        $saved = L::settings();
        $sales = L::sales($lb);
        $sum = L::summary($sales);
        $pv = app(RewardService::class)->pointValue();
        $blocks = [];

        if ($sum['orders'] === 0) {
            return ['title' => 'Loyalty settings', 'blocks' => [['type' => 'note', 'text' => 'No sales to customers in ' . $lb->label() . ' — there is nothing to test these settings against yet.']], 'basis' => 'Read from sales.'];
        }

        $cost = function (int $rate) use ($sales, $pv) { return $sales->sum(fn ($s) => L::points($s->amount, $rate, $s->multiplier)) * $pv; };
        $pts = fn (int $rate) => $sales->sum(fn ($s) => L::points($s->amount, $rate, $s->multiplier));
        $pct = fn (float $c) => $sum['revenue'] > 0 ? $c / $sum['revenue'] * 100 : 0.0;

        $blocks[] = ['type' => 'facts', 'title' => 'What customers bought (' . $lb->label() . ')', 'rows' => [
            ['Sales to customers', $b . ' ' . number_format($sum['revenue'], 2), $sum['orders'] . ' sales, average ' . $b . ' ' . number_format($sum['aov'], 2)],
            ['Average tier multiplier (by spend)', '× ' . number_format($sum['avg_multiplier'], 2)],
            ['Value of one point', $b . ' ' . number_format($pv, 4), $pv > 0 ? 'from the point value setting or your best redemption rule' : 'not set: points are not valued yet'],
        ]];
        $blocks[] = ['type' => 'table', 'title' => 'Who spends it', 'columns' => ['Tier', 'Customers', 'Share of sales', 'Multiplier', 'Points at the rate being set'],
            'rows' => array_map(fn ($t) => [$t['tier'], (string) $t['customers'], $t['share'] . '%', '× ' . number_format($t['multiplier'], 2), number_format($sales->where('tier', $t['tier'] === '—' ? null : $t['tier'])->sum(fn ($s) => L::points($s->amount, $set['rate'], $s->multiplier)))], $sum['tiers'])];

        // points per 100
        $c = $cost($set['rate']);
        $rows = [['Points earned', number_format($pts($set['rate']))], ['Cost of those points', $b . ' ' . number_format($c, 2), number_format($pct($c), 2) . '% of sales']];
        if ($set['rate'] !== $saved['rate']) {
            $cs = $cost($saved['rate']);
            $rows[] = ['At the saved setting (' . $saved['rate'] . ' per 100)', $b . ' ' . number_format($cs, 2), number_format($pct($cs), 2) . '% of sales'];
        }
        $blocks[] = ['type' => 'facts', 'title' => 'Points per 100 ' . $b . ': ' . $set['rate'], 'rows' => $rows];
        $alt = [];
        foreach ([max(1, $set['rate'] - 1), $set['rate'] + 1] as $r) {
            if ($r !== $set['rate'] && ! isset($alt[$r])) {
                $alt[$r] = [$r . ' per 100', number_format($pts($r)), $b . ' ' . number_format($cost($r), 2), number_format($pct($cost($r)), 2) . '%'];
            }
        }
        if ($alt) {
            $blocks[] = ['type' => 'table', 'title' => 'What if it were…', 'columns' => ['Rate', 'Points', 'Cost', '% of sales'], 'rows' => array_values($alt)];
        }
        $p = $pct($c);
        $blocks[] = ['type' => 'verdict', 'tone' => $pv <= 0 ? 'info' : ($p < 1 ? 'good' : ($p < 3 ? 'warn' : 'bad')), 'text' => $pv <= 0
            ? 'Points have no value yet, so their cost cannot be worked out. Set a point value or a redemption rule.'
            : 'Points at this rate give back ' . number_format($p, 2) . '% of what customers spend. As a rule of thumb under 1% is light, 1–3% is worth watching against your margin, and over 3% is generous. This is revenue, not profit: if your margin on these sales is thin, the same percentage takes a bigger bite out of it.'];

        // minimum to redeem
        $perCust = $sum['customers'];
        $reach = fn (int $min) => $perCust->filter(fn ($x) => $x->points_held >= $min);
        $rows = [];
        foreach (array_unique([$set['min_points'], $saved['min_points']]) as $min) {
            $r = $reach($min);
            $rows[] = ['Minimum ' . number_format($min) . ' points' . ($min === $set['min_points'] && $min !== $saved['min_points'] ? ' (being set)' : ''), $r->count() . ' of ' . $perCust->count() . ' customers can redeem now', 'worth about ' . $b . ' ' . number_format($r->sum('points_held') * $pv, 2)];
        }
        $blocks[] = ['type' => 'facts', 'title' => 'Minimum to redeem', 'rows' => $rows];
        $blocks[] = ['type' => 'table', 'title' => 'Spend needed to reach ' . number_format($set['min_points']) . ' points', 'columns' => ['Tier', 'Needs to spend'],
            'rows' => array_map(fn ($t) => [$t['tier'] . ' (× ' . number_format($t['multiplier'], 2) . ')', $b . ' ' . number_format(ceil($set['min_points'] / max($set['rate'] * $t['multiplier'], 0.0001)) * 100, 0)], $sum['tiers'])];

        // gift voucher cap
        $gift = L::giftBalances();
        if ($gift->isNotEmpty()) {
            $byCust = $perCust->keyBy('id');
            $rows = $gift->sortByDesc('balance')->take(5)->map(function ($g) use ($byCust, $set, $b) {
                $aov = ($x = $byCust->get($g->customer_id)) && $x->orders ? $x->spend / $x->orders : null;
                $per = $aov !== null ? min($g->balance, $aov * $set['cap_pct'] / 100) : null;

                return [$g->name ?: 'Customer #' . $g->customer_id, $b . ' ' . number_format($g->balance, 2) . ' held', $per !== null ? 'up to ' . $b . ' ' . number_format($per, 2) . ' a sale (' . number_format($set['cap_pct'], 0) . '% of their usual ' . $b . ' ' . number_format($aov, 2) . ')' : 'no sales in this window'];
            })->values()->all();
            $blocks[] = ['type' => 'table', 'title' => 'Gift voucher cap: ' . number_format($set['cap_pct'], 0) . '% of a sale — your five biggest holders', 'columns' => ['Customer', 'Holds', 'Could use'], 'rows' => $rows];
            $blocks[] = ['type' => 'note', 'text' => 'Gift vouchers already sit on your books as what you owe, so spending one is not a new cost; the cap only controls how fast a customer can turn their balance into discounted sales. A low cap spreads the use over more visits.'];
        }

        // another example: one real customer
        $ex = $perCust->get($example % max($perCust->count(), 1));
        if ($example > 0 && $ex) {
            $earned = L::points($ex->spend, $set['rate'], $ex->multiplier);
            $blocks[] = ['type' => 'facts', 'title' => 'Example: ' . $ex->name, 'rows' => [
                ['Spent in the window', $b . ' ' . number_format($ex->spend, 2), $ex->orders . ' sales, tier ' . ($ex->tier ?: '—') . ' × ' . number_format($ex->multiplier, 2)],
                ['Would earn', number_format($earned) . ' points', 'worth about ' . $b . ' ' . number_format($earned * $pv, 2)],
                ['Holds now', number_format($ex->points_held) . ' points', $ex->points_held >= $set['min_points'] ? 'can redeem' : 'needs ' . number_format($set['min_points'] - $ex->points_held) . ' more'],
            ]];
        }

        return ['title' => 'Loyalty settings', 'subtitle' => 'Tried on real sales — the values on the page, saved or not', 'blocks' => $blocks, 'has_another' => $perCust->count() > 1,
            'basis' => 'Read from sales, tiers, points held and gift vouchers over ' . $lb->label() . '.'];
    }
}

<?php

namespace App\Services\Insight\Packs;

use App\Models\Currency;
use App\Models\User;
use App\Services\CurrencyConversionService;
use App\Services\Insight\InsightPack;
use App\Services\Insight\LoyaltyData as L;
use App\Services\Insight\Lookback;

/** One redemption rule being written: what spending it takes to earn it, what it gives back as a share of that spend, and how real customers fare. */
class LoyaltyRulePack implements InsightPack
{
    public function key(): string { return 'loyalty.rule'; }

    public function title(): string { return 'Is this redemption rule a profit or a loss?'; }

    public function module(): ?string { return null; }

    public function roles(): array { return ['super_admin', 'admin']; }

    public function contexts(): array { return ['loyalty_rule']; }

    public function applies(array $context): bool
    {
        $d = (array) ($context['draft'] ?? []);

        return (int) ($d['points_required'] ?? 0) > 0 && (float) ($d['value'] ?? 0) > 0;
    }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        $d = (array) $context['draft'];
        $b = L::baseCode();
        $money = app(CurrencyConversionService::class);
        $cur = ! empty($d['currency_id']) ? Currency::find($d['currency_id']) : $money->getBaseCurrency();
        $points = (int) $d['points_required'];
        $value = (float) $d['value'];
        $valueBase = $cur ? $money->convert($value, $cur, $money->getBaseCurrency()) : $value;
        $set = L::settings((array) ($context['settings'] ?? []));
        $sum = L::summary(L::sales($lb));
        $blocks = [];

        $rows = [['Awards', ($cur?->code ?? $b) . ' ' . number_format($value, 2), ($cur && $cur->code !== $b) ? '= ' . $b . ' ' . number_format($valueBase, 2) . ' at today\'s rate' : null],
            ['For', number_format($points) . ' points', 'each point is worth ' . $b . ' ' . number_format($valueBase / $points, 4)]];
        $blocks[] = ['type' => 'facts', 'title' => 'The rule', 'rows' => array_values(array_map(fn ($r) => array_values(array_filter($r, fn ($x) => $x !== null)), $rows))];

        $mult = $sum['avg_multiplier'] ?: 1.0;
        $rows = [];
        $tiers = $sum['orders'] ? $sum['tiers'] : [['tier' => 'standard', 'multiplier' => 1.0, 'share' => 100]];
        foreach ($tiers as $t) {
            $spend = ceil($points / max($set['rate'] * $t['multiplier'], 0.0001)) * 100;
            $rows[] = [$t['tier'] . ' (× ' . number_format($t['multiplier'], 2) . ')', $b . ' ' . number_format($spend, 0), number_format($valueBase / $spend * 100, 2) . '% of what they spend'];
        }
        $blocks[] = ['type' => 'table', 'title' => 'To earn it a customer spends…', 'columns' => ['Tier', 'Spend', 'The rule gives back'], 'rows' => $rows];

        $spendAvg = ceil($points / max($set['rate'] * $mult, 0.0001)) * 100;
        $giveBack = $valueBase / $spendAvg * 100;
        $blocks[] = ['type' => 'verdict', 'tone' => $giveBack < 1.5 ? 'good' : ($giveBack < 4 ? 'warn' : 'bad'), 'text' =>
            'At ' . $set['rate'] . ' point(s) per 100 and your average tier multiplier (× ' . number_format($mult, 2) . '), a customer spends about ' . $b . ' ' . number_format($spendAvg, 0) . ' to earn this, and it gives back ' . number_format($giveBack, 2) . '% of that. '
            . ($giveBack < 1.5 ? 'That is light: a profit on almost any margin.' : ($giveBack < 4 ? 'Worth checking against your margin: if your margin on these sales is under ' . number_format($giveBack * 2, 0) . '%, it eats a large part of it.' : 'That is generous: it only pays for itself if your margin is well above ' . number_format($giveBack, 0) . '%, or if it brings repeat visits you would not otherwise get.'))];

        // other active rules, same yardstick
        $others = [];
        foreach ((array) \App\Models\LoyaltySetting::get('redemption_rules', []) as $r) {
            $pr = (int) ($r['points_required'] ?? 0);
            if (empty($r['active']) || $pr <= 0 || ($r['type'] ?? '') === 'gift' || (isset($d['id']) && ($r['id'] ?? null) === $d['id'])) {
                continue;
            }
            $vb = $money->convert((float) ($r['value'] ?? $r['value_kes'] ?? 0), $money->currencyFrom($r['currency_id'] ?? null), $money->getBaseCurrency());
            $sp = ceil($pr / max($set['rate'] * $mult, 0.0001)) * 100;
            $others[] = [$r['name'] ?? 'Rule', number_format($pr) . ' pts', $b . ' ' . number_format($vb, 2), number_format($vb / $sp * 100, 2) . '%'];
        }
        if ($others) {
            $blocks[] = ['type' => 'table', 'title' => 'Your other active rules, same measure', 'columns' => ['Rule', 'Points', 'Awards', 'Gives back'], 'rows' => $others];
        }

        // real customers: how long to reach it at their own pace
        $custs = $sum['customers'];
        if ($custs->isNotEmpty()) {
            $days = max(1, (int) $lb->from->diffInDays($lb->to));
            $take = $example > 0 ? $custs->slice(($example * 3) % $custs->count(), 3) : $custs->take(3);
            $rows = $take->map(function ($c) use ($set, $points, $days, $b, $valueBase) {
                $earn = L::points($c->spend, $set['rate'], $c->multiplier);

                return [$c->name ?: 'Customer #' . $c->id, $b . ' ' . number_format($c->spend, 0) . ' in the window', number_format($earn) . ' pts', $earn > 0 ? 'reaches it in about ' . max(1, (int) ceil($points / $earn * $days / 7)) . ' week(s)' : '—'];
            })->values()->all();
            $blocks[] = ['type' => 'table', 'title' => $example > 0 ? 'Other customers' : 'Your biggest customers at their own pace', 'columns' => ['Customer', 'Spent', 'Earns', 'This rule'], 'rows' => $rows];
        }

        return ['title' => $d['name'] ?? 'Redemption rule', 'subtitle' => 'On the rule as typed — saved or not', 'blocks' => $blocks, 'has_another' => $custs->count() > 3,
            'basis' => 'Read from sales over ' . $lb->label() . ', the loyalty settings and your tiers.'];
    }
}

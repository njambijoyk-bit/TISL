<?php

namespace App\Services\Insight\Packs;

use App\Models\Books\Voucher;
use App\Models\Currency;
use App\Models\LoyaltySetting;
use App\Models\User;
use App\Services\Books\RewardService;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;

/** A loyalty points journal: which sale it came from, the customer's tier multiplier, the points table, and whether the numbers agree. */
class LoyaltyJournalPack implements InsightPack
{
    public function key(): string { return 'loyalty.journal'; }

    public function title(): string { return 'How these points were worked out'; }

    public function module(): ?string { return null; }

    public function permission(): string { return 'books.view'; }

    public function contexts(): array { return ['voucher']; }

    public function applies(array $context): bool
    {
        $v = Voucher::find($context['id'] ?? null);

        return (bool) $v && isset($v->meta['points']) && ! empty($v->meta['sale_voucher_id']);
    }

    public function answer(array $context, Lookback $lookback, User $user, int $example = 0): array
    {
        $j = Voucher::findOrFail($context['id']);
        $sale = Voucher::with(['customer', 'type', 'currency'])->find($j->meta['sale_voucher_id']);
        $points = (int) $j->meta['points'];
        $mode = (string) ($j->meta['points_mode'] ?? 'accrue');
        $base = Currency::where('is_base', true)->first();
        $b = $base?->code ?? '';
        $blocks = [];

        $blocks[] = ['type' => 'facts', 'title' => 'This journal', 'rows' => [
            [$mode === 'accrue' ? 'Points given' : ($mode === 'release' ? 'Points taken back' : 'Points ' . $mode), number_format($points)],
            ['Value booked', $b . ' ' . number_format((float) $j->total_amount, 2)],
        ]];
        if (! $sale) {
            return ['title' => $j->voucher_number, 'blocks' => array_merge($blocks, [['type' => 'note', 'text' => 'The sale it came from is no longer there.']]), 'basis' => 'Read from the journal.'];
        }

        $baseTotal = (float) $sale->base_total;
        $per100 = (int) LoyaltySetting::get('points_per_100_kes', 1);
        $raw = (int) floor($baseTotal / 100) * $per100;
        $mult = (float) ($sale->customer?->tier_benefits['loyalty_points_multiplier'] ?? 1.0);
        $expected = (int) round($raw * $mult);
        $pv = app(RewardService::class)->pointValue();
        $blocks[] = ['type' => 'facts', 'title' => 'The sale it came from', 'rows' => array_values(array_filter([
            [$sale->type?->name . ' ' . $sale->voucher_number, $sale->date?->toDateString()],
            ['Customer', $sale->customer ? trim($sale->customer->first_name . ' ' . $sale->customer->last_name) : ($sale->party_name ?: '—')],
            ['Sale value', $b . ' ' . number_format($baseTotal, 2), $sale->currency && $sale->currency->code !== $b ? 'was ' . $sale->currency->code . ' ' . number_format((float) $sale->total_amount, 2) : null],
            ['Customer tier', $sale->customer?->tier ?? '—', 'multiplier × ' . rtrim(rtrim(number_format($mult, 2), '0'), '.')],
        ]))];
        $blocks[] = ['type' => 'table', 'title' => 'Working', 'columns' => ['Step', 'Figure'], 'rows' => [
            ['Points per 100 ' . $b . ' spent (loyalty settings)', (string) $per100],
            [number_format($baseTotal, 2) . ' ÷ 100, rounded down, × ' . $per100, number_format($raw) . ' points'],
            ['× tier multiplier ' . rtrim(rtrim(number_format($mult, 2), '0'), '.'), number_format($expected) . ' points'],
            ['Value of one point today', $b . ' ' . number_format($pv, 4)],
            [number_format($expected) . ' points at today\'s value', $b . ' ' . number_format($expected * $pv, 2)],
        ]];

        $same = $mode !== 'accrue' || $points === $expected;
        $blocks[] = ['type' => 'verdict', 'tone' => $same ? 'good' : 'warn', 'text' => $same
            ? ($mode === 'accrue' ? 'The points on this journal match what the settings and the customer\'s tier give for this sale.' : 'This journal reverses points that were given earlier.')
            : 'The journal has ' . number_format($points) . ' points but today\'s settings and tier give ' . number_format($expected) . ' for this sale — the settings or the customer\'s tier may have changed since, or the sale was edited.'];
        $liabilityToday = $expected * $pv;
        if ($mode === 'accrue' && abs($liabilityToday - (float) $j->total_amount) > 0.05 && $points === $expected) {
            $blocks[] = ['type' => 'note', 'text' => 'The value booked (' . $b . ' ' . number_format((float) $j->total_amount, 2) . ') differs from today\'s value of those points (' . $b . ' ' . number_format($liabilityToday, 2) . '): points are booked at the value they were given at, and the point value has changed since.'];
        }

        return ['title' => $j->voucher_number, 'subtitle' => $j->narration, 'blocks' => $blocks, 'basis' => 'Read from the journal, its sale, the customer\'s tier and the loyalty settings. Nothing is changed.'];
    }
}

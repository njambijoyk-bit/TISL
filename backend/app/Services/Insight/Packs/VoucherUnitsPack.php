<?php

namespace App\Services\Insight\Packs;

use App\Models\Books\Voucher;
use App\Models\Currency;
use App\Models\User;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use App\Services\Insight\UnitMath;

/** A voucher sold in dozens, boxes or kilos: what that is in the base unit, and what each other unit of the same kind would cost. */
class VoucherUnitsPack implements InsightPack
{
    public function key(): string { return 'units.voucher'; }

    public function title(): string { return 'Units on this document'; }

    public function module(): ?string { return null; }

    public function roles(): array { return ['finance', 'manager', 'admin', 'super_admin']; }   // who may open vouchers

    public function contexts(): array { return ['voucher']; }

    public function applies(array $context): bool
    {
        $v = Voucher::with('items')->find($context['id'] ?? null);

        return (bool) $v && $v->items->contains(fn ($i) => ! $i->is_header && $i->unit_code && abs((float) $i->unit_factor - 1.0) > 0.000001);
    }

    public function answer(array $context, Lookback $lookback, User $user, int $example = 0): array
    {
        $v = Voucher::with(['items', 'currency', 'type'])->findOrFail($context['id']);
        $cur = $v->currency?->code ?? Currency::where('is_base', true)->value('code');
        $lines = $v->items->filter(fn ($i) => ! $i->is_header && $i->unit_code && abs((float) $i->unit_factor - 1.0) > 0.000001)->values();
        $blocks = [];
        $note = [];

        foreach ($lines as $i) {
            $factor = (float) $i->unit_factor;
            $qty = (float) $i->quantity;
            $rate = (float) $i->rate;
            $family = UnitMath::family($i->unit_code);
            $base = collect($family)->first(fn ($u) => abs($u['factor'] - 1.0) < 0.000001);
            $baseCode = $base['code'] ?? 'base unit';
            $perBase = $factor > 0 ? $rate / $factor : 0;
            $tax = (float) $i->tax_rate_percent;

            $blocks[] = ['type' => 'facts', 'title' => $i->description . ($i->variant_label ? " · {$i->variant_label}" : ''), 'rows' => array_values(array_filter([
                ['Sold as', rtrim(rtrim(number_format($qty, 4, '.', ''), '0'), '.') . ' ' . $i->unit_code . ' at ' . self::m($rate, $cur) . ' each'],
                ['1 ' . $i->unit_code . ' is', rtrim(rtrim(number_format($factor, 6, '.', ''), '0'), '.') . ' ' . $baseCode],
                ['Quantity in ' . $baseCode, rtrim(rtrim(number_format($qty * $factor, 4, '.', ''), '0'), '.')],
                ['Price per ' . $baseCode, self::m($perBase, $cur), $tax > 0 ? 'before ' . $tax . '% tax; ' . self::m($perBase * (1 + $tax / 100), $cur) . ' with it' : null],
            ]))];
            $across = UnitMath::priceAcross($rate, $i->unit_code);
            if (count($across) > 1) {
                $blocks[] = ['type' => 'table', 'title' => 'The same price in every unit of this kind', 'columns' => ['Unit', 'Is (in ' . $baseCode . ')', 'Price each (' . $cur . ')'],
                    'rows' => array_map(fn ($u) => [$u['name'] . ' (' . $u['code'] . ')', rtrim(rtrim(number_format($u['factor'], 6, '.', ''), '0'), '.'), number_format($u['price'], 2)], $across)];
            }
            $note[] = "{$i->unit_code} → {$baseCode}";
        }

        return ['title' => $v->type?->name . ' ' . $v->voucher_number, 'subtitle' => 'Selling in ' . implode(', ', array_unique($note)), 'blocks' => $blocks,
            'basis' => 'Read from the document\'s own lines and the units table. Nothing is changed.'];
    }

    private static function m(float $n, string $cur): string
    {
        return $cur . ' ' . number_format($n, 2);
    }
}

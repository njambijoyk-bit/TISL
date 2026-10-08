<?php

namespace App\Services\Insight\Packs;

use App\Models\User;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use App\Services\Insight\UnitMath;

/** Type a price and a unit in the calculator: what each other unit of the same kind costs. Open to every staff role (it reads only the units table). */
class UnitPricePack implements InsightPack
{
    public function key(): string { return 'units.price'; }

    public function title(): string { return 'Price in other units'; }

    public function module(): ?string { return null; }

    public function permission(): string { return 'insight.view'; }

    public function contexts(): array { return ['unit_price']; }

    public function applies(array $context): bool
    {
        return ! empty($context['unit_code']) && (float) ($context['amount'] ?? 0) > 0 && count(UnitMath::family((string) $context['unit_code'])) > 1;
    }

    public function answer(array $context, Lookback $lookback, User $user, int $example = 0): array
    {
        $code = (string) $context['unit_code'];
        $amount = (float) $context['amount'];
        $rows = array_map(fn ($u) => [$u['name'] . ' (' . $u['code'] . ')', rtrim(rtrim(number_format($u['factor'], 6, '.', ''), '0'), '.'), number_format($u['price'], 4)], UnitMath::priceAcross($amount, $code));

        return ['title' => number_format($amount, 2) . ' per ' . $code, 'blocks' => [['type' => 'table', 'title' => 'The same price in every unit of this kind', 'columns' => ['Unit', 'Is (base units)', 'Price each'], 'rows' => $rows]],
            'basis' => 'From the units table.'];
    }
}

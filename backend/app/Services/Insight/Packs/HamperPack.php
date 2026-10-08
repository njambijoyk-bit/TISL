<?php

namespace App\Services\Insight\Packs;

use App\Models\Currency;
use App\Models\Hamper;
use App\Models\StockBatch;
use App\Models\User;
use App\Services\CurrencyConversionService;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use Illuminate\Support\Facades\DB;

/** A hamper: what its products go for one by one, what the hamper is priced at, and whether bundling them helps or costs you. */
class HamperPack implements InsightPack
{
    public function key(): string { return 'hamper.price'; }

    public function title(): string { return 'Is this hamper priced right?'; }

    public function module(): ?string { return null; }

    public function permission(): string { return 'insight.ops'; }

    public function contexts(): array { return ['hamper']; }

    public function applies(array $context): bool
    {
        return Hamper::whereKey($context['id'] ?? 0)->exists();
    }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        $h = Hamper::with(['items.product', 'items.variant'])->findOrFail($context['id']);
        $money = app(CurrencyConversionService::class);
        $cur = $h->currency_id ? Currency::find($h->currency_id) : $money->getBaseCurrency();
        $baseCur = $money->getBaseCurrency();
        $c = $cur?->code ?? $baseCur->code;
        $price = (float) $h->price;

        $rows = [];
        $single = 0.0; $cost = 0.0; $costKnown = true; $pieces = 0;
        foreach ($h->items as $i) {
            $p = $i->product;
            $unit = (float) ($i->variant?->price ?? $p?->price ?? 0);
            $unit = $p ? $money->convert($unit, $money->currencyFrom($p->currency_id), $cur ?? $baseCur) : $unit;
            $unitCostBase = $i->variant_id ? StockBatch::where('variant_id', $i->variant_id)->where('status', StockBatch::ACTIVE)->avg('unit_cost') : null;
            $unitCost = $unitCostBase !== null ? $money->convert((float) $unitCostBase, $baseCur, $cur ?? $baseCur) : null;
            $q = (int) $i->quantity;
            $single += $unit * $q; $pieces += $q;
            if ($unitCost === null) { $costKnown = false; } else { $cost += $unitCost * $q; }
            $rows[] = [($p?->name ?? 'Product') . ($i->variant?->name ? ' · ' . $i->variant->name : ''), (string) $q, number_format($unit, 2), number_format($unit * $q, 2), $unitCost !== null ? number_format($unitCost * $q, 2) : '—'];
        }
        $blocks = [['type' => 'table', 'title' => 'What is in it, and what each would sell for alone', 'columns' => ['Product', 'Qty', 'Sells for', 'Line', 'Cost'], 'rows' => $rows]];
        if ($single <= 0) {
            return ['title' => $h->name, 'blocks' => array_merge($blocks, [['type' => 'note', 'text' => 'The products have no catalogue prices to compare with.']]), 'basis' => 'Read from the hamper and the catalogue.'];
        }

        $disc = $single - $price;
        $facts = [['Sold separately', $c . ' ' . number_format($single, 2)], ['Hamper price', $c . ' ' . number_format($price, 2), ($disc >= 0 ? number_format($disc / $single * 100, 1) . '% below' : number_format(-$disc / $single * 100, 1) . '% above') . ' buying them one by one']];
        if ($costKnown && $cost > 0) {
            $mH = ($price - $cost) / max($price, 0.01) * 100; $mS = ($single - $cost) / $single * 100;
            $facts[] = ['What the products cost you', $c . ' ' . number_format($cost, 2), 'average cost of stock on hand'];
            $facts[] = ['Margin on the hamper', number_format($mH, 1) . '%', 'selling the same products singly: ' . number_format($mS, 1) . '%'];
        }
        $blocks[] = ['type' => 'facts', 'title' => 'The hamper', 'rows' => $facts];

        $sold = DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->where('i.hamper_id', $h->id)->where('v.status', 'posted')
            ->whereBetween('v.date', [$lb->from->toDateString(), $lb->to->toDateString()])->selectRaw('COALESCE(SUM(i.quantity),0) as q, COALESCE(SUM(i.amount),0) as a')->first();
        $blocks[] = ['type' => 'facts', 'title' => 'How it sold (' . $lb->label() . ')', 'rows' => [['Sold', number_format((float) $sold->q) . ' hamper(s)', $h->total_stock ? number_format((int) $h->stock_remaining) . ' of ' . number_format((int) $h->total_stock) . ' left' : null], ['Taken', $c . ' ' . number_format((float) $sold->a, 2)]]];

        // price options
        $opts = [];
        foreach ([0, 5, 10, 15, 20] as $off) {
            $pr = round($single * (1 - $off / 100), 2);
            $opts[] = [$off . '% below singles', number_format($pr, 2), $costKnown && $cost > 0 ? number_format(($pr - $cost) / $pr * 100, 1) . '% margin' : '—'];
        }
        $blocks[] = ['type' => 'table', 'title' => 'What if the hamper were priced at…', 'columns' => ['Offer', 'Price', 'Margin'], 'rows' => $opts];

        if ($costKnown && $cost > 0) {
            $mS = ($single - $cost) / $single * 100; $mH = ($price - $cost) / max($price, 0.01) * 100;
            $keep = $cost / (1 - $mS / 100);
            $tone = $mH < 0 ? 'bad' : ($mH < $mS / 2 ? 'warn' : 'good');
            $blocks[] = ['type' => 'verdict', 'tone' => $tone, 'text' => $mH < 0
                ? 'The hamper sells for less than its products cost you: every one is a loss of ' . $c . ' ' . number_format($cost - $price, 2) . '.'
                : 'Bundling gives the customer ' . number_format(max($disc, 0) / $single * 100, 1) . '% off and takes your margin from ' . number_format($mS, 1) . '% to ' . number_format($mH, 1) . '%. To keep the single-sale margin the hamper would be ' . $c . ' ' . number_format($keep, 2) . '; ' . ($mH >= $mS / 2 ? 'a bundle discount that keeps at least half your usual margin is normal for a gift hamper.' : 'you are giving away more than half your usual margin.') . ' It is worth it if hampers sell products or customers that would not buy otherwise; if they only replace sales you would have made, selling singly earns more.'];
        } else {
            $blocks[] = ['type' => 'verdict', 'tone' => 'info', 'text' => 'Bundling gives the customer ' . number_format(max($disc, 0) / $single * 100, 1) . '% off the single prices. Stock has no recorded cost for some of these products, so your margin cannot be worked out yet; once purchases are recorded this shows whether the discount is affordable.'];
        }

        return ['title' => $h->name, 'subtitle' => $pieces . ' piece(s) in ' . $h->items->count() . ' product(s)', 'blocks' => $blocks, 'basis' => 'Read from the hamper, today\'s catalogue prices, stock cost and sales over ' . $lb->label() . '. Nothing is changed.'];
    }
}

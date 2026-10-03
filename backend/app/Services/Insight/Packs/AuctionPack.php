<?php

namespace App\Services\Insight\Packs;

use App\Models\Auction;
use App\Models\Currency;
use App\Models\StockBatch;
use App\Models\User;
use App\Services\CurrencyConversionService;
use App\Services\Insight\InsightPack;
use App\Services\Insight\Lookback;
use Illuminate\Support\Facades\DB;

/** An auction (or all that ended in the window): what the item sells for normally, what bidders were willing to pay, and what the auction earned over or under that. */
class AuctionPack implements InsightPack
{
    public function key(): string { return 'auction.result'; }

    public function title(): string { return 'Did the auction beat the shelf price?'; }

    public function module(): ?string { return null; }

    public function roles(): array { return ['super_admin', 'admin', 'manager']; }

    public function contexts(): array { return ['auction', 'auctions']; }

    public function applies(array $context): bool
    {
        return ($context['type'] ?? '') === 'auctions' || Auction::whereKey($context['id'] ?? 0)->exists();
    }

    public function answer(array $context, Lookback $lb, User $user, int $example = 0): array
    {
        $money = app(CurrencyConversionService::class);
        $baseCur = $money->getBaseCurrency();
        $b = $baseCur->code;
        $list = function (Auction $a) use ($money, $baseCur) {
            $a->loadMissing(['product', 'variant']);
            $price = (float) ($a->variant?->price ?? $a->product?->price ?? 0);

            return $a->product ? $money->convert($price, $money->currencyFrom($a->product->currency_id), $money->currencyFrom($a->currency_id)) : $price;
        };

        if (($context['type'] ?? '') === 'auctions') {
            $ended = Auction::with(['product', 'variant'])->where('end_time', '>=', $lb->from)->where('end_time', '<=', $lb->to->copy()->endOfDay())->whereNotNull('winner_id')->get();
            if ($ended->isEmpty()) {
                return ['title' => 'Auctions', 'blocks' => [['type' => 'note', 'text' => 'No auction with a winner ended in this window.']], 'basis' => 'Read from auctions.'];
            }
            $rows = []; $extra = 0.0; $above = 0;
            foreach ($ended as $a) {
                $c = $money->currencyFrom($a->currency_id); $lp = $list($a); $fin = (float) $a->current_price;
                $dBase = $money->convert($fin - $lp, $c, $baseCur); $extra += $dBase; $above += $fin >= $lp ? 1 : 0;
                $rows[] = [($a->product?->name ?? 'Item') . ' #' . $a->id, $c->code . ' ' . number_format($lp, 2), $c->code . ' ' . number_format($fin, 2), ($fin >= $lp ? '+' : '') . number_format($lp > 0 ? ($fin - $lp) / $lp * 100 : 0, 1) . '%'];
            }

            return ['title' => 'Auctions', 'subtitle' => $ended->count() . ' sold in ' . $lb->label(), 'blocks' => [
                ['type' => 'table', 'title' => 'Each sale against the shelf price', 'columns' => ['Item', 'Shelf price', 'Sold for', 'Over / under'], 'rows' => $rows],
                ['type' => 'verdict', 'tone' => $extra >= 0 ? 'good' : 'warn', 'text' => $above . ' of ' . $ended->count() . ' sold at or above the shelf price. Altogether the auctions earned ' . $b . ' ' . number_format(abs($extra), 2) . ($extra >= 0 ? ' more' : ' less') . ' than selling those items at their shelf prices.']],
                'basis' => 'Read from ended auctions and today\'s catalogue prices.'];
        }

        $a = Auction::with(['product', 'variant', 'charges'])->findOrFail($context['id']);
        $c = $money->currencyFrom($a->currency_id)->code;
        $lp = $list($a);
        $bids = DB::table('auction_bids')->where('auction_id', $a->id)->orderBy('amount')->get();
        $fin = (float) $a->current_price;
        $cost = $a->variant_id ? StockBatch::where('variant_id', $a->variant_id)->where('status', StockBatch::ACTIVE)->avg('unit_cost') : null;
        $cost = $cost !== null ? $money->convert((float) $cost, $baseCur, $money->currencyFrom($a->currency_id)) : null;

        $blocks = [['type' => 'facts', 'title' => ($a->product?->name ?? 'Item') . ' — ' . $a->status, 'rows' => array_values(array_filter([
            ['Shelf price', $c . ' ' . number_format($lp, 2)], ['Started at', $c . ' ' . number_format((float) $a->start_price, 2)],
            $a->reserve_price ? ['Reserve', $c . ' ' . number_format((float) $a->reserve_price, 2)] : null,
            [$a->winner_id ? 'Sold for' : 'Highest bid now', $c . ' ' . number_format($fin, 2)],
            $cost !== null ? ['What it cost you', $c . ' ' . number_format($cost, 2)] : null,
        ]))]];
        if ($bids->isNotEmpty()) {
            $maxes = $bids->map(fn ($x) => (float) max($x->max_bid ?? 0, $x->amount));
            $over = $maxes->filter(fn ($m) => $lp > 0 && $m >= $lp)->count();
            $blocks[] = ['type' => 'facts', 'title' => 'What bidders were willing to pay', 'rows' => [
                ['Bids', $bids->count() . ' from ' . $bids->pluck('bidder_id')->unique()->count() . ' bidder(s)'],
                ['Highest any bidder would go to', $c . ' ' . number_format((float) $maxes->max(), 2), $lp > 0 ? number_format(((float) $maxes->max() / $lp - 1) * 100, 1) . '% against the shelf price' : null],
                ['Bids at or above the shelf price', (string) $over],
            ]];
        }
        $diff = $fin - $lp;
        if ($lp > 0) {
            $tone = $a->winner_id ? ($diff >= 0 ? 'good' : 'warn') : 'info';
            $blocks[] = ['type' => 'verdict', 'tone' => $tone, 'text' => ($a->winner_id ? 'It sold ' : 'It stands ') . ($diff >= 0 ? 'above' : 'below') . ' the shelf price by ' . $c . ' ' . number_format(abs($diff), 2) . ' (' . number_format(abs($diff) / $lp * 100, 1) . '%).'
                . ($cost !== null ? ' Against what it cost you that is a ' . ($fin - $cost >= 0 ? 'profit' : 'loss') . ' of ' . $c . ' ' . number_format(abs($fin - $cost), 2) . '.' : '')
                . ($a->charges->where('is_enabled', true)->isNotEmpty() ? ' The auction fees (' . $a->charges->where('is_enabled', true)->count() . ' charge(s)) are extra income on top.' : '')];
        }

        return ['title' => ($a->product?->name ?? 'Auction') . ' #' . $a->id, 'blocks' => $blocks, 'basis' => 'Read from this auction, its bids, today\'s catalogue price and stock cost.'];
    }
}

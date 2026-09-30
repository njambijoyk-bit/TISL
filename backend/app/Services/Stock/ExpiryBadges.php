<?php

namespace App\Services\Stock;

use App\Models\Product;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * The "Expires dd/mm" badge on storefront products.
 *
 * Only ever on a product that tracks expiry AND whose next batch to be sold has an expiry date; and only when the
 * rules (shop-wide, with category / product exceptions) say to show it. The date is that of the batch that will be
 * taken first — the in-date batch with stock that expires soonest.
 */
class ExpiryBadges
{
    public function __construct(private StockPolicy $policy) {}

    /** Sets `expiry_badge` (Y-m-d or null) on each product of the collection. */
    public function attach(Collection $products): void
    {
        $tracked = $products->filter(fn ($p) => $p instanceof Product && $p->track_expiry);
        if ($tracked->isEmpty()) {
            return;
        }
        try {
            $next = DB::table('stock_batches as sb')
                ->join('product_variants as pv', 'pv.id', '=', 'sb.variant_id')
                ->join('stock_batch_balances as bb', 'bb.batch_id', '=', 'sb.id')
                ->whereIn('pv.product_id', $tracked->pluck('id'))->where('bb.quantity', '>', 0)
                ->where('sb.status', 'active')->whereNotNull('sb.expiry_date')->where('sb.expiry_date', '>=', today()->toDateString())
                ->groupBy('pv.product_id')->select('pv.product_id', DB::raw('MIN(sb.expiry_date) as next_expiry'))
                ->pluck('next_expiry', 'product_id');
        } catch (Throwable $e) {
            return;   // batches not set up yet: no badge
        }
        foreach ($tracked as $p) {
            $date = $next[$p->id] ?? null;
            $p->expiry_badge = $date && $this->policy->forProduct($p)['show_expiry_badge'] ? substr((string) $date, 0, 10) : null;
        }
    }
}

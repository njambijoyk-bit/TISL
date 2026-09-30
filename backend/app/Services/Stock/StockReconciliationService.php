<?php

namespace App\Services\Stock;

use App\Services\Location\VariantStockService;
use Illuminate\Support\Facades\DB;

/**
 * Proving the stock registers against the books (Books → Reports → Reconciliation).
 *
 *  - VALUE: the Stock ledger against the batches at cost. Two kinds of document move stock without posting, and the
 *    ledger catches up later: goods received on a Receipt Note (in the batches, not yet on the ledger — booked when
 *    the purchase is made from it) and goods delivered on a Delivery Note (out of the batches, not yet costed — booked
 *    when the invoice is made from it). Those differences are worked out and shown as explained; anything else is a
 *    real difference (a purchase price changed after receipt, a debit note posted at a different amount, opening stock
 *    entered before batches at cost 0, an entry made straight on the Stock ledger).
 *  - UNITS: what the shop reads (variant_location_stock) against the in-date batches, per variant and branch.
 */
class StockReconciliationService
{
    public function __construct(private BatchService $batches, private VariantStockService $stock) {}

    /**
     * The value of every batch still holding stock, at cost (base currency).
     *
     * @return array{in_date: float, expired: float, held: float, total: float, units: float}
     */
    public function value(): array
    {
        $rows = DB::table('stock_batch_balances as bb')->join('stock_batches as sb', 'sb.id', '=', 'bb.batch_id')
            ->where('bb.quantity', '>', 0)->get(['bb.quantity', 'sb.unit_cost', 'sb.status', 'sb.expiry_date']);
        $today = today()->toDateString();
        $v = ['in_date' => 0.0, 'expired' => 0.0, 'held' => 0.0, 'units' => 0.0];
        foreach ($rows as $r) {
            $amount = (float) $r->quantity * (float) $r->unit_cost;
            $v['units'] += (float) $r->quantity;
            if (in_array($r->status, ['quarantined', 'recalled'], true)) {
                $v['held'] += $amount;
            } elseif ($r->status === 'expired' || ($r->expiry_date && substr((string) $r->expiry_date, 0, 10) < $today)) {
                $v['expired'] += $amount;
            } else {
                $v['in_date'] += $amount;
            }
        }
        $v = array_map(fn ($x) => round($x, 2), $v);
        $v['total'] = round($v['in_date'] + $v['expired'] + $v['held'], 2);

        return $v;
    }

    /**
     * Cost of stock that moved on a document that posts nothing, and whose invoice / purchase has not come yet:
     * `received` on open Receipt Notes (in the batches, not on the ledger) and `delivered` on open Delivery Notes
     * (out of the batches, not costed). For a part-invoiced note only the part still to be invoiced counts.
     *
     * @return array{received: float, delivered: float}
     */
    public function openDocuments(): array
    {
        $out = ['received' => 0.0, 'delivered' => 0.0];
        $vouchers = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->whereIn('t.base_type', ['receipt_note', 'delivery_note'])->where('v.status', 'posted')
            ->where(fn ($q) => $q->whereNull('v.fulfilment_status')->orWhere('v.fulfilment_status', '!=', 'closed'))
            ->get(['v.id', 't.base_type']);
        foreach ($vouchers as $v) {
            $moves = DB::table('stock_movements')->where('voucher_id', $v->id)->where('reversed', false)->whereNotNull('unit_cost')->get(['quantity', 'unit_cost']);
            $cost = $moves->sum(fn ($m) => abs((float) $m->quantity) * (float) $m->unit_cost);
            if ($cost <= 0) {
                continue;
            }
            $items = DB::table('voucher_items')->where('voucher_id', $v->id)->whereNull('parent_item_id')->whereNotNull('variant_id')->get(['quantity', 'invoiced_quantity']);
            $total = (float) $items->sum('quantity');
            $left = $total > 0 ? (float) $items->sum(fn ($i) => max(0.0, (float) $i->quantity - (float) $i->invoiced_quantity)) / $total : 1.0;
            $out[$v->base_type === 'receipt_note' ? 'received' : 'delivered'] += $cost * $left;
        }

        return array_map(fn ($x) => round($x, 2), $out);
    }

    /**
     * The shop's numbers that do not match the in-date batches: [{variant_id, location_id, product, variant, location, shop, batches}].
     *
     * @return array<int, array<string, mixed>>
     */
    public function unitMismatches(int $limit = 200): array
    {
        $rows = DB::table('variant_location_stock as s')
            ->join('product_variants as pv', 'pv.id', '=', 's.product_variant_id')
            ->leftJoin('products as p', 'p.id', '=', 'pv.product_id')
            ->leftJoin('locations as l', 'l.id', '=', 's.location_id')
            ->get(['s.product_variant_id as variant_id', 's.location_id', 's.quantity', 'p.name as product', 'pv.name as variant', 'l.name as location']);
        $out = [];
        foreach ($rows as $r) {
            $batch = $this->batches->sellable((int) $r->variant_id, (int) $r->location_id);
            if (abs((float) $r->quantity - $batch) > 0.0001) {
                $out[] = ['variant_id' => (int) $r->variant_id, 'location_id' => (int) $r->location_id, 'product' => $r->product, 'variant' => $r->variant,
                    'location' => $r->location, 'shop' => (float) $r->quantity, 'batches' => $batch];
                if (count($out) >= $limit) {
                    break;
                }
            }
        }

        return $out;
    }

    /** Bring the shop's numbers back in line with the batches. @return int variants refreshed */
    public function refreshUnits(): int
    {
        $ids = array_values(array_unique(array_column($this->unitMismatches(10000), 'variant_id')));
        foreach ($ids as $id) {
            $this->stock->refreshVariant($id);
        }

        return count($ids);
    }

    /**
     * The value check as a reconciliation row, given the Stock ledger's balance.
     *
     * @return array{book: float, register: float, explained: float, note: string}
     */
    public function valueCheck(float $book): array
    {
        $v = $this->value();
        $o = $this->openDocuments();
        $fmt = fn ($x) => number_format($x, 2);
        $parts = ["In date {$fmt($v['in_date'])}"];
        if ($v['expired'] > 0) {
            $parts[] = "expired and not yet written off {$fmt($v['expired'])}";
        }
        if ($v['held'] > 0) {
            $parts[] = "held (quarantined or recalled) {$fmt($v['held'])}";
        }
        $note = 'Batches at cost: ' . implode(', ', $parts) . '.';
        if ($o['delivered'] > 0) {
            $note .= " {$fmt($o['delivered'])} delivered on notes not yet invoiced (out of the batches, costed when invoiced).";
        }
        if ($o['received'] > 0) {
            $note .= " {$fmt($o['received'])} received on notes not yet billed (in the batches, booked on the purchase).";
        }
        $transit = \Illuminate\Support\Facades\Schema::hasTable('stock_transfers') ? app(StockTransferService::class)->inTransitValue() : 0.0;
        if ($transit > 0) {
            $note .= " {$fmt($transit)} on transfers between branches not yet received (out of the sending branch, not in the other).";
        }
        $note .= ' Any other difference: a price changed after receipt, a debit note at another amount, stock entered before batches at cost 0, or an entry made straight on the Stock ledger.';

        return ['book' => round($book, 2), 'register' => $v['total'], 'explained' => round($o['delivered'] - $o['received'] + $transit, 2), 'note' => $note];
    }
}

<?php

namespace App\Services\Stock;

use App\Models\Books\StockMovement;
use App\Models\Production;
use App\Models\ProductionLine;
use App\Models\Recipe;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Location\VariantStockService;
use Illuminate\Support\Facades\DB;

/**
 * A production run: uses the recipe's ingredients (first-expiring, in-date batches first) and makes a batch of the
 * finished item, costed at what the ingredients cost. Stock changes shape, not value, so nothing is posted to the
 * ledgers. Cancelling is allowed while all of the finished batch is still on the shelf.
 */
class ProductionService
{
    public function __construct(private VariantStockService $stock, private BatchService $batches) {}

    /** @param array $o batch_no, expiry_date, note */
    public function run(Recipe $r, int $locationId, float $qty, array $o = [], ?User $user = null): Production
    {
        $qty = round($qty, 4);
        if ($qty <= 0) {
            throw new BooksException('Enter how much was made.');
        }
        if (\App\Models\Location::hasCapabilities() && ($loc = \App\Models\Location::find($locationId)) && ! $loc->produces) {
            throw new BooksException("{$loc->name} is not set up to make things. Choose a branch that produces, or switch Produces on for it in Settings, Branches.");
        }
        $r->loadMissing('items');
        $out = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->where('pv.id', $r->variant_id)->first(['p.name', 'p.track_expiry']);
        if ($r->deduct_on_sale) {
            throw new BooksException('This item is made to order — selling it uses the ingredients, so there is nothing to produce ahead.');
        }
        if ($out?->track_expiry && ! filled($o['expiry_date'] ?? null)) {
            throw new BooksException("{$out->name} expires — enter the expiry date of what was made.");
        }

        return DB::transaction(function () use ($r, $locationId, $qty, $o, $user, $out) {
            $factor = $qty / (float) $r->yield_qty;
            $p = Production::create(['recipe_id' => $r->id, 'variant_id' => $r->variant_id, 'location_id' => $locationId, 'quantity' => $qty, 'status' => 'posted', 'note' => $o['note'] ?? null, 'created_by' => $user?->id]);
            $p->update(['number' => 'PR-' . str_pad((string) $p->id, 6, '0', STR_PAD_LEFT)]);

            $cost = 0.0;
            foreach ($r->items as $i) {
                $need = round((float) $i->quantity * $factor, 4);
                $have = $this->batches->sellable((int) $i->variant_id, $locationId);
                if ($have + 0.00005 < $need) {
                    $name = DB::table('product_variants as pv')->join('products as pr', 'pr.id', '=', 'pv.product_id')->where('pv.id', $i->variant_id)->value('pr.name');
                    throw new BooksException("Not enough {$name} to make {$qty}: need {$need}, have " . round($have, 4) . '.');
                }
                foreach ($this->stock->applyDelta((int) $i->variant_id, $locationId, -$need) as $a) {
                    $q = abs($a['qty']);
                    ProductionLine::create(['production_id' => $p->id, 'variant_id' => $i->variant_id, 'batch_id' => $a['batch_id'], 'quantity' => $q, 'unit_cost' => $a['unit_cost']]);
                    $this->move($p, (int) $i->variant_id, $locationId, -$q, 'production_use', $a['batch_id'], $a['unit_cost']);
                    $cost += $q * $a['unit_cost'];
                }
            }
            $unit = round($cost / $qty, 4);
            $alloc = $this->stock->applyDelta((int) $r->variant_id, $locationId, $qty, [
                'unit_cost' => $unit, 'batch_no' => $o['batch_no'] ?? $p->number, 'expiry_date' => $o['expiry_date'] ?? null, 'received_at' => today()->toDateString(),
            ])[0];
            $this->move($p, (int) $r->variant_id, $locationId, $qty, 'production_out', $alloc['batch_id'], $alloc['unit_cost']);
            $p->update(['unit_cost' => $unit, 'batch_id' => $alloc['batch_id']]);

            return $p->load('lines');
        });
    }

    public function cancel(Production $p): Production
    {
        if ($p->status !== 'posted') {
            throw new BooksException("Production {$p->number} is already {$p->status}.");
        }

        return DB::transaction(function () use ($p) {
            $left = (float) DB::table('stock_batch_balances')->where('batch_id', $p->batch_id)->where('location_id', $p->location_id)->value('quantity');
            $elsewhere = (float) DB::table('stock_batch_balances')->where('batch_id', $p->batch_id)->where('location_id', '!=', $p->location_id)->sum('quantity');
            if ($left + 0.00005 < (float) $p->quantity || $elsewhere > 0.00005) {
                throw new BooksException("Some of what {$p->number} made has already been sold or moved, so it cannot be cancelled.");
            }
            $this->stock->applyDelta((int) $p->variant_id, (int) $p->location_id, -(float) $p->quantity, ['batch_id' => $p->batch_id]);
            foreach ($p->lines as $l) {
                $this->stock->applyDelta((int) $l->variant_id, (int) $p->location_id, (float) $l->quantity, ['batch_id' => $l->batch_id, 'no_blend' => true]);
            }
            StockMovement::where('ref_type', 'production')->where('ref_id', $p->id)->update(['reversed' => true]);
            $p->update(['status' => 'cancelled']);

            return $p;
        });
    }

    private function move(Production $p, int $variantId, int $location, float $qty, string $type, int $batchId, float $cost): void
    {
        StockMovement::create(['voucher_id' => null, 'voucher_item_id' => null, 'variant_id' => $variantId, 'location_id' => $location, 'quantity' => $qty,
            'movement_type' => $type, 'movement_date' => today()->toDateString(), 'created_at' => now(), 'batch_id' => $batchId, 'unit_cost' => $cost,
            'ref_type' => 'production', 'ref_id' => $p->id]);
    }
}

<?php

namespace App\Services\Stock;

use App\Models\StockBatch;
use Illuminate\Support\Facades\DB;

/**
 * Batches: where stock arrives into, and where it is taken from.
 *
 * Every arrival is a batch (with its cost); a product that does not track
 * expiry simply leaves batch number and expiry empty. Stock leaving is taken
 * first-expiring first — batches with no expiry come after those with one, and
 * among equals the oldest goes first, so a product without expiry is plain FIFO.
 *
 * This class only moves batch balances. VariantStockService calls it and keeps
 * variant_location_stock equal to the batch totals; nothing else should write
 * to stock_batch_balances.
 */
class BatchService
{
    /**
     * Stock arrives at a branch. Creates a new batch, or — when `batch_id` is
     * given (returns, undoing an issue) — tops up that batch.
     *
     * @param  array  $o  batch_id, batch_no, mfg_date, expiry_date, unit_cost (base, per base unit),
     *                    received_at, voucher_id, notes
     * @return array<int, array{batch_id:int, qty:float, unit_cost:float, created:bool}>
     */
    public function receive(int $variantId, int $locationId, float $qty, array $o = []): array
    {
        $qty = round($qty, 4);
        if ($qty <= 0) {
            return [];
        }

        $created = false;
        $batch = ! empty($o['batch_id']) ? StockBatch::lockForUpdate()->find($o['batch_id']) : null;
        if (! $batch) {
            $batch = StockBatch::create([
                'variant_id'          => $variantId,
                'batch_no'            => $o['batch_no'] ?? null,
                'mfg_date'            => $o['mfg_date'] ?? null,
                'expiry_date'         => $o['expiry_date'] ?? null,
                'unit_cost'           => $o['unit_cost'] ?? $this->lastCost($variantId),
                'received_at'         => $o['received_at'] ?? now()->toDateString(),
                'received_voucher_id' => $o['voucher_id'] ?? null,
                'status'              => StockBatch::ACTIVE,
                'notes'               => $o['notes'] ?? null,
            ]);
            $created = true;
        }

        $this->addBalance($batch->id, $locationId, $qty);
        if (empty($o['no_blend']) && app(StockPolicy::class)->costingMethod() === 'average') {
            $this->blend($variantId);
            $batch->refresh();
        }

        return [['batch_id' => $batch->id, 'qty' => $qty, 'unit_cost' => (float) $batch->unit_cost, 'created' => $created]];
    }

    /**
     * Stock leaves a branch. Takes from the batches there, first-expiring first,
     * skipping batches that are not active — or from one named batch (`batch_id`,
     * used to undo an arrival), whatever its status. Takes only what exists; the
     * caller checks availability first.
     *
     * @return array<int, array{batch_id:int, qty:float, unit_cost:float, created:bool}>  qty is negative
     */
    public function issue(int $variantId, int $locationId, float $qty, array $o = []): array
    {
        $left = round($qty, 4);
        if ($left <= 0) {
            return [];
        }

        $q = DB::table('stock_batch_balances as b')
            ->join('stock_batches as s', 's.id', '=', 'b.batch_id')
            ->where('s.variant_id', $variantId)
            ->where('b.location_id', $locationId)
            ->where('b.quantity', '>', 0);

        if (! empty($o['batch_id'])) {
            $q->where('s.id', $o['batch_id']);
        } else {
            $this->pickOrder($this->sellableFilter($q, $o));
        }

        $out = [];
        foreach ($q->lockForUpdate()->get(['b.batch_id', 'b.quantity', 's.unit_cost']) as $row) {
            if ($left <= 0.00005) {
                break;
            }
            $take = round(min((float) $row->quantity, $left), 4);
            DB::table('stock_batch_balances')->where('batch_id', $row->batch_id)->where('location_id', $locationId)
                ->update(['quantity' => round((float) $row->quantity - $take, 4)]);
            $out[] = ['batch_id' => (int) $row->batch_id, 'qty' => -$take, 'unit_cost' => (float) $row->unit_cost, 'created' => false];
            $left = round($left - $take, 4);
        }

        return $out;
    }

    /**
     * What issue() would take, without taking it — for previews. Same order, same skipping.
     *
     * @return array<int, array{batch_id:int, qty:float, unit_cost:float, created:bool}>  qty is negative
     */
    public function peek(int $variantId, int $locationId, float $qty, array $o = []): array
    {
        $left = round($qty, 4);
        if ($left <= 0) {
            return [];
        }
        $q = DB::table('stock_batch_balances as b')
            ->join('stock_batches as s', 's.id', '=', 'b.batch_id')
            ->where('s.variant_id', $variantId)->where('b.location_id', $locationId)->where('b.quantity', '>', 0);
        if (! empty($o['batch_id'])) {
            $q->where('s.id', $o['batch_id']);
        } else {
            $this->pickOrder($this->sellableFilter($q, $o));
        }
        $out = [];
        foreach ($q->get(['b.batch_id', 'b.quantity', 's.unit_cost']) as $row) {
            if ($left <= 0.00005) {
                break;
            }
            $take = round(min((float) $row->quantity, $left), 4);
            $out[] = ['batch_id' => (int) $row->batch_id, 'qty' => -$take, 'unit_cost' => (float) $row->unit_cost, 'created' => false];
            $left = round($left - $take, 4);
        }

        return $out;
    }

    /** Everything a variant has at a branch, across all its batches. */
    public function total(int $variantId, int $locationId): float
    {
        return $this->sellable($variantId, $locationId);
    }

    /**
     * Moving-average costing: every batch of the product that still holds stock takes the average cost of them all.
     * The value of the stock does not change (each batch is re-priced, the total stays), so the Stock ledger still agrees.
     */
    public function blend(int $variantId): void
    {
        $rows = DB::table('stock_batch_balances as b')->join('stock_batches as s', 's.id', '=', 'b.batch_id')
            ->where('s.variant_id', $variantId)->where('b.quantity', '>', 0)
            ->groupBy('s.id', 's.unit_cost')->get(['s.id', 's.unit_cost', DB::raw('SUM(b.quantity) as q')]);
        $qty = (float) $rows->sum('q');
        if ($qty <= 0) {
            return;
        }
        $avg = round($rows->sum(fn ($r) => (float) $r->q * (float) $r->unit_cost) / $qty, 4);
        StockBatch::whereIn('id', $rows->pluck('id'))->update(['unit_cost' => $avg]);
    }

    /**
     * Stock that came back and must be checked before it is shelved: a copy of the batch it came from, held
     * (quarantined), with the returned quantity at the same cost.
     *
     * @return array<int, array{batch_id:int, qty:float, unit_cost:float, created:bool}>
     */
    public function receiveHeld(StockBatch $from, int $locationId, float $qty, string $reason, array $o = []): array
    {
        $held = StockBatch::create([
            'variant_id' => $from->variant_id, 'batch_no' => $from->batch_no, 'mfg_date' => $from->mfg_date, 'expiry_date' => $from->expiry_date,
            'unit_cost' => $from->unit_cost, 'received_at' => $o['received_at'] ?? now()->toDateString(), 'received_voucher_id' => $o['voucher_id'] ?? null,
            'status' => StockBatch::QUARANTINED, 'held_reason' => $reason, 'notes' => 'Returned by a customer',
        ]);
        $this->addBalance($held->id, $locationId, round($qty, 4));

        return [['batch_id' => $held->id, 'qty' => round($qty, 4), 'unit_cost' => (float) $held->unit_cost, 'created' => true]];
    }

    /**
     * What can be sold: batches that are active and not past their expiry date (today counts as in date).
     * `$o` narrows it the way a sale does — `sell_after` (a date: the batch must last at least until then)
     * or `allow_expired` (an expired batch may be sold too).
     */
    public function sellable(int $variantId, int $locationId, array $o = []): float
    {
        $q = DB::table('stock_batch_balances as b')
            ->join('stock_batches as s', 's.id', '=', 'b.batch_id')
            ->where('s.variant_id', $variantId)->where('b.location_id', $locationId);

        return (float) $this->sellableFilter($q, $o)->sum('b.quantity');
    }

    /** Stock that has passed its expiry date (or was marked expired) and is still on the shelf at a branch. */
    public function expiredOnHand(int $variantId, int $locationId): float
    {
        return (float) DB::table('stock_batch_balances as b')
            ->join('stock_batches as s', 's.id', '=', 'b.batch_id')
            ->where('s.variant_id', $variantId)->where('b.location_id', $locationId)
            ->where(fn ($w) => $w->where('s.status', StockBatch::EXPIRED)->orWhere(fn ($x) => $x->where('s.status', StockBatch::ACTIVE)->where('s.expiry_date', '<', today()->toDateString())))
            ->sum('b.quantity');
    }

    /**
     * Make the batches at a branch add up to `$target` (a stock count or a
     * hand-typed quantity). More stock = a new batch at the latest known cost;
     * less = taken first-expiring first.
     *
     * @return array the batch allocations made (empty when nothing changed)
     */
    public function syncTo(int $variantId, int $locationId, float $target, array $o = []): array
    {
        $delta = round($target - $this->total($variantId, $locationId), 4);
        if ($delta > 0) {
            return $this->receive($variantId, $locationId, $delta, $o + ['notes' => 'Stock adjustment']);
        }
        if ($delta < 0) {
            return $this->issue($variantId, $locationId, -$delta);
        }

        return [];
    }

    /** Cost of the variant's most recent batch (base, per base unit); 0 if it never had one. */
    public function lastCost(int $variantId): float
    {
        return (float) (StockBatch::where('variant_id', $variantId)->orderByDesc('id')->value('unit_cost') ?? 0);
    }

    /**
     * The order stock is taken in, from Settings → Stock & expiry: first-expiring first (batches with no
     * expiry after those with one, oldest first among equals — plain oldest-first for products without
     * expiry), or oldest first regardless of expiry.
     */
    private function sellableFilter($q, array $o = [])
    {
        if (! empty($o['allow_expired'])) {
            return $q->whereIn('s.status', [StockBatch::ACTIVE, StockBatch::EXPIRED]);   // the rules let an expired batch be sold
        }
        $today = today()->toDateString();
        $from = ! empty($o['sell_after']) && $o['sell_after'] > $today ? $o['sell_after'] : $today;

        return $q->where('s.status', StockBatch::ACTIVE)
            ->where(fn ($w) => $w->whereNull('s.expiry_date')->orWhere('s.expiry_date', '>=', $from));
    }

    private function pickOrder($q)
    {
        if (app(StockPolicy::class)->pickOrder() === 'fifo') {
            return $q->orderBy('s.id');
        }

        return $q->orderByRaw('s.expiry_date IS NULL')->orderBy('s.expiry_date')->orderBy('s.id');
    }

    private function addBalance(int $batchId, int $locationId, float $qty): void
    {
        $row = DB::table('stock_batch_balances')->where('batch_id', $batchId)->where('location_id', $locationId)->lockForUpdate()->first();
        if ($row) {
            DB::table('stock_batch_balances')->where('batch_id', $batchId)->where('location_id', $locationId)
                ->update(['quantity' => round((float) $row->quantity + $qty, 4)]);
        } else {
            DB::table('stock_batch_balances')->insert(['batch_id' => $batchId, 'location_id' => $locationId, 'quantity' => $qty]);
        }
    }
}

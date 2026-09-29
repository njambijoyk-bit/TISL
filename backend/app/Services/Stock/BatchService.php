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
            $q->where('s.status', StockBatch::ACTIVE)
              ->orderByRaw('s.expiry_date IS NULL')->orderBy('s.expiry_date')->orderBy('s.id');
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

    /** Everything a variant has at a branch, across all its batches. */
    public function total(int $variantId, int $locationId): float
    {
        return (float) DB::table('stock_batch_balances as b')
            ->join('stock_batches as s', 's.id', '=', 'b.batch_id')
            ->where('s.variant_id', $variantId)->where('b.location_id', $locationId)
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

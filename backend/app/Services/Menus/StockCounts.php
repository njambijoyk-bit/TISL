<?php

namespace App\Services\Menus;

use App\Models\Menus\Count;
use App\Models\Menus\CountLine;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Stock taking: the shelf is counted (in packs, the bigger unit or the base unit: 10 packs of Exe 2 kg is 20 kg) and the system is made to agree. A shortage takes stock off the lots
 * first-expiring first; stock found becomes a new lot at the last known cost. What the difference is worth is booked once, as the net: Dr Food Waste Expense, Cr Food Ingredients
 * Inventory for a loss, the other way round for a gain. Only the variants that were counted are touched.
 */
class StockCounts
{
    private const EPS = 0.00005;

    public function __construct(private IngredientUse $use)
    {
    }

    /** Everything physically on the shelf for a variant at a branch, whatever the lot's status. */
    public function expected(int $itemId, int $loc): float
    {
        return round((float) StockBatch::where('item_id', $itemId)->where('location_id', $loc)->where('qty_left', '>', 0)->sum('qty_left'), 4);
    }

    /**
     * @param array{location_id: int, date?: ?string, note?: ?string, lines: array<int, array{item_id: int, quantity: float, unit?: string}>} $d
     */
    public function post(array $d, ?User $by): Count
    {
        $loc = (int) ($d['location_id'] ?? 0);
        if (! DB::table('locations')->where('id', $loc)->exists()) {
            throw new BooksException('Choose the branch.');
        }
        $on = Carbon::parse($d['date'] ?? today()->toDateString());
        if ($on->toDateString() > today()->toDateString()) {
            throw new BooksException('That day has not come yet.');
        }
        $in = array_values($d['lines'] ?? []);
        if (! $in) {
            throw new BooksException('Count at least one ingredient.');
        }

        return DB::transaction(function () use ($d, $by, $loc, $on, $in) {
            $count = Count::create(['number' => 'TMP', 'location_id' => $loc, 'counted_on' => $on->toDateString(), 'note' => mb_substr(trim((string) ($d['note'] ?? '')), 0, 255) ?: null, 'created_by' => $by?->id]);
            $count->update(['number' => 'SC-'.str_pad((string) $count->id, 6, '0', STR_PAD_LEFT)]);
            $seen = [];
            $net = 0.0;
            foreach ($in as $n => $l) {
                $row = $n + 1;
                $item = IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->find((int) ($l['item_id'] ?? 0));
                if (! $item) {
                    throw new BooksException("Line {$row}: choose an ingredient variant.");
                }
                if (isset($seen[$item->id])) {
                    throw new BooksException("Line {$row}: {$item->name} is counted twice. Add the two counts together.");
                }
                $seen[$item->id] = true;
                $typed = round((float) ($l['quantity'] ?? -1), 4);
                if ($typed < 0) {
                    throw new BooksException("Line {$row}: enter how much {$item->name} was counted (0 if there is none).");
                }
                $unit = (string) ($l['unit'] ?? 'base');
                $counted = $item->toBase($unit, $typed);
                $expected = $this->expected($item->id, $loc);
                $var = round($counted - $expected, 4);
                $value = $var < -self::EPS ? -$this->takeOff($item, $loc, -$var, $count, $on, $by) : ($var > self::EPS ? $this->putOn($item, $loc, $var, $count, $on, $by) : 0.0);
                $net += $value;
                CountLine::create(['count_id' => $count->id, 'item_id' => $item->id, 'input_qty' => $typed, 'input_unit' => $unit, 'expected' => $expected, 'counted' => $counted, 'variance' => $var, 'value_change' => round($value, 2)]);
            }
            $net = round($net, 2);
            $journal = null;
            if (abs($net) >= 0.01) {
                $journal = $net < 0
                    ? $this->use->book(FoodLedgers::waste(), FoodLedgers::inventory(), -$net, "Stock take {$count->number}: stock missing", $loc, $on, $by)
                    : $this->use->book(FoodLedgers::inventory(), FoodLedgers::waste(), $net, "Stock take {$count->number}: stock found", $loc, $on, $by);
            }
            $count->update(['value_change' => $net, 'journal_id' => $journal?->id]);

            return $count->load('lines');
        });
    }

    /** @return float what the missing stock was worth */
    private function takeOff(IngredientItem $item, int $loc, float $qty, Count $count, Carbon $on, ?User $by): float
    {
        $cost = 0.0;
        $left = $qty;
        $lots = StockBatch::where('item_id', $item->id)->where('location_id', $loc)->where('qty_left', '>', 0)->lockForUpdate()->get()
            ->sortBy(fn (StockBatch $b) => [$b->expiry_date?->toDateString() ?? '9999-12-31', (int) $b->id])->values();
        foreach ($lots as $b) {
            if ($left <= self::EPS) {
                break;
            }
            $take = round(min((float) $b->qty_left, $left), 4);
            StockBatch::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left - '.number_format($take, 4, '.', ''))]);
            StockMove::create(['item_id' => $item->id, 'location_id' => $loc, 'batch_id' => $b->id, 'kind' => 'count', 'quantity' => -$take, 'unit_cost' => $b->unit_cost, 'ref_type' => 'count', 'ref_id' => $count->id,
                'note' => 'Stock take: missing', 'moved_on' => $on->toDateString(), 'created_by' => $by?->id]);
            $cost += $take * (float) $b->unit_cost;
            $left = round($left - $take, 4);
        }

        return $cost;
    }

    /** @return float what the stock found is worth */
    private function putOn(IngredientItem $item, int $loc, float $qty, Count $count, Carbon $on, ?User $by): float
    {
        $unitCost = $this->lastCost($item->id, $loc);
        $b = StockBatch::create(['item_id' => $item->id, 'location_id' => $loc, 'received_on' => $on->toDateString(), 'unit_cost' => $unitCost, 'qty_in' => $qty, 'qty_left' => $qty, 'status' => 'ok', 'source' => 'count']);
        StockMove::create(['item_id' => $item->id, 'location_id' => $loc, 'batch_id' => $b->id, 'kind' => 'count', 'quantity' => $qty, 'unit_cost' => $unitCost, 'ref_type' => 'count', 'ref_id' => $count->id,
            'note' => 'Stock take: found', 'moved_on' => $on->toDateString(), 'created_by' => $by?->id]);

        return $qty * $unitCost;
    }

    /** What one base unit last cost: at this branch, else anywhere. */
    public function lastCost(int $itemId, int $loc): float
    {
        $at = StockBatch::where('item_id', $itemId)->where('location_id', $loc)->where('source', '!=', 'count')->orderByDesc('id')->value('unit_cost');

        return (float) ($at ?? StockBatch::where('item_id', $itemId)->where('source', '!=', 'count')->orderByDesc('id')->value('unit_cost') ?? 0);
    }
}

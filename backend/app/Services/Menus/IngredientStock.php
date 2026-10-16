<?php

namespace App\Services\Menus;

use App\Models\Menus\IngredientItem;
use App\Models\Menus\Receipt;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Menus' own ingredient stock: batches per variant per branch, in the ingredient's base unit, and the log of every change. Nothing here touches products.
 * (Using stock up, wasting, counting and moving it arrive in the next steps; they add moves and take from batches the same way.)
 */
class IngredientStock
{
    private const EPS = 0.00005;

    public static function installed(): bool
    {
        return Schema::hasTable('menus_stock_batches') && Schema::hasTable('menus_stock_moves');
    }

    /**
     * Put a received lot on the shelf.
     *
     * @param array{batch_no?: ?string, expiry_date?: ?string, date?: ?string, source?: string, receipt_id?: ?int, voucher_id?: ?int, by?: ?int, note?: ?string} $o
     */
    public function receive(IngredientItem $item, int $locationId, float $qtyBase, float $costPerBase, array $o = []): StockBatch
    {
        $qty = round($qtyBase, 4);
        if ($qty <= 0) {
            throw new BooksException("The quantity of {$item->name} must be more than nothing.");
        }
        if ($item->track_expiry && empty($o['expiry_date'])) {
            throw new BooksException("{$item->name} expires: enter the expiry date of what you received.");
        }
        $source = $o['source'] ?? 'purchase';
        $on = $o['date'] ?? today()->toDateString();

        $batch = StockBatch::create([
            'item_id' => $item->id, 'location_id' => $locationId, 'batch_no' => $o['batch_no'] ?? null, 'received_on' => $on, 'expiry_date' => $item->track_expiry ? $o['expiry_date'] : null,
            'unit_cost' => round(max(0.0, $costPerBase), 6), 'qty_in' => $qty, 'qty_left' => $qty, 'status' => 'ok', 'source' => $source, 'receipt_id' => $o['receipt_id'] ?? null,
        ]);
        StockMove::create([
            'item_id' => $item->id, 'location_id' => $locationId, 'batch_id' => $batch->id, 'kind' => $source === 'opening' ? 'opening' : 'purchase', 'quantity' => $qty, 'unit_cost' => $batch->unit_cost,
            'receipt_id' => $o['receipt_id'] ?? null, 'voucher_id' => $o['voucher_id'] ?? null, 'note' => $o['note'] ?? null, 'moved_on' => $on, 'created_by' => $o['by'] ?? null,
        ]);

        return $batch;
    }

    /** Take a receipt's stock back off the shelf (the receipt was cancelled). Refused, naming the item, when some of it has been used since. */
    public function reverseReceipt(Receipt $receipt, ?int $by): void
    {
        $batches = StockBatch::where('receipt_id', $receipt->id)->lockForUpdate()->get();
        foreach ($batches as $b) {
            if ((float) $b->qty_left < (float) $b->qty_in - self::EPS) {
                $name = IngredientItem::whereKey($b->item_id)->value('name') ?? "Item {$b->item_id}";
                throw new BooksException("Some of the {$name} from this receipt has been used or written off already ({$this->fmt($b->qty_left)} of {$this->fmt($b->qty_in)} is left), so the receipt can not be cancelled.");
            }
        }
        foreach ($batches as $b) {
            StockMove::create([
                'item_id' => $b->item_id, 'location_id' => $b->location_id, 'batch_id' => $b->id, 'kind' => 'reversal', 'quantity' => -(float) $b->qty_left, 'unit_cost' => $b->unit_cost,
                'receipt_id' => $receipt->id, 'voucher_id' => $receipt->voucher_id, 'note' => 'Receipt cancelled', 'moved_on' => today()->toDateString(), 'created_by' => $by,
            ]);
            $b->update(['qty_left' => 0]);
        }
    }

    /** What is on the shelf, in the base unit, for one item at one branch (held and recalled lots do not count). */
    public function onHand(int $itemId, int $locationId): float
    {
        return round((float) StockBatch::where('item_id', $itemId)->where('location_id', $locationId)->where('status', 'ok')->sum('qty_left'), 4);
    }

    /**
     * Quantity and value per variant at a branch.
     *
     * @return array<int, array{qty: float, value: float, next_expiry: ?string}> keyed by item id
     */
    public function levels(int $locationId): array
    {
        $out = [];
        $rows = StockBatch::where('location_id', $locationId)->where('qty_left', '>', 0)->where('status', 'ok')->get(['item_id', 'qty_left', 'unit_cost', 'expiry_date']);
        foreach ($rows as $b) {
            $o = $out[$b->item_id] ?? ['qty' => 0.0, 'value' => 0.0, 'next_expiry' => null];
            $o['qty'] += (float) $b->qty_left;
            $o['value'] += (float) $b->qty_left * (float) $b->unit_cost;
            $exp = $b->expiry_date?->toDateString();
            if ($exp && ($o['next_expiry'] === null || $exp < $o['next_expiry'])) {
                $o['next_expiry'] = $exp;
            }
            $out[$b->item_id] = $o;
        }
        foreach ($out as $id => $o) {
            $out[$id] = ['qty' => round($o['qty'], 4), 'value' => round($o['value'], 2), 'next_expiry' => $o['next_expiry']];
        }

        return $out;
    }

    private function fmt(mixed $n): string
    {
        return rtrim(rtrim(number_format((float) $n, 4, '.', ''), '0'), '.');
    }
}

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

    /** Is the Menus module switched on, with its stock tables in place? The core stock pages list ingredients only then. */
    public static function moduleOn(): bool
    {
        if (! Schema::hasTable('menus_ingredient_items')) {
            return false;
        }
        try {
            return app(\App\Services\Licensing\LicenseManager::class)->isActive('menus');
        } catch (\Throwable) {
            return false;
        }
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
        ] + (Schema::hasColumn('menus_stock_batches', 'voucher_id') ? ['voucher_id' => $o['voucher_id'] ?? null, 'voucher_item_id' => $o['voucher_item_id'] ?? null] : []));
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

    /** Take what a voucher brought in off the shelf again (it was cancelled or is being changed). Refused, naming the item, when some of it has been used since. Safe to call twice. */
    public function reverseVoucher(int $voucherId, ?int $by): void
    {
        if (! Schema::hasColumn('menus_stock_batches', 'voucher_id')) {
            return;
        }
        $batches = StockBatch::where('voucher_id', $voucherId)->where('qty_in', '>', 0)->lockForUpdate()->get();
        foreach ($batches as $b) {
            if ((float) $b->qty_left > 0 && (float) $b->qty_left < (float) $b->qty_in - self::EPS) {
                $name = IngredientItem::whereKey($b->item_id)->value('name') ?? "Item {$b->item_id}";
                throw new BooksException("Some of the {$name} from this voucher has been used or written off already ({$this->fmt($b->qty_left)} of {$this->fmt($b->qty_in)} is left), so the voucher can not be cancelled or changed.");
            }
            if ((float) $b->qty_left <= 0 && StockMove::where('batch_id', $b->id)->where('kind', 'reversal')->exists()) {
                continue;   // already taken back
            }
            if ((float) $b->qty_left <= 0) {
                $name = IngredientItem::whereKey($b->item_id)->value('name') ?? "Item {$b->item_id}";
                throw new BooksException("All of the {$name} from this voucher has been used or written off already, so the voucher can not be cancelled or changed.");
            }
        }
        foreach ($batches as $b) {
            if ((float) $b->qty_left <= 0) {
                continue;
            }
            StockMove::create([
                'item_id' => $b->item_id, 'location_id' => $b->location_id, 'batch_id' => $b->id, 'kind' => 'reversal', 'quantity' => -(float) $b->qty_left, 'unit_cost' => $b->unit_cost,
                'voucher_id' => $voucherId, 'note' => 'Voucher cancelled', 'moved_on' => today()->toDateString(), 'created_by' => $by,
            ]);
            $b->update(['qty_left' => 0]);
        }
    }

    /**
     * Goods sent back to the supplier on a debit note: the quantity comes off the lots that the delivery (or the documents of its chain) brought in, first-expiring first. Held, recalled and expired
     * lots may go back (that is often why they do). Refused, saying how much is left of that delivery, when it is less than what is being sent back.
     *
     * @param array<int, int> $voucherIds the vouchers whose lots may be taken from
     */
    public function returnToSupplier(IngredientItem $item, int $locationId, float $qty, array $voucherIds, int $noteId, string $date, ?int $by, string $note = ''): void
    {
        $lots = $voucherIds ? StockBatch::where('item_id', $item->id)->where('location_id', $locationId)->whereIn('voucher_id', $voucherIds)->where('qty_left', '>', 0)->lockForUpdate()->get()
            ->sortBy(fn (StockBatch $b) => [$b->expiry_date?->toDateString() ?? '9999-12-31', (int) $b->id])->values() : collect();
        $have = round((float) $lots->sum('qty_left'), 4);
        if ($have + self::EPS < $qty) {
            $name = trim($item->ingredient->name.' '.$item->name);
            $unit = $item->ingredient->baseUnit?->code;
            throw new BooksException("Only {$this->fmt($have)} {$unit} of {$name} is left from what that purchase brought in (the rest has been used, wasted or moved), so {$this->fmt($qty)} {$unit} can not go back to the supplier.");
        }
        $left = $qty;
        foreach ($lots as $b) {
            if ($left <= self::EPS) {
                break;
            }
            $take = round(min((float) $b->qty_left, $left), 4);
            StockBatch::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left - '.number_format($take, 4, '.', ''))]);
            StockMove::create([
                'item_id' => $item->id, 'location_id' => $locationId, 'batch_id' => $b->id, 'kind' => 'supplier_return', 'quantity' => -$take, 'unit_cost' => $b->unit_cost, 'voucher_id' => $noteId,
                'note' => trim('Sent back to the supplier '.$note), 'moved_on' => $date, 'created_by' => $by,
            ]);
            $left = round($left - $take, 4);
        }
    }

    /** A debit note was cancelled or is being changed: what it took off the lots goes back on them. Safe to call twice. */
    public function reverseSupplierReturn(int $noteId, ?int $by): void
    {
        $moves = StockMove::where('voucher_id', $noteId)->where('kind', 'supplier_return')->get();
        foreach ($moves as $m) {
            if (StockMove::where('voucher_id', $noteId)->where('kind', 'reversal')->where('batch_id', $m->batch_id)->exists()) {
                continue;   // already taken back
            }
            $back = abs((float) $m->quantity);
            StockBatch::whereKey($m->batch_id)->update(['qty_left' => DB::raw('qty_left + '.number_format($back, 4, '.', ''))]);
            StockMove::create(['item_id' => $m->item_id, 'location_id' => $m->location_id, 'batch_id' => $m->batch_id, 'kind' => 'reversal', 'quantity' => $back, 'unit_cost' => $m->unit_cost, 'voucher_id' => $noteId,
                'note' => 'Debit note cancelled', 'moved_on' => today()->toDateString(), 'created_by' => $by]);
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

    /**
     * Lots that have expired or will within `$days` days, soonest first. Held and recalled lots are listed too, with their status.
     *
     * @return array<int, array{batch_id: int, item_id: int, name: string, unit: string, quantity: float, value: float, expiry_date: string, days_left: int, expired: bool, batch_no: ?string, status: string}>
     */
    public function expiring(int $locationId, int $days = 7, ?\Illuminate\Support\Carbon $on = null): array
    {
        $on = ($on ?? today())->copy()->startOfDay();
        $rows = StockBatch::where('location_id', $locationId)->where('qty_left', '>', 0)->whereNotNull('expiry_date')->where('expiry_date', '<=', $on->copy()->addDays(max(0, $days))->toDateString())
            ->orderBy('expiry_date')->orderBy('id')->get();
        $items = IngredientItem::with('ingredient.baseUnit')->whereIn('id', $rows->pluck('item_id'))->get()->keyBy('id');

        return $rows->map(function (StockBatch $b) use ($items, $on) {
            $i = $items[$b->item_id] ?? null;
            $left = (int) $on->diffInDays($b->expiry_date->copy()->startOfDay(), false);

            return ['batch_id' => $b->id, 'item_id' => $b->item_id, 'name' => $i ? trim($i->ingredient->name.' '.$i->name) : "Item {$b->item_id}", 'unit' => $i?->ingredient->baseUnit?->code ?? '',
                'quantity' => round((float) $b->qty_left, 4), 'value' => round((float) $b->qty_left * (float) $b->unit_cost, 2), 'expiry_date' => $b->expiry_date->toDateString(), 'days_left' => $left,
                'expired' => $left < 0, 'batch_no' => $b->batch_no, 'status' => $b->status];
        })->all();
    }

    private function fmt(mixed $n): string
    {
        return rtrim(rtrim(number_format((float) $n, 4, '.', ''), '0'), '.');
    }
}

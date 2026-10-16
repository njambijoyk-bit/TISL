<?php

namespace App\Services\Menus;

use App\Models\Menus\IngredientItem;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Models\StockTransfer;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Stock\StockTransferService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Ingredients sent from one branch to another, lot by lot: each lot keeps its cost, expiry and batch number on the other side. Expired, held and recalled stock is not sent. The core transfer drives this. */
class StockTransfers
{
    private const EPS = 0.00005;

    /**
     * A transfer made from Menus: the stock goes through the core transfer (the same one the Purchases menu lists, with its note and its Journal for anything short), sent and received
     * at once, so the other branch's shelf has it straight away.
     *
     * @param array{from_location_id: int, to_location_id: int, date?: ?string, note?: ?string, lines: array<int, array{item_id: int, quantity: float, unit?: string}>} $d
     */
    public function send(array $d, ?User $by): StockTransfer
    {
        $from = (int) ($d['from_location_id'] ?? 0);
        $to = (int) ($d['to_location_id'] ?? 0);
        if (! DB::table('locations')->where('id', $from)->exists() || ! DB::table('locations')->where('id', $to)->exists()) {
            throw new BooksException('Choose the two branches.');
        }
        if ($from === $to) {
            throw new BooksException('Choose two different branches.');
        }
        if (Carbon::parse($d['date'] ?? today()->toDateString())->toDateString() > today()->toDateString()) {
            throw new BooksException('That day has not come yet.');
        }
        $in = array_values($d['lines'] ?? []);
        if (! $in) {
            throw new BooksException('Add at least one ingredient to send.');
        }
        if (! self::installed()) {
            throw new BooksException('Run database script 187_menus_core_stock.sql first: transfers of ingredients need it.');
        }
        $ingredients = [];
        foreach ($in as $n => $l) {
            $row = $n + 1;
            $item = IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->find((int) ($l['item_id'] ?? 0));
            if (! $item) {
                throw new BooksException("Line {$row}: choose an ingredient variant.");
            }
            $typed = round((float) ($l['quantity'] ?? 0), 4);
            if ($typed <= 0) {
                throw new BooksException("Line {$row}: enter how much {$item->name} to send.");
            }
            $ingredients[] = ['item_id' => $item->id, 'quantity' => $item->toBase((string) ($l['unit'] ?? 'base'), $typed)];
        }
        $service = app(StockTransferService::class);

        return DB::transaction(function () use ($service, $from, $to, $ingredients, $d, $by) {
            $t = $service->send($from, $to, [], mb_substr(trim((string) ($d['note'] ?? '')), 0, 255) ?: null, $by, $ingredients, Carbon::parse($d['date'] ?? today()->toDateString()));

            return $service->receive($t, [], $by);
        });
    }

    public static function installed(): bool
    {
        return \Illuminate\Support\Facades\Schema::hasTable('stock_transfer_ingredient_lines');
    }

    /**
     * Take an amount of a variant off the sending branch's lots, first-expiring first. Expired, held and recalled stock is not sent.
     *
     * @return array<int, array{batch_id: int, qty: float, unit_cost: float}>
     */
    public function dispatch(IngredientItem $item, int $from, float $qty, int $transferId, Carbon $on, ?User $by): array
    {
        $lots = StockBatch::where('item_id', $item->id)->where('location_id', $from)->where('status', 'ok')->where('qty_left', '>', 0)
            ->where(fn ($w) => $w->whereNull('expiry_date')->orWhere('expiry_date', '>=', $on->toDateString()))->lockForUpdate()->get()
            ->sortBy(fn (StockBatch $b) => [$b->expiry_date?->toDateString() ?? '9999-12-31', (int) $b->id])->values();
        $have = round((float) $lots->sum('qty_left'), 4);
        if ($have + self::EPS < $qty) {
            $name = trim($item->ingredient->name.' '.$item->name);
            throw new BooksException("Only {$this->fmt($have)} {$item->ingredient->baseUnit?->code} of {$name} can be sent from here, not {$this->fmt($qty)} (expired, held or recalled stock is not sent).");
        }
        $left = $qty;
        $out = [];
        foreach ($lots as $b) {
            if ($left <= self::EPS) {
                break;
            }
            $take = round(min((float) $b->qty_left, $left), 4);
            StockBatch::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left - '.number_format($take, 4, '.', ''))]);
            StockMove::create(['item_id' => $item->id, 'location_id' => $from, 'batch_id' => $b->id, 'kind' => 'transfer_out', 'quantity' => -$take, 'unit_cost' => $b->unit_cost, 'ref_type' => 'transfer', 'ref_id' => $transferId,
                'note' => 'Sent to another branch', 'moved_on' => $on->toDateString(), 'created_by' => $by?->id]);
            $out[] = ['batch_id' => (int) $b->id, 'qty' => $take, 'unit_cost' => (float) $b->unit_cost];
            $left = round($left - $take, 4);
        }

        return $out;
    }

    /** Stock that was sent arrives: a lot at the receiving branch with the cost, expiry and batch number of the one it left. */
    public function arrive(int $batchId, int $to, float $qty, int $transferId, Carbon $on, ?User $by): ?StockBatch
    {
        $b = StockBatch::find($batchId);
        if (! $b || $qty <= 0) {
            return null;
        }
        $new = StockBatch::create(['item_id' => $b->item_id, 'location_id' => $to, 'batch_no' => $b->batch_no, 'received_on' => $b->received_on?->toDateString() ?? $on->toDateString(), 'expiry_date' => $b->expiry_date?->toDateString(),
            'unit_cost' => $b->unit_cost, 'qty_in' => $qty, 'qty_left' => $qty, 'status' => 'ok', 'source' => 'transfer']);
        StockMove::create(['item_id' => $b->item_id, 'location_id' => $to, 'batch_id' => $new->id, 'kind' => 'transfer_in', 'quantity' => $qty, 'unit_cost' => $b->unit_cost, 'ref_type' => 'transfer', 'ref_id' => $transferId,
            'note' => 'Received from another branch', 'moved_on' => $on->toDateString(), 'created_by' => $by?->id]);

        return $new;
    }

    /** A transfer was cancelled in transit: what it took comes back to the lot it left. */
    public function putBack(int $batchId, float $qty, int $transferId, ?User $by): void
    {
        $b = StockBatch::whereKey($batchId)->lockForUpdate()->first();
        if (! $b || $qty <= 0) {
            return;
        }
        StockBatch::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left + '.number_format($qty, 4, '.', ''))]);
        StockMove::create(['item_id' => $b->item_id, 'location_id' => $b->location_id, 'batch_id' => $b->id, 'kind' => 'reversal', 'quantity' => $qty, 'unit_cost' => $b->unit_cost, 'ref_type' => 'transfer', 'ref_id' => $transferId,
            'note' => 'Transfer cancelled', 'moved_on' => today()->toDateString(), 'created_by' => $by?->id]);
    }

    private function fmt(mixed $n): string
    {
        return rtrim(rtrim(number_format((float) $n, 4, '.', ''), '0'), '.');
    }
}

<?php

namespace App\Services\Menus;

use App\Models\Menus\IngredientItem;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Models\Menus\Transfer;
use App\Models\Menus\TransferLine;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Stock sent from one branch to another, lot by lot: each lot keeps its cost, expiry and batch number on the other side. Expired, held and recalled stock is not sent. */
class StockTransfers
{
    private const EPS = 0.00005;

    /**
     * @param array{from_location_id: int, to_location_id: int, date?: ?string, note?: ?string, lines: array<int, array{item_id: int, quantity: float, unit?: string}>} $d
     */
    public function send(array $d, ?User $by): Transfer
    {
        $from = (int) ($d['from_location_id'] ?? 0);
        $to = (int) ($d['to_location_id'] ?? 0);
        if (! DB::table('locations')->where('id', $from)->exists() || ! DB::table('locations')->where('id', $to)->exists()) {
            throw new BooksException('Choose the two branches.');
        }
        if ($from === $to) {
            throw new BooksException('Choose two different branches.');
        }
        $on = Carbon::parse($d['date'] ?? today()->toDateString());
        if ($on->toDateString() > today()->toDateString()) {
            throw new BooksException('That day has not come yet.');
        }
        $in = array_values($d['lines'] ?? []);
        if (! $in) {
            throw new BooksException('Add at least one ingredient to send.');
        }

        return DB::transaction(function () use ($d, $by, $from, $to, $on, $in) {
            $t = Transfer::create(['number' => 'TMP', 'from_location_id' => $from, 'to_location_id' => $to, 'transferred_on' => $on->toDateString(), 'note' => mb_substr(trim((string) ($d['note'] ?? '')), 0, 255) ?: null, 'created_by' => $by?->id]);
            $t->update(['number' => 'TR-'.str_pad((string) $t->id, 6, '0', STR_PAD_LEFT)]);
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
                $qty = $item->toBase((string) ($l['unit'] ?? 'base'), $typed);
                $lots = StockBatch::where('item_id', $item->id)->where('location_id', $from)->where('status', 'ok')->where('qty_left', '>', 0)
                    ->where(fn ($w) => $w->whereNull('expiry_date')->orWhere('expiry_date', '>=', $on->toDateString()))->lockForUpdate()->get()
                    ->sortBy(fn (StockBatch $b) => [$b->expiry_date?->toDateString() ?? '9999-12-31', (int) $b->id])->values();
                $have = round((float) $lots->sum('qty_left'), 4);
                if ($have + self::EPS < $qty) {
                    throw new BooksException("Only {$this->fmt($have)} {$item->ingredient->baseUnit?->code} of ".trim($item->ingredient->name.' '.$item->name)." can be sent from here, not {$this->fmt($qty)}.");
                }
                $left = $qty;
                $worth = 0.0;
                foreach ($lots as $b) {
                    if ($left <= self::EPS) {
                        break;
                    }
                    $take = round(min((float) $b->qty_left, $left), 4);
                    StockBatch::whereKey($b->id)->update(['qty_left' => DB::raw('qty_left - '.number_format($take, 4, '.', ''))]);
                    $new = StockBatch::create(['item_id' => $item->id, 'location_id' => $to, 'batch_no' => $b->batch_no, 'received_on' => $b->received_on?->toDateString() ?? $on->toDateString(), 'expiry_date' => $b->expiry_date?->toDateString(),
                        'unit_cost' => $b->unit_cost, 'qty_in' => $take, 'qty_left' => $take, 'status' => 'ok', 'source' => 'transfer']);
                    $ref = ['ref_type' => 'transfer', 'ref_id' => $t->id, 'moved_on' => $on->toDateString(), 'created_by' => $by?->id, 'unit_cost' => $b->unit_cost, 'item_id' => $item->id];
                    StockMove::create($ref + ['location_id' => $from, 'batch_id' => $b->id, 'kind' => 'transfer_out', 'quantity' => -$take, 'note' => "To branch {$to}"]);
                    StockMove::create($ref + ['location_id' => $to, 'batch_id' => $new->id, 'kind' => 'transfer_in', 'quantity' => $take, 'note' => "From branch {$from}"]);
                    $worth += $take * (float) $b->unit_cost;
                    $left = round($left - $take, 4);
                }
                TransferLine::create(['transfer_id' => $t->id, 'item_id' => $item->id, 'quantity' => $qty, 'unit_cost' => $qty > 0 ? round($worth / $qty, 6) : 0]);
            }

            return $t->load('lines');
        });
    }

    private function fmt(mixed $n): string
    {
        return rtrim(rtrim(number_format((float) $n, 4, '.', ''), '0'), '.');
    }
}

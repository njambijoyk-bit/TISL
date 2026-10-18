<?php

namespace App\Services\Menus;

use App\Models\Books\Voucher;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\OrderPackaging;
use App\Models\Menus\StockUse;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * The packaging that went out with a sale comes off the shelf, free or charged: a container is used either way. Each item's stock goes down by the count the order was checked out with, and the cost
 * is booked in one journal, to the account its kind is charged to (Kitchen Supplies Used and the like) against the account the kind's stock is carried on. It is recorded against the sale, so
 * cancelling the sale gives it back with everything else. A shortage never stops a sale: what is on the shelf is taken, and the rest is noted in the log, because running out of containers is a
 * count to put right, not a reason to refuse a guest.
 */
class PackagingStock
{
    public function __construct(private IngredientUse $use)
    {
    }

    public function apply(MenuOrder $o, Voucher $sale, ?User $by): void
    {
        if (! PackagingCheckout::installed() || ! DishStock::installed()) {
            return;
        }
        $rows = OrderPackaging::where('order_id', $o->id)->where('quantity', '>', 0)->get();
        if ($rows->isEmpty()) {
            return;
        }
        $loc = (int) $o->location_id;
        $date = $sale->date instanceof Carbon ? $sale->date : Carbon::parse($sale->date ?? today());
        $ref = ['type' => 'voucher', 'id' => (int) $sale->id];
        $byKind = [];
        $uses = [];
        foreach ($rows as $r) {
            $item = IngredientItem::with('ingredient.baseUnit', 'ingredient.altUnit')->find($r->item_id);
            if (! $item || ! $item->ingredient) {
                continue;
            }
            $ing = $item->ingredient;
            $have = (float) $this->use->usable($ing, $loc, $date)->sum('qty_left');
            $qty = min((float) $r->quantity, $have);
            if ($qty < (float) $r->quantity) {
                Log::notice("Packaging short on order {$o->number}: {$ing->name} needed {$r->quantity}, had {$have}.");
            }
            if ($qty <= 0) {
                continue;
            }
            $u = $this->use->consume(new DishRecipe(), 1.0, $loc, $ref, $by, ['date' => $date->toDateString(), 'post' => false, 'needs' => [$ing->id => ['ingredient' => $ing, 'qty' => $qty]]]);
            $uses[] = $u['use_id'];
            foreach (($u['by_kind'] ?? []) as $kind => $cost) {
                $byKind[$kind] = ($byKind[$kind] ?? 0.0) + $cost;
            }
        }
        if ($uses && array_sum($byKind) > 0) {
            $journal = $this->use->bookKinds($byKind, 'cost', "Packaging used for {$sale->voucher_number}", $loc, $date, $by);
            StockUse::whereIn('id', $uses)->update(['journal_id' => $journal->id]);
        }
    }
}

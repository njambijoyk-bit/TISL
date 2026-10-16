<?php

namespace App\Observers\Menus;

use App\Models\Books\StockMovement;
use App\Models\Menus\StockMove;
use App\Services\Menus\IngredientItemSource;
use Illuminate\Support\Facades\Schema;

/**
 * Every change to the kitchen's ingredient shelf is also written to the core stock movements (as an item of type menus_ingredient_item, quantity in the base unit), so the stock
 * journal and the stock reports see ingredients move the way they see products move. Menus' own movement stays the detail (which lot); this is the ledger of what happened.
 */
class StockMoveObserver
{
    /** Menus' kind of movement => the core movement type. A count and a reversal are named by what they did. */
    private const TYPES = ['purchase' => 'purchase', 'opening' => 'opening_stock', 'use' => 'ingredient_use', 'use_reversal' => 'ingredient_use', 'waste' => 'write_off', 'waste_reversal' => 'write_off',
        'transfer_out' => 'transfer_out', 'transfer_in' => 'transfer_in', 'reversal' => 'reversal'];

    public function created(StockMove $m): void
    {
        if (! Schema::hasTable('stock_movements') || ! StockMovement::hasItemColumns('stock_movements')) {
            return;
        }
        $qty = (float) $m->quantity;
        if ($m->kind === 'reversal' && $m->voucher_id) {
            // a voucher cancelled: what it brought in is hidden from the journal, as a cancelled product voucher's movements are
            StockMovement::where('voucher_id', $m->voucher_id)->where('item_type', IngredientItemSource::TYPE)->where('item_id', $m->item_id)->update(['reversed' => true]);

            return;
        }
        StockMovement::create([
            'voucher_id' => $m->voucher_id, 'voucher_item_id' => null, 'variant_id' => null, 'location_id' => $m->location_id, 'quantity' => $qty,
            'movement_type' => $m->kind === 'count' ? ($qty < 0 ? 'count_loss' : 'count_gain') : (self::TYPES[$m->kind] ?? $m->kind), 'movement_date' => $m->moved_on?->toDateString() ?? today()->toDateString(), 'created_at' => now(),
            'batch_id' => null, 'unit_cost' => $m->unit_cost, 'ref_type' => $m->ref_type ?: $m->kind, 'ref_id' => $m->ref_id, 'item_type' => IngredientItemSource::TYPE, 'item_id' => $m->item_id,
        ]);
    }
}

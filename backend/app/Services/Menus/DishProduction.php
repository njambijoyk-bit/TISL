<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishBatch;
use App\Models\Menus\DishMove;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\Production;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/**
 * Making a batch of a dish ahead (the cake): the recipe's ingredients are used up and the portions go on the shelf as a batch, costed at what the ingredients cost. The value only
 * moves from the ingredients to the dish within the same inventory account, so nothing is booked until the portions are sold. A batch can be cancelled while all of it is still there.
 */
class DishProduction
{
    public function __construct(private IngredientUse $use)
    {
    }

    /** @param array{batch_no?: ?string, expiry_date?: ?string, note?: ?string, date?: ?string} $o */
    public function run(Dish $dish, int $locationId, float $portions, array $o = [], ?User $by = null): Production
    {
        $portions = round($portions, 4);
        if ($portions <= 0) {
            throw new BooksException('Enter how many portions were made.');
        }
        $recipe = DishRecipe::where('dish_id', $dish->id)->where('is_active', true)->first();
        if (! $recipe) {
            throw new BooksException("{$dish->name} has no recipe, so there is nothing to make it from. Write its recipe first.");
        }
        if ($recipe->made_to_order) {
            throw new BooksException("{$dish->name} is made to order: selling it uses the ingredients, so there is nothing to make ahead. Change its recipe to made ahead first.");
        }
        $on = $o['date'] ?? today()->toDateString();

        return DB::transaction(function () use ($dish, $recipe, $locationId, $portions, $o, $by, $on) {
            $p = Production::create(['number' => 'TMP', 'dish_id' => $dish->id, 'recipe_id' => $recipe->id, 'location_id' => $locationId, 'portions' => $portions, 'status' => 'posted',
                'note' => $o['note'] ?? null, 'made_on' => $on, 'created_by' => $by?->id]);
            $p->update(['number' => 'MB-'.str_pad((string) $p->id, 6, '0', STR_PAD_LEFT)]);
            $res = $this->use->consume($recipe, $portions, $locationId, ['type' => 'production', 'id' => $p->id], $by, ['date' => $on, 'post' => false]);
            $unit = round($res['cost'] / $portions, 6);
            $batch = DishBatch::create(['dish_id' => $dish->id, 'location_id' => $locationId, 'production_id' => $p->id, 'batch_no' => $o['batch_no'] ?? $p->number, 'made_on' => $on,
                'expiry_date' => $o['expiry_date'] ?? null, 'unit_cost' => $unit, 'qty_in' => $portions, 'qty_left' => $portions, 'status' => 'ok']);
            DishMove::create(['dish_id' => $dish->id, 'location_id' => $locationId, 'batch_id' => $batch->id, 'kind' => 'production', 'quantity' => $portions, 'unit_cost' => $unit,
                'use_id' => $res['use_id'], 'production_id' => $p->id, 'ref_type' => 'production', 'ref_id' => $p->id, 'moved_on' => $on, 'created_by' => $by?->id]);
            $p->update(['cost' => $res['cost'], 'unit_cost' => $unit, 'batch_id' => $batch->id, 'use_id' => $res['use_id']]);

            return $p->fresh();
        });
    }

    public function cancel(Production $p, ?User $by = null): Production
    {
        if ($p->status !== 'posted') {
            throw new BooksException("{$p->number} is already {$p->status}.");
        }

        return DB::transaction(function () use ($p, $by) {
            $batch = DishBatch::whereKey($p->batch_id)->lockForUpdate()->first();
            if ($batch && (float) $batch->qty_left + 0.00005 < (float) $batch->qty_in) {
                throw new BooksException("Some of what {$p->number} made has already been sold or wasted, so it can not be cancelled.");
            }
            if ($batch) {
                DishMove::create(['dish_id' => $p->dish_id, 'location_id' => $p->location_id, 'batch_id' => $batch->id, 'kind' => 'production_reversal', 'quantity' => -(float) $batch->qty_left,
                    'unit_cost' => $batch->unit_cost, 'production_id' => $p->id, 'ref_type' => 'production', 'ref_id' => $p->id, 'note' => 'Batch cancelled', 'moved_on' => today()->toDateString(), 'created_by' => $by?->id]);
                $batch->update(['qty_left' => 0]);
            }
            $this->use->reverse('production', (int) $p->id, $by, 'Batch cancelled');
            $p->update(['status' => 'cancelled', 'cancelled_at' => now()]);

            return $p->fresh();
        });
    }
}

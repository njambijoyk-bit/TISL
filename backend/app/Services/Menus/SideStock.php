<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishServing;
use App\Models\Menus\DishSlot;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;

/**
 * What the shelf holds of each side, and so how many of a dish with a make-up could be sold now. A side made to order is as many as its recipe's ingredients allow, a side made ahead is the
 * prepared food in date, a ready-to-serve side is its ingredient on the shelf. All of it is counted in the unit the side's source is counted in, the same as the amount a serving holds.
 * Sides that share an ingredient (two recipes both using flour) are counted one at a time here; the sale itself takes what is really there and refuses when it is short.
 */
class SideStock
{
    public function __construct(private Sides $sides, private IngredientUse $use, private SideSales $sales)
    {
    }

    /** How much of a side could be served now at a branch, in its source's unit. */
    public function available(Side $side, int $locationId): float
    {
        if ($side->recipe_id) {
            $recipe = $side->recipe ?? throw new BooksException("The recipe of {$side->name} has been removed.");
            if (! $recipe->is_active) {
                return 0.0;
            }
            if ($recipe->made_to_order) {
                try {
                    return $this->use->capacity($recipe, $locationId);
                } catch (BooksException) {
                    return 0.0;   // an ingredient was removed or switched off: it can not be made until the recipe is fixed
                }
            }

            return $this->sales->preparedQty($side, $locationId);
        }
        $ing = $side->ingredient;

        return $ing && $ing->is_active ? round((float) $this->use->usable($ing, $locationId)->sum('qty_left'), 4) : 0.0;
    }

    /** How many servings of a size of a side could be served now. */
    public function servings(Side $side, int $locationId, ?int $servingId = null): float
    {
        if (! $side->is_active) {
            return 0.0;
        }
        $each = $this->sides->amountFor($side, $servingId);

        return $each > 0 ? round($this->available($side, $locationId) / $each, 4) : 0.0;
    }

    /**
     * How many of a dish with a make-up could be sold now: the sides that always come must all be there; one of a choose-one slot is enough; a choose-any slot needs as many sides as its fewest
     * picks; extras are not needed. The smallest of those is the answer. With sizes, the size that needs the most decides unless one is asked for.
     */
    public function portions(Dish $dish, int $locationId, ?int $servingId = null): float
    {
        $slots = DishSlot::with('choices.side.recipe', 'choices.side.ingredient.baseUnit', 'choices.side.amounts')->where('dish_id', $dish->id)->get();
        $sizes = $servingId ? [$servingId] : DishServing::where('dish_id', $dish->id)->pluck('serving_id')->map(fn ($i) => (int) $i)->all();
        $best = null;
        foreach ($sizes ?: [null] as $size) {
            $got = INF;
            foreach ($slots as $slot) {
                $got = min($got, $this->slot($slot, $locationId, $size));
            }
            // the size that can be made the least decides when none was asked for
            $best = $best === null ? $got : min($best, $got);
        }

        return is_infinite((float) $best) ? 0.0 : (float) $best;
    }

    private function slot(DishSlot $slot, int $locationId, ?int $size): float
    {
        $have = $slot->choices->filter(fn ($c) => $c->side)->map(fn ($c) => $this->servings($c->side, $locationId, $size))->sortDesc()->values();
        switch ($slot->kind) {
            case 'fixed':
                return $have->isEmpty() ? INF : (float) $have->min();
            case 'choose_one':
                return $have->isEmpty() ? INF : (float) $have->first();
            case 'choose_any':
                $min = max(0, (int) $slot->min_choices);

                return $min === 0 || $have->isEmpty() ? INF : (float) ($have[$min - 1] ?? 0.0);
            default:
                return INF;   // extras are never needed
        }
    }

    /**
     * What an order of these sides lacks, as the names of the sides that can not be served in full. `$wanted` is each side's amount for the whole order, in its source's unit. Sides made to
     * order and ready-to-serve sides are counted together by the ingredients they take (two recipes that both use flour share the flour); sides made ahead by their prepared food.
     *
     * @param array<int, float> $wanted side id => amount
     * @return array<string, float> side name => (for a prepared side) how much more is wanted than there is; 0 for the others
     */
    public function short(array $wanted, int $locationId): array
    {
        $out = [];
        $ing = [];   // ingredient id => ['ingredient' => ..., 'qty' => needed in all, 'sides' => names]
        foreach (Side::with('recipe', 'ingredient')->whereIn('id', array_keys($wanted))->get() as $side) {
            $amount = (float) $wanted[$side->id];
            if (! $side->is_active) {
                $out[$side->name] = $amount;

                continue;
            }
            if ($side->recipe_id && $side->recipe && ! $side->recipe->made_to_order) {
                $have = $this->sales->preparedQty($side, $locationId);
                if ($amount > $have + 0.0001) {
                    $out[$side->name] = round($amount - $have, 4);
                }

                continue;
            }
            try {
                $needs = $side->recipe_id ? $this->use->needs($side->recipe ?? throw new BooksException('removed'), $amount)
                    : ($side->ingredient ? [$side->ingredient->id => ['ingredient' => $side->ingredient, 'qty' => $amount]] : throw new BooksException('removed'));
            } catch (BooksException) {
                $out[$side->name] = $amount;   // a recipe or ingredient behind it was removed or switched off

                continue;
            }
            foreach ($needs as $id => $n) {
                $ing[$id] ??= ['ingredient' => $n['ingredient'], 'qty' => 0.0, 'sides' => []];
                $ing[$id]['qty'] += $n['qty'];
                $ing[$id]['sides'][$side->name] = true;
            }
        }
        foreach ($ing as $row) {
            if ($row['qty'] > (float) $this->use->usable($row['ingredient'], $locationId)->sum('qty_left') + 0.0001) {
                foreach (array_keys($row['sides']) as $name) {
                    $out[$name] ??= 0.0;
                }
            }
        }

        return $out;
    }
}

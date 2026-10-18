<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\PrepLot;
use App\Models\Menus\Side;
use Illuminate\Support\Carbon;

/**
 * Selling a dish through its side. When the Menus setting "sell through sides" is on, a dish that has a side made from its recipe (script 201) takes its stock through that side: the recipe the
 * side is made from is used, for as much as one serving of the side holds. Made to order that is the ingredients; made ahead it is the prepared food on the shelf. A dish with no side keeps
 * selling as it did.
 */
class SideSales
{
    public function __construct(private Sides $sides)
    {
    }

    /** Is selling through sides switched on, and possible (scripts 200 and 201 are run)? */
    public static function enabled(): bool
    {
        return (bool) (MenusSettings::all()['sell_through_sides'] ?? false) && SidesFromDishes::installed();
    }

    /** The side a dish sells through now: switched on, the dish has an active side made from its recipe, and that recipe of its own is on. */
    public function sideFor(Dish|int $dish): ?Side
    {
        if (! self::enabled()) {
            return null;
        }
        $side = Side::with('recipe.yieldUnit')->where('from_dish_id', $dish instanceof Dish ? $dish->id : $dish)->where('is_active', true)->first();

        return $side && $side->recipe_id && $side->recipe && $side->recipe->is_active && ! $side->recipe->dish_id ? $side : null;
    }

    /** How much of the side's recipe (in its own unit, portions for a copied dish recipe) one sold portion of the dish takes. */
    public function perPortion(Side $side): float
    {
        return max(0.000001, $this->sides->amountFor($side));
    }

    /** Portions of the dish the prepared food on the shelf makes, soonest use-by not yet past. */
    public function preparedPortions(Side $side, int $locationId, ?Carbon $on = null): float
    {
        return round($this->preparedQty($side, $locationId, $on) / $this->perPortion($side), 4);
    }

    /** The prepared food of the side's recipe that can be sold now at a branch (expired and held batches do not count). */
    public function preparedQty(Side $side, int $locationId, ?Carbon $on = null): float
    {
        $on ??= today();

        return (float) $this->lots((int) $side->recipe_id, $locationId, $on)->sum('qty_left');
    }

    /** @return \Illuminate\Support\Collection<int, PrepLot> in the order they are sold: soonest use-by first */
    public function lots(int $recipeId, int $locationId, Carbon $on, bool $lock = false)
    {
        $q = PrepLot::where('recipe_id', $recipeId)->where('location_id', $locationId)->where('status', 'ok')->where('qty_left', '>', 0)
            ->where(fn ($w) => $w->whereNull('expiry_date')->orWhereDate('expiry_date', '>=', $on->toDateString()));
        if ($lock) {
            $q->lockForUpdate();
        }

        return $q->get()->sortBy(fn (PrepLot $b) => [$b->expiry_date?->toDateString() ?? '9999-12-31', $b->made_on?->toDateString() ?? '', (int) $b->id])->values();
    }
}

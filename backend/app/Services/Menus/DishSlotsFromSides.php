<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishBatch;
use App\Models\Menus\DishSlot;
use App\Models\Menus\DishSlotChoice;
use App\Models\Menus\Option;
use App\Models\Menus\OptionGroup;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Giving today's dishes a make-up from what is already there. Two things, each only for what is not done yet:
 *   its own side      a dish that has a side made from its recipe (script 201) and no slots yet gets one always-included slot holding that side: the "dish with one slot"
 *   its set meals     a "Choose a side" group of choices whose every choice is another dish becomes a slot of those dishes' sides (choose one, or choose any), each adding what the
 *                     choice added to the price; the old group is kept and marked as replaced (script 204), so it is not offered twice and nothing is lost
 * A dish keeps its price. A group that can not be turned into a slot is left as it is, with the reason.
 */
class DishSlotsFromSides
{
    /** Are scripts 200, 201, 202 and 204 run? */
    public static function installed(): bool
    {
        return DishMakeup::installed() && SidesFromDishes::installed() && OptionGroup::hasSlotColumn();
    }

    /**
     * What it would do now.
     *
     * @return array{ready: bool, own: array<int, array{dish_id: int, dish: string, side: string}>, groups: array<int, array{dish_id: int, dish: string, group: string, kind: string, sides: string[]}>,
     *               skipped: array<int, array{dish: string, group: string, why: string}>, warnings: array<int, string>}
     */
    public function preview(): array
    {
        if (! self::installed()) {
            return ['ready' => false, 'own' => [], 'groups' => [], 'skipped' => [], 'warnings' => []];
        }
        $own = [];
        $groups = [];
        $skipped = [];
        $warnings = [];
        foreach (Dish::orderBy('name')->get() as $dish) {
            $side = $this->ownSide($dish);
            $hasSlots = DishSlot::where('dish_id', $dish->id)->exists();
            $hasOwn = (bool) $side && (! $hasSlots || DishSlotChoice::where('side_id', $side->id)->whereIn('slot_id', DishSlot::where('dish_id', $dish->id)->pluck('id'))->exists());   // (a dish with none gets one)
            if ($side && ! $hasSlots) {
                $own[] = ['dish_id' => (int) $dish->id, 'dish' => $dish->name, 'side' => $side->name];
                if ($side->recipe && ! $side->recipe->made_to_order && $this->oldShelf($dish) > 0.00005) {
                    $warnings[] = "{$dish->name} is made ahead and {$this->oldShelf($dish)} portions are on the old dish shelf. Once it has a make-up its sales take prepared food (Menus, Prepared food), not that shelf.";
                }
            }
            foreach (OptionGroup::with('options')->offered()->where('dish_id', $dish->id)->orderBy('sort_order')->get() as $g) {
                $plan = $this->plan($dish, $g, $side, $hasOwn || ! $side);
                if (is_string($plan)) {
                    if ($this->linkedGroup($g)) {
                        $skipped[] = ['dish' => $dish->name, 'group' => $g->name, 'why' => $plan];
                    }
                } else {
                    $groups[] = ['dish_id' => (int) $dish->id, 'dish' => $dish->name, 'group' => $g->name, 'kind' => $plan['kind'], 'sides' => array_map(fn ($c) => Side::find($c['side_id'])?->name ?? '', $plan['choices'])];
                }
            }
        }

        return ['ready' => true, 'own' => $own, 'groups' => $groups, 'skipped' => $skipped, 'warnings' => $warnings];
    }

    /** @return array{own: int, groups: int, skipped: int} */
    public function run(): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database scripts 200, 201, 202 and 204 first (204_menus_option_groups_slot.sql is the new one).');
        }
        $makeup = app(DishMakeup::class);
        $own = 0;
        $made = 0;
        $skipped = 0;
        foreach (Dish::orderBy('name')->get() as $dish) {
            DB::transaction(function () use ($dish, $makeup, &$own, &$made, &$skipped) {
                $side = $this->ownSide($dish);
                $hasSlots = DishSlot::where('dish_id', $dish->id)->exists();
                $hasOwn = (bool) $side && $hasSlots && DishSlotChoice::where('side_id', $side->id)->whereIn('slot_id', DishSlot::where('dish_id', $dish->id)->pluck('id'))->exists();
                if ($side && ! $hasSlots) {
                    $makeup->appendSlot($dish, ['name' => mb_substr($dish->name, 0, 60), 'kind' => 'fixed', 'choices' => [['side_id' => $side->id]]], true);
                    $own++;
                    $hasOwn = true;
                }
                foreach (OptionGroup::with('options')->offered()->where('dish_id', $dish->id)->orderBy('sort_order')->get() as $g) {
                    $plan = $this->plan($dish, $g, $side, $hasOwn || ! $side);
                    if (is_string($plan)) {
                        $skipped += $this->linkedGroup($g) ? 1 : 0;

                        continue;
                    }
                    $slot = $makeup->appendSlot($dish, ['name' => $g->name, 'kind' => $plan['kind'], 'min' => $plan['min'], 'max' => $plan['max'], 'choices' => $plan['choices']]);
                    $g->slot_id = $slot->id;
                    $g->save();
                    $made++;
                }
            });
        }

        return ['own' => $own, 'groups' => $made, 'skipped' => $skipped];
    }

    private function ownSide(Dish $dish): ?Side
    {
        $side = Side::with('recipe')->where('from_dish_id', $dish->id)->where('is_active', true)->first();

        return $side && $side->recipe && $side->recipe->is_active ? $side : null;
    }

    private function oldShelf(Dish $dish): float
    {
        return Schema::hasTable('menus_dish_batches') ? round((float) DishBatch::where('dish_id', $dish->id)->where('qty_left', '>', 0)->sum('qty_left'), 4) : 0.0;
    }

    /** Is every choice in the group another dish (a set meal)? */
    private function linkedGroup(OptionGroup $g): bool
    {
        $active = $g->options->where('is_active', true);

        return $active->isNotEmpty() && $active->every(fn (Option $o) => (bool) $o->linked_dish_id);
    }

    /**
     * The slot a group would become, or why it can not.
     *
     * @return array{kind: string, min: int, max: ?int, choices: array<int, array{side_id: int, upcharge: float, is_default: bool}>}|string
     */
    private function plan(Dish $dish, OptionGroup $g, ?Side $ownSide, bool $ownCovered): array|string
    {
        if (! $this->linkedGroup($g)) {
            return 'has choices that are not dishes';
        }
        if (! $ownCovered) {
            return 'the dish has a make-up of its own that does not include its own side: change it by hand';
        }
        $active = $g->options->where('is_active', true)->values();
        $choices = [];
        foreach ($active as $o) {
            if ((float) $o->price_delta < 0) {
                return 'has a choice that takes money off, which a slot can not do';
            }
            $side = Side::with('recipe')->where('from_dish_id', $o->linked_dish_id)->where('is_active', true)->first();
            if (! $side || ! $side->recipe || ! $side->recipe->is_active) {
                $name = Dish::whereKey($o->linked_dish_id)->value('name') ?? 'a dish';

                return "{$name} has no side yet: make sides from the dishes' recipes first";
            }
            $choices[] = ['side_id' => (int) $side->id, 'upcharge' => round((float) $o->price_delta, 2), 'is_default' => (bool) $o->is_default];
        }
        if (count(array_unique(array_column($choices, 'side_id'))) !== count($choices)) {
            return 'lists the same dish twice';
        }
        if ($g->kind === 'single' && (int) $g->min_choices >= 1) {
            if (count($choices) < 2) {
                return 'has only one choice';
            }
            $slot = ['kind' => 'choose_one', 'min' => 1, 'max' => 1, 'choices' => $this->oneDefault($choices)];
        } else {
            $max = $g->kind === 'single' ? 1 : ($g->max_choices === null ? null : (int) $g->max_choices);
            $slot = ['kind' => 'choose_any', 'min' => (int) $g->min_choices, 'max' => $max, 'choices' => $choices];
        }
        try {
            app(DishMakeup::class)->validateSlot(['name' => $g->name] + $slot);
        } catch (BooksException $e) {
            return $e->getMessage();
        }

        return $slot;
    }

    /** A pick-one slot has at most one side chosen to begin with. @param array<int, array{side_id: int, upcharge: float, is_default: bool}> $choices */
    private function oneDefault(array $choices): array
    {
        $seen = false;
        foreach ($choices as &$c) {
            if ($c['is_default'] && $seen) {
                $c['is_default'] = false;
            }
            $seen = $seen || $c['is_default'];
        }

        return $choices;
    }
}

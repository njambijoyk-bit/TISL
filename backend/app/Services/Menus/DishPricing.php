<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\Option;
use App\Models\Menus\OptionGroup;
use App\Services\Books\BooksException;

/**
 * What a customer's choices on a dish mean: are they allowed (a required group answered, no more than the most, one for a pick-one group), what do they add to the price,
 * and what do they change in what the kitchen uses. Used when an order is taken; the order keeps a copy of the names and prices so later edits never change an old order.
 */
class DishPricing
{
    /**
     * @param int[] $chosen the ids of the options picked
     * @return array{price_delta: float, options: array<int, array{id: int, group: string, name: string, price_delta: float}>, uses: array<int, array<string, mixed>>, linked_dishes: int[]}
     * @throws BooksException with the group's name when the choices are not allowed
     */
    public function resolve(Dish $dish, array $chosen): array
    {
        $chosen = array_values(array_unique(array_map('intval', $chosen)));
        $groups = OptionGroup::with(['options' => fn ($q) => $q->where('is_active', true), 'options.uses'])->offered()->where('dish_id', $dish->id)->orderBy('sort_order')->get();
        $known = $groups->flatMap(fn ($g) => $g->options)->keyBy('id');
        if ($stray = array_diff($chosen, $known->keys()->all())) {
            throw new BooksException('One of the choices is not on '.$dish->name.' (any more).');
        }
        $picked = [];
        foreach ($groups as $g) {
            $mine = array_values(array_filter($chosen, fn ($id) => $g->options->contains('id', $id)));
            if (! $mine) {   // nothing picked: the usual one(s) apply
                $mine = $g->options->where('is_default', true)->pluck('id')->map(fn ($i) => (int) $i)->all();
                $mine = $g->kind === 'single' ? array_slice($mine, 0, 1) : $mine;
            }
            $max = $g->kind === 'single' ? 1 : $g->max_choices;
            if (count($mine) < (int) $g->min_choices) {
                throw new BooksException($g->min_choices > 1 ? "{$g->name}: choose at least {$g->min_choices}." : "{$g->name}: please choose one.");
            }
            if ($max !== null && count($mine) > $max) {
                throw new BooksException($max === 1 ? "{$g->name}: choose only one." : "{$g->name}: choose no more than {$max}.");
            }
            foreach ($mine as $id) {
                $picked[$id] = $g;
            }
        }
        $delta = 0.0;
        $out = [];
        $uses = [];
        $linked = [];
        foreach ($picked as $id => $g) {
            /** @var Option $o */
            $o = $known[$id];
            $delta += (float) $o->price_delta;
            $out[] = ['id' => (int) $o->id, 'group' => $g->name, 'name' => $o->name, 'price_delta' => (float) $o->price_delta];
            foreach ($o->uses as $u) {
                $uses[] = ['mode' => $u->mode, 'ingredient_id' => $u->ingredient_id, 'quantity' => $u->quantity === null ? null : (float) $u->quantity, 'unit' => $u->unit ?: 'base'];
            }
            if ($o->linked_dish_id) {
                $linked[] = (int) $o->linked_dish_id;
            }
        }

        return ['price_delta' => round($delta, 2), 'options' => $out, 'uses' => $uses, 'linked_dishes' => $linked];
    }
}

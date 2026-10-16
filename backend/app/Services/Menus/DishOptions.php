<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\Ingredient;
use App\Models\Menus\Option;
use App\Models\Menus\OptionGroup;
use App\Models\Menus\OptionUse;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/**
 * The choices on a dish: groups ("Choose a side", "Size", "Extras") and their options. A choice carries a price change and may use more of an ingredient
 * (extra cheese) or leave a recipe line out ("no onion"). A removal costs nothing unless the choice is switched to charge for it.
 */
class DishOptions
{
    /**
     * Replace the dish's groups with these. A group or option with an `id` of this dish keeps that id (so a customer's basket does not lose it); one left out is removed.
     *
     * @param array<int, array{id?: int, name: string, kind?: string, min_choices?: int, max_choices?: ?int, options: array<int, array{id?: int, name: string, price_delta?: float, is_default?: bool, charge_removal?: bool, linked_dish_id?: ?int, is_active?: bool, uses?: array<int, array{mode: string, family_id?: ?int, variant_id?: ?int, quantity?: ?float, unit_id?: ?int}>}>}> $groups
     */
    public function save(Dish $dish, array $groups): void
    {
        $dish->loadMissing('menuRecipe.lines');
        $clean = [];
        foreach (array_values($groups) as $g) {
            $clean[] = $this->checkGroup($dish, $g);
        }

        DB::transaction(function () use ($dish, $clean) {
            $keepGroups = [];
            foreach ($clean as $gi => $g) {
                $group = ($g['id'] ?? null) ? OptionGroup::where('dish_id', $dish->id)->find($g['id']) : null;
                $group ??= new OptionGroup(['dish_id' => $dish->id]);
                $group->fill(['name' => $g['name'], 'kind' => $g['kind'], 'min_choices' => $g['min_choices'], 'max_choices' => $g['max_choices'], 'sort_order' => $gi])->save();
                $keepGroups[] = $group->id;
                $keepOptions = [];
                foreach ($g['options'] as $oi => $o) {
                    $option = ($o['id'] ?? null) ? Option::where('group_id', $group->id)->find($o['id']) : null;
                    $option ??= new Option(['group_id' => $group->id]);
                    $option->fill(['name' => $o['name'], 'price_delta' => $o['price_delta'], 'is_default' => $o['is_default'], 'charge_removal' => $o['charge_removal'],
                        'linked_dish_id' => $o['linked_dish_id'], 'sort_order' => $oi, 'is_active' => $o['is_active']])->save();
                    $keepOptions[] = $option->id;
                    OptionUse::where('option_id', $option->id)->delete();
                    foreach ($o['uses'] as $u) {
                        OptionUse::create(['option_id' => $option->id] + $u);
                    }
                }
                $this->dropOptions(Option::where('group_id', $group->id)->whereNotIn('id', $keepOptions ?: [0])->pluck('id')->all());
            }
            foreach (OptionGroup::where('dish_id', $dish->id)->whereNotIn('id', $keepGroups ?: [0])->get() as $gone) {
                $this->dropOptions(Option::where('group_id', $gone->id)->pluck('id')->all());
                $gone->delete();
            }
        });
    }

    /** @return array<int, array<string, mixed>> the dish's groups as the screen edits them */
    public function forDish(Dish $dish): array
    {
        return OptionGroup::with('options.uses')->where('dish_id', $dish->id)->orderBy('sort_order')->orderBy('id')->get()->map(fn (OptionGroup $g) => [
            'id' => $g->id, 'name' => $g->name, 'kind' => $g->kind, 'min_choices' => $g->min_choices, 'max_choices' => $g->max_choices,
            'options' => $g->options->map(fn (Option $o) => [
                'id' => $o->id, 'name' => $o->name, 'price_delta' => (float) $o->price_delta, 'is_default' => $o->is_default, 'charge_removal' => $o->charge_removal, 'linked_dish_id' => $o->linked_dish_id, 'is_active' => $o->is_active,
                'uses' => $o->uses->map(fn (OptionUse $u) => ['mode' => $u->mode, 'ingredient_id' => $u->ingredient_id, 'quantity' => $u->quantity === null ? null : (float) $u->quantity, 'unit' => $u->unit ?: 'base'])->values()->all(),
            ])->values()->all(),
        ])->values()->all();
    }

    private function dropOptions(array $ids): void
    {
        if ($ids) {
            OptionUse::whereIn('option_id', $ids)->delete();
            Option::whereIn('id', $ids)->delete();
        }
    }

    /** @return array<string, mixed> */
    private function checkGroup(Dish $dish, array $g): array
    {
        $name = trim((string) ($g['name'] ?? ''));
        if ($name === '') {
            throw new BooksException('Every group of choices needs a name (Choose a side, Size, Extras).');
        }
        $kind = $g['kind'] ?? 'single';
        if (! array_key_exists($kind, OptionGroup::KINDS)) {
            throw new BooksException("{$name}: choose whether people pick one or several.");
        }
        $options = array_values($g['options'] ?? []);
        if (! $options) {
            throw new BooksException("{$name} has no choices in it yet.");
        }
        $clean = [];
        foreach ($options as $o) {
            $clean[] = $this->checkOption($dish, $name, $o);
        }
        $count = count(array_filter($clean, fn ($o) => $o['is_active']));
        $min = max(0, (int) ($g['min_choices'] ?? 0));
        $max = $kind === 'single' ? 1 : (isset($g['max_choices']) && $g['max_choices'] !== '' ? (int) $g['max_choices'] : null);
        if ($kind === 'single' && $min > 1) {
            throw new BooksException("{$name}: people pick one, so at least one can not be more than one.");
        }
        if ($max !== null && $max < 1) {
            throw new BooksException("{$name}: the most a person can pick must be at least 1.");
        }
        if ($max !== null && $min > $max) {
            throw new BooksException("{$name}: the least can not be more than the most.");
        }
        if ($min > $count) {
            throw new BooksException("{$name} asks for {$min} but only has {$count} choice".($count === 1 ? '' : 's').' that can be picked.');
        }
        $defaults = count(array_filter($clean, fn ($o) => $o['is_default'] && $o['is_active']));
        if ($defaults > ($max ?? $count)) {
            throw new BooksException("{$name} has more choices ticked as the usual one than a person may pick.");
        }
        $names = array_map(fn ($o) => mb_strtolower($o['name']), $clean);
        if (count($names) !== count(array_unique($names))) {
            throw new BooksException("{$name} lists the same choice twice.");
        }

        return ['id' => $g['id'] ?? null, 'name' => $name, 'kind' => $kind, 'min_choices' => $min, 'max_choices' => $max, 'options' => $clean];
    }

    /** @return array<string, mixed> */
    private function checkOption(Dish $dish, string $group, array $o): array
    {
        $name = trim((string) ($o['name'] ?? ''));
        if ($name === '') {
            throw new BooksException("{$group}: every choice needs a name.");
        }
        $delta = round((float) ($o['price_delta'] ?? 0), 2);
        if (abs($delta) > 1000000) {
            throw new BooksException("{$group} → {$name}: that price change is too large.");
        }
        $linked = ! empty($o['linked_dish_id']) ? (int) $o['linked_dish_id'] : null;
        if ($linked !== null) {
            if ($linked === (int) $dish->id) {
                throw new BooksException("{$group} → {$name}: a dish can not be a choice on itself.");
            }
            if (! Dish::whereKey($linked)->exists()) {
                throw new BooksException("{$group} → {$name}: that dish does not exist any more.");
            }
        }
        $uses = [];
        foreach (array_values($o['uses'] ?? []) as $u) {
            $uses[] = $this->checkUse($dish, "{$group} → {$name}", $u);
        }
        $removesOnly = $uses && ! array_filter($uses, fn ($u) => $u['mode'] === 'add') && $linked === null;
        $charge = (bool) ($o['charge_removal'] ?? false);
        if ($removesOnly && ! $charge) {
            $delta = 0.0;   // taking something out is free unless this choice says it is charged for
        }

        return ['id' => $o['id'] ?? null, 'name' => $name, 'price_delta' => $delta, 'is_default' => (bool) ($o['is_default'] ?? false), 'charge_removal' => $charge && $removesOnly,
            'linked_dish_id' => $linked, 'is_active' => (bool) ($o['is_active'] ?? true), 'uses' => $uses];
    }

    /** @return array<string, mixed> */
    private function checkUse(Dish $dish, string $where, array $u): array
    {
        $mode = $u['mode'] ?? 'add';
        if (! in_array($mode, ['add', 'remove'], true)) {
            throw new BooksException("{$where}: a choice either uses more of something or leaves something out.");
        }
        $ingredient = ! empty($u['ingredient_id']) ? Ingredient::with('altUnit', 'baseUnit')->find((int) $u['ingredient_id']) : null;
        if (! $ingredient) {
            throw new BooksException("{$where}: name the ingredient it uses more of or leaves out.");
        }
        if ($mode === 'remove') {
            $recipe = $dish->menuRecipe;
            if ($recipe && ! $recipe->lines->contains('ingredient_id', $ingredient->id)) {
                throw new BooksException("{$where}: the recipe does not use {$ingredient->name}, so there is nothing to leave out.");
            }

            return ['mode' => 'remove', 'ingredient_id' => $ingredient->id, 'quantity' => null, 'unit' => 'base'];
        }
        $qty = (float) ($u['quantity'] ?? 0);
        if ($qty <= 0) {
            throw new BooksException("{$where}: say how much more it uses.");
        }
        $unit = (string) ($u['unit'] ?? 'base');
        if (! in_array($unit, ['base', 'alt'], true) || ($unit === 'alt' && ! $ingredient->altUnit)) {
            throw new BooksException("{$where}: write the amount in {$ingredient->baseUnit?->code}".($ingredient->altUnit ? " or {$ingredient->altUnit->code}" : '').'.');
        }

        return ['mode' => 'add', 'ingredient_id' => $ingredient->id, 'quantity' => round($qty, 4), 'unit' => $unit];
    }
}

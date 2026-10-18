<?php

namespace App\Services\Menus;

use App\Models\Menus\Audience;
use App\Models\Menus\Dish;
use App\Models\Menus\DishServing;
use App\Models\Menus\DishSlot;
use App\Models\Menus\DishSlotChoice;
use App\Models\Menus\Serving;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What a dish is made of and sold as: its slots (always included, choose one, choose any, free extra, paid extra) each filled with sides, the sizes it is sold in with the price of each (the
 * dish's price, not the sum of its parts), and who it is for. Saved as a whole: what is sent replaces what was there.
 */
class DishMakeup
{
    public const MAX_SLOTS = 12;

    public const MAX_CHOICES = 40;

    /** Has script 202 been run (with 200 for the sides and 193 for servings and audiences)? */
    public static function installed(): bool
    {
        foreach (['menus_dish_slots', 'menus_dish_slot_choices', 'menus_dish_servings', 'menus_dish_audiences'] as $t) {
            if (! Schema::hasTable($t)) {
                return false;
            }
        }

        return Sides::installed() && MenusLists::installed();
    }

    /** @return array<string, mixed> */
    public function show(Dish $dish): array
    {
        $slots = DishSlot::with('choices.side')->where('dish_id', $dish->id)->orderBy('sort_order')->orderBy('id')->get();

        return [
            'dish_id' => (int) $dish->id, 'price' => (float) $dish->price,
            'servings' => DishServing::with('serving')->where('dish_id', $dish->id)->get()->sortBy(fn ($d) => $d->serving?->sort_order ?? 0)->map(fn (DishServing $d) => ['serving_id' => (int) $d->serving_id, 'serving' => $d->serving?->name, 'price' => (float) $d->price])->values()->all(),
            'audience_ids' => DB::table('menus_dish_audiences')->where('dish_id', $dish->id)->pluck('audience_id')->map(fn ($i) => (int) $i)->values()->all(),
            'slots' => $slots->map(fn (DishSlot $s) => [
                'id' => (int) $s->id, 'name' => $s->name, 'kind' => $s->kind, 'kind_label' => DishSlot::KINDS[$s->kind] ?? $s->kind, 'min' => (int) $s->min_choices, 'max' => $s->max_choices === null ? null : (int) $s->max_choices,
                'choices' => $s->choices->map(fn (DishSlotChoice $c) => ['side_id' => (int) $c->side_id, 'side' => $c->side?->name, 'upcharge' => (float) $c->upcharge, 'is_default' => (bool) $c->is_default])->values()->all(),
            ])->values()->all(),
        ];
    }

    /**
     * @param array{servings?: array<int, array{serving_id: mixed, price: mixed}>, audience_ids?: array<int, mixed>, slots?: array<int, array<string, mixed>>} $d
     * @return array<string, mixed>
     */
    public function save(Dish $dish, array $d): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 202_menus_dish_makeup.sql first (with 193 and 200 before it).');
        }
        $servings = array_key_exists('servings', $d) ? $this->servings((array) $d['servings']) : null;
        $audiences = array_key_exists('audience_ids', $d) ? $this->audiences((array) $d['audience_ids']) : null;
        $slots = array_key_exists('slots', $d) ? $this->slots((array) $d['slots']) : null;

        DB::transaction(function () use ($dish, $servings, $audiences, $slots) {
            if ($servings !== null) {
                DishServing::where('dish_id', $dish->id)->delete();
                foreach ($servings as $serving => $price) {
                    DishServing::create(['dish_id' => $dish->id, 'serving_id' => $serving, 'price' => $price]);
                }
            }
            if ($audiences !== null) {
                DB::table('menus_dish_audiences')->where('dish_id', $dish->id)->delete();
                foreach ($audiences as $id) {
                    DB::table('menus_dish_audiences')->insert(['dish_id' => $dish->id, 'audience_id' => $id, 'created_at' => now(), 'updated_at' => now()]);
                }
            }
            if ($slots !== null) {
                $this->deleteSlots($dish->id);
                foreach ($slots as $i => $s) {
                    $slot = DishSlot::create(['dish_id' => $dish->id, 'name' => $s['name'], 'kind' => $s['kind'], 'min_choices' => $s['min'], 'max_choices' => $s['max'], 'sort_order' => $i + 1]);
                    foreach ($s['choices'] as $j => $c) {
                        DishSlotChoice::create(['slot_id' => $slot->id, 'side_id' => $c['side_id'], 'upcharge' => $c['upcharge'], 'is_default' => $c['is_default'], 'sort_order' => $j + 1]);
                    }
                }
            }
        });

        return $this->show($dish->fresh());
    }

    /** Take away every slot of a dish and what is in them (a dish is being removed, or its make-up rewritten). */
    public function deleteSlots(int $dishId): void
    {
        $ids = DishSlot::where('dish_id', $dishId)->pluck('id');
        DishSlotChoice::whereIn('slot_id', $ids)->delete();
        DishSlot::whereIn('id', $ids)->delete();
    }

    /** Everything kept for a dish, when it is deleted. */
    public function deleteAll(int $dishId): void
    {
        if (! self::installed()) {
            return;
        }
        $this->deleteSlots($dishId);
        DishServing::where('dish_id', $dishId)->delete();
        DB::table('menus_dish_audiences')->where('dish_id', $dishId)->delete();
    }

    /** The dishes that have this side in a slot: names. @return string[] */
    public static function dishesUsingSide(int $sideId): array
    {
        if (! self::installed()) {
            return [];
        }
        $slots = DishSlotChoice::where('side_id', $sideId)->pluck('slot_id');

        return Dish::whereIn('id', DishSlot::whereIn('id', $slots)->pluck('dish_id'))->orderBy('name')->pluck('name')->all();
    }

    /** @param array<int, array{serving_id: mixed, price: mixed}> $rows @return array<int, float> serving id => price */
    private function servings(array $rows): array
    {
        $out = [];
        foreach (array_values($rows) as $i => $r) {
            if (($r['price'] ?? '') === '' || ($r['price'] ?? null) === null) {
                continue;   // not sold in this size
            }
            $serving = Serving::find((int) ($r['serving_id'] ?? 0));
            if (! $serving || ! $serving->is_active) {
                throw new BooksException('Sizes row '.($i + 1).': choose one of the servings on your list (Menus, Configuration).');
            }
            $price = round((float) $r['price'], 2);
            if ($price < 0) {
                throw new BooksException("{$serving->name}: the price can not be less than nothing.");
            }
            if (isset($out[$serving->id])) {
                throw new BooksException("{$serving->name} is listed twice.");
            }
            $out[(int) $serving->id] = $price;
        }

        return $out;
    }

    /** @param array<int, mixed> $ids @return int[] */
    private function audiences(array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', array_filter($ids))));
        if ($ids && Audience::whereIn('id', $ids)->where('is_active', true)->count() !== count($ids)) {
            throw new BooksException('Choose audiences from your list (Menus, Configuration).');
        }

        return $ids;
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array{name: string, kind: string, min: int, max: ?int, choices: array<int, array{side_id: int, upcharge: float, is_default: bool}>}>
     */
    private function slots(array $rows): array
    {
        $rows = array_values($rows);
        if (count($rows) > self::MAX_SLOTS) {
            throw new BooksException('A dish can have '.self::MAX_SLOTS.' slots at most.');
        }
        $out = [];
        foreach ($rows as $i => $r) {
            $n = $i + 1;
            $name = mb_substr(trim((string) ($r['name'] ?? '')), 0, 60);
            if ($name === '') {
                throw new BooksException("Slot {$n}: give it a name (Bread, Choose a protein, Sauces).");
            }
            $kind = (string) ($r['kind'] ?? '');
            if (! isset(DishSlot::KINDS[$kind])) {
                throw new BooksException("{$name}: choose how it is filled: always included, choose one, choose any, free extra or paid extra.");
            }
            $choices = $this->choices($name, $kind, array_values((array) ($r['choices'] ?? [])));
            [$min, $max] = $this->limits($name, $kind, $r, count($choices), $choices);
            $out[] = ['name' => $name, 'kind' => $kind, 'min' => $min, 'max' => $max, 'choices' => $choices];
        }

        return $out;
    }

    /** @return array<int, array{side_id: int, upcharge: float, is_default: bool}> */
    private function choices(string $slot, string $kind, array $rows): array
    {
        if (! $rows) {
            throw new BooksException("{$slot}: add at least one side.");
        }
        if (count($rows) > self::MAX_CHOICES) {
            throw new BooksException("{$slot}: too many sides.");
        }
        if ($kind === 'choose_one' && count($rows) < 2) {
            throw new BooksException("{$slot}: a choice needs at least two sides to choose between. Use \"always included\" for one.");
        }
        $out = [];
        $seen = [];
        foreach ($rows as $c) {
            $side = Side::find((int) ($c['side_id'] ?? 0));
            if (! $side) {
                throw new BooksException("{$slot}: choose a side for every row.");
            }
            if (! $side->is_active) {
                throw new BooksException("{$slot}: the side {$side->name} is switched off.");
            }
            if (isset($seen[$side->id])) {
                throw new BooksException("{$slot}: {$side->name} is listed twice.");
            }
            $seen[$side->id] = true;
            $up = round((float) ($c['upcharge'] ?? 0), 2);
            if ($up < 0) {
                throw new BooksException("{$slot}: {$side->name} can not have a price less than nothing.");
            }
            if ($kind === 'paid_extra' && $up <= 0) {
                throw new BooksException("{$slot}: {$side->name} is a paid extra, so it needs a price.");
            }
            if (in_array($kind, ['fixed', 'free_extra'], true)) {
                $up = 0.0;   // part of the dish, or free
            }
            $default = $kind === 'fixed' ? true : (in_array($kind, ['free_extra', 'paid_extra'], true) ? false : (bool) ($c['is_default'] ?? false));
            $out[] = ['side_id' => (int) $side->id, 'upcharge' => $up, 'is_default' => $default];
        }

        return $out;
    }

    /** @return array{0: int, 1: ?int} the fewest and the most that may be chosen */
    private function limits(string $slot, string $kind, array $r, int $count, array $choices): array
    {
        $defaults = count(array_filter($choices, fn ($c) => $c['is_default']));
        if ($kind === 'fixed') {
            return [0, null];
        }
        if ($kind === 'choose_one') {
            if ($defaults > 1) {
                throw new BooksException("{$slot}: only one side can be chosen to begin with.");
            }

            return [1, 1];
        }
        $min = $kind === 'choose_any' ? (int) ($r['min'] ?? 0) : 0;
        $max = isset($r['max']) && $r['max'] !== '' && $r['max'] !== null ? (int) $r['max'] : null;
        if ($min < 0 || ($max !== null && $max < 1)) {
            throw new BooksException("{$slot}: the fewest can not be below 0 and the most must be at least 1 (leave it empty for no limit).");
        }
        if ($min > $count || ($max !== null && $min > $max)) {
            throw new BooksException("{$slot}: the fewest to choose can not be more than the most, or than the sides there are.");
        }
        if ($max !== null && $max > $count) {
            $max = $count;
        }
        if ($max !== null && $defaults > $max) {
            throw new BooksException("{$slot}: more sides are chosen to begin with than may be chosen.");
        }

        return [$min, $max];
    }
}

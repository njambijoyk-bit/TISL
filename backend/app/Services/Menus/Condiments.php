<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishCondiment;
use App\Models\Menus\Ingredient;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\OrderCondiment;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Free condiments: the ketchup and mayonnaise that come with fries. A dish has an allowance (an ingredient and a count for each dish sold). At checkout the allowances of the dishes ordered add up
 * and the cashier says what was actually given; a different count shows a warning, never a block, and the stock follows what was actually given. They are free: nothing is sold.
 */
class Condiments
{
    public const MAX = 99;

    /** Has script 211 been run? */
    public static function installed(): bool
    {
        return Schema::hasTable('menus_dish_condiments') && Schema::hasTable('menus_order_condiments');
    }

    /** @return array{ready: bool, items: array<int, array<string, mixed>>, allowance: array<int, array<string, mixed>>} the allowance of a dish and the ingredients it may name */
    public function show(Dish $dish): array
    {
        if (! self::installed()) {
            return ['ready' => false, 'items' => [], 'allowance' => []];
        }

        return ['ready' => true,
            'items' => Ingredient::with('baseUnit')->where('is_active', true)->orderBy('name')->get()->map(fn ($i) => ['ingredient_id' => (int) $i->id, 'name' => $i->name, 'unit' => $i->baseUnit?->code])->values()->all(),
            'allowance' => DishCondiment::with('ingredient.baseUnit')->where('dish_id', $dish->id)->orderBy('id')->get()->map(fn ($c) => ['ingredient_id' => (int) $c->ingredient_id, 'name' => $c->ingredient?->name ?? '(removed)', 'unit' => $c->ingredient?->baseUnit?->code, 'quantity' => (int) $c->quantity])->values()->all()];
    }

    /** Set the allowance of a dish: [{ingredient_id, quantity}], replacing what was there. @param array<int, array<string, mixed>> $rows @return array<string, mixed> */
    public function save(Dish $dish, array $rows): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 211_menus_condiments.sql first: until then free condiments can not be set.');
        }
        $clean = [];
        foreach ($rows as $r) {
            $ing = Ingredient::find((int) ($r['ingredient_id'] ?? 0)) ?? throw new BooksException('One of the condiments is not there any more.');
            if (! $ing->is_active) {
                throw new BooksException("{$ing->name} is switched off.");
            }
            if (isset($clean[$ing->id])) {
                throw new BooksException("{$ing->name} is listed twice.");
            }
            $q = (int) ($r['quantity'] ?? 0);
            if ($q < 1 || $q > self::MAX) {
                throw new BooksException("The count of {$ing->name} must be from 1 to ".self::MAX.'.');
            }
            $clean[$ing->id] = ['dish_id' => $dish->id, 'ingredient_id' => $ing->id, 'quantity' => $q];
        }
        DB::transaction(function () use ($dish, $clean) {
            DishCondiment::where('dish_id', $dish->id)->delete();
            foreach ($clean as $row) {
                DishCondiment::create($row);
            }
        });

        return $this->show($dish);
    }

    /** The dish's allowance goes when it is deleted. */
    public static function forget(int $dishId): void
    {
        if (Schema::hasTable('menus_dish_condiments')) {
            DishCondiment::where('dish_id', $dishId)->delete();
        }
    }

    /**
     * The allowance for an order: what each dish allows, for each dish sold, added up. With the cashier's counts (`$given`: [{ingredient_id, given}]) the list says what was given and warns where it is
     * different. An ingredient that is not on the allowance can not be given as a free condiment here.
     *
     * @param array<int, array{dish: Dish, quantity: float|int}> $lines
     * @param ?array<int, array<string, mixed>> $given
     * @return array<int, array{ingredient_id: int, name: string, unit: ?string, allowed: int, given: int, differs: bool, warning: ?string}>
     */
    public function resolve(array $lines, ?array $given): array
    {
        if (! self::installed()) {
            if (array_filter((array) $given)) {
                throw new BooksException('Run database script 211_menus_condiments.sql first: until then free condiments can not be changed.');
            }

            return [];
        }
        $allowed = [];
        foreach ($lines as $l) {
            foreach (DishCondiment::where('dish_id', $l['dish']->id)->get() as $c) {
                $allowed[$c->ingredient_id] = ($allowed[$c->ingredient_id] ?? 0) + (int) ceil($c->quantity * (float) $l['quantity']);
            }
        }
        $chosen = [];
        foreach (array_values(array_filter((array) $given)) as $g) {
            $id = (int) ($g['ingredient_id'] ?? 0);
            if (! isset($allowed[$id])) {
                throw new BooksException('That is not a free condiment of any dish on this order.');
            }
            if (isset($chosen[$id])) {
                throw new BooksException('The condiments list has the same item twice.');
            }
            $n = (int) ($g['given'] ?? $allowed[$id]);
            if ($n < 0 || $n > self::MAX * 50) {
                throw new BooksException('A condiment count must be from 0 up.');
            }
            $chosen[$id] = $n;
        }
        $out = [];
        foreach (Ingredient::with('baseUnit')->whereIn('id', array_keys($allowed))->orderBy('name')->get() as $ing) {
            $a = $allowed[$ing->id];
            $n = $chosen[$ing->id] ?? $a;
            $out[] = ['ingredient_id' => (int) $ing->id, 'name' => $ing->name, 'unit' => $ing->baseUnit?->code, 'allowed' => $a, 'given' => $n, 'differs' => $n !== $a,
                'warning' => $n === $a ? null : ($n > $a ? "{$n} {$ing->name} given, {$a} allowed." : "Only {$n} {$ing->name} given, {$a} allowed.")];
        }

        return $out;
    }

    /** Keep what an order was allowed and given, replacing any earlier list. @param array<int, array<string, mixed>> $resolved */
    public function store(MenuOrder $o, array $resolved, ?User $by): void
    {
        if (! self::installed()) {
            return;
        }
        DB::transaction(function () use ($o, $resolved, $by) {
            OrderCondiment::where('order_id', $o->id)->delete();
            foreach ($resolved as $l) {
                OrderCondiment::create(['order_id' => $o->id, 'ingredient_id' => $l['ingredient_id'], 'name' => $l['name'], 'allowed' => $l['allowed'], 'given' => $l['given'], 'created_by' => $by?->id]);
            }
        });
    }

    /**
     * What the packers should give with the order: what was given when it was checked out, else (a tab not paid yet) the allowance as it stands. Nothing is listed that is not to be given.
     *
     * @return array<int, array{name: string, quantity: int}>
     */
    public function forPackers(MenuOrder $o): array
    {
        if (! self::installed()) {
            return [];
        }
        if (OrderCondiment::where('order_id', $o->id)->exists()) {
            return array_values(array_map(fn ($r) => ['name' => $r['name'], 'quantity' => $r['given']], array_filter($this->forOrder($o), fn ($r) => $r['given'] > 0)));
        }
        try {
            $lines = app(CounterService::class)->rebuild($o);
        } catch (\Throwable) {
            return [];
        }

        return array_values(array_map(fn ($r) => ['name' => $r['name'], 'quantity' => $r['given']], array_filter($this->resolve($lines, null), fn ($r) => $r['given'] > 0)));
    }

    /** What an order was allowed and given, for the packers. @return array<int, array{name: string, allowed: int, given: int, differs: bool}> */
    public function forOrder(MenuOrder $o): array
    {
        return self::installed() ? OrderCondiment::where('order_id', $o->id)->orderBy('name')->get()->map(fn ($r) => ['name' => $r->name, 'allowed' => (int) $r->allowed, 'given' => (int) $r->given, 'differs' => $r->allowed !== $r->given])->all() : [];
    }
}

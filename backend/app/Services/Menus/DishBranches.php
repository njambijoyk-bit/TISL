<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishServing;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Dishes are shared by every branch; this says what differs at one (script 226). With no row a dish is served at the branch at its own price. A row can switch the dish off there, give it a price of
 * its own, and give each size a price of its own (a size not listed keeps the price it has on the dish).
 */
class DishBranches
{
    /** @var array<int, array<int, object>> branch id => dish id => row, kept for the request */
    private static array $memo = [];

    public static function installed(): bool
    {
        return Schema::hasTable('menus_dish_branches');
    }

    /** Forget what was read (after a save, and between tests). */
    public static function forget(): void
    {
        self::$memo = [];
    }

    private static function row(int $dishId, ?int $locationId): ?object
    {
        if (! $locationId || ! self::installed()) {
            return null;
        }
        if (app()->runningUnitTests()) {
            return DB::table('menus_dish_branches')->where('dish_id', $dishId)->where('location_id', $locationId)->first();
        }

        return (self::$memo[$locationId] ??= DB::table('menus_dish_branches')->where('location_id', $locationId)->get()->keyBy('dish_id')->all())[$dishId] ?? null;
    }

    /** Is the dish served at the branch? */
    public static function available(Dish|int $dish, ?int $locationId): bool
    {
        $row = self::row($dish instanceof Dish ? (int) $dish->id : $dish, $locationId);

        return ! $row || (bool) $row->is_available;
    }

    /** The price (before tax) of the dish at the branch: its own there, else the dish's. */
    public static function price(Dish $dish, ?int $locationId): ?float
    {
        $row = self::row((int) $dish->id, $locationId);
        if ($row && $row->price !== null) {
            return round((float) $row->price, 2);
        }

        return $dish->price === null ? null : (float) $dish->price;
    }

    /** The price of a size at the branch: its own there, else `$default` (what the dish says for that size). */
    public static function sizePrice(int $dishId, int $servingId, ?int $locationId, float $default): float
    {
        $row = self::row($dishId, $locationId);
        $sizes = $row && $row->size_prices ? (is_array($row->size_prices) ? $row->size_prices : (json_decode((string) $row->size_prices, true) ?: [])) : [];

        return isset($sizes[$servingId]) ? round((float) $sizes[$servingId], 2) : $default;
    }

    /**
     * What each branch does with a dish, for the dish's screen: every active branch with whether it serves the dish and the prices it has there (null: the dish's own).
     *
     * @return array{ready: bool, price: ?float, servings: array<int, array{serving_id: int, serving: ?string, price: float}>, branches: array<int, array<string, mixed>>}
     */
    public function show(Dish $dish): array
    {
        $servings = DishMakeup::installed() ? DishServing::with('serving')->where('dish_id', $dish->id)->get()->sortBy(fn ($d) => $d->serving?->sort_order ?? 0)->map(fn ($d) => ['serving_id' => (int) $d->serving_id, 'serving' => $d->serving?->name, 'price' => (float) $d->price])->values()->all() : [];
        if (! self::installed()) {
            return ['ready' => false, 'price' => (float) $dish->price, 'servings' => $servings, 'branches' => []];
        }
        $rows = DB::table('menus_dish_branches')->where('dish_id', $dish->id)->get()->keyBy('location_id');
        $branches = app(MenuBranches::class)->narrow(DB::table('locations')->where('is_active', 1))->orderByDesc('is_default')->orderBy('name')->get(['id', 'name'])->map(function ($l) use ($rows) {
            $r = $rows[$l->id] ?? null;
            $sizes = $r && $r->size_prices ? (json_decode((string) $r->size_prices, true) ?: []) : [];

            return ['location_id' => (int) $l->id, 'name' => $l->name, 'is_available' => ! $r || (bool) $r->is_available, 'price' => $r && $r->price !== null ? (float) $r->price : null,
                'size_prices' => array_map('floatval', $sizes)];
        })->values()->all();

        return ['ready' => true, 'price' => (float) $dish->price, 'servings' => $servings, 'branches' => $branches];
    }

    /**
     * Set what each branch in the list does with the dish. A branch that serves the dish at its own prices has no row. Branches not in the list are left as they are.
     *
     * @param array<int, array{location_id?: mixed, is_available?: mixed, price?: mixed, size_prices?: mixed}> $rows
     * @return array<string, mixed> show() as it now is
     */
    public function save(Dish $dish, array $rows): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 226_menus_dish_branches.sql first: until then every branch serves every dish at its price.');
        }
        $sizes = DishMakeup::installed() ? DishServing::where('dish_id', $dish->id)->pluck('serving_id')->map(fn ($i) => (int) $i)->all() : [];
        $clean = [];
        foreach ($rows as $r) {
            $loc = (int) ($r['location_id'] ?? 0);
            if (! DB::table('locations')->where('id', $loc)->exists()) {
                throw new BooksException('One of the branches is not there any more.');
            }
            $name = (string) DB::table('locations')->where('id', $loc)->value('name');
            $price = ($r['price'] ?? '') === '' || ($r['price'] ?? null) === null ? null : round((float) $r['price'], 2);
            if ($price !== null && $price < 0) {
                throw new BooksException("{$name}: the price can not be less than nothing.");
            }
            $size = [];
            foreach ((array) ($r['size_prices'] ?? []) as $serving => $p) {
                if ($p === '' || $p === null) {
                    continue;
                }
                if (! in_array((int) $serving, $sizes, true)) {
                    throw new BooksException("{$name}: {$dish->name} is not sold in that size.");
                }
                if ((float) $p < 0) {
                    throw new BooksException("{$name}: a price can not be less than nothing.");
                }
                $size[(int) $serving] = round((float) $p, 2);
            }
            $clean[$loc] = ['is_available' => (bool) ($r['is_available'] ?? true), 'price' => $price, 'size_prices' => $size];
        }
        DB::transaction(function () use ($dish, $clean) {
            foreach ($clean as $loc => $c) {
                if ($c['is_available'] && $c['price'] === null && ! $c['size_prices']) {
                    DB::table('menus_dish_branches')->where('dish_id', $dish->id)->where('location_id', $loc)->delete();
                    continue;
                }
                $values = ['is_available' => $c['is_available'], 'price' => $c['price'], 'size_prices' => $c['size_prices'] ? json_encode($c['size_prices']) : null, 'updated_at' => now()];
                if (DB::table('menus_dish_branches')->where('dish_id', $dish->id)->where('location_id', $loc)->exists()) {
                    DB::table('menus_dish_branches')->where('dish_id', $dish->id)->where('location_id', $loc)->update($values);
                } else {
                    DB::table('menus_dish_branches')->insert($values + ['dish_id' => $dish->id, 'location_id' => $loc, 'created_at' => now()]);
                }
            }
        });
        self::forget();

        return $this->show($dish);
    }

    /** The branch rows of a dish go with it. */
    public static function dropFor(int $dishId): void
    {
        if (self::installed()) {
            DB::table('menus_dish_branches')->where('dish_id', $dishId)->delete();
            self::forget();
        }
    }
}

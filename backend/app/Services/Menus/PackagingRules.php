<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\PackagingPrice;
use App\Models\Menus\PackagingRule;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What packaging goes with what. A rule is on a side (the container for the stew) or on a dish, which may override its sides: a dish's rule for an item replaces what its sides say about that
 * item. A rule names an item of the packaging kind, how many, whether the count is for each dish or once for the whole order, whether it is compulsory, whether it is charged (priced from the
 * list) or free, and whether it shows on the receipt. Rules whose item has left the packaging kind stay, greyed out, and are not used.
 */
class PackagingRules
{
    public const MAX_QUANTITY = 99;

    /** Has script 208 been run (with 207 for the prices)? */
    public static function installed(): bool
    {
        return Schema::hasTable('menus_packaging_rules') && PackagingPrices::installed();
    }

    /** @return array{0: string, 1: int} the column and id a rule is kept under: ['side_id', 5] or ['dish_id', 9] */
    private function owner(string $owner, int $id): array
    {
        return match ($owner) {
            'side' => ['side_id', (Side::findOrFail($id))->id],
            'dish' => ['dish_id', (Dish::findOrFail($id))->id],
            default => throw new BooksException('Packaging rules belong to a side or a dish.'),
        };
    }

    /**
     * The rules of a side or a dish and the items they can use.
     *
     * @return array{ready: bool, items: array<int, array<string, mixed>>, rules: array<int, array<string, mixed>>}
     */
    public function show(string $owner, int $id): array
    {
        [$col, $key] = $this->owner($owner, $id);
        if (! self::installed()) {
            return ['ready' => false, 'items' => [], 'rules' => []];
        }
        $items = collect(app(PackagingPrices::class)->all()['items'])->where('grey', false);
        $prices = PackagingPrice::where('is_active', true)->pluck('price', 'item_id');
        $names = collect(app(PackagingPrices::class)->all()['items'])->keyBy('item_id');
        $rules = PackagingRule::where($col, $key)->orderBy('id')->get()->map(fn (PackagingRule $r) => [
            'item_id' => (int) $r->item_id, 'item' => $names[$r->item_id]['name'] ?? '(removed item)', 'scope' => $r->scope, 'quantity' => (int) $r->quantity, 'compulsory' => (bool) $r->compulsory, 'charged' => (bool) $r->charged,
            'receipt' => $r->receipt, 'grey' => (bool) ($names[$r->item_id]['grey'] ?? true),
        ])->values()->all();

        return ['ready' => true, 'items' => $items->map(fn ($i) => ['item_id' => $i['item_id'], 'name' => $i['name'], 'priced' => $prices->has($i['item_id']), 'price' => $prices[$i['item_id']] ?? null])->values()->all(), 'rules' => $rules];
    }

    /**
     * Set the rules of a side or a dish: [{item_id, scope, quantity, compulsory, charged, receipt}]. What is sent replaces the rules for items in the packaging kind; a rule whose item has left
     * the kind (greyed out) is kept and can not be sent.
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<string, mixed>
     */
    public function save(string $owner, int $id, array $rows): array
    {
        [$col, $key] = $this->owner($owner, $id);
        if (! self::installed()) {
            throw new BooksException('Run database script 208_menus_packaging_rules.sql first (with 207 and 200 before it).');
        }
        $kind = app(PackagingPrices::class)->kind() ?? throw new BooksException('Choose which kind of ingredient is packaging under Menus, Configuration first.');
        $priced = PackagingPrice::where('is_active', true)->pluck('item_id')->map(fn ($i) => (int) $i)->all();
        $clean = [];
        foreach ($rows as $r) {
            $item = IngredientItem::with('ingredient')->find((int) ($r['item_id'] ?? 0)) ?? throw new BooksException('One of the packaging items is not there any more.');
            $name = $item->ingredient->name.($item->name !== $item->ingredient->name ? ' - '.$item->name : '');
            if ((int) $item->ingredient->kind_id !== (int) $kind->id) {
                throw new BooksException("{$name} is not of the kind {$kind->name}, which is the packaging kind.");
            }
            if (isset($clean[$item->id])) {
                throw new BooksException("{$name} has two rules: keep one.");
            }
            $scope = (string) ($r['scope'] ?? 'per_dish');
            if (! isset(PackagingRule::SCOPES[$scope])) {
                throw new BooksException("Choose whether {$name} is for each dish or once for the order.");
            }
            $qty = (int) ($r['quantity'] ?? 1);
            if ($qty < 1 || $qty > self::MAX_QUANTITY) {
                throw new BooksException("The quantity of {$name} must be from 1 to ".self::MAX_QUANTITY.'.');
            }
            $receipt = (string) ($r['receipt'] ?? 'auto');
            if (! isset(PackagingRule::RECEIPT[$receipt])) {
                throw new BooksException("Choose when {$name} shows on the receipt: when charged, always or never.");
            }
            $charged = (bool) ($r['charged'] ?? false);
            if ($charged && ! in_array((int) $item->id, $priced, true)) {
                throw new BooksException("{$name} has no price on the packaging price list, so it can not be charged. Price it under Menus, Configuration first, or make the rule free.");
            }
            $clean[$item->id] = [$col => $key, 'item_id' => $item->id, 'scope' => $scope, 'quantity' => $qty, 'compulsory' => (bool) ($r['compulsory'] ?? false), 'charged' => $charged, 'receipt' => $receipt];
        }
        DB::transaction(function () use ($col, $key, $kind, $clean) {
            $live = IngredientItem::whereHas('ingredient', fn ($q) => $q->where('kind_id', $kind->id))->pluck('id');
            PackagingRule::where($col, $key)->whereIn('item_id', $live)->delete();
            foreach ($clean as $row) {
                PackagingRule::create($row);
            }
        });

        return $this->show($owner, $id);
    }

    /**
     * The rules a dish line follows: its own, and those of the sides it was ordered with, a dish's rule for an item replacing the sides' rule for that item. Where two sides both ask for an item
     * in the same way the larger count of a per-order rule wins and per-dish counts add up; asked for both ways it is two entries. Rules on items that have left the packaging kind are left out.
     *
     * @param int[] $sideIds
     * @return array<int, array{item_id: int, scope: string, quantity: int, compulsory: bool, charged: bool, receipt: string, from: string}>
     */
    public function effective(Dish $dish, array $sideIds): array
    {
        if (! self::installed() || ! ($kind = app(PackagingPrices::class)->kind())) {
            return [];
        }
        $live = IngredientItem::whereHas('ingredient', fn ($q) => $q->where('kind_id', $kind->id))->pluck('id')->map(fn ($i) => (int) $i)->all();
        $own = PackagingRule::where('dish_id', $dish->id)->whereIn('item_id', $live)->get();
        $out = [];
        foreach ($own as $r) {
            $out[$r->item_id.':'.$r->scope] = $this->row($r, $dish->name);
        }
        $overridden = $own->pluck('item_id')->all();
        $names = $sideIds ? Side::whereIn('id', $sideIds)->pluck('name', 'id') : collect();
        foreach (PackagingRule::whereIn('side_id', $sideIds ?: [0])->whereIn('item_id', $live)->orderBy('id')->get() as $r) {
            if (in_array($r->item_id, $overridden, true)) {
                continue;   // the dish says what it wants for this item
            }
            $row = $this->row($r, (string) ($names[$r->side_id] ?? 'A side'));
            $k = $r->item_id.':'.$r->scope;
            if (! isset($out[$k])) {
                $out[$k] = $row;

                continue;
            }
            // two sides ask for the same item the same way: per order the larger count wins, per dish the counts add up
            $out[$k]['quantity'] = $r->scope === 'per_order' ? max($out[$k]['quantity'], $row['quantity']) : $out[$k]['quantity'] + $row['quantity'];
            $out[$k]['compulsory'] = $out[$k]['compulsory'] || $row['compulsory'];
            $out[$k]['charged'] = $out[$k]['charged'] || $row['charged'];
            $out[$k]['from'] .= ', '.$row['from'];
        }

        return array_values($out);
    }

    /** @return array<string, mixed> */
    private function row(PackagingRule $r, string $from): array
    {
        return ['item_id' => (int) $r->item_id, 'scope' => $r->scope, 'quantity' => (int) $r->quantity, 'compulsory' => (bool) $r->compulsory, 'charged' => (bool) $r->charged, 'receipt' => $r->receipt, 'from' => $from];
    }

    /** The side's and the dish's rules go when it is deleted. */
    public static function forget(string $owner, int $id): void
    {
        if (Schema::hasTable('menus_packaging_rules')) {
            PackagingRule::where($owner === 'side' ? 'side_id' : 'dish_id', $id)->delete();
        }
    }

    /** How many rules use an item (so it is not deleted from under them). */
    public static function usedBy(int $itemId): int
    {
        return Schema::hasTable('menus_packaging_rules') ? PackagingRule::where('item_id', $itemId)->count() : 0;
    }
}

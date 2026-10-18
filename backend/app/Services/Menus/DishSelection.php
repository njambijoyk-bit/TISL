<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishServing;
use App\Models\Menus\DishSlot;
use App\Models\Menus\DishSlotChoice;
use App\Services\Books\BooksException;

/**
 * What a guest's picks on a dish mean (script 202's make-up): is the size one the dish is sold in, are the picks allowed (one for a choose-one slot, the fewest and the most for the others,
 * an extra no more than its limit), what is the price (the size's price, or the dish's own when it has no sizes, plus what each pick adds), and which sides, how many servings of each, and how
 * much of each the kitchen must make. The result is kept on the order line, so later edits to the dish never change an old order.
 *
 * Picks are [slot id => [side id, or {side_id, qty}, ...]]. A slot not mentioned is answered by its sides chosen to begin with; a slot mentioned with nothing in it is answered with nothing.
 * Always-included sides are in every order; picks for them are ignored. Free and paid extras may be taken more than once (qty), up to the slot's most counting every serving.
 */
class DishSelection
{
    public function __construct(private Sides $sides)
    {
    }

    /** Does this dish have a make-up (slots or sizes) for orders to follow? */
    public static function applies(Dish $dish): bool
    {
        return DishMakeup::installed() && (DishSlot::where('dish_id', $dish->id)->exists() || DishServing::where('dish_id', $dish->id)->exists());
    }

    /**
     * @param array<int|string, mixed> $picks
     * @return array{dish_id: int, serving: ?array{id: int, name: string}, base_price: float, upcharge: float, unit_price: float,
     *               lines: array<int, array<string, mixed>>, sides: array<int, array<string, mixed>>, uses: array<int, array<string, mixed>>}
     */
    public function resolve(Dish $dish, ?int $servingId, array $picks = []): array
    {
        if (! DishMakeup::installed()) {
            throw new BooksException('Run database script 202_menus_dish_makeup.sql first.');
        }
        $servings = DishServing::with('serving')->where('dish_id', $dish->id)->get();
        $serving = null;
        $base = (float) $dish->price;
        if ($servings->isNotEmpty()) {
            if (! $servingId) {
                throw new BooksException("Choose a size for {$dish->name}.");
            }
            $row = $servings->firstWhere('serving_id', $servingId) ?? throw new BooksException("{$dish->name} is not sold in that size.");
            $serving = ['id' => (int) $row->serving_id, 'name' => (string) ($row->serving?->name ?? '')];
            $base = (float) $row->price;
        } elseif ($servingId) {
            throw new BooksException("{$dish->name} is sold in one size.");
        }

        $slots = DishSlot::with('choices.side')->where('dish_id', $dish->id)->orderBy('sort_order')->orderBy('id')->get();
        $asked = $this->normalise($picks);
        if ($stray = array_diff(array_keys($asked), $slots->pluck('id')->map(fn ($i) => (int) $i)->all())) {
            throw new BooksException("One of the picks is not on {$dish->name} (any more).");
        }
        $lines = [];
        $upcharge = 0.0;
        foreach ($slots as $slot) {
            foreach ($this->pick($dish, $slot, $asked) as $c) {
                $each = (float) $c['choice']->upcharge;
                $lines[] = ['slot_id' => (int) $slot->id, 'slot' => $slot->name, 'kind' => $slot->kind, 'side_id' => (int) $c['choice']->side_id, 'side' => $c['choice']->side?->name, 'qty' => $c['qty'],
                    'upcharge' => round($each, 2), 'amount' => round($each * $c['qty'], 2)];
                $upcharge += $each * $c['qty'];
            }
        }
        $sides = $this->sidesFor($lines, $serving['id'] ?? null);

        return ['dish_id' => (int) $dish->id, 'serving' => $serving, 'base_price' => round($base, 2), 'upcharge' => round($upcharge, 2), 'unit_price' => round($base + $upcharge, 2), 'lines' => $lines, 'sides' => $sides,
            'uses' => array_map(fn ($s) => ['mode' => 'side', 'side_id' => $s['side_id'], 'qty' => $s['qty'], 'amount' => $s['amount'], 'serving_id' => $serving['id'] ?? null], $sides)];
    }

    /**
     * What goes on the order line: the size and the picks as they were.
     *
     * @param array<string, mixed> $resolved the result of resolve()
     * @return array{serving_id: ?int, serving: ?string, selection: ?array<int, array<string, mixed>>}
     */
    public function orderLine(array $resolved): array
    {
        return ['serving_id' => $resolved['serving']['id'] ?? null, 'serving' => $resolved['serving']['name'] ?? null, 'selection' => $resolved['lines'] ?: null];
    }

    /**
     * A line's size and sides as short text (Jumbo: Bread, Choma, Kale, Ketchup x2), for the note on a voucher line.
     *
     * @param ?array<int, array<string, mixed>> $selection what orderLine() kept
     */
    public static function describe(?string $serving, ?array $selection): string
    {
        $sides = array_map(fn ($l) => $l['side'].((int) ($l['qty'] ?? 1) > 1 ? ' x'.(int) $l['qty'] : ''), $selection ?? []);

        return trim(($serving ?? '').($serving && $sides ? ': ' : '').implode(', ', $sides));
    }

    /**
     * The side rows a line carries in its `menu_uses` (the rest of the list is what the choices change in the recipe).
     *
     * @param mixed $menuUses what a voucher line holds
     * @return array<int, array{side_id: int, qty: float, amount: float, serving_id: ?int}>
     */
    public static function sidesIn(mixed $menuUses): array
    {
        $rows = is_string($menuUses) ? (json_decode($menuUses, true) ?: []) : (array) $menuUses;

        return array_values(array_map(fn ($u) => ['side_id' => (int) $u['side_id'], 'qty' => (float) ($u['qty'] ?? 1), 'amount' => (float) ($u['amount'] ?? 0), 'serving_id' => ! empty($u['serving_id']) ? (int) $u['serving_id'] : null],
            array_filter($rows, fn ($u) => is_array($u) && ($u['mode'] ?? '') === 'side' && ! empty($u['side_id']))));
    }

    /** @param array<int|string, mixed> $picks @return array<int, array<int, array{side_id: int, qty: int}>> slot id => picks */
    private function normalise(array $picks): array
    {
        $out = [];
        foreach ($picks as $slotId => $rows) {
            $list = [];
            foreach ((array) $rows as $r) {
                $side = (int) (is_array($r) ? ($r['side_id'] ?? 0) : $r);
                $qty = is_array($r) ? (int) ($r['qty'] ?? 1) : 1;
                if ($side <= 0 || $qty < 1) {
                    throw new BooksException('A pick needs a side and a number of one or more.');
                }
                $list[] = ['side_id' => $side, 'qty' => $qty];
            }
            $out[(int) $slotId] = $list;
        }

        return $out;
    }

    /**
     * The choices taken in one slot with how many of each.
     *
     * @param array<int, array<int, array{side_id: int, qty: int}>> $asked
     * @return array<int, array{choice: DishSlotChoice, qty: int}>
     */
    private function pick(Dish $dish, DishSlot $slot, array $asked): array
    {
        $choices = $slot->choices->keyBy('side_id');
        if ($slot->kind === 'fixed') {
            return $slot->choices->map(fn ($c) => ['choice' => $c, 'qty' => 1])->all();
        }
        $given = array_key_exists((int) $slot->id, $asked);
        $rows = $given ? $asked[(int) $slot->id] : $slot->choices->where('is_default', true)->map(fn ($c) => ['side_id' => (int) $c->side_id, 'qty' => 1])->values()->all();
        $taken = [];
        $total = 0;
        foreach ($rows as $r) {
            $c = $choices->get($r['side_id']) ?? throw new BooksException("{$slot->name}: that is not one of the sides on {$dish->name}.");
            if (! $c->side || ! $c->side->is_active) {
                throw new BooksException("{$slot->name}: {$c->side?->name} is not available.");
            }
            if (isset($taken[$r['side_id']])) {
                throw new BooksException("{$slot->name}: {$c->side->name} is chosen twice. Choose it once and say how many.");
            }
            if ($r['qty'] > 1 && ! in_array($slot->kind, ['free_extra', 'paid_extra'], true)) {
                throw new BooksException("{$slot->name}: {$c->side->name} can only be chosen once.");
            }
            $taken[$r['side_id']] = ['choice' => $c, 'qty' => $r['qty']];
            $total += $r['qty'];
        }
        $min = (int) $slot->min_choices;
        $max = $slot->max_choices === null ? null : (int) $slot->max_choices;
        if ($total < $min) {
            throw new BooksException($slot->kind === 'choose_one' ? "{$slot->name}: please choose one." : ($min > 1 ? "{$slot->name}: choose at least {$min}." : "{$slot->name}: choose at least one."));
        }
        if ($max !== null && $total > $max) {
            throw new BooksException($max === 1 ? "{$slot->name}: choose only one." : "{$slot->name}: choose no more than {$max}.");
        }

        return array_values($taken);
    }

    /**
     * The sides that must be made, added up over the slots: how many servings of each, and how much that is in the side's own unit for this size.
     *
     * @param array<int, array<string, mixed>> $lines
     * @return array<int, array{side_id: int, side: ?string, qty: int, amount: float, unit: string}>
     */
    private function sidesFor(array $lines, ?int $servingId): array
    {
        $out = [];
        foreach ($lines as $l) {
            $out[$l['side_id']] ??= ['side_id' => $l['side_id'], 'side' => $l['side'], 'qty' => 0, 'amount' => 0.0, 'unit' => ''];
            $out[$l['side_id']]['qty'] += $l['qty'];
        }
        foreach (\App\Models\Menus\Side::with('recipe.yieldUnit', 'ingredient.baseUnit', 'unit')->whereIn('id', array_keys($out))->get() as $side) {
            $out[$side->id]['amount'] = round($out[$side->id]['qty'] * $this->sides->amountFor($side, $servingId), 6);
            $out[$side->id]['unit'] = $this->sides->row($side)['source_unit'];
        }

        return array_values($out);
    }
}

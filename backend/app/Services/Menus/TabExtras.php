<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishSlotChoice;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\MenuOrderLine;
use App\Models\Menus\Side;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;

/**
 * Paid extras on an open tab, added later (another egg once the sandwich is on the table). An extra is its own line, priced at what the dish's paid-extra slot says, sent to the kitchen as a new
 * round, and it takes the stock of that side alone. It is held to the slot's most, counted over the dish's servings and over the extras already on the tab for that dish.
 */
class TabExtras
{
    public function __construct(private CounterService $counter, private SideStock $stock, private Sides $sides)
    {
    }

    /**
     * What each dish on the tab may still have added: line id => [{side_id, name, price, left}] (left is null when the slot has no limit). Lines that are extras themselves offer nothing.
     *
     * @return array<int, array<int, array{side_id: int, slot_id: int, name: string, price: float, left: ?int}>>
     */
    public function offered(MenuOrder $o): array
    {
        if (! DishMakeup::installed() || ! MenuOrderLine::keepsSelection()) {
            return [];
        }
        $lines = $o->lines()->get();
        $out = [];
        foreach ($lines as $l) {
            if ($this->isExtra($l)) {
                continue;
            }
            $rows = [];
            foreach ($this->choices((int) $l->dish_id) as $c) {
                $left = $c->slot->max_choices === null ? null : max(0, (int) $c->slot->max_choices * (int) ceil((float) $l->quantity) - $this->taken($lines, $l, (int) $c->slot_id));
                $rows[] = ['side_id' => (int) $c->side_id, 'slot_id' => (int) $c->slot_id, 'name' => (string) $c->side?->name, 'price' => (float) $c->upcharge, 'left' => $left];
            }
            if ($rows) {
                $out[(int) $l->id] = $rows;
            }
        }

        return $out;
    }

    /** @param array{line_id?: mixed, side_id?: mixed, quantity?: mixed} $in */
    public function add(MenuOrder $o, array $in, ?User $by = null): MenuOrder
    {
        $this->counter->assertTab($o);
        $line = $o->lines()->whereKey((int) ($in['line_id'] ?? 0))->first() ?? throw new BooksException('Choose the dish the extra is for.');
        if ($this->isExtra($line)) {
            throw new BooksException('An extra can not have extras of its own: add it to the dish.');
        }
        $qty = (int) ($in['quantity'] ?? 1);
        if ($qty < 1 || $qty > 50) {
            throw new BooksException('Choose how many, from 1 to 50.');
        }
        $choice = $this->choices((int) $line->dish_id)->firstWhere('side_id', (int) ($in['side_id'] ?? 0)) ?? throw new BooksException("That extra is not sold with {$line->name}.");
        $left = $this->offered($o)[(int) $line->id] ?? [];
        $row = collect($left)->firstWhere('side_id', (int) $choice->side_id);
        if ($row && $row['left'] !== null && $qty > $row['left']) {
            throw new BooksException($row['left'] > 0 ? "Only {$row['left']} more {$choice->side->name} can go with {$line->name}." : "No more {$choice->side->name} can go with {$line->name}.");
        }
        $side = Side::with('recipe', 'ingredient', 'amounts')->findOrFail($choice->side_id);
        $loc = (int) $o->location_id;
        $amount = $this->sides->amountFor($side, $line->serving_id ? (int) $line->serving_id : null);
        if ($this->stock->short([(int) $side->id => $amount * $qty], $loc)) {
            throw new BooksException("{$side->name} has run out.");
        }
        $price = round((float) $choice->upcharge, 2);
        $dish = Dish::findOrFail($line->dish_id);
        $pick = ['slot_id' => (int) $choice->slot_id, 'slot' => $choice->slot->name, 'kind' => 'paid_extra', 'side_id' => (int) $side->id, 'side' => $side->name, 'qty' => 1, 'upcharge' => $price, 'amount' => $price, 'parent_line_id' => (int) $line->id];
        $new = ['dish' => $dish, 'name' => $side->name.' (extra)', 'quantity' => $qty, 'base_price' => $price, 'unit_price' => $price, 'options' => [], 'linked' => [], 'note' => 'With '.$line->name,
            'uses' => [['mode' => 'side', 'side_id' => (int) $side->id, 'qty' => 1, 'amount' => $amount, 'serving_id' => $line->serving_id ? (int) $line->serving_id : null, 'extra' => true]],
            'serving_id' => null, 'serving' => null, 'selection' => [$pick]];
        DB::transaction(function () use ($o, $new) {
            $this->counter->addLines($o, [$new], (int) $o->lines()->max('round') + 1);
            $this->counter->retotal($o);
        });
        $this->counter->fire($o);

        return $o->fresh();
    }

    /** Is the line an extra added to another one? */
    public function isExtra(MenuOrderLine $l): bool
    {
        return collect((array) ($l->selection ?? []))->contains(fn ($s) => ! empty($s['parent_line_id']));
    }

    /** @return \Illuminate\Support\Collection<int, DishSlotChoice> the paid extras the dish offers */
    private function choices(int $dishId)
    {
        return DishSlotChoice::with('slot', 'side')->whereHas('slot', fn ($q) => $q->where('dish_id', $dishId)->where('kind', 'paid_extra'))->get()
            ->filter(fn ($c) => $c->side && $c->side->is_active);
    }

    /** How many of a slot's extras a line already has: those it was ordered with and those added since. */
    private function taken($lines, MenuOrderLine $parent, int $slotId): int
    {
        $own = collect((array) ($parent->selection ?? []))->where('slot_id', $slotId)->sum(fn ($s) => (int) ($s['qty'] ?? 1));
        $added = $lines->filter(fn ($x) => collect((array) ($x->selection ?? []))->contains(fn ($s) => (int) ($s['parent_line_id'] ?? 0) === (int) $parent->id && (int) ($s['slot_id'] ?? 0) === $slotId))
            ->sum(fn ($x) => (int) ceil((float) $x->quantity));

        return (int) ($own * ceil((float) $parent->quantity)) + (int) $added;
    }
}

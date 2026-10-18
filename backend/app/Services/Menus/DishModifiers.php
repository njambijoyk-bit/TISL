<?php

namespace App\Services\Menus;

use App\Models\Menus\Dish;
use App\Models\Menus\DishModifier;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\DishSlot;
use App\Models\Menus\ModifierPolicy;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What it costs when a customer leaves an ingredient out or asks for extra. The ingredients on offer are the recipe lines ticked in script 205, in the dish's own recipe and in the recipes of
 * the sides it is made of. Each one is priced by a named policy (free, a fixed fee, a percentage of the dish price at the size chosen); an item with no policy of its own uses the default one.
 */
class DishModifiers
{
    /** Has script 206 been run (with 205 for the flags and 193 for the policies)? */
    public static function installed(): bool
    {
        return Schema::hasTable('menus_dish_modifiers') && DishRecipes::hasFlags() && MenusLists::installed();
    }

    /**
     * Every removal and extra the dish offers, with the policy it has (null: the default).
     *
     * @return array<int, array{ingredient_id: int, ingredient: string, kind: string, kind_label: string, in: string[], policy_id: ?int}>
     */
    public function candidates(Dish $dish): array
    {
        $found = [];
        foreach ($this->recipes($dish) as $source => $recipe) {
            foreach ($recipe->lines()->with('ingredient')->whereNotNull('ingredient_id')->orderBy('position')->get() as $l) {
                foreach (['remove' => $l->removable, 'extra' => $l->extra_allowed] as $kind => $on) {
                    if ($on && $l->ingredient) {
                        $found[$l->ingredient_id.':'.$kind]['row'] ??= ['ingredient_id' => (int) $l->ingredient_id, 'ingredient' => $l->ingredient->name, 'kind' => $kind, 'kind_label' => DishModifier::KINDS[$kind],
                            'quantity' => (float) $l->quantity, 'unit' => (string) $l->unit];   // an extra is one more of this amount
                        $found[$l->ingredient_id.':'.$kind]['in'][$source] = true;
                    }
                }
            }
        }
        $own = self::installed() ? DishModifier::where('dish_id', $dish->id)->get()->keyBy(fn ($m) => $m->ingredient_id.':'.$m->kind) : collect();

        return array_values(array_map(fn ($key, $f) => $f['row'] + ['in' => array_keys($f['in']), 'policy_id' => isset($own[$key]) ? (int) $own[$key]->policy_id : null], array_keys($found), $found));
    }

    /**
     * The recipes a dish's removals and extras come from: its own, and the recipes of the sides in its slots. Only recipes made to order count (script 205 refuses the flags elsewhere).
     *
     * @return array<string, DishRecipe> source name => recipe
     */
    private function recipes(Dish $dish): array
    {
        $out = [];
        $own = DishRecipe::where('dish_id', $dish->id)->where('is_active', true)->where('made_to_order', true)->first();
        if ($own) {
            $out[$dish->name] = $own;
        }
        if (DishMakeup::installed()) {
            foreach (DishSlot::with('choices.side.recipe')->where('dish_id', $dish->id)->get() as $slot) {
                foreach ($slot->choices as $c) {
                    $r = $c->side?->recipe;
                    if ($r && $r->is_active && $r->made_to_order) {
                        $out[$c->side->name] = $r;
                    }
                }
            }
        }

        return $out;
    }

    /**
     * Set the policy of each item: [{ingredient_id, kind, policy_id}], where an empty policy_id means the default one. What is sent replaces what was there. An item the dish does not offer
     * (its tick was taken off the recipe) is refused.
     *
     * @param array<int, array{ingredient_id?: mixed, kind?: mixed, policy_id?: mixed}> $rows
     * @return array<int, array<string, mixed>> the candidates as they now are
     */
    public function save(Dish $dish, array $rows): array
    {
        if (! self::installed()) {
            throw new BooksException('Run database script 206_menus_dish_modifiers.sql first (with 205 and 193 before it).');
        }
        $offered = collect($this->candidates($dish))->keyBy(fn ($c) => $c['ingredient_id'].':'.$c['kind']);
        $keep = [];
        foreach ($rows as $r) {
            $ing = (int) ($r['ingredient_id'] ?? 0);
            $kind = (string) ($r['kind'] ?? '');
            if (! isset(DishModifier::KINDS[$kind]) || ! $offered->has("{$ing}:{$kind}")) {
                throw new BooksException("{$dish->name} does not offer that: tick it on the recipe first (Menus, Recipes).");
            }
            if (isset($keep["{$ing}:{$kind}"])) {
                throw new BooksException($offered["{$ing}:{$kind}"]['ingredient'].' is listed twice.');
            }
            if (empty($r['policy_id'])) {
                continue;   // the default policy: no row of its own
            }
            $policy = ModifierPolicy::find((int) $r['policy_id']);
            if (! $policy || ! $policy->is_active) {
                throw new BooksException('That policy is not available: choose one from the list under Menus, Configuration.');
            }
            $keep["{$ing}:{$kind}"] = ['dish_id' => $dish->id, 'ingredient_id' => $ing, 'kind' => $kind, 'policy_id' => $policy->id];
        }
        DB::transaction(function () use ($dish, $keep) {
            DishModifier::where('dish_id', $dish->id)->delete();
            foreach ($keep as $row) {
                DishModifier::create($row);
            }
        });

        return $this->candidates($dish);
    }

    /** The policy that prices a removal or an extra of an ingredient on a dish: its own, else the default, else none (free). */
    public function policyFor(Dish $dish, int $ingredientId, string $kind): ?ModifierPolicy
    {
        if (self::installed() && ($row = DishModifier::with('policy')->where(['dish_id' => $dish->id, 'ingredient_id' => $ingredientId, 'kind' => $kind])->first()) && $row->policy) {
            return $row->policy;
        }

        return MenusLists::installed() ? ModifierPolicy::where('is_default', true)->first() : null;
    }

    /** What a policy charges on a dish that costs `$dishPrice` at the size chosen: nothing, the fixed fee, or its percentage of that price. */
    public static function fee(?ModifierPolicy $policy, float $dishPrice): float
    {
        if (! $policy || $policy->kind === 'free') {
            return 0.0;
        }

        return $policy->kind === 'percent' ? round($dishPrice * (float) $policy->amount / 100, 2) : round((float) $policy->amount, 2);
    }

    /** What leaving out, or adding extra of, an ingredient costs on a dish at this price. */
    public function priceOf(Dish $dish, int $ingredientId, string $kind, float $dishPrice): float
    {
        return self::fee($this->policyFor($dish, $ingredientId, $kind), $dishPrice);
    }

    /**
     * What a guest's removals and extras mean on an order line of this dish: the choices as option rows (name, fee), the stock rows (a removed ingredient is not used, an extra is one more of the
     * recipe line's amount), and the fees. A fee is a percentage of `$feeBase`, the price of the size chosen. With the Menus setting "a fee carries the dish's VAT" on, the fee is part of the
     * line's price; off, it is kept apart and posted to its own account.
     *
     * @param array<int, array{ingredient_id?: mixed, kind?: mixed}> $mods
     * @return array{options: array<int, array<string, mixed>>, uses: array<int, array<string, mixed>>, fee_in_price: float, fee_apart: float}
     */
    public function resolve(Dish $dish, array $mods, float $feeBase): array
    {
        $out = ['options' => [], 'uses' => [], 'fee_in_price' => 0.0, 'fee_apart' => 0.0];
        if (! $mods) {
            return $out;
        }
        $offered = collect($this->candidates($dish))->keyBy(fn ($c) => $c['ingredient_id'].':'.$c['kind']);
        $vat = (bool) (MenusSettings::all()['modifier_fees_vatable'] ?? true);
        $seen = [];
        foreach ($mods as $m) {
            $ing = (int) ($m['ingredient_id'] ?? 0);
            $kind = (string) ($m['kind'] ?? '');
            $item = $offered->get("{$ing}:{$kind}") ?? throw new BooksException("{$dish->name} can not be changed that way any more.");
            if (isset($seen[$ing])) {
                throw new BooksException("{$item['ingredient']} can not be both left out and added to.");
            }
            $seen[$ing] = true;
            $fee = $this->priceOf($dish, $ing, $kind, $feeBase);
            $out['options'][] = ['id' => null, 'group' => $kind === 'remove' ? 'Left out' : 'Extra', 'name' => ($kind === 'remove' ? 'No ' : 'Extra ').mb_strtolower($item['ingredient']), 'price_delta' => $fee,
                'apart' => ! $vat && $fee > 0, 'mod' => ['kind' => $kind, 'ingredient_id' => $ing]];
            $out['uses'][] = $kind === 'remove' ? ['mode' => 'remove', 'ingredient_id' => $ing] : ['mode' => 'add', 'ingredient_id' => $ing, 'quantity' => $item['quantity'], 'unit' => $item['unit']];
            $out[$vat ? 'fee_in_price' : 'fee_apart'] += $fee;
        }
        $out['fee_in_price'] = round($out['fee_in_price'], 2);
        $out['fee_apart'] = round($out['fee_apart'], 2);

        return $out;
    }

    /** How many dishes use a policy of their own (so it can not be deleted from under them). */
    public static function usedBy(int $policyId): int
    {
        return Schema::hasTable('menus_dish_modifiers') ? (int) DishModifier::where('policy_id', $policyId)->distinct()->count('dish_id') : 0;
    }
}

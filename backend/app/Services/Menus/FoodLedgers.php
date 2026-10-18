<?php

namespace App\Services\Menus;

use App\Models\Books\Ledger;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\IngredientKind;
use App\Services\Books\BooksException;

/**
 * The accounts Menus posts ingredient stock to. Menus configuration can point at others; until it does they are the ones script 182 made, found by name:
 *   Food Ingredients Inventory (current asset), Food Cost of Sales (direct expense), Food Waste Expense (direct expense).
 * A kind of ingredient can name its own: where its stock is carried (script 192) and what its cost is charged to when used (script 191). Supplies and packaging use Kitchen Supplies Inventory
 * and Kitchen Supplies Used, so they do not count as food. A kind without its own accounts, or no kind at all, falls back to the three above.
 */
final class FoodLedgers
{
    public const NAMES = ['ingredient_stock_ledger_id' => 'Food Ingredients Inventory', 'food_cost_ledger_id' => 'Food Cost of Sales', 'food_waste_ledger_id' => 'Food Waste Expense'];

    /** Where the stock is carried: the kind's account, else Food Ingredients Inventory. */
    public static function inventory(?IngredientKind $kind = null): int
    {
        return $kind?->stock_ledger_id ? (int) $kind->stock_ledger_id : self::resolve('ingredient_stock_ledger_id');
    }

    /** What the cost is charged to when stock is used: the kind's account, else Food Cost of Sales. */
    public static function cost(?IngredientKind $kind = null): int
    {
        return $kind?->expense_ledger_id ? (int) $kind->expense_ledger_id : self::resolve('food_cost_ledger_id');
    }

    /**
     * What a shortfall is charged to. Waste is Food Waste Expense; but for supplies and packaging, which are used up on purpose, a count that finds less is the using, so it is charged
     * to the kind's account (Kitchen Supplies Used).
     */
    public static function loss(?IngredientKind $kind = null): int
    {
        return $kind && $kind->consumable() && $kind->expense_ledger_id ? (int) $kind->expense_ledger_id : self::waste();
    }

    /** The kind of an ingredient variant (null when it has none yet). */
    public static function kindOfItem(int $itemId): ?IngredientKind
    {
        return IngredientItem::with('ingredient.kind')->find($itemId)?->ingredient?->kind;
    }

    /**
     * Journal lines for amounts keyed by kind id (0 for no kind): the debit is the cost account of each kind (`cost`), Food Waste Expense (`waste`) or the loss account of each kind (`loss`),
     * the credit is the account the kind's stock is carried on. Lines on the same account are added up.
     *
     * @param array<int, float> $byKind
     * @param callable|null $convert turns each kind's base-currency amount into the voucher's currency (so a kind's debit and credit stay equal)
     * @return array<int, array{ledger_id: int, side: string, amount: float}>
     */
    public static function entries(array $byKind, string $debit = 'cost', ?callable $convert = null): array
    {
        $lines = [];
        foreach ($byKind as $kindId => $amount) {
            $amount = round($convert ? $convert((float) $amount) : (float) $amount, 2);
            if ($amount <= 0) {
                continue;
            }
            $kind = $kindId ? IngredientKind::find((int) $kindId) : null;
            $dr = match ($debit) { 'waste' => self::waste(), 'loss' => self::loss($kind), default => self::cost($kind) };
            foreach ([[$dr, 'D'], [self::inventory($kind), 'C']] as [$ledger, $side]) {
                $key = $ledger.$side;
                $lines[$key] = ['ledger_id' => $ledger, 'side' => $side, 'amount' => round(($lines[$key]['amount'] ?? 0.0) + $amount, 2)];
            }
        }

        return array_values($lines);
    }

    /**
     * Journal lines for what a count found, by kind: a loss (negative) is charged to the kind's loss account and taken off its stock account, a gain (positive) the other way round.
     *
     * @param array<int, float> $byKind
     * @return array<int, array{ledger_id: int, side: string, amount: float}>
     */
    public static function countEntries(array $byKind, ?callable $convert = null): array
    {
        $lines = [];
        foreach ($byKind as $kindId => $value) {
            $abs = round($convert ? $convert(abs((float) $value)) : abs((float) $value), 2);
            if ($abs < 0.01) {
                continue;
            }
            $kind = $kindId ? IngredientKind::find((int) $kindId) : null;
            $loss = self::loss($kind);
            $stock = self::inventory($kind);
            foreach ($value < 0 ? [[$loss, 'D'], [$stock, 'C']] : [[$stock, 'D'], [$loss, 'C']] as [$ledger, $side]) {
                $key = $ledger.$side;
                $lines[$key] = ['ledger_id' => $ledger, 'side' => $side, 'amount' => round(($lines[$key]['amount'] ?? 0.0) + $abs, 2)];
            }
        }

        return array_values($lines);
    }

    /** Where cooked food waiting to be sold is carried (Menus configuration, else the account called Prepared Food Inventory). */
    public static function prepared(): int
    {
        $chosen = MenusSettings::all()['prepared_food_ledger_id'] ?? null;
        if ($chosen && Ledger::whereKey($chosen)->where('is_active', true)->exists()) {
            return (int) $chosen;
        }

        return (int) (Ledger::where('name', 'Prepared Food Inventory')->where('is_active', true)->value('id')
            ?: throw new BooksException('The account "Prepared Food Inventory" does not exist yet. Run database script 193_menus_config_foundation.sql, or choose the account under Menus, Configuration.'));
    }

    public static function waste(): int
    {
        return self::resolve('food_waste_ledger_id');
    }

    private static function resolve(string $key): int
    {
        $chosen = MenusSettings::all()[$key] ?? null;
        if ($chosen && Ledger::whereKey($chosen)->where('is_active', true)->exists()) {
            return (int) $chosen;
        }
        $byName = Ledger::where('name', self::NAMES[$key])->where('is_active', true)->value('id');
        if (! $byName) {
            throw new BooksException('The account "'.self::NAMES[$key].'" does not exist yet. Run database script 182_menus_ingredient_stock.sql, or choose the account under Menus, Configuration.');
        }

        return (int) $byName;
    }
}

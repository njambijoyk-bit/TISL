<?php

namespace App\Services\Menus;

use App\Models\Books\Ledger;
use App\Services\Books\BooksException;

/**
 * The three accounts Menus posts ingredient stock to. Menus configuration can point at others; until it does they are the ones script 182 made, found by name:
 *   Food Ingredients Inventory (current asset), Food Cost of Sales (direct expense), Food Waste Expense (direct expense).
 */
final class FoodLedgers
{
    public const NAMES = ['ingredient_stock_ledger_id' => 'Food Ingredients Inventory', 'food_cost_ledger_id' => 'Food Cost of Sales', 'food_waste_ledger_id' => 'Food Waste Expense'];

    public static function inventory(): int
    {
        return self::resolve('ingredient_stock_ledger_id');
    }

    public static function cost(): int
    {
        return self::resolve('food_cost_ledger_id');
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

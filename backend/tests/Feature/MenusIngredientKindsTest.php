<?php

namespace Tests\Feature;

use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientKind;
use App\Services\Books\BooksException;
use App\Services\Menus\IngredientKinds;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus, ingredient kinds (script 190): a kind says what its ingredients may be used for; cooking ingredients go into recipes, ready to serve ones do not. */
class MenusIngredientKindsTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
    }

    private function kinds(): IngredientKinds
    {
        return app(IngredientKinds::class);
    }

    private function kind(string $code): IngredientKind
    {
        $this->kinds()->seedDefaults();

        return IngredientKind::where('code', $code)->firstOrFail();
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected: {$part}");
    }

    private function soda(): Ingredient
    {
        return $this->makeIngredient('Cola 500ml', $this->g, null, [['name' => 'Cola 500ml']], 'preferred', ['kind_id' => $this->kind('ready_to_serve')->id]);
    }

    public function test_the_scripts_put_in_exactly_the_default_kinds(): void
    {
        $flags = ['in_recipes', 'sold_as_is', 'free_extra', 'packaging', 'used_up'];
        $rows = [];
        foreach (['190_menus_ingredient_kinds.sql' => 4, '191_menus_kind_ledgers.sql' => 5] as $file => $count) {   // script 190 has four uses, 191 adds the fifth
            $sql = file_get_contents(base_path('database/sql/'.$file));
            preg_match_all("/SELECT '(\w+)'(?: AS code)?, '([^']+)'(?: AS name)?, (\d)(?: AS in_recipes)?, (\d)(?: AS sold_as_is)?, (\d)(?: AS free_extra)?, (\d)(?: AS packaging)?(?:, (\d)(?: AS used_up)?)?/", $sql, $m, PREG_SET_ORDER);
            foreach ($m as $r) {
                $on = array_slice($r, 3, $count);
                $rows[$r[1]] = [$r[1], $r[2], array_values(array_filter($flags, fn ($f, $i) => ($on[$i] ?? '0') === '1', ARRAY_FILTER_USE_BOTH))];
            }
        }
        $this->assertSame(array_map(fn ($d) => array_slice($d, 0, 3), IngredientKinds::DEFAULTS), array_values($rows), 'the scripts and IngredientKinds::DEFAULTS say the same');
        $this->assertSame(5, $this->kinds()->seedDefaults());
        $this->assertSame(0, $this->kinds()->seedDefaults(), 'nothing is added twice');
    }

    public function test_the_default_kinds_are_charged_to_the_accounts_the_script_names(): void
    {
        $supplies = DB::table('ledgers')->insertGetId(['name' => 'Kitchen Supplies Used', 'group_id' => 1]);
        $shelf = DB::table('ledgers')->insertGetId(['name' => 'Kitchen Supplies Inventory', 'group_id' => 1]);
        $this->kinds()->seedDefaults();
        $this->assertSame([$this->inventory, $this->inventory, $shelf, $shelf], [$this->kind('cooking')->stock_ledger_id, $this->kind('condiment')->stock_ledger_id, $this->kind('supplies')->stock_ledger_id, $this->kind('packaging')->stock_ledger_id], 'food is carried on Food Ingredients Inventory, supplies on their own account');
        $this->assertSame($this->costOfSales, $this->kind('cooking')->expense_ledger_id);
        $this->assertSame($this->costOfSales, $this->kind('ready_to_serve')->expense_ledger_id);
        $this->assertSame($supplies, $this->kind('supplies')->expense_ledger_id);
        $this->assertSame($supplies, $this->kind('packaging')->expense_ledger_id);
        $this->assertTrue($this->kind('supplies')->used_up);
    }

    public function test_a_new_ingredient_is_a_cooking_ingredient_unless_a_kind_is_chosen(): void
    {
        $flour = $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Exe']]);
        $this->assertSame('cooking', $flour->kind->code);
        $this->assertSame('ready_to_serve', $this->soda()->kind->code);
    }

    public function test_saving_again_keeps_the_kind_it_has(): void
    {
        $soda = $this->soda();
        $again = app(\App\Services\Menus\Ingredients::class)->save(['name' => 'Cola 500ml', 'base_unit_id' => $this->g, 'variants' => [['name' => 'Cola 500ml']]], $soda->id);
        $this->assertSame($soda->kind_id, $again->kind_id);
    }

    public function test_a_recipe_takes_cooking_ingredients_and_refuses_a_ready_to_serve_one(): void
    {
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Exe']]);
        $this->soda();
        $this->dish('Pancakes', 100, [['Wheat flour', 200]]);   // fine
        $this->fails(fn () => $this->dish('Cola float', 100, [['Cola 500ml', 1]]), 'Ready to serve, which is not used in recipes');
    }

    public function test_a_condiment_can_be_cooked_with(): void
    {
        $this->makeIngredient('Salt', $this->g, null, [['name' => 'Salt']], 'preferred', ['kind_id' => $this->kind('condiment')->id]);
        $this->dish('Chips', 100, [['Salt', 5]]);
        $this->assertSame(1, Ingredient::where('name', 'Salt')->count());
    }

    public function test_an_ingredient_without_a_kind_is_allowed_in_recipes(): void
    {
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Exe']]);
        DB::table('menus_ingredients')->update(['kind_id' => null]);
        $this->dish('Pancakes', 100, [['Wheat flour', 200]]);
        $this->assertTrue(IngredientKinds::allowedInRecipe(Ingredient::first()));
    }

    public function test_an_ingredient_in_a_recipe_can_not_be_given_a_kind_that_is_not_used_in_recipes(): void
    {
        $flour = $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Exe']]);
        $this->dish('Pancakes', 100, [['Wheat flour', 200]]);
        $this->fails(fn () => app(\App\Services\Menus\Ingredients::class)->save(['name' => 'Wheat flour', 'base_unit_id' => $this->g, 'kind_id' => $this->kind('packaging')->id, 'variants' => [['name' => 'Exe', 'id' => $flour->variants()->value('id')]]], $flour->id), 'It is in a recipe');
        $this->assertSame('cooking', $flour->fresh()->kind->code);
    }

    public function test_a_kind_can_be_made_renamed_and_keeps_its_code(): void
    {
        $k = $this->kinds()->save(['name' => 'Bar drinks', 'sold_as_is' => true, 'expense_ledger_id' => $this->costOfSales, 'stock_ledger_id' => $this->inventory]);
        $this->assertSame('bar_drinks', $k->code);
        $this->assertTrue($k->sold_as_is);
        $this->assertFalse($k->in_recipes);
        $k = $this->kinds()->save(['name' => 'Drinks from the bar', 'sold_as_is' => true, 'in_recipes' => true, 'expense_ledger_id' => $this->costOfSales, 'stock_ledger_id' => $this->inventory], $k);
        $this->assertSame('bar_drinks', $k->code);
        $this->assertTrue($k->fresh()->in_recipes);
    }

    public function test_a_kind_needs_a_name_a_use_and_a_name_of_its_own(): void
    {
        $this->kinds()->seedDefaults();
        $cost = $this->costOfSales;
        $this->fails(fn () => $this->kinds()->save(['name' => ' ', 'in_recipes' => true, 'expense_ledger_id' => $cost, 'stock_ledger_id' => $this->inventory]), 'Give the kind a name');
        $this->fails(fn () => $this->kinds()->save(['name' => 'Odds', 'expense_ledger_id' => $cost, 'stock_ledger_id' => $this->inventory]), 'Say what it is used for');
        $this->fails(fn () => $this->kinds()->save(['name' => 'packaging', 'packaging' => true, 'expense_ledger_id' => $cost, 'stock_ledger_id' => $this->inventory]), 'already a kind called');
    }

    public function test_a_kind_must_say_which_account_its_stock_is_carried_on(): void
    {
        $this->fails(fn () => $this->kinds()->save(['name' => 'Gloves', 'used_up' => true, 'expense_ledger_id' => $this->costOfSales]), 'Choose the account its stock is carried on');
        $k = $this->kinds()->save(['name' => 'Gloves', 'used_up' => true, 'expense_ledger_id' => $this->costOfSales, 'stock_ledger_id' => $this->inventory]);
        $this->assertSame($this->inventory, $k->stock_ledger_id);
        $this->assertSame('Food Ingredients Inventory', collect($this->kinds()->list()['kinds'])->firstWhere('code', 'gloves')['stock_ledger'], 'two kinds may share an account');
    }

    public function test_a_kind_must_say_which_account_its_cost_is_charged_to(): void
    {
        $this->fails(fn () => $this->kinds()->save(['name' => 'Gloves', 'used_up' => true, 'stock_ledger_id' => $this->inventory]), 'Choose the account its cost is charged to');
        $this->fails(fn () => $this->kinds()->save(['name' => 'Gloves', 'used_up' => true, 'expense_ledger_id' => 9999, 'stock_ledger_id' => $this->inventory]), 'Choose the account its cost is charged to');
        $k = $this->kinds()->save(['name' => 'Cleaning', 'used_up' => true, 'expense_ledger_id' => $this->costOfSales, 'stock_ledger_id' => $this->inventory]);
        $this->assertTrue($k->used_up);
        $this->assertSame($this->costOfSales, $k->expense_ledger_id);
        $row = collect($this->kinds()->list()['kinds'])->firstWhere('code', 'cleaning');
        $this->assertSame('Food Cost of Sales', $row['expense_ledger']);
    }

    public function test_a_kind_can_not_stop_being_used_in_recipes_while_a_recipe_needs_it(): void
    {
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Exe']]);
        $this->dish('Pancakes', 100, [['Wheat flour', 200]]);
        $cooking = $this->kind('cooking');
        $this->fails(fn () => $this->kinds()->save(['name' => 'Cooking ingredient', 'sold_as_is' => true, 'expense_ledger_id' => $this->costOfSales, 'stock_ledger_id' => $this->inventory], $cooking), 'in a recipe');
        $this->kinds()->save(['name' => 'Cooking ingredient', 'in_recipes' => true, 'sold_as_is' => true, 'expense_ledger_id' => $this->costOfSales, 'stock_ledger_id' => $this->inventory], $cooking);   // adding a use is fine
        $this->assertTrue($cooking->fresh()->sold_as_is);
    }

    public function test_a_kind_in_use_or_the_default_one_can_not_be_removed(): void
    {
        $soda = $this->soda();
        $ready = $this->kind('ready_to_serve');
        $this->fails(fn () => $this->kinds()->delete($ready), 'is the kind of 1 ingredient');
        $this->fails(fn () => $this->kinds()->delete($this->kind('cooking')), 'stays');
        $soda->delete();
        $this->kinds()->delete($ready);
        $this->assertNull(IngredientKind::where('code', 'ready_to_serve')->first());
    }

    public function test_the_list_counts_the_ingredients_of_each_kind(): void
    {
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Exe']]);
        $this->makeIngredient('Sugar', $this->g, $this->kg, [['name' => 'Sugar']]);
        $this->soda();
        $by = collect($this->kinds()->list()['kinds'])->keyBy('code');
        $this->assertSame(2, $by['cooking']['ingredients']);
        $this->assertSame(1, $by['ready_to_serve']['ingredients']);
        $this->assertSame(0, $by['packaging']['ingredients']);
        $this->assertTrue($by['condiment']['in_recipes'] && $by['condiment']['free_extra']);
    }

    public function test_using_ingredients_charges_and_credits_the_accounts_of_each_kind(): void
    {
        $direct = (int) DB::table('ledger_groups')->where('name', 'Direct Expenses')->value('id');
        $stock = (int) DB::table('ledger_groups')->where('name', 'Stock-in-hand')->value('id');
        $spice = DB::table('ledgers')->insertGetId(['name' => 'Spice cost', 'group_id' => $direct]);
        $spiceShelf = DB::table('ledgers')->insertGetId(['name' => 'Spice shelf', 'group_id' => $stock]);
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Exe']]);
        $kind = $this->kinds()->save(['name' => 'Spices', 'in_recipes' => true, 'expense_ledger_id' => $spice, 'stock_ledger_id' => $spiceShelf]);
        $this->makeIngredient('Pepper', $this->g, null, [['name' => 'Pepper tin']], 'preferred', ['kind_id' => $kind->id]);
        $this->shelve('Exe', 1000, 0.2);
        $this->shelve('Pepper tin', 100, 1.0);
        $recipe = $this->dish('Peppered mash', 100, [['Wheat flour', 100], ['Pepper', 10]])->menuRecipe;   // flour 100 g at 0.2 = 20.00, pepper 10 g at 1.00 = 10.00
        app(\App\Services\Menus\IngredientUse::class)->consume($recipe, 1, self::BRANCH, ['type' => 'test', 'id' => 1], null);
        $by = collect(end($this->posted)['entries'])->mapWithKeys(fn ($e) => [$e['ledger_id'].$e['side'] => (float) $e['amount']]);
        $this->assertSame(20.0, $by[$this->costOfSales.'D']);
        $this->assertSame(20.0, $by[$this->inventory.'C']);
        $this->assertSame(10.0, $by[$spice.'D'], 'the spice is charged to its own cost account');
        $this->assertSame(10.0, $by[$spiceShelf.'C'], 'and taken off its own shelf account');
    }
}

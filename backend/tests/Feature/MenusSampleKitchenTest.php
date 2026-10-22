<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\DishSlot;
use App\Models\Menus\IngredientKind;
use App\Models\Menus\PrepLot;
use App\Models\Menus\StockBatch;
use App\Services\Books\BooksException;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishModifiers;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\DishSelection;
use App\Services\Menus\DishStock;
use App\Services\Menus\MenusLists;
use App\Services\Menus\IngredientUse;
use App\Services\Menus\PrepProduction;
use App\Services\Menus\Sides;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The sample kitchen of docs/MENUS_TEST_DATA.md, entered the way the document says (ingredients with variants and opening stock, recipes of their own, sides, dishes made of sides) so that
 * the figures the document states come from running that data: what a portion costs, what a sale takes off the shelf and from which variant, what leaving something out saves, and the cake batch.
 * If this fails, the document or the code is wrong: fix whichever is.
 */
class MenusSampleKitchenTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $ml;
    private int $litre;
    /** @var array<string, int> */
    private array $recipe = [];
    /** @var array<string, int> */
    private array $side = [];
    /** @var array<string, Dish> */
    private array $dish = [];
    private int $medium;
    private int $jumbo;
    private int $kids;
    /** @var array<string, int> */
    private array $slot = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); });
        Schema::create('menus_chefs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->default(0); $t->string('display_name'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '198_menus_prepared_food.sql', '199_menus_prepared_waste_counts.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '205_menus_recipe_line_flags.sql', '206_menus_dish_modifiers.sql', '225_menus_recipe_line_variant.sql');
        DB::table('ledgers')->insert(['name' => 'Prepared Food Inventory', 'group_id' => DB::table('ledger_groups')->where('name', 'Stock-in-hand')->value('id')]);
        $this->ml = DB::table('units_of_measure')->insertGetId(['code' => 'ml', 'name' => 'Millilitre', 'dimension' => 'volume', 'to_base_factor' => 1]);
        $this->litre = DB::table('units_of_measure')->insertGetId(['code' => 'L', 'name' => 'Litre', 'dimension' => 'volume', 'to_base_factor' => 1000]);
        app(\App\Services\Menus\IngredientKinds::class)->seedDefaults();
        $this->medium = DB::table('menus_servings')->insertGetId(['name' => 'Medium', 'sort_order' => 1, 'is_active' => true]);
        $this->jumbo = DB::table('menus_servings')->insertGetId(['name' => 'Jumbo', 'sort_order' => 2, 'is_active' => true]);
        $this->ingredients();
        $this->recipes();
        $this->sides();
        $this->dishes();
    }

    /** section 1 and 2 of the data: the ingredients, their variants and the opening stock (price of one pack divided by what it holds, per base unit). */
    private function ingredients(): void
    {
        $kind = fn (string $code) => ['kind_id' => (int) IngredientKind::where('code', $code)->value('id')];
        $in = function (string $name, int $base, ?int $alt, array $variants, string $rule = 'preferred', array $extra = []) {
            $this->makeIngredient($name, $base, $alt, array_map(fn ($v) => array_diff_key($v, ['stock' => 1, 'cost' => 1, 'expiry' => 1]), $variants), $rule, $extra);
            foreach ($variants as $v) {
                if (! empty($v['stock'])) {
                    $this->shelve($v['name'], $v['stock'], $v['cost'], $v['expiry'] ?? null);
                }
            }
        };
        $in('Wheat flour', $this->g, $this->kg, [['name' => 'Pembe 24 kg', 'pack' => 24000], ['name' => 'Exe 2 kg', 'pack' => 2000, 'level' => 6000, 'stock' => 20000, 'cost' => 0.13], ['name' => 'Soko 1 kg', 'pack' => 1000, 'allowed' => false, 'stock' => 5000, 'cost' => 0.14], ['name' => 'Jogoo 2 kg', 'pack' => 2000, 'active' => false]]);
        $in('Sugar', $this->g, $this->kg, [['name' => 'Kabras 1 kg', 'pack' => 1000, 'stock' => 10000, 'cost' => 0.16]]);
        $in('Eggs', $this->each, null, [['name' => 'Tray of 30', 'pack' => 30, 'expires' => true, 'level' => 60, 'stock' => 120, 'cost' => 15, 'expiry' => '2026-10-21']]);
        $in('Milk', $this->ml, $this->litre, [['name' => 'Fresh 1 L', 'pack' => 1000, 'stock' => 20000, 'cost' => 0.12], ['name' => 'Fresh 500 ml', 'pack' => 500, 'stock' => 5000, 'cost' => 0.13]], 'cheapest');
        $in('Butter', $this->g, $this->kg, [['name' => 'Block 250 g', 'pack' => 250, 'expires' => true, 'stock' => 1250, 'cost' => 1.32, 'expiry' => '2026-11-11']]);
        $in('Cooking oil', $this->ml, $this->litre, [['name' => 'Jerrycan 5 L', 'pack' => 5000, 'stock' => 10000, 'cost' => 0.31], ['name' => 'Bottle 1 L', 'pack' => 1000, 'stock' => 6000, 'cost' => 0.34]]);
        $in('Beef', $this->g, $this->kg, [['name' => 'Stewing meat 1 kg', 'pack' => 1000, 'expires' => true, 'stock' => 6000, 'cost' => 0.8, 'expiry' => '2026-11-06']]);
        $in('Chicken', $this->g, $this->kg, [['name' => 'Breast 1 kg', 'pack' => 1000, 'expires' => true, 'stock' => 1000, 'cost' => 0.65, 'expiry' => '2026-11-06']]);
        $in('Tomatoes', $this->g, $this->kg, [['name' => 'Tomatoes 1 kg', 'pack' => 1000, 'stock' => 8000, 'cost' => 0.12]]);
        $in('Onions', $this->g, $this->kg, [['name' => 'Onions 1 kg', 'pack' => 1000, 'stock' => 8000, 'cost' => 0.1]]);
        $in('Potatoes', $this->g, $this->kg, [['name' => 'Potatoes 1 kg', 'pack' => 1000, 'stock' => 15000, 'cost' => 0.09]]);
        $in('Rice', $this->g, $this->kg, [['name' => 'Pishori 2 kg', 'pack' => 2000, 'stock' => 10000, 'cost' => 0.19]]);
        $in('Kale', $this->g, $this->kg, [['name' => 'Sukuma wiki 1 kg', 'pack' => 1000, 'stock' => 5000, 'cost' => 0.06]]);
        $in('Maize flour', $this->g, $this->kg, [['name' => 'Unga 2 kg', 'pack' => 2000, 'stock' => 20000, 'cost' => 0.1]]);
        $in('Salt', $this->g, $this->kg, [['name' => 'Salt 500 g', 'pack' => 500, 'level' => 1000, 'stock' => 500, 'cost' => 0.08]], 'preferred', $kind('condiment'));
        $in('Cocoa', $this->g, $this->kg, [['name' => 'Cocoa tin 200 g', 'pack' => 200, 'stock' => 400, 'cost' => 1.9]]);
        $in('Baking powder', $this->g, $this->kg, [['name' => 'Tin 100 g', 'pack' => 100, 'stock' => 200, 'cost' => 1.2]]);
        $in('Tea leaves', $this->g, $this->kg, [['name' => 'Pack 250 g', 'pack' => 250, 'stock' => 750, 'cost' => 0.6]]);
        $in('Cheddar cheese', $this->g, $this->kg, [['name' => 'Block 1 kg', 'pack' => 1000, 'expires' => true, 'stock' => 3000, 'cost' => 0.9, 'expiry' => '2026-11-17']]);
        $in('Burger bun', $this->each, null, [['name' => 'Pack of 6', 'pack' => 6, 'expires' => true, 'stock' => 60, 'cost' => 20, 'expiry' => '2026-10-23']]);
        $in('Mayonnaise', $this->ml, $this->litre, [['name' => 'Jar 1 L', 'pack' => 1000, 'expires' => true, 'stock' => 2000, 'cost' => 0.45, 'expiry' => '2027-01-16']], 'preferred', $kind('condiment'));
        $in('Tomato ketchup', $this->ml, $this->litre, [['name' => 'Ketchup bottle 1 L', 'pack' => 1000, 'expires' => true, 'stock' => 3000, 'cost' => 0.36, 'expiry' => '2027-02-15']], 'preferred', $kind('condiment'));
        $in('Cola', $this->each, null, [['name' => 'Crate of 24', 'pack' => 24, 'expires' => true, 'level' => 24, 'stock' => 72, 'cost' => 50, 'expiry' => '2027-01-16'], ['name' => 'Single bottle', 'pack' => 1, 'expires' => true, 'stock' => 6, 'cost' => 60, 'expiry' => '2027-01-16']], 'cheapest', $kind('ready_to_serve'));
    }

    private function ing(string $name): int
    {
        return (int) DB::table('menus_ingredients')->where('name', $name)->value('id');
    }

    private function left(string $variant): float
    {
        return (float) StockBatch::where('item_id', $this->itemId($variant))->sum('qty_left');
    }

    /** @param array<int, array{0: string, 1: float, 2?: float}> $lines [ingredient, amount, waste %] */
    private function recipeOf(string $name, float $yield, array $lines, array $o = []): void
    {
        $this->recipe[$name] = app(DishRecipes::class)->saveStandalone($o + ['name' => $name, 'yield_qty' => $yield, 'lines' => array_map(fn ($l) => ['ingredient_id' => $this->ing($l[0]), 'quantity' => $l[1], 'waste_pct' => $l[2] ?? 0] + ($l[3] ?? []), $lines)])->id;
    }

    /** section 4 of the data: the recipes of their own. The dishes' recipes of the old data became these. */
    private function recipes(): void
    {
        $this->recipeOf('Stewed beef', 1, [['Beef', 200, 5], ['Onions', 60], ['Tomatoes', 100], ['Cooking oil', 20], ['Salt', 3]], ['prep_minutes' => 10, 'cook_minutes' => 90, 'steps' => [['body' => 'Brown the beef in the oil.', 'minutes' => 10], ['body' => 'Add the onions, tomatoes and salt and cook down.', 'minutes' => 10], ['body' => 'Cover and simmer until the beef is tender.', 'minutes' => 70]]]);
        $this->recipeOf('Chicken pilau', 1, [['Rice', 150], ['Chicken', 180], ['Onions', 50], ['Cooking oil', 25], ['Tomatoes', 40], ['Salt', 3]], ['prep_minutes' => 15, 'cook_minutes' => 40, 'steps' => [['body' => 'Fry the onions in the oil until golden.', 'minutes' => 8], ['body' => 'Add the chicken, tomatoes and salt and brown.', 'minutes' => 12], ['body' => 'Stir in the rice and water, cover and cook until dry.', 'minutes' => 20]]]);
        $this->recipeOf('Sukuma wiki', 1, [['Kale', 150, 10], ['Onions', 40], ['Tomatoes', 50], ['Cooking oil', 15], ['Salt', 2]], ['prep_minutes' => 5, 'cook_minutes' => 10, 'steps' => [['body' => 'Fry the onions and tomatoes in the oil.', 'minutes' => 5], ['body' => 'Add the chopped kale and salt and cook until soft.', 'minutes' => 5]]]);
        $this->recipeOf('Chips', 1, [['Potatoes', 300, 15], ['Cooking oil', 60], ['Salt', 2]]);
        $this->recipeOf('Pancakes', 1, [['Wheat flour', 120], ['Eggs', 1], ['Milk', 150], ['Sugar', 15], ['Butter', 10, 0, ['removable' => true]], ['Cooking oil', 10]]);
        $this->recipeOf('Masala chai', 1, [['Milk', 200], ['Tea leaves', 5], ['Sugar', 10]]);
        $this->recipeOf('Chocolate cake', 8, [['Wheat flour', 300], ['Sugar', 250], ['Eggs', 4], ['Butter', 200], ['Cocoa', 60], ['Milk', 200], ['Baking powder', 10]], ['made_to_order' => false, 'prep_minutes' => 20, 'cook_minutes' => 40]);
        $this->recipeOf('Ugali', 2, [['Maize flour', 800]], ['made_to_order' => false, 'yield_unit_id' => $this->kg, 'times' => [['up_to' => 1, 'minutes' => 15], ['up_to' => 2, 'minutes' => 20], ['up_to' => 5, 'minutes' => 40]]]);
        $this->recipeOf('Tomato and onion base', 2, [['Onions', 400], ['Tomatoes', 600]], ['yield_unit_id' => $this->kg]);
        $this->recipeOf('Bread', 1, [['Wheat flour', 60]]);
        $this->recipeOf('Choma', 1, [['Beef', 150], ['Salt', 2]]);
        $this->recipeOf('Wet fry', 1, [['Beef', 120], ['Onions', 30], ['Cooking oil', 15]]);
        $this->recipeOf('Kale', 1, [['Kale', 100], ['Onions', 20]]);
        $this->recipeOf('Egg', 1, [['Eggs', 1]]);
        $this->recipeOf('Ketchup portion', 1, [['Tomato ketchup', 30]]);
        $this->recipeOf('Mayo portion', 1, [['Mayonnaise', 20]]);
        $this->recipeOf('Beef pilau', 1, [['Rice', 150], ['Beef', 150], ['Onions', 50], ['Cooking oil', 25], ['Tomatoes', 40], ['Salt', 3]], ['prep_minutes' => 15, 'cook_minutes' => 45, 'steps' => [['body' => 'Fry the onions in the oil until golden.', 'minutes' => 8], ['body' => 'Add the beef, tomatoes and salt and brown.', 'minutes' => 12], ['body' => 'Stir in the rice and water, cover and cook until dry.', 'minutes' => 25]]]);
        $this->recipeOf('Mandazi', 1, [['Wheat flour', 100], ['Sugar', 20], ['Milk', 60], ['Cooking oil', 40], ['Baking powder', 3]], ['prep_minutes' => 20, 'cook_minutes' => 10, 'steps' => [['body' => 'Mix the flour, sugar and baking powder, then the milk, and knead.', 'minutes' => 10], ['body' => 'Rest the dough, roll and cut into triangles.', 'minutes' => 10], ['body' => 'Deep fry until golden.', 'minutes' => 10]]]);
        $this->recipeOf('Cheese omelette', 1, [['Eggs', 2], ['Cheddar cheese', 20], ['Butter', 10], ['Salt', 1]], ['prep_minutes' => 3, 'cook_minutes' => 5, 'steps' => [['body' => 'Beat the eggs with the salt.', 'minutes' => 2], ['body' => 'Melt the butter, pour in the eggs, add the cheese and fold.', 'minutes' => 4]]]);
        $this->recipeOf('Burger', 1, [['Burger bun', 1], ['Beef', 120], ['Cheddar cheese', 20, 0, ['removable' => true, 'extra_allowed' => true]], ['Onions', 10, 0, ['removable' => true]], ['Cooking oil', 5]]);
    }

    /** section 5 of the data. */
    private function sides(): void
    {
        $svc = app(Sides::class);
        foreach (['Stewed beef', 'Chicken pilau', 'Sukuma wiki', 'Pancakes', 'Masala chai', 'Chocolate cake', 'Bread', 'Choma', 'Wet fry', 'Kale', 'Egg', 'Burger', 'Beef pilau', 'Mandazi', 'Cheese omelette'] as $n) {
            $this->side[$n] = $svc->save(['name' => $n, 'recipe_id' => $this->recipe[$n]])->id;
        }
        $this->side['Chips'] = $svc->save(['name' => 'Chips', 'recipe_id' => $this->recipe['Chips'], 'base_amount' => 1, 'amounts' => [['serving_id' => $this->jumbo, 'amount' => 1.5]]])->id;
        $this->side['Ugali'] = $svc->save(['name' => 'Ugali', 'recipe_id' => $this->recipe['Ugali'], 'unit_id' => $this->g, 'base_amount' => 250, 'amounts' => [['serving_id' => $this->jumbo, 'amount' => 350]]])->id;
        foreach (['Ketchup' => 'Ketchup portion', 'Mayo' => 'Mayo portion'] as $n => $r) {
            $this->side[$n] = $svc->save(['name' => $n, 'recipe_id' => $this->recipe[$r]])->id;
        }
        $this->side['Cola'] = $svc->save(['name' => 'Cola', 'ingredient_id' => $this->ing('Cola')])->id;
    }

    private function plate(string $dish, float $price, string $side, array $o = []): Dish
    {
        $d = Dish::create(['name' => $dish, 'slug' => \Illuminate\Support\Str::slug($dish), 'price' => $price, 'is_active' => true]);
        app(DishMakeup::class)->save($d, $o + ['slots' => [['name' => 'Plate', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side[$side]]]]]]);

        return $this->dish[$dish] = $d;
    }

    /** section 6 of the data. */
    private function dishes(): void
    {
        $this->plate('Beef stew & ugali', 650, 'Stewed beef', ['slots' => [['name' => 'Main', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Stewed beef']]]], ['name' => 'Starch', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Ugali']]]]]]);
        $this->plate('Chicken pilau', 600, 'Chicken pilau');
        $this->plate('Beef pilau', 650, 'Beef pilau');
        $this->plate('Mandazi', 80, 'Mandazi');
        $this->plate('Cheese omelette', 300, 'Cheese omelette');
        $this->plate('Sukuma wiki & ugali', 250, 'Sukuma wiki', ['slots' => [['name' => 'Main', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Sukuma wiki']]]], ['name' => 'Starch', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Ugali']]]]]]);
        $this->plate('Pancakes', 350, 'Pancakes');
        $this->plate('Masala chai', 150, 'Masala chai');
        $this->plate('Chocolate cake slice', 400, 'Chocolate cake');
        $this->plate('Chips', 300, 'Chips', ['servings' => [['serving_id' => $this->medium, 'price' => 300], ['serving_id' => $this->jumbo, 'price' => 400]]]);
        $lists = app(MenusLists::class);
        $lists->save('policies', ['name' => 'Free', 'kind' => 'free']);
        $fee = $lists->save('policies', ['name' => 'Fee 20', 'kind' => 'fixed', 'amount' => 20])->id;
        $pct = $lists->save('policies', ['name' => 'Ten percent', 'kind' => 'percent', 'amount' => 10])->id;
        $burger = $this->plate('Burger', 500, 'Burger');
        app(DishModifiers::class)->save($burger, [['ingredient_id' => $this->ing('Cheddar cheese'), 'kind' => 'extra', 'policy_id' => $pct], ['ingredient_id' => $this->ing('Onions'), 'kind' => 'remove', 'policy_id' => $fee]]);
        $kids = DB::table('menus_servings')->insertGetId(['name' => 'Kids', 'sort_order' => 3, 'is_active' => true]);
        $steak = $this->plate('Steak sandwich', 500, 'Bread', ['servings' => [['serving_id' => $this->jumbo, 'price' => 650], ['serving_id' => $kids, 'price' => 350]], 'slots' => [
            ['name' => 'Bread', 'kind' => 'fixed', 'choices' => [['side_id' => $this->side['Bread']]]],
            ['name' => 'Protein', 'kind' => 'choose_one', 'choices' => [['side_id' => $this->side['Choma'], 'is_default' => true], ['side_id' => $this->side['Wet fry'], 'upcharge' => 50]]],
            ['name' => 'Greens', 'kind' => 'choose_any', 'min' => 0, 'max' => 2, 'choices' => [['side_id' => $this->side['Kale'], 'upcharge' => 20]]],
            ['name' => 'Sauces', 'kind' => 'free_extra', 'max' => 2, 'choices' => [['side_id' => $this->side['Ketchup']], ['side_id' => $this->side['Mayo']]]],
            ['name' => 'Drink', 'kind' => 'free_extra', 'max' => 2, 'choices' => [['side_id' => $this->side['Cola']]]],
            ['name' => 'Extras', 'kind' => 'paid_extra', 'max' => 3, 'choices' => [['side_id' => $this->side['Egg'], 'upcharge' => 40]]],
        ]]);
        $this->slot = DishSlot::where('dish_id', $steak->id)->pluck('id', 'name')->all();
        $this->kids = $kids;
    }

    /** Sell qty of a dish the way the till does and book the stock for it, all inside a transaction like the books'. */
    private function sell(string $dish, float $qty = 1, ?int $serving = null, array $mods = []): void
    {
        $d = $this->dish[$dish];
        $sel = app(DishSelection::class)->resolve($d, $serving, []);
        $m = app(DishModifiers::class)->resolve($d, $mods, (float) $sel['base_price']);
        $v = $this->sale([['dish' => $d, 'qty' => $qty, 'uses' => array_merge($sel['uses'], $m['uses'])]]);
        DB::transaction(fn () => app(DishStock::class)->apply($v, null));
    }

    private function portionCost(string $recipe): float
    {
        return round((float) app(IngredientUse::class)->cost(DishRecipe::find($this->recipe[$recipe]), 1)['per_portion'], 2);
    }

    // ------------------------------------------------------------ the figures of the document

    public function test_what_a_portion_of_each_recipe_costs(): void
    {
        $this->assertSame(
            ['Beef pilau' => 166.57, 'Mandazi' => 39.97, 'Cheese omelette' => 61.28, 'Stewed beef' => 193.09, 'Chicken pilau' => 163.57, 'Sukuma wiki' => 24.98, 'Chips' => 51.20, 'Pancakes' => 67.71, 'Masala chai' => 29.00],
            collect(['Beef pilau', 'Mandazi', 'Cheese omelette', 'Stewed beef', 'Chicken pilau', 'Sukuma wiki', 'Chips', 'Pancakes', 'Masala chai'])->mapWithKeys(fn ($r) => [$r => $this->portionCost($r)])->all(),
        );
    }

    public function test_the_cake_costs_a_slice_on_the_recipe_screen_and_ugali_a_kilogram(): void
    {
        $this->assertSame([69.18, 40.0], [$this->portionCost('Chocolate cake'), $this->portionCost('Ugali')], 'the shelf average; making the batch costs 553.00, which is 69.13 a slice');
    }

    public function test_three_pancakes_take_the_flour_from_exe_the_milk_from_the_cheapest_and_leave_soko_alone(): void
    {
        $this->sell('Pancakes', 3);
        $this->assertSame([19640.0, 5000.0, 117.0, 19550.0, 1220.0], [$this->left('Exe 2 kg'), $this->left('Soko 1 kg'), $this->left('Tray of 30'), $this->left('Fresh 1 L'), $this->left('Block 250 g')], 'flour from Exe (Pembe is empty, Soko may not be used), eggs 120 to 117, milk 450 ml from the 1 L packs, butter 1,250 to 1,220');
        $this->assertSame(5000.0, $this->left('Fresh 500 ml'));
    }

    public function test_leaving_out_the_butter_saves_ten_grams_a_pancake(): void
    {
        $this->sell('Pancakes', 3, null, [['kind' => 'remove', 'ingredient_id' => $this->ing('Butter')]]);
        $this->assertSame(1250.0, $this->left('Block 250 g'));
        $this->assertSame(19640.0, $this->left('Exe 2 kg'), 'the rest of the pancake is still made');
    }

    public function test_the_sixth_chicken_pilau_is_refused_and_the_chicken_is_not_touched(): void
    {
        $this->sell('Chicken pilau', 5);
        $this->assertSame(100.0, $this->left('Breast 1 kg'), '1 kg holds five portions of 180 g');
        try {
            $this->sell('Chicken pilau', 1);
            $this->fail('the sixth was sold');
        } catch (BooksException $e) {
            $this->assertSame('Not enough Chicken: need 180 g, have 100.', $e->getMessage());
        }
        $this->assertSame(100.0, $this->left('Breast 1 kg'));
    }

    public function test_a_jumbo_chips_takes_half_as_much_again_as_a_medium(): void
    {
        $this->sell('Chips', 1, $this->medium);
        $medium = 15000.0 - $this->left('Potatoes 1 kg');
        $this->sell('Chips', 1, $this->jumbo);
        $jumbo = 15000.0 - $this->left('Potatoes 1 kg') - $medium;
        $this->assertEqualsWithDelta([300 / 0.85, 450 / 0.85], [$medium, $jumbo], 0.01, '300 g and 450 g, with the 15% peeling waste added back');
    }

    public function test_the_cake_batch_costs_what_the_document_says_and_a_slice_is_sold_from_the_prepared_shelf(): void
    {
        $run = app(PrepProduction::class)->run(DishRecipe::find($this->recipe['Chocolate cake']), 1, 8.0, ['date' => '2026-10-17']);
        $this->assertSame(553.0, round((float) $run->cost, 2));
        $this->assertSame([8.0, 69.13], [(float) PrepLot::first()->qty_left, round((float) PrepLot::first()->unit_cost, 2)], '8 slices at 69.13 each');
        $this->sell('Chocolate cake slice', 1);
        $this->assertSame(7.0, (float) PrepLot::first()->qty_left);
    }

    public function test_the_other_kinds_are_where_the_document_says(): void
    {
        $kinds = DB::table('menus_ingredients')->join('menus_ingredient_kinds as k', 'k.id', '=', 'menus_ingredients.kind_id')->pluck('k.code', 'menus_ingredients.name')->all();
        $this->assertSame(['condiment', 'condiment', 'condiment', 'ready_to_serve'], [$kinds['Salt'], $kinds['Mayonnaise'], $kinds['Tomato ketchup'], $kinds['Cola']]);
        $this->assertSame(72.0 + 6.0, $this->left('Crate of 24') + $this->left('Single bottle'));
    }

    public function test_a_dish_made_of_sides_tells_the_allergens_and_diets_of_every_side_it_can_hold(): void
    {
        foreach ([['Wheat flour', ['wheat'], ['gluten']], ['Eggs', ['eggs'], ['egg']], ['Milk', ['milk'], ['dairy']], ['Butter', ['milk'], ['dairy']], ['Beef', [], ['meat']]] as [$name, $allergens, $tags]) {
            \App\Models\Menus\Ingredient::where('name', $name)->first()->update(['allergens' => $allergens, 'tags' => $tags]);
        }
        $info = app(\App\Services\Menus\DishInfo::class);

        $pancakes = $info->profile($this->dish['Pancakes']->fresh());
        $this->assertEqualsCanonicalizing([['eggs', 'milk', 'wheat'], ['dairy', 'egg', 'gluten']], [$pancakes['allergens'], $pancakes['tags']], 'nobody typed these on the dish: they come from the pancake recipe through the side');
        $this->assertTrue($pancakes['complete']);

        $stew = $info->profile($this->dish['Beef stew & ugali']->fresh());
        $this->assertSame([[], ['meat']], [$stew['allergens'], $stew['tags']]);
        $this->assertNotContains('vegetarian', $stew['diets']);
        $this->assertContains('vegetarian', $info->profile($this->dish['Sukuma wiki & ugali']->fresh())['diets']);

        $combo = $this->plate('Combo', 500, 'Choma');
        app(DishMakeup::class)->save($combo, ['slots' => [
            ['name' => 'Main', 'kind' => 'choose_one', 'choices' => [['side_id' => $this->side['Choma']], ['side_id' => $this->side['Bread']]]],
            ['name' => 'Topping', 'kind' => 'free_extra', 'choices' => [['side_id' => $this->side['Egg']]]],
        ]]);
        $this->assertSame(['eggs', 'wheat'], collect($info->profile($combo->fresh())['allergens'])->sort()->values()->all(), 'the bread or the egg may end up on the plate, so both are declared, even though a guest picks only one main');

        $cola = $this->plate('Cola', 100, 'Cola');
        $this->assertTrue($info->profile($cola->fresh())['complete'], 'a ready-to-serve ingredient is a side that says what it is');

        $bare = Dish::create(['name' => 'Bare', 'slug' => 'bare', 'price' => 10, 'is_active' => true]);
        $this->assertFalse($info->profile($bare->fresh())['complete'], 'no recipe and no sides: nothing is known, so no diet is claimed');
    }

    private function priced(string $dish, ?int $serving, array $picks = [], array $mods = []): float
    {
        $sel = app(DishSelection::class)->resolve($this->dish[$dish], $serving, $picks);
        $m = app(DishModifiers::class)->resolve($this->dish[$dish], $mods, (float) $sel['base_price']);

        return round($sel['unit_price'] + $m['fee_in_price'], 2);
    }

    public function test_the_steak_sandwich_prices_of_the_document(): void
    {
        $wet = $this->side['Wet fry'];
        $this->assertSame(650.0, $this->priced('Steak sandwich', $this->jumbo), 'Jumbo with the default Choma');
        $this->assertSame(720.0, $this->priced('Steak sandwich', $this->jumbo, [$this->slot['Protein'] => [$wet], $this->slot['Greens'] => [$this->side['Kale']]]), '650 + 50 + 20');
        $this->assertSame(800.0, $this->priced('Steak sandwich', $this->jumbo, [$this->slot['Protein'] => [$wet], $this->slot['Greens'] => [$this->side['Kale']], $this->slot['Extras'] => [['side_id' => $this->side['Egg'], 'qty' => 2]]]), '720 + 2 x 40');
        $this->assertSame(350.0, $this->priced('Steak sandwich', $this->kids));
    }

    public function test_the_burger_with_extra_cheese_and_no_onion_is_570_and_takes_the_cheese_and_onion_accordingly(): void
    {
        $mods = [['kind' => 'extra', 'ingredient_id' => $this->ing('Cheddar cheese')], ['kind' => 'remove', 'ingredient_id' => $this->ing('Onions')]];
        $this->assertSame(570.0, $this->priced('Burger', null, [], $mods), '500 + 10% of 500 for the cheese + 20 for leaving the onion out');
        $this->assertSame(500.0, $this->priced('Burger', null));
        $this->sell('Burger', 1, null, $mods);
        $this->assertSame([2960.0, 8000.0, 59.0, 5880.0], [$this->left('Block 1 kg'), $this->left('Onions 1 kg'), $this->left('Pack of 6'), $this->left('Stewing meat 1 kg')], 'cheese 40 g (20 + 20 extra), no onion, one bun, 120 g beef');
    }

    public function test_a_cola_and_a_ketchup_picked_on_the_steak_sandwich_come_off_the_shelf(): void
    {
        $d = $this->dish['Steak sandwich'];
        $sel = app(DishSelection::class)->resolve($d, $this->jumbo, [$this->slot['Drink'] => [$this->side['Cola']], $this->slot['Sauces'] => [$this->side['Ketchup']]]);
        $this->assertSame(650.0, $sel['unit_price'], 'free extras cost nothing');
        DB::transaction(fn () => app(DishStock::class)->apply($this->sale([['dish' => $d, 'qty' => 1, 'uses' => $sel['uses']]]), null));
        $this->assertSame([71.0, 6.0, 2970.0], [$this->left('Crate of 24'), $this->left('Single bottle'), $this->left('Ketchup bottle 1 L')], 'the cheapest Cola (the crate, 50 each) and 30 ml of ketchup');
    }

    public function test_a_beef_stew_and_ugali_takes_the_stew_from_the_shelf_and_the_ugali_from_the_batch_made_ahead(): void
    {
        app(PrepProduction::class)->run(DishRecipe::find($this->recipe['Ugali']), 1, 2.0, ['date' => '2026-10-17']);
        $this->assertSame(19200.0, $this->left('Unga 2 kg'), '800 g of maize flour for the 2 kg batch');
        $this->sell('Beef stew & ugali', 2);
        $this->assertSame([1.5, 19200.0], [(float) PrepLot::first()->qty_left, $this->left('Unga 2 kg')], '2 x 250 g of ugali from the batch (1.5 kg of the 2 kg left), and no more flour: the stew has none');
        $this->assertEqualsWithDelta(6000 - 2 * 200 / 0.95, $this->left('Stewing meat 1 kg'), 0.01);
    }

    public function test_naming_the_variant_on_a_recipe_line_changes_what_is_taken_and_what_the_recipe_costs(): void
    {
        $this->assertSame(29.0, $this->portionCost('Masala chai'), 'on automatic, milk is the cheapest first: Fresh 1 L');
        $this->recipeOf('Masala chai (500 ml milk)', 1, [['Milk', 200, 0, ['item_id' => $this->itemId('Fresh 500 ml')]], ['Tea leaves', 5], ['Sugar', 10]]);
        $this->assertSame(30.6, $this->portionCost('Masala chai (500 ml milk)'), '200 ml at 0.13 instead of the shelf average 0.122: 26.00 + 3.00 + 1.60');
        app(\App\Services\Menus\IngredientUse::class)->consume(DishRecipe::find($this->recipe['Masala chai (500 ml milk)']), 3, 1, ['type' => 'voucher', 'id' => 1], null);
        $this->assertSame([19550.0 + 450.0, 4400.0], [$this->left('Fresh 1 L'), $this->left('Fresh 500 ml')], '3 chais take 600 ml of milk from the 500 ml packs and none from the 1 L packs');
    }

    public function test_the_three_simple_dishes_beef_pilau_mandazi_and_cheese_omelette(): void
    {
        $this->sell('Beef pilau', 2);
        $this->assertSame([5700.0, 9700.0], [$this->left('Stewing meat 1 kg'), $this->left('Pishori 2 kg')], '2 pilau take 300 g of beef and 300 g of rice, in one pot');
        $this->sell('Mandazi', 3);
        $this->assertSame([19700.0, 9940.0], [$this->left('Exe 2 kg'), $this->left('Kabras 1 kg')], '3 mandazi take 300 g of flour (Exe) and 60 g of sugar');
        $this->sell('Cheese omelette', 1);
        $this->assertSame([118.0, 2980.0, 1240.0], [$this->left('Tray of 30'), $this->left('Block 1 kg'), $this->left('Block 250 g')], '2 eggs, 20 g of cheese, 10 g of butter');
        foreach (['Eggs' => [['eggs'], ['egg']], 'Cheddar cheese' => [['milk'], ['dairy']]] as $name => [$a, $t]) {
            \App\Models\Menus\Ingredient::where('name', $name)->first()->update(['allergens' => $a, 'tags' => $t]);
        }
        $this->assertEqualsCanonicalizing(['eggs', 'milk'], app(\App\Services\Menus\DishInfo::class)->profile($this->dish['Cheese omelette']->fresh())['allergens']);
    }
}

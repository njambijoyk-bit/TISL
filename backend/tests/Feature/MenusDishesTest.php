<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusDishController;
use App\Models\Menus\Dish;
use App\Services\Books\BooksException;
use App\Services\CurrencyConversionService;
use App\Services\Licensing\LicenseManager;
use App\Services\Menus\DietBadges;
use App\Services\Menus\DishInfo;
use App\Services\Menus\DishService;
use App\Services\Menus\MenusSettings;
use App\Services\Ecommerce\SkuGenerator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus dishes on their own (script 184): a price of their own and no product, allergens and diets inherited from the ingredients, what can be made now, what it costs, and the settings. */
class MenusDishesTest extends TestCase
{
    use Concerns\CreatesDishTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createDishTables();
        $this->createDishNeighbours();
    }

    // ------------------------------------------------------------ diets

    public function test_diet_badges_only_claim_what_the_ingredients_allow(): void
    {
        $this->assertSame(['vegetarian', 'vegan', 'halal_friendly', 'gluten_free', 'dairy_free', 'nut_free'], DietBadges::for([], []));
        $this->assertSame(['halal_friendly', 'gluten_free', 'dairy_free', 'nut_free'], DietBadges::for([], ['meat']));
        $this->assertSame(['halal_friendly', 'gluten_free', 'dairy_free', 'nut_free'], DietBadges::for(['fish'], []), 'fish is not vegetarian');
        $this->assertSame(['vegetarian', 'gluten_free', 'nut_free', 'halal_friendly'], array_values(array_intersect(['vegetarian', 'gluten_free', 'nut_free', 'halal_friendly'], DietBadges::for(['milk'], ['dairy']))));
        $this->assertNotContains('vegan', DietBadges::for(['eggs'], []));
        $this->assertNotContains('vegan', DietBadges::for([], ['honey']));
        $this->assertContains('vegetarian', DietBadges::for(['milk', 'eggs'], ['dairy', 'egg']));
        $this->assertNotContains('halal_friendly', DietBadges::for([], ['pork']));
        $this->assertNotContains('halal_friendly', DietBadges::for([], ['alcohol']));
        $this->assertNotContains('gluten_free', DietBadges::for(['wheat'], []));
        $this->assertNotContains('gluten_free', DietBadges::for([], ['gluten']));
        $this->assertNotContains('dairy_free', DietBadges::for(['milk'], []));
        $this->assertNotContains('nut_free', DietBadges::for(['peanuts'], []));
        $this->assertNotContains('nut_free', DietBadges::for(['tree_nuts'], []));
    }

    // ------------------------------------------------------------ allergens inherited

    public function test_a_dish_inherits_allergens_and_tags_from_the_ingredients_it_is_made_from(): void
    {
        $d = $this->make();
        $flour = $this->family('Flour', ['allergens' => ['wheat'], 'tags' => ['gluten']]);
        $egg = $this->family('Eggs', ['allergens' => ['eggs'], 'tags' => ['egg']]);
        $this->recipe($d, [['family_id' => $flour, 'quantity' => 500], ['family_id' => $egg, 'quantity' => 1]]);
        $p = $this->info()->profile($d->fresh());
        $this->assertSame(['eggs', 'wheat'], $p['allergens']);
        $this->assertSame(['egg', 'gluten'], $p['tags']);
        $this->assertTrue($p['complete']);
        $this->assertSame(['vegetarian', 'halal_friendly', 'dairy_free', 'nut_free'], $p['diets']);
    }

    public function test_every_ingredient_says_what_it_is_so_a_dish_with_a_recipe_is_always_complete(): void
    {
        $d = $this->make();
        $this->recipe($d, [['family_id' => $this->family('Mystery powder'), 'quantity' => 1]]);
        $p = $this->info()->profile($d->fresh());
        $this->assertTrue($p['complete'], 'an ingredient with nothing ticked contains nothing and is nothing in particular');
        $this->assertContains('vegan', $p['diets']);
    }

    public function test_a_dish_with_no_recipe_claims_nothing(): void
    {
        $p = $this->info()->profile($this->make());
        $this->assertSame([false, []], [$p['complete'], $p['diets']]);
    }

    public function test_what_the_dish_declares_replaces_what_is_inherited_and_makes_it_complete_when_both_are_declared(): void
    {
        $d = $this->make('Salad', 40, ['allergens' => ['sesame'], 'tags' => []]);
        $p = $this->info()->profile($d->fresh());
        $this->assertSame(['sesame'], $p['allergens']);
        $this->assertTrue($p['complete'] && $p['declared'], 'declared both, so nothing is left unknown even with no recipe');
        $this->assertContains('vegan', $p['diets']);
        $d->update(['tags_override' => null]);
        $this->assertFalse($this->info()->profile($d->fresh())['complete'], 'declaring only the allergens leaves the tags unknown when there is no recipe');
    }

    // ------------------------------------------------------------ can it be made now

    public function test_a_dish_made_to_order_can_be_sold_as_often_as_the_scarcest_ingredient_allows(): void
    {
        $d = $this->make();
        $this->makeIngredient('Flour', $this->g, $this->kg, [['name' => 'Exe'], ['name' => 'Pembe']]);
        $this->pantry('Oil', 0, 1, $this->ml);
        $this->shelve('Exe', 2000);
        $this->shelve('Pembe', 12000);
        $this->shelve('Oil', 3000);
        $this->writeRecipe($d, [['Flour', 100, 'base', 20], ['Oil', 500]]);   // 125 g of flour and half a litre per chapati
        $this->assertEquals(min(14000 / 125, 3000 / 500), $this->info()->portions($d->fresh(), self::BRANCH), 'flour allows 112, oil allows 6');
        $this->shelve('Oil', 100000);
        $this->assertSame(112.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    public function test_a_recipe_yield_counts_when_working_out_how_many_can_be_made(): void
    {
        $d = $this->make();
        $this->pantry('Oil', 3000, 1, $this->ml);
        $this->recipe($d, [['family_id' => $this->family('Oil'), 'quantity' => 1000]], 10);   // one litre makes ten
        $this->assertSame(30.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    public function test_an_ingredient_with_nothing_on_the_shelf_makes_a_dish_unavailable(): void
    {
        $d = $this->make();
        $this->recipe($d, [['family_id' => $this->family('Oil'), 'quantity' => 1]]);
        $this->assertSame(0.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    public function test_a_switched_off_ingredient_makes_the_dish_unavailable_instead_of_failing(): void
    {
        $d = $this->make();
        $fam = $this->family('Flour');
        $this->shelve('Flour', 1000);
        $this->recipe($d, [['family_id' => $fam, 'quantity' => 100]]);
        $this->assertSame(10.0, $this->info()->portions($d->fresh(), self::BRANCH));
        \App\Models\Menus\IngredientItem::where('ingredient_id', $fam)->update(['is_active' => false]);
        $this->assertSame(0.0, $this->info()->portions($d->fresh(), self::BRANCH), 'nothing may be taken from a switched-off variant');
    }

    public function test_a_dish_with_no_recipe_is_not_available_because_nothing_says_what_it_is_made_of(): void
    {
        $this->assertSame(0.0, $this->info()->portions($this->make(), self::BRANCH));
    }

    public function test_a_dish_made_ahead_is_what_is_on_the_shelf(): void
    {
        $d = $this->make('Samosa');
        $this->stockDish($d, 24, false);
        $this->assertSame(24.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    public function test_sold_out_today_and_switched_off_mean_none_whatever_the_stock_says(): void
    {
        $d = $this->make();
        $this->stockDish($d, 10);
        $this->assertSame(10.0, $this->info()->portions($d->fresh(), self::BRANCH));
        $this->dishes()->soldOutToday($d, true);
        $this->assertSame(0.0, $this->info()->portions($d->fresh(), self::BRANCH));
        $this->dishes()->soldOutToday($d, false);
        $this->assertSame(10.0, $this->info()->portions($d->fresh(), self::BRANCH));
        $d->update(['sold_out_on' => today()->subDay()->toDateString()]);
        $this->assertSame(10.0, $this->info()->portions($d->fresh(), self::BRANCH), 'yesterday\'s "sold out" is over');
        $d->update(['is_active' => false]);
        $this->assertSame(0.0, $this->info()->portions($d->fresh(), self::BRANCH));
    }

    // ------------------------------------------------------------ the money

    public function test_the_price_the_cost_and_the_margin(): void
    {
        $d = $this->make('Chapati', 50);
        $this->pantry('Oil', 10000, 0.4, $this->ml);
        $this->recipe($d, [['family_id' => $this->family('Oil'), 'quantity' => 50]]);   // 20 of cost per chapati
        $m = $this->info()->money($d->fresh(), self::BRANCH);
        $this->assertEquals([50.0, 20.0, 30.0, 40.0, true], [$m['price'], $m['cost'], $m['margin'], $m['food_cost_pct'], $m['complete']]);
        $none = $this->info()->money($this->make('Plain', 10), self::BRANCH);
        $this->assertEquals([10.0, null, null, null, false], [$none['price'], $none['cost'], $none['margin'], $none['food_cost_pct'], $none['complete']]);
    }

    // ------------------------------------------------------------ making dishes

    public function test_a_new_dish_stands_on_its_own_with_its_price_and_no_product(): void
    {
        $d = $this->make('Beef stew', 450, ['description' => 'Slow cooked', 'prep_minutes' => 20]);
        $this->assertSame(['beef-stew', 'Slow cooked', 20, 450.0], [$d->slug, $d->description, $d->prep_minutes, (float) $d->price]);
        $this->assertNull($d->product_id);
        $this->assertNull($d->variant_id);
        $this->assertSame(1, Dish::count());
    }

    public function test_two_dishes_with_the_same_name_get_different_addresses(): void
    {
        $a = $this->make('Pilau');
        $b = $this->make('Pilau');
        $this->assertSame(['pilau', 'pilau-2'], [$a->slug, $b->slug]);
    }

    public function test_it_needs_a_name_a_price_and_the_sales_account_in_the_settings_and_says_so(): void
    {
        $svc = $this->dishes();
        $cases = [
            [['name' => '  ', 'price' => 1], 'Give the dish a name'],
            [['name' => 'X'], 'Give the dish a price'],
            [['name' => 'X', 'price' => -1], 'less than nothing'],
            [['name' => 'X', 'price' => 'free'], 'less than nothing'],
            [['name' => 'X', 'price' => 1, 'allergens' => ['glitter']], 'Unknown allergen: glitter'],
            [['name' => 'X', 'price' => 1, 'tags' => ['unicorn']], 'Unknown tag: unicorn'],
        ];
        foreach ($cases as [$in, $why]) {
            try {
                $svc->save($in);
                $this->fail("should be refused: {$why}");
            } catch (BooksException $e) {
                $this->assertStringContainsString($why, $e->getMessage());
            }
        }
        $this->assertSame(0, Dish::count());
        MenusSettings::save(['sales_ledger_id' => null], 1);
        $this->expectExceptionMessage('Choose the sales account dishes are booked under');
        $svc->save(['name' => 'X', 'price' => 1]);
    }

    public function test_changing_a_dish_changes_its_own_price_and_name(): void
    {
        $d = $this->make('Tea', 30);
        $d = $this->dishes()->save(['name' => 'Masala tea', 'price' => 45, 'is_active' => false, 'sort_order' => 3], $d->id);
        $this->assertSame(['Masala tea', false, 3, 45.0], [$d->name, $d->is_active, $d->sort_order, (float) $d->price]);
        $this->assertSame('tea', $d->slug, 'the address does not change under a customer');
        $this->assertSame(45.0, (float) $this->dishes()->save(['name' => 'Masala tea'], $d->id)->price, 'a save that does not mention the price leaves it');
    }

    public function test_allergens_can_be_declared_cleared_and_left_alone(): void
    {
        $d = $this->make('Cake', 100, ['allergens' => ['soy', 'MILK']]);
        $this->assertSame(['milk', 'soy'], $d->allergens_override);
        $d = $this->dishes()->save(['name' => 'Cake', 'price' => 100], $d->id);
        $this->assertSame(['milk', 'soy'], $d->allergens_override, 'a save that says nothing about them leaves them');
        $d = $this->dishes()->save(['name' => 'Cake', 'allergens' => []], $d->id);
        $this->assertSame([], $d->allergens_override, 'declared as none');
        $d = $this->dishes()->save(['name' => 'Cake', 'allergens' => null], $d->id);
        $this->assertNull($d->allergens_override, 'back to what the ingredients say');
    }

    public function test_a_dish_never_sold_can_be_deleted_with_its_recipe_and_choices(): void
    {
        $d = $this->make();
        $this->pantry('Oil');
        $this->recipe($d, [['family_id' => $this->family('Oil'), 'quantity' => 1]]);
        $this->dishes()->delete($d);
        $this->assertSame([0, 0, 0], [Dish::count(), DB::table('menus_recipes')->count(), DB::table('menus_recipe_lines')->count()]);
    }

    public function test_a_dish_that_has_been_sold_or_made_or_ordered_is_switched_off_instead(): void
    {
        $sold = $this->make('Sold');
        DB::table('voucher_items')->insert(['dish_id' => $sold->id]);
        $made = $this->make('Made');
        \App\Models\Menus\DishBatch::create(['dish_id' => $made->id, 'location_id' => 1, 'made_on' => '2026-10-01', 'unit_cost' => 1, 'qty_in' => 1, 'qty_left' => 1, 'status' => 'ok']);
        foreach ([$sold, $made] as $d) {
            try {
                $this->dishes()->delete($d);
                $this->fail('the history should block the delete');
            } catch (BooksException $e) {
                $this->assertStringContainsString('Switch it off instead', $e->getMessage());
            }
            $this->assertSame(1, Dish::where('id', $d->id)->count());
        }
    }

    // ------------------------------------------------------------ settings

    public function test_settings_keep_a_valid_sales_account_and_say_why_when_it_is_not(): void
    {
        $s = MenusSettings::save(['sales_ledger_id' => $this->ledger, 'allergen_note' => '  Ask us  ', 'receipt_footer' => 'Thank you'], 5);
        $this->assertSame([$this->ledger, 'Ask us', 'Thank you'], [$s['sales_ledger_id'], $s['allergen_note'], $s['receipt_footer']]);
        $this->assertSame($s, MenusSettings::all());
        $expense = DB::table('ledger_groups')->insertGetId(['name' => 'Expenses', 'behaviour' => 'expense']);
        $bad = DB::table('ledgers')->insertGetId(['name' => 'Rent', 'group_id' => $expense, 'tax_nature' => 'exempt']);
        foreach ([['sales_ledger_id' => $bad, 'not a sales account'], ['category_id' => 999, 'does not exist']] as $in) {
            $why = array_pop($in);
            try {
                MenusSettings::save($in, 5);
                $this->fail($why);
            } catch (BooksException $e) {
                $this->assertStringContainsString($why, $e->getMessage());
            }
        }
        $this->assertSame($this->ledger, MenusSettings::all()['sales_ledger_id'], 'a refused change leaves the settings as they were');
        $this->assertNull(MenusSettings::save(['sales_ledger_id' => null], 5)['sales_ledger_id']);
    }

    public function test_the_three_food_accounts_are_settings_too(): void
    {
        $s = MenusSettings::save(['ingredient_stock_ledger_id' => $this->ledger, 'food_cost_ledger_id' => $this->ledger, 'food_waste_ledger_id' => null], 5);
        $this->assertSame([$this->ledger, $this->ledger, null], [$s['ingredient_stock_ledger_id'], $s['food_cost_ledger_id'], $s['food_waste_ledger_id']]);
        $this->expectExceptionMessage('That account does not exist');
        MenusSettings::save(['food_waste_ledger_id' => 9999], 5);
    }

    public function test_before_script_134_the_defaults_apply_and_saving_is_refused(): void
    {
        Schema::drop('menus_settings');
        $this->assertSame(MenusSettings::DEFAULTS, MenusSettings::all());
        $this->expectExceptionMessage('run database script 134');
        MenusSettings::save(['receipt_footer' => 'x'], 1);
    }

    // ------------------------------------------------------------ the screen's API

    public function test_the_list_shows_each_dish_with_its_allergens_diets_availability_and_money(): void
    {
        $d = $this->make('Chapati', 50);
        $this->pantry('Oil', 10000, 0.4, $this->ml);
        $this->makeIngredient('Wheat', $this->g, null, [['name' => 'Exe']], 'preferred', ['allergens' => ['wheat'], 'tags' => ['gluten']]);
        $this->shelve('Exe', 5000, 0.2);
        $this->recipe($d, [['family_id' => $this->family('Oil'), 'quantity' => 50], ['family_id' => $this->family('Wheat'), 'quantity' => 100]]);
        $data = app(MenusDishController::class)->index(Request::create('/x', 'GET'))->getData(true);
        $row = $data['dishes'][0];
        $this->assertSame(['Chapati', true, true, ['wheat']], [$row['name'], $row['has_recipe'], $row['made_to_order'], $row['allergens']]);
        $this->assertContains('vegetarian', $row['diets']);
        $this->assertNotContains('gluten_free', $row['diets']);
        $this->assertEquals([50, 40, 10, 80], [$row['price'], $row['cost'], $row['margin'], $row['food_cost_pct']], 'oil 20 plus 100 g of flour at 0.20 a gram is 40');
        $this->assertEquals(min(5000 / 100, 10000 / 50), $row['available']);
        $this->assertArrayNotHasKey('variant_id', $row, 'no product is behind it');
        $this->assertArrayHasKey('wheat', $data['allergens']);
        $this->assertTrue($data['settings_ready']);
    }

    public function test_the_save_endpoint_answers_in_plain_words_and_marks_sold_out(): void
    {
        $c = app(MenusDishController::class);
        $ok = $c->save(Request::create('/x', 'POST', ['name' => 'Soda', 'price' => 80]));
        $this->assertSame(201, $ok->status());
        MenusSettings::save(['sales_ledger_id' => null], 1);
        $bad = $c->save(Request::create('/x', 'POST', ['name' => 'Water', 'price' => 50]));
        $this->assertSame(422, $bad->status());
        $this->assertStringContainsString('sales account', $bad->getData(true)['message']);
        $id = Dish::first()->id;
        $out = $c->soldOut(Request::create('/x', 'POST', ['sold_out' => true]), $id)->getData(true);
        $this->assertTrue($out['dish']['sold_out_today']);
        $this->assertStringContainsString('sold out for today', $out['message']);
        $this->assertSame(200, $c->destroy($id)->status());
        $this->assertSame(0, Dish::count());
    }
}

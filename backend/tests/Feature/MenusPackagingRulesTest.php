<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\IngredientKind;
use App\Models\Menus\PackagingRule;
use App\Models\Menus\Side;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\DishService;
use App\Services\Menus\IngredientKinds;
use App\Services\Menus\Ingredients;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\PackagingPrices;
use App\Services\Menus\PackagingRules;
use App\Services\Menus\Sides;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus packaging, build step 5.2 (script 208): what packaging goes with a side or a dish, and which rules a dish line follows. */
class MenusPackagingRulesTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $packaging;
    private int $supplies;
    private int $box;
    private int $bag;
    private int $foil;
    private int $soap;
    private Side $stew;
    private Side $rice;
    private Dish $meal;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::table('accounting_settings', function ($t) { $t->unsignedBigInteger('tips_payable_ledger_id')->nullable(); $t->unsignedBigInteger('default_sales_ledger_id')->nullable(); });
        Schema::table('currencies', function ($t) { $t->boolean('is_active')->default(true); $t->string('name')->nullable(); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '207_menus_packaging_prices.sql', '208_menus_packaging_rules.sql');
        app(IngredientKinds::class)->seedDefaults();
        $this->packaging = (int) IngredientKind::where('code', 'packaging')->value('id');
        $this->supplies = (int) IngredientKind::where('code', 'supplies')->value('id');
        $this->box = $this->item('Container', $this->packaging);
        $this->bag = $this->item('Bag', $this->packaging);
        $this->foil = $this->item('Foil', $this->packaging);
        $this->soap = $this->item('Soap', $this->supplies);
        MenusSettings::save(['packaging_kind_id' => $this->packaging], null);
        app(PackagingPrices::class)->save([['item_id' => $this->box, 'price' => 15], ['item_id' => $this->bag, 'price' => 5]]);   // the foil has no price
        $this->pantry('Flour', 1000, 0.1);
        $r = app(DishRecipes::class)->saveStandalone(['name' => 'Stew', 'yield_qty' => 1, 'lines' => [['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Flour')->value('id'), 'quantity' => 10]]]);
        $r2 = app(DishRecipes::class)->saveStandalone(['name' => 'Rice', 'yield_qty' => 1, 'lines' => [['ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Flour')->value('id'), 'quantity' => 10]]]);
        $this->stew = app(Sides::class)->save(['name' => 'Stew', 'recipe_id' => $r->id]);
        $this->rice = app(Sides::class)->save(['name' => 'Rice', 'recipe_id' => $r2->id]);
        $this->meal = $this->dish('Meal', 400);
    }

    private function item(string $name, int $kind): int
    {
        $this->makeIngredient($name, $this->each, null, [['name' => $name]], 'preferred', ['kind_id' => $kind]);

        return $this->itemId($name);
    }

    private function svc(): PackagingRules
    {
        return app(PackagingRules::class);
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

    private function rule(int $item, array $o = []): array
    {
        return $o + ['item_id' => $item, 'scope' => 'per_dish', 'quantity' => 1, 'compulsory' => false, 'charged' => false, 'receipt' => 'auto'];
    }

    public function test_a_side_has_rules_that_are_kept_and_listed_with_the_items_it_can_use(): void
    {
        $shown = $this->svc()->show('side', $this->stew->id);
        $this->assertSame([['Bag', true], ['Container', true], ['Foil', false]], array_map(fn ($i) => [$i['name'], $i['priced']], $shown['items']), 'the packaging kind only, with whether each has a price');
        $r = $this->svc()->save('side', $this->stew->id, [$this->rule($this->box, ['quantity' => 2, 'compulsory' => true, 'charged' => true, 'receipt' => 'always']), $this->rule($this->foil, ['scope' => 'per_order'])]);
        $this->assertSame([['Container', 'per_dish', 2, true, true, 'always'], ['Foil', 'per_order', 1, false, false, 'auto']], array_map(fn ($x) => [$x['item'], $x['scope'], $x['quantity'], $x['compulsory'], $x['charged'], $x['receipt']], $r['rules']));
        $r = $this->svc()->save('side', $this->stew->id, [$this->rule($this->bag)]);
        $this->assertSame(['Bag'], array_column($r['rules'], 'item'), 'what is sent replaces what was there');
        $this->assertSame([], $this->svc()->show('side', $this->rice->id)['rules'], 'another side is not touched');
    }

    public function test_the_rules_are_checked_and_a_refused_save_changes_nothing(): void
    {
        $this->svc()->save('side', $this->stew->id, [$this->rule($this->box)]);
        $this->fails(fn () => $this->svc()->save('side', $this->stew->id, [$this->rule($this->soap)]), 'is not of the kind');
        $this->fails(fn () => $this->svc()->save('side', $this->stew->id, [$this->rule($this->bag, ['scope' => 'weekly'])]), 'each dish or once for the order');
        $this->fails(fn () => $this->svc()->save('side', $this->stew->id, [$this->rule($this->bag, ['quantity' => 0])]), 'from 1 to 99');
        $this->fails(fn () => $this->svc()->save('side', $this->stew->id, [$this->rule($this->bag, ['quantity' => 100])]), 'from 1 to 99');
        $this->fails(fn () => $this->svc()->save('side', $this->stew->id, [$this->rule($this->bag, ['receipt' => 'sometimes'])]), 'on the receipt');
        $this->fails(fn () => $this->svc()->save('side', $this->stew->id, [$this->rule($this->bag), $this->rule($this->bag, ['scope' => 'per_order'])]), 'two rules');
        $this->fails(fn () => $this->svc()->save('side', $this->stew->id, [$this->rule($this->foil, ['charged' => true])]), 'no price on the packaging price list');
        $this->fails(fn () => $this->svc()->save('side', $this->stew->id, [$this->rule(99999)]), 'not there any more');
        $this->assertSame(['Container'], array_column($this->svc()->show('side', $this->stew->id)['rules'], 'item'));
        $this->fails(fn () => $this->svc()->show('chef', 1), 'a side or a dish');
    }

    public function test_a_free_rule_may_use_an_item_with_no_price_and_a_compulsory_free_rule_is_allowed(): void
    {
        $r = $this->svc()->save('dish', $this->meal->id, [$this->rule($this->foil, ['compulsory' => true])]);
        $this->assertSame([[false, true]], array_map(fn ($x) => [$x['charged'], $x['compulsory']], $r['rules']));
    }

    public function test_a_dish_overrides_the_rules_of_its_sides_for_an_item_and_adds_its_own(): void
    {
        $this->svc()->save('side', $this->stew->id, [$this->rule($this->box, ['quantity' => 2, 'charged' => true]), $this->rule($this->bag)]);
        $this->svc()->save('side', $this->rice->id, [$this->rule($this->box, ['quantity' => 1, 'charged' => true])]);
        $eff = $this->svc()->effective($this->meal, [$this->stew->id, $this->rice->id]);
        $by = array_column($eff, null, 'item_id');
        $this->assertSame([3, 'Stew, Rice'], [$by[$this->box]['quantity'], $by[$this->box]['from']], 'two sides, the same item, for each dish: the counts add up');
        $this->assertSame(1, $by[$this->bag]['quantity']);
        $this->svc()->save('dish', $this->meal->id, [$this->rule($this->box, ['quantity' => 1]), $this->rule($this->foil)]);
        $by = array_column($this->svc()->effective($this->meal, [$this->stew->id, $this->rice->id]), null, 'item_id');
        $this->assertSame([1, false, 'Meal'], [$by[$this->box]['quantity'], $by[$this->box]['charged'], $by[$this->box]['from']], 'the dish\'s rule replaces what its sides say about the container');
        $this->assertSame([1, 'Stew'], [$by[$this->bag]['quantity'], $by[$this->bag]['from']], 'items the dish does not mention still come from its sides');
        $this->assertArrayHasKey($this->foil, $by);
    }

    public function test_per_order_rules_take_the_largest_count_and_the_two_ways_of_asking_stay_apart(): void
    {
        $this->svc()->save('side', $this->stew->id, [$this->rule($this->bag, ['scope' => 'per_order', 'quantity' => 1])]);
        $this->svc()->save('side', $this->rice->id, [$this->rule($this->bag, ['scope' => 'per_order', 'quantity' => 3, 'compulsory' => true])]);
        $eff = $this->svc()->effective($this->meal, [$this->stew->id, $this->rice->id]);
        $this->assertSame([[3, true]], array_map(fn ($e) => [$e['quantity'], $e['compulsory']], $eff), 'the largest, not the sum');
        $this->svc()->save('side', $this->rice->id, [$this->rule($this->bag, ['scope' => 'per_dish', 'quantity' => 2])]);
        $eff = $this->svc()->effective($this->meal, [$this->stew->id, $this->rice->id]);
        $this->assertEqualsCanonicalizing([['per_order', 1], ['per_dish', 2]], array_map(fn ($e) => [$e['scope'], $e['quantity']], $eff));
        $this->assertSame([], $this->svc()->effective($this->meal, []), 'no sides, no rules of its own');
    }

    public function test_rules_whose_item_has_left_the_packaging_kind_stay_greyed_and_are_not_used(): void
    {
        $this->svc()->save('side', $this->stew->id, [$this->rule($this->box), $this->rule($this->bag)]);
        DB::table('menus_ingredients')->where('name', 'Bag')->update(['kind_id' => $this->supplies]);
        $rules = $this->svc()->show('side', $this->stew->id)['rules'];
        $this->assertSame([['Container', false], ['Bag', true]], array_map(fn ($r) => [$r['item'], $r['grey']], $rules));
        $this->assertSame([$this->box], array_column($this->svc()->effective($this->meal, [$this->stew->id]), 'item_id'));
        $this->svc()->save('side', $this->stew->id, [$this->rule($this->box, ['quantity' => 4])]);
        $this->assertSame(2, PackagingRule::where('side_id', $this->stew->id)->count(), 'a save leaves the greyed rule alone');
    }

    public function test_deleting_a_side_or_dish_takes_its_rules_and_a_used_item_cannot_be_deleted(): void
    {
        $this->svc()->save('side', $this->rice->id, [$this->rule($this->box)]);
        app(Sides::class)->delete($this->rice->id);
        $this->assertSame(0, PackagingRule::count());
        Schema::create('menus_option_groups', function ($t) { $t->id(); $t->unsignedBigInteger('dish_id'); $t->string('name'); $t->string('kind', 8)->default('single'); $t->unsignedTinyInteger('min_choices')->default(0); $t->unsignedTinyInteger('max_choices')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_options', function ($t) { $t->id(); $t->unsignedBigInteger('group_id'); $t->string('name'); $t->decimal('price_delta', 12, 2)->default(0); $t->boolean('is_default')->default(false); $t->boolean('charge_removal')->default(false); $t->unsignedBigInteger('linked_dish_id')->nullable(); $t->integer('sort_order')->default(0); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_option_uses', function ($t) { $t->id(); $t->unsignedBigInteger('option_id'); $t->string('mode', 8)->default('add'); $t->unsignedBigInteger('ingredient_id')->nullable(); $t->string('unit', 4)->default('base'); $t->unsignedBigInteger('family_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->decimal('quantity', 18, 4)->nullable(); $t->unsignedBigInteger('unit_id')->nullable(); });
        Schema::create('menus_section_dishes', function ($t) { $t->id(); $t->unsignedBigInteger('section_id'); $t->unsignedBigInteger('dish_id'); $t->integer('sort_order')->default(0); });
        $this->svc()->save('dish', $this->meal->id, [$this->rule($this->box)]);
        $ing = \App\Models\Menus\Ingredient::where('name', 'Container')->first();
        $this->fails(fn () => app(Ingredients::class)->delete($ing), 'packaging price list or in a packaging rule');
        app(DishService::class)->delete($this->meal);
        $this->assertSame(0, PackagingRule::count());
    }

    public function test_before_script_208_saving_says_which_script_and_with_no_kind_nothing_is_used(): void
    {
        MenusSettings::save(['packaging_kind_id' => null], null);
        $this->fails(fn () => $this->svc()->save('side', $this->stew->id, [$this->rule($this->box)]), 'Choose which kind of ingredient is packaging');
        $this->assertSame([], $this->svc()->effective($this->meal, [$this->stew->id]));
        Schema::drop('menus_packaging_rules');
        $this->assertFalse(PackagingRules::installed());
        $this->assertFalse($this->svc()->show('side', $this->stew->id)['ready']);
        $this->fails(fn () => $this->svc()->save('side', $this->stew->id, []), '208_menus_packaging_rules');
        $this->assertSame(0, PackagingRules::usedBy($this->box));
    }
}

<?php

namespace Tests\Feature;

use App\Models\Menus\Dish;
use App\Models\Menus\ModifierPolicy;
use App\Services\Books\BooksException;
use App\Services\Menus\DishMakeup;
use App\Services\Menus\DishModifiers;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\MenusLists;
use App\Services\Menus\MenusSettings;
use App\Services\Menus\Sides;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus modifiers, build step 4.2 (script 206): which ingredients a dish lets a customer leave out or add, and the policy that prices each. */
class MenusDishModifiersTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private Dish $burger;
    private int $free;
    private int $fee;
    private int $pct;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_stations', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedSmallInteger('target_minutes')->default(15); $t->boolean('is_default')->default(false); $t->boolean('is_active')->default(true); $t->integer('sort_order')->default(0); $t->timestamps(); });
        Schema::create('menus_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '200_menus_sides.sql', '202_menus_dish_makeup.sql', '206_menus_dish_modifiers.sql');
        $lists = app(MenusLists::class);
        $this->free = $lists->save('policies', ['name' => 'Free', 'kind' => 'free'])->id;
        $this->fee = $lists->save('policies', ['name' => 'Fee 20', 'kind' => 'fixed', 'amount' => 20])->id;
        $this->pct = $lists->save('policies', ['name' => 'Ten percent', 'kind' => 'percent', 'amount' => 10])->id;
        $this->pantry('Flour', 1000, 0.1);
        $this->pantry('Cheese', 1000, 0.5);
        $this->pantry('Onion', 1000, 0.2);
        $this->pantry('Egg', 1000, 0.2);
        $this->burger = $this->dish('Burger', 500);
        app(DishRecipes::class)->save($this->burger, ['yield_qty' => 1, 'lines' => [
            ['ingredient_id' => $this->ing('Flour'), 'quantity' => 100],
            ['ingredient_id' => $this->ing('Cheese'), 'quantity' => 20, 'removable' => true, 'extra_allowed' => true],
            ['ingredient_id' => $this->ing('Onion'), 'quantity' => 10, 'removable' => true],
        ]]);
    }

    private function ing(string $name): int
    {
        return (int) DB::table('menus_ingredients')->where('name', $name)->value('id');
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

    private function svc(): DishModifiers
    {
        return app(DishModifiers::class);
    }

    public function test_the_dish_offers_what_its_recipe_lines_allow_and_each_starts_on_the_default_policy(): void
    {
        $items = $this->svc()->candidates($this->burger);
        $this->assertSame([['Cheese', 'remove'], ['Cheese', 'extra'], ['Onion', 'remove']], array_map(fn ($i) => [$i['ingredient'], $i['kind']], $items));
        $this->assertSame([null, null, null], array_column($items, 'policy_id'));
        $this->assertSame(0.0, $this->svc()->priceOf($this->burger, $this->ing('Cheese'), 'extra', 500), 'the default policy is Free');
    }

    public function test_the_ingredients_of_the_sides_a_dish_is_made_of_are_offered_too(): void
    {
        $r = app(DishRecipes::class)->saveStandalone(['name' => 'Fried egg', 'yield_qty' => 1, 'lines' => [['ingredient_id' => $this->ing('Egg'), 'quantity' => 1, 'extra_allowed' => true]]]);
        $side = app(Sides::class)->save(['name' => 'Fried egg', 'recipe_id' => $r->id]);
        $meal = $this->dish('Brunch', 400);
        app(DishMakeup::class)->save($meal, ['slots' => [['name' => 'Egg', 'kind' => 'fixed', 'choices' => [['side_id' => $side->id]]]]]);
        $items = $this->svc()->candidates($meal);
        $this->assertSame([['Egg', 'extra', ['Fried egg']]], array_map(fn ($i) => [$i['ingredient'], $i['kind'], $i['in']], $items));
    }

    public function test_a_policy_is_chosen_for_each_item_and_what_is_sent_replaces_what_was_there(): void
    {
        $cheese = $this->ing('Cheese');
        $items = $this->svc()->save($this->burger, [['ingredient_id' => $cheese, 'kind' => 'extra', 'policy_id' => $this->pct], ['ingredient_id' => $this->ing('Onion'), 'kind' => 'remove', 'policy_id' => $this->fee]]);
        $this->assertSame([null, $this->pct, $this->fee], array_column($items, 'policy_id'));
        $this->assertSame(50.0, $this->svc()->priceOf($this->burger, $cheese, 'extra', 500), '10% of 500');
        $this->assertSame(35.0, $this->svc()->priceOf($this->burger, $cheese, 'extra', 350), '10% of the kids size');
        $this->assertSame(20.0, $this->svc()->priceOf($this->burger, $this->ing('Onion'), 'remove', 500));
        $this->assertSame(0.0, $this->svc()->priceOf($this->burger, $cheese, 'remove', 500), 'the cheese left out has no policy of its own: the default, Free');
        $items = $this->svc()->save($this->burger, [['ingredient_id' => $cheese, 'kind' => 'remove', 'policy_id' => $this->fee], ['ingredient_id' => $this->ing('Onion'), 'kind' => 'remove', 'policy_id' => '']]);
        $this->assertSame([$this->fee, null, null], array_column($items, 'policy_id'));
        $this->assertSame(0.0, $this->svc()->priceOf($this->burger, $cheese, 'extra', 500));
    }

    public function test_the_default_policy_is_the_one_that_prices_an_item_with_none_of_its_own(): void
    {
        app(MenusLists::class)->save('policies', ['name' => 'Fee 20', 'kind' => 'fixed', 'amount' => 20, 'is_default' => true], $this->fee);
        $this->assertSame(20.0, $this->svc()->priceOf($this->burger, $this->ing('Onion'), 'remove', 500));
    }

    public function test_an_item_the_dish_does_not_offer_or_a_bad_policy_is_refused_and_nothing_changes(): void
    {
        $onion = $this->ing('Onion');
        $this->svc()->save($this->burger, [['ingredient_id' => $onion, 'kind' => 'remove', 'policy_id' => $this->fee]]);
        $this->fails(fn () => $this->svc()->save($this->burger, [['ingredient_id' => $onion, 'kind' => 'extra', 'policy_id' => $this->fee]]), 'does not offer that');
        $this->fails(fn () => $this->svc()->save($this->burger, [['ingredient_id' => $this->ing('Flour'), 'kind' => 'remove', 'policy_id' => $this->fee]]), 'does not offer that');
        $this->fails(fn () => $this->svc()->save($this->burger, [['ingredient_id' => $onion, 'kind' => 'remove', 'policy_id' => 9999]]), 'not available');
        $this->fails(fn () => $this->svc()->save($this->burger, [['ingredient_id' => $onion, 'kind' => 'remove', 'policy_id' => $this->fee], ['ingredient_id' => $onion, 'kind' => 'remove', 'policy_id' => $this->pct]]), 'listed twice');
        $this->assertSame($this->fee, $this->svc()->policyFor($this->burger, $onion, 'remove')->id, 'the earlier choice is still there');
    }

    public function test_a_policy_in_use_cannot_be_deleted_or_switched_off(): void
    {
        $this->svc()->save($this->burger, [['ingredient_id' => $this->ing('Onion'), 'kind' => 'remove', 'policy_id' => $this->fee]]);
        $lists = app(MenusLists::class);
        $this->fails(fn () => $lists->delete('policies', $this->fee), 'prices removals or extras on 1 dish');
        $this->fails(fn () => $lists->save('policies', ['name' => 'Fee 20', 'kind' => 'fixed', 'amount' => 20, 'is_active' => false], $this->fee), 'before switching it off');
        $lists->delete('policies', $this->pct);
        $this->assertSame(2, ModifierPolicy::count());
    }

    public function test_the_fee_of_each_kind_of_policy_and_the_vat_setting(): void
    {
        $this->assertSame([0.0, 20.0, 65.0], [DishModifiers::fee(ModifierPolicy::find($this->free), 650), DishModifiers::fee(ModifierPolicy::find($this->fee), 650), DishModifiers::fee(ModifierPolicy::find($this->pct), 650)]);
        $this->assertSame(0.0, DishModifiers::fee(null, 650));
        $this->assertTrue(MenusSettings::all()['modifier_fees_vatable'], 'fees carry the dish\'s VAT unless switched off');
        $this->assertFalse(MenusSettings::save(['modifier_fees_vatable' => false], null)['modifier_fees_vatable']);
    }

    public function test_before_script_206_saving_says_which_script_and_the_dish_still_lists_what_it_offers(): void
    {
        Schema::drop('menus_dish_modifiers');
        $this->assertFalse(DishModifiers::installed());
        $this->fails(fn () => $this->svc()->save($this->burger, []), '206_menus_dish_modifiers');
        $this->assertCount(3, $this->svc()->candidates($this->burger));
        $this->assertSame(0, DishModifiers::usedBy($this->fee));
    }
}

<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Models\Menus\StockUse;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\IngredientUse;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus stock, step 3 (script 183): a recipe written on ingredients, and using the shelf up for it: which variant's batches, in what order, what it costs, and undoing it exactly. */
class MenusIngredientUseTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
    }

    private function recipe(array $lines, array $over = [], string $dish = 'Pancakes'): DishRecipe
    {
        return app(DishRecipes::class)->save($this->dish($dish), $over + ['yield_qty' => 1, 'lines' => $lines]);
    }

    private function flour(string $rule = 'preferred'): void
    {
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Pembe'], ['name' => 'Exe']], $rule);
    }

    private function line(string $ingredient, float $qty, string $unit = 'base', float $waste = 0): array
    {
        return ['ingredient_id' => DB::table('menus_ingredients')->where('name', $ingredient)->value('id'), 'quantity' => $qty, 'unit' => $unit, 'waste_pct' => $waste];
    }

    // ------------------------------------------------------------ the recipe

    public function test_the_amounts_are_scaled_to_the_portions_and_the_waste_is_added_back(): void
    {
        $this->flour();
        // 4 portions need 1 kg of flour with 20% lost in preparing it: 2 portions take 500 g / 0.8
        $r = $this->recipe([$this->line('Wheat flour', 1, 'alt', 20)], ['yield_qty' => 4]);
        $need = app(IngredientUse::class)->needs($r, 2);
        $this->assertEqualsWithDelta(625.0, array_values($need)[0]['qty'], 0.0001);
        $this->assertEqualsWithDelta(1250.0, array_values(app(IngredientUse::class)->needs($r, 4))[0]['qty'], 0.0001);
    }

    public function test_a_recipe_is_refused_for_the_ways_it_can_be_wrong(): void
    {
        $this->flour();
        $this->makeIngredient('Sugar', $this->g, null, [['name' => 'Kabras']]);
        $dish = $this->dish();
        $svc = app(DishRecipes::class);
        $cases = [
            [['lines' => []], 'at least one ingredient'],
            [['lines' => [['ingredient_id' => 999, 'quantity' => 1]]], 'choose an ingredient'],
            [['lines' => [$this->line('Wheat flour', 1), $this->line('Wheat flour', 2)]], 'listed twice'],
            [['lines' => [$this->line('Sugar', 1, 'alt')]], 'no alternate unit'],
            [['lines' => [$this->line('Sugar', 1, 'base', 95)]], 'between 0 and 90'],
            [['lines' => [$this->line('Sugar', 1)], 'yield_qty' => 0], 'more than nothing'],
            [['lines' => [$this->line('Sugar', 1)], 'visibility' => 'secret'], 'who may see'],
        ];
        foreach ($cases as [$d, $says]) {
            try {
                $svc->save($dish, $d);
                $this->fail("accepted: {$says}");
            } catch (BooksException $e) {
                $this->assertStringContainsString($says, $e->getMessage());
            }
        }
        $this->assertSame(0, DishRecipe::count());
        DB::table('menus_ingredients')->where('name', 'Sugar')->update(['is_active' => false]);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('switched off');
        $svc->save($dish, ['lines' => [$this->line('Sugar', 1)]]);
    }

    public function test_saving_again_replaces_the_lines_and_steps_and_keeps_one_recipe_per_dish(): void
    {
        $this->flour();
        $this->makeIngredient('Sugar', $this->g, null, [['name' => 'Kabras']]);
        $dish = $this->dish();
        $svc = app(DishRecipes::class);
        $svc->save($dish, ['lines' => [$this->line('Wheat flour', 100)], 'steps' => [['body' => 'Mix'], ['body' => '  '], ['body' => 'Fry', 'minutes' => 5]]]);
        $r = $svc->save($dish, ['yield_qty' => 2, 'made_to_order' => false, 'lines' => [$this->line('Sugar', 10), $this->line('Wheat flour', 0)], 'steps' => [['body' => 'Bake']]]);
        $this->assertSame(1, DishRecipe::count());
        $this->assertSame(['Sugar'], $r->lines->map(fn ($l) => $l->ingredient->name)->all(), 'a line with no amount is left out');
        $this->assertSame(['Bake'], $r->steps->pluck('body')->all());
        $this->assertFalse($r->made_to_order);
        $svc->delete($dish);
        $this->assertSame([0, 0, 0], [DishRecipe::count(), DB::table('menus_recipe_lines')->count(), DB::table('menus_recipe_steps')->count()]);
    }

    // ------------------------------------------------------------ which variant

    public function test_the_preferred_variant_is_used_first_and_the_next_covers_the_rest(): void
    {
        $this->flour();
        $this->shelve('Pembe', 1000, 0.10);
        $this->shelve('Exe', 5000, 0.13);
        $r = $this->recipe([$this->line('Wheat flour', 1.5, 'alt')]);   // 1500 g
        $use = app(IngredientUse::class)->consume($r, 1, 1, ['type' => 'voucher', 'id' => 7], null);
        $this->assertEquals(1000 * 0.10 + 500 * 0.13, $use['cost'], 'the cost of the batches it came from');
        $this->assertEquals([0, 4500], StockBatch::orderBy('id')->pluck('qty_left')->map(fn ($q) => (float) $q)->all());
    }

    public function test_the_cheapest_rule_takes_the_batch_that_cost_least_whatever_the_order(): void
    {
        $this->flour('cheapest');
        $this->shelve('Pembe', 1000, 0.20);
        $this->shelve('Exe', 1000, 0.13);
        app(IngredientUse::class)->consume($this->recipe([$this->line('Wheat flour', 600)]), 1, 1, ['type' => 'voucher', 'id' => 1], null);
        $this->assertEquals([1000, 400], StockBatch::orderBy('id')->pluck('qty_left')->map(fn ($q) => (float) $q)->all());
    }

    public function test_the_first_expiring_rule_takes_the_soonest_expiry_across_variants_and_leaves_what_never_expires_for_last(): void
    {
        $this->makeIngredient('Milk', $this->ml, $this->l, [['name' => 'Brookside', 'expires' => true], ['name' => 'Tuzo', 'expires' => true]], 'first_expiring');
        $late = $this->shelve('Brookside', 1000, 0.12, '2027-03-01');
        $soon = $this->shelve('Tuzo', 1000, 0.12, '2027-01-10');
        $never = $this->shelve('Brookside', 1000, 0.12, null);
        app(IngredientUse::class)->consume($this->recipe([$this->line('Milk', 1200)], [], 'Chai'), 1, 1, ['type' => 'voucher', 'id' => 1], null);
        $this->assertEquals([800, 0, 1000], [(float) $late->fresh()->qty_left, (float) $soon->fresh()->qty_left, (float) $never->fresh()->qty_left], 'the soonest expiry first (1000), then the next soonest (200), and what never expires last');
    }

    public function test_preferred_keeps_to_the_variant_order_but_uses_its_soonest_expiring_batch_first(): void
    {
        $this->makeIngredient('Milk', $this->ml, $this->l, [['name' => 'Brookside', 'expires' => true], ['name' => 'Tuzo', 'expires' => true]]);
        $later = $this->shelve('Brookside', 1000, 0.12, '2027-03-01');
        $sooner = $this->shelve('Brookside', 1000, 0.12, '2027-02-01');
        $other = $this->shelve('Tuzo', 1000, 0.10, '2027-01-01');
        app(IngredientUse::class)->consume($this->recipe([$this->line('Milk', 1500)], [], 'Chai'), 1, 1, ['type' => 'voucher', 'id' => 1], null);
        $this->assertEquals([500, 0, 1000], [(float) $later->fresh()->qty_left, (float) $sooner->fresh()->qty_left, (float) $other->fresh()->qty_left]);
    }

    public function test_expired_held_recalled_not_allowed_and_switched_off_stock_is_never_used(): void
    {
        $this->makeIngredient('Milk', $this->ml, $this->l, [['name' => 'Fresh', 'expires' => true], ['name' => 'Held'], ['name' => 'Banned', 'allowed' => false], ['name' => 'Off', 'active' => false]]);
        $this->shelve('Fresh', 500, 0.1, '2026-10-10');   // expired a few days ago (today in these tests is real time, so use a date long past)
        DB::table('menus_stock_batches')->where('item_id', $this->itemId('Fresh'))->update(['expiry_date' => '2020-01-01']);
        $this->shelve('Held', 500, 0.1, null, 1, 'held');
        $this->shelve('Banned', 500);
        $this->shelve('Off', 500);
        $r = $this->recipe([$this->line('Milk', 100)], [], 'Chai');
        try {
            app(IngredientUse::class)->consume($r, 1, 1, ['type' => 'voucher', 'id' => 1], null);
            $this->fail('used stock it may not');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Not enough Milk: need 100 ml, have 0', $e->getMessage());
        }
        $this->assertEquals(2000, (float) StockBatch::sum('qty_left'));
        $this->assertSame(0, StockMove::where('kind', 'use')->count());
    }

    public function test_stock_at_another_branch_is_not_used(): void
    {
        $this->flour();
        DB::table('locations')->insert(['id' => 2, 'name' => 'Annex']);
        $this->shelve('Pembe', 5000, 0.1, null, 2);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('Not enough Wheat flour');
        app(IngredientUse::class)->consume($this->recipe([$this->line('Wheat flour', 100)]), 1, 1, ['type' => 'voucher', 'id' => 1], null);
    }

    // ------------------------------------------------------------ using it

    public function test_not_enough_of_one_ingredient_stops_everything_and_changes_nothing(): void
    {
        $this->flour();
        $this->makeIngredient('Sugar', $this->g, null, [['name' => 'Kabras']]);
        $this->shelve('Pembe', 1000, 0.1);
        $this->shelve('Kabras', 5, 0.16);
        $r = $this->recipe([$this->line('Wheat flour', 100), $this->line('Sugar', 15)]);
        try {
            app(IngredientUse::class)->consume($r, 1, 1, ['type' => 'voucher', 'id' => 1], null);
            $this->fail('used it');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Not enough Sugar: need 15 g, have 5', $e->getMessage());
        }
        $this->assertEquals([1000, 5], StockBatch::orderBy('id')->pluck('qty_left')->map(fn ($q) => (float) $q)->all(), 'the flour was not touched either');
        $this->assertSame([0, 0, 0], [StockUse::count(), StockMove::where('kind', 'use')->count(), count($this->posted)]);
    }

    public function test_using_stock_records_the_movements_the_cost_and_a_journal_against_food_cost_of_sales(): void
    {
        $this->flour();
        $this->shelve('Pembe', 1000, 0.10);
        $r = $this->recipe([$this->line('Wheat flour', 120)]);
        $res = app(IngredientUse::class)->consume($r, 3, 1, ['type' => 'voucher', 'id' => 55], null);   // 360 g
        $this->assertEquals(36.0, $res['cost']);
        $use = StockUse::findOrFail($res['use_id']);
        $this->assertSame(['voucher', 55, 'posted'], [$use->ref_type, (int) $use->ref_id, $use->status]);
        $this->assertEquals([3, 36.0], [(float) $use->portions, (float) $use->cost]);
        $move = StockMove::where('use_id', $use->id)->firstOrFail();
        $this->assertSame('use', $move->kind);
        $this->assertEquals(-360, (float) $move->quantity);
        $this->assertEquals(0.10, (float) $move->unit_cost);
        $j = $this->posted[0];
        $this->assertSame(2, $j['voucher_type_id'], 'a Journal');
        $this->assertEquals([[$this->costOfSales, 'D', 36], [$this->inventory, 'C', 36]], array_map(fn ($e) => [$e['ledger_id'], $e['side'], $e['amount']], $j['entries']));
        $this->assertSame($res['journal_id'], (int) $use->journal_id);
    }

    public function test_undoing_a_use_puts_the_same_batches_back_cancels_the_journal_and_is_safe_twice(): void
    {
        $this->flour();
        $a = $this->shelve('Pembe', 100, 0.10);
        $b = $this->shelve('Exe', 1000, 0.20);
        $r = $this->recipe([$this->line('Wheat flour', 300)]);
        $res = app(IngredientUse::class)->consume($r, 1, 1, ['type' => 'voucher', 'id' => 9], null);
        $this->assertEquals([0, 800], [(float) $a->fresh()->qty_left, (float) $b->fresh()->qty_left]);

        $this->assertSame(1, app(IngredientUse::class)->reverse('voucher', 9, null, 'sale cancelled'));
        $this->assertEquals([100, 1000], [(float) $a->fresh()->qty_left, (float) $b->fresh()->qty_left], 'each batch got back what it gave');
        $this->assertSame('reversed', StockUse::find($res['use_id'])->status);
        $this->assertSame('cancelled', Voucher::find($res['journal_id'])->status);
        $this->assertSame(2, StockMove::where('kind', 'use_reversal')->count());
        $this->assertSame(0, app(IngredientUse::class)->reverse('voucher', 9, null), 'nothing left to undo');
        $this->assertEquals([100, 1000], [(float) $a->fresh()->qty_left, (float) $b->fresh()->qty_left]);
        $this->assertFalse(app(IngredientUse::class)->usedFor('voucher', 9));
    }

    // ------------------------------------------------------------ how many, what it costs

    public function test_how_many_portions_can_be_made_is_decided_by_the_ingredient_that_runs_out_first(): void
    {
        $this->flour();
        $this->makeIngredient('Eggs', $this->each, null, [['name' => 'Tray']]);
        $this->shelve('Pembe', 10000, 0.1);
        $this->shelve('Tray', 7, 15);
        $r = $this->recipe([$this->line('Wheat flour', 120), $this->line('Eggs', 2)]);
        $this->assertEquals(3.5, app(IngredientUse::class)->capacity($r, 1), 'flour allows 83, eggs allow 3.5');
        $this->assertEquals(0.0, app(IngredientUse::class)->capacity($r, 2), 'nothing at another branch');
        DB::table('menus_stock_batches')->where('item_id', $this->itemId('Tray'))->update(['expiry_date' => '2020-01-01']);
        $this->assertEquals(0.0, app(IngredientUse::class)->capacity($r, 1), 'expired eggs do not count');
    }

    public function test_the_cost_of_a_portion_uses_what_is_on_the_shelf_and_says_when_something_was_never_bought(): void
    {
        $this->flour();
        $this->makeIngredient('Sugar', $this->g, null, [['name' => 'Kabras']]);
        $this->shelve('Pembe', 1000, 0.10);
        $this->shelve('Exe', 1000, 0.20);   // the shelf averages 0.15 a gram
        $r = $this->recipe([$this->line('Wheat flour', 100), $this->line('Sugar', 10)]);
        $c = app(IngredientUse::class)->cost($r, 1);
        $this->assertFalse($c['complete'], 'sugar has never been bought');
        $this->assertEquals(15.0, $c['per_portion'], 'only what is known is added up');
        $this->assertNull($c['lines'][1]['unit_cost']);

        $this->shelve('Kabras', 100, 0.16);
        $c = app(IngredientUse::class)->cost($r, 1);
        $this->assertTrue($c['complete']);
        $this->assertEquals(16.6, $c['per_portion']);
        $this->assertEquals(0.15, $c['lines'][0]['unit_cost']);
        // sold out of everything: the last known cost is still used
        DB::table('menus_stock_batches')->update(['qty_left' => 0]);
        $this->assertTrue(app(IngredientUse::class)->cost($r, 1)['complete']);
    }

    // ------------------------------------------------------------ what a dish says about itself

    public function test_a_dish_inherits_allergens_and_tags_from_the_ingredients_of_its_recipe(): void
    {
        $this->makeIngredient('Wheat flour', $this->g, null, [['name' => 'Pembe']], 'preferred', ['allergens' => ['wheat'], 'tags' => ['gluten']]);
        $this->makeIngredient('Beef', $this->g, null, [['name' => 'Stew meat']], 'preferred', ['tags' => ['meat']]);
        $this->makeIngredient('Oil', $this->ml, null, [['name' => 'Fresh Fri']]);
        $stew = $this->dish('Stew');
        app(DishRecipes::class)->save($stew, ['lines' => [$this->line('Beef', 200), $this->line('Oil', 20)]]);
        $info = app(\App\Services\Menus\DishInfo::class)->profile($stew->fresh());
        $this->assertSame([[], ['meat']], [$info['allergens'], $info['tags']]);
        $this->assertTrue($info['complete'], 'every ingredient says what it is, so the diets can be claimed');
        $this->assertNotContains('vegetarian', $info['diets']);

        $cake = $this->dish('Cake');
        app(DishRecipes::class)->save($cake, ['lines' => [$this->line('Wheat flour', 300), $this->line('Oil', 20)]]);
        $info = app(\App\Services\Menus\DishInfo::class)->profile($cake->fresh());
        $this->assertSame([['wheat'], ['gluten']], [$info['allergens'], $info['tags']]);
        $this->assertContains('vegetarian', $info['diets']);
        $this->assertNotContains('gluten_free', $info['diets']);
    }

    public function test_the_portions_a_dish_can_be_sold_follow_the_shelf_and_stop_when_it_is_off_or_sold_out_today(): void
    {
        $this->flour();
        $this->shelve('Pembe', 1000, 0.1);
        $dish = $this->dish();
        app(DishRecipes::class)->save($dish, ['lines' => [$this->line('Wheat flour', 120)]]);
        $info = app(\App\Services\Menus\DishInfo::class);
        $this->assertEquals(8.3333, $info->portions($dish->fresh(), 1));
        $dish->update(['sold_out_on' => today()]);
        $this->assertEquals(0.0, $info->portions($dish->fresh(), 1), 'marked sold out for today');
        $dish->update(['sold_out_on' => null, 'is_active' => false]);
        $this->assertEquals(0.0, $info->portions($dish->fresh(), 1), 'switched off');
    }

    // ------------------------------------------------------------ the screen's door

    public function test_the_recipes_door_saves_lists_with_cost_and_portions_and_answers_a_refusal_in_words(): void
    {
        $this->flour();
        $this->shelve('Pembe', 1200, 0.10);
        $dish = $this->dish();
        $c = app(\App\Http\Controllers\Admin\MenusRecipesController::class);
        $ok = $c->save(\Illuminate\Http\Request::create('/x', 'PUT', ['yield_qty' => 2, 'made_to_order' => true, 'visibility' => 'internal', 'lines' => [['ingredient_id' => $this->line('Wheat flour', 1)['ingredient_id'], 'quantity' => 0.24, 'unit' => 'alt', 'waste_pct' => 0]]]), $dish->id);
        $this->assertSame(200, $ok->getStatusCode());

        $out = $c->index(\Illuminate\Http\Request::create('/x', 'GET', ['location_id' => 1]))->getData(true);
        $row = $out['dishes'][0]['recipe'];
        $this->assertSame('Pancakes', $out['dishes'][0]['name']);
        $this->assertEquals([240, 'alt', 'kg'], [$row['lines'][0]['quantity'] * 1000, $row['lines'][0]['unit'], $row['lines'][0]['alt_unit']]);
        $this->assertEquals(12.0, $row['cost']['per_portion'], '240 g makes 2 portions: 120 g each at 0.10');
        $this->assertEquals(10.0, $row['portions'], '1200 g allows 10 portions');
        $this->assertSame('Wheat flour', $out['ingredients'][0]['name']);

        $bad = $c->save(\Illuminate\Http\Request::create('/x', 'PUT', ['yield_qty' => 1, 'lines' => [['ingredient_id' => 9999, 'quantity' => 1]]]), $dish->id);
        $this->assertSame(422, $bad->getStatusCode());
        $this->assertStringContainsString('choose an ingredient', $bad->getData(true)['message']);
        $this->assertSame(200, $c->destroy($dish->id)->getStatusCode());
        $this->assertNull($c->index(\Illuminate\Http\Request::create('/x', 'GET'))->getData(true)['dishes'][0]['recipe']);
    }
}

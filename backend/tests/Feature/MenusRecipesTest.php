<?php

namespace Tests\Feature;

use App\Models\Production;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Services\Books\BooksException;
use App\Services\Licensing\LicenseManager;
use App\Services\Location\VariantStockService;
use App\Services\Menus\IngredientFamilies;
use App\Services\Menus\RecipeCosting;
use App\Services\Menus\RecipeLines;
use App\Services\Stock\ProductionService;
use App\Services\Stock\RecipeService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus step 1.2: recipe lines that name an ingredient family, are written in a recipe unit and lose some to waste; made-to-order sales and production runs take them from the right items; the cost; the method. */
class MenusRecipesTest extends TestCase
{
    use Concerns\CreatesMenusTables;

    /** @var array<int, array{variant: int, location: int, delta: float}> what the stock engine was asked to move */
    private array $moves = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createMenusTables();
        Schema::create('recipes', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id')->unique(); $t->decimal('yield_qty', 18, 4)->default(1); $t->boolean('deduct_on_sale')->default(false); $t->string('note')->nullable(); $t->boolean('is_active')->default(true); $t->string('visibility', 12)->default('internal'); $t->unsignedSmallInteger('prep_minutes')->nullable(); $t->unsignedSmallInteger('cook_minutes')->nullable(); $t->timestamps(); });
        Schema::create('recipe_items', function ($t) { $t->id(); $t->unsignedBigInteger('recipe_id'); $t->unsignedBigInteger('variant_id')->nullable(); $t->unsignedBigInteger('family_id')->nullable(); $t->unsignedBigInteger('unit_id')->nullable(); $t->decimal('waste_pct', 5, 2)->default(0); $t->decimal('quantity', 18, 4); });
        Schema::create('recipe_steps', function ($t) { $t->id(); $t->unsignedBigInteger('recipe_id'); $t->unsignedSmallInteger('position')->default(1); $t->text('body'); $t->unsignedSmallInteger('minutes')->nullable(); $t->string('image')->nullable(); $t->timestamps(); });
        Schema::create('productions', function ($t) { $t->id(); $t->string('number', 20)->nullable(); $t->unsignedBigInteger('recipe_id'); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('location_id'); $t->decimal('quantity', 18, 4); $t->decimal('unit_cost', 18, 4)->default(0); $t->unsignedBigInteger('batch_id')->nullable(); $t->string('status', 10)->default('posted'); $t->string('note')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('production_lines', function ($t) { $t->id(); $t->unsignedBigInteger('production_id'); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('batch_id'); $t->decimal('quantity', 18, 4); $t->decimal('unit_cost', 18, 4)->default(0); $t->timestamps(); });
        Schema::create('stock_movements', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('voucher_item_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->unsignedBigInteger('location_id'); $t->decimal('quantity', 18, 4); $t->string('movement_type'); $t->date('movement_date'); $t->boolean('reversed')->default(false); $t->timestamp('created_at')->nullable(); $t->unsignedBigInteger('batch_id')->nullable(); $t->decimal('unit_cost', 18, 4)->default(0); $t->string('ref_type')->nullable(); $t->unsignedBigInteger('ref_id')->nullable(); });
        Schema::table('products', fn ($t) => $t->boolean('track_expiry')->default(false));
        RecipeLines::forget();
        RecipeService::forget();
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturn(true));
    }

    private function lines(): RecipeService
    {
        return app(RecipeService::class);
    }

    private function dish(string $name = 'Chapati'): int
    {
        return $this->item($name);
    }

    private function family(string $name, int $unit, array $items, string $rule = 'preferred'): int
    {
        return app(IngredientFamilies::class)->save(['name' => $name, 'unit_id' => $unit, 'pick_rule' => $rule, 'variants' => array_map(fn ($i) => ['variant_id' => $i[0], 'units_per_stock' => $i[1]], $items)])->id;
    }

    private function need(Recipe $r, float $factor = 1): array
    {
        $rows = app(RecipeLines::class)->requirements($r, $factor, self::BRANCH);

        return array_column($rows, 'quantity', 'variant_id');
    }

    // ------------------------------------------------------------ saving a recipe

    public function test_an_old_style_recipe_still_means_exact_items_in_their_stock_unit(): void
    {
        $dish = $this->dish();
        $oil = $this->item('Oil', '1 l');
        $r = $this->lines()->save($dish, 10, false, null, [['variant_id' => $oil, 'quantity' => 2]]);
        $this->assertSame([$oil => 2.0], $this->need($r));
        $this->assertSame([$oil => 4.0], $this->need($r, 2), 'twice the batch, twice the oil');
    }

    public function test_a_line_is_either_an_exact_item_or_an_ingredient(): void
    {
        $dish = $this->dish();
        $oil = $this->item('Oil', '1 l');
        $fam = $this->family('Oil', $this->ml, [[$oil, 1000]]);
        foreach ([['variant_id' => $oil, 'family_id' => $fam, 'quantity' => 1], ['quantity' => 1]] as $bad) {
            try {
                $this->lines()->save($dish, 1, false, null, [$bad]);
                $this->fail('should be refused');
            } catch (BooksException $e) {
                $this->assertStringContainsString('either one exact stock item or an ingredient', $e->getMessage());
            }
        }
    }

    public function test_waste_must_be_sensible_and_the_same_thing_cannot_be_listed_twice(): void
    {
        $dish = $this->dish();
        $oil = $this->item('Oil', '1 l');
        $fam = $this->family('Sugar', $this->g, [[$this->item('Sugar', '1 kg'), 1000]]);
        $cases = [
            [[['variant_id' => $oil, 'quantity' => 1, 'waste_pct' => 95]], 'between 0 and 90'],
            [[['variant_id' => $oil, 'quantity' => 1, 'waste_pct' => -1]], 'between 0 and 90'],
            [[['variant_id' => $oil, 'quantity' => 1], ['variant_id' => $oil, 'quantity' => 2]], 'listed twice'],
            [[['family_id' => $fam, 'quantity' => 1], ['family_id' => $fam, 'quantity' => 2]], 'listed twice'],
            [[['family_id' => 9999, 'quantity' => 1]], 'removed or switched off'],
        ];
        foreach ($cases as [$items, $why]) {
            try {
                $this->lines()->save($dish, 1, false, null, $items);
                $this->fail("should be refused: {$why}");
            } catch (BooksException $e) {
                $this->assertStringContainsString($why, $e->getMessage());
            }
        }
    }

    public function test_a_dish_cannot_be_made_from_itself_even_through_an_ingredient(): void
    {
        $dish = $this->dish();
        $fam = $this->family('Mix', $this->g, [[$dish, 100]]);
        $this->expectExceptionMessage('cannot be an ingredient of itself');
        $this->lines()->save($dish, 1, false, null, [['family_id' => $fam, 'quantity' => 1]]);
    }

    public function test_an_ingredient_that_is_made_to_order_cannot_be_used_in_another_recipe_even_through_a_family(): void
    {
        $sauce = $this->dish('Sauce');
        $oil = $this->item('Oil', '1 l');
        $this->lines()->save($sauce, 1, true, null, [['variant_id' => $oil, 'quantity' => 1]]);   // made to order
        $fam = $this->family('Sauces', $this->g, [[$sauce, 100]]);
        $this->expectExceptionMessage('made to order cannot be used in another recipe');
        $this->lines()->save($this->dish('Plate'), 1, false, null, [['family_id' => $fam, 'quantity' => 1]]);
    }

    public function test_a_recipe_unit_must_be_the_same_kind_as_what_it_is_measured_in(): void
    {
        $dish = $this->dish();
        $fam = $this->family('Flour', $this->g, [[$this->item('Flour', '2 kg'), 2000]]);
        $this->expectExceptionMessage('can not be turned into it');
        $this->lines()->save($dish, 1, false, null, [['family_id' => $fam, 'quantity' => 1, 'unit_id' => $this->ml]]);
    }

    public function test_an_exact_item_in_a_recipe_unit_needs_to_say_how_much_one_holds(): void
    {
        $dish = $this->dish();
        $rice = $this->item('Rice', 'loose');
        $this->expectExceptionMessage('does not say how much one of it holds');
        $this->lines()->save($dish, 1, false, null, [['variant_id' => $rice, 'quantity' => 200, 'unit_id' => $this->g]]);
    }

    public function test_who_may_see_the_recipe_is_one_of_the_two_choices(): void
    {
        $dish = $this->dish();
        $oil = $this->item('Oil', '1 l');
        $this->expectExceptionMessage('Choose who may see this recipe');
        $this->lines()->save($dish, 1, false, null, [['variant_id' => $oil, 'quantity' => 1]], ['visibility' => 'everybody']);
    }

    public function test_the_method_is_kept_in_order_and_blank_steps_are_dropped(): void
    {
        $dish = $this->dish();
        $oil = $this->item('Oil', '1 l');
        $r = $this->lines()->save($dish, 1, false, null, [['variant_id' => $oil, 'quantity' => 1]], ['visibility' => 'publishable', 'prep_minutes' => 15, 'cook_minutes' => 30,
            'steps' => [['body' => ' Knead the dough ', 'minutes' => 10], ['body' => '  '], ['body' => 'Roll and fry', 'minutes' => 20, 'image' => 'steps/fry.jpg']]]);
        $r = Recipe::with('steps')->find($r->id);
        $this->assertSame(['Knead the dough', 'Roll and fry'], $r->steps->pluck('body')->all());
        $this->assertSame([1, 2], $r->steps->pluck('position')->all());
        $this->assertSame(['publishable', 15, 30], [$r->visibility, $r->prep_minutes, $r->cook_minutes]);
        $again = $this->lines()->save($dish, 1, false, null, [['variant_id' => $oil, 'quantity' => 1]], ['steps' => [['body' => 'Only one']]]);
        $this->assertSame(1, Recipe::find($again->id)->steps()->count(), 'saving the steps again replaces them');
        $kept = $this->lines()->save($dish, 1, false, null, [['variant_id' => $oil, 'quantity' => 1]]);
        $this->assertSame(1, Recipe::find($kept->id)->steps()->count(), 'a save that says nothing about steps leaves them alone');
    }

    public function test_before_script_133_the_new_things_are_refused_and_the_old_ones_still_work(): void
    {
        Schema::table('recipe_items', fn ($t) => $t->dropColumn(['family_id', 'unit_id', 'waste_pct']));
        RecipeLines::forget();
        $dish = $this->dish();
        $oil = $this->item('Oil', '1 l');
        $this->assertSame(2.0, (float) $this->lines()->save($dish, 1, false, null, [['variant_id' => $oil, 'quantity' => 2]])->items->first()->quantity);
        $this->expectExceptionMessage('need database script 133');
        $this->lines()->save($dish, 1, false, null, [['variant_id' => $oil, 'quantity' => 2, 'waste_pct' => 10]]);
    }

    // ------------------------------------------------------------ what a recipe takes from the shelf

    public function test_a_line_in_grams_of_an_item_sold_by_the_pack_takes_the_right_fraction_of_a_pack(): void
    {
        $dish = $this->dish();
        $rice = $this->item('Rice', '2 kg', ['net_content_qty' => 2, 'net_content_unit_id' => $this->kg]);
        $r = $this->lines()->save($dish, 4, false, null, [['variant_id' => $rice, 'quantity' => 400, 'unit_id' => $this->g]]);   // 400 g per 4 portions
        $this->assertSame([$rice => 0.2], $this->need($r));
    }

    public function test_waste_is_added_back_so_what_is_lost_in_preparing_is_still_taken_from_stock(): void
    {
        $dish = $this->dish();
        $pot = $this->item('Potatoes', '1 kg', ['net_content_qty' => 1, 'net_content_unit_id' => $this->kg]);
        $r = $this->lines()->save($dish, 1, false, null, [['variant_id' => $pot, 'quantity' => 850, 'unit_id' => $this->g, 'waste_pct' => 15]]);   // 850 g peeled
        $this->assertSame([$pot => 1.0], $this->need($r), '850 g of peeled potato needs 1 kg of potatoes');
    }

    public function test_a_family_line_takes_the_preferred_item_then_spills_to_the_next(): void
    {
        $dish = $this->dish();
        $exe = $this->item('Exe', '2 kg');
        $pembe = $this->item('Pembe', '24 kg');
        $fam = $this->family('Wheat flour', $this->g, [[$exe, 2000], [$pembe, 24000]]);
        $this->stock($exe, 1);       // 2000 g
        $this->stock($pembe, 1);
        $r = $this->lines()->save($dish, 10, false, null, [['family_id' => $fam, 'quantity' => 3, 'unit_id' => $this->kg]]);   // 3 kg per batch
        $this->assertSame([$exe => 1.0, $pembe => 0.0417], $this->need($r), 'the stock engine counts in four decimals');
    }

    public function test_an_exact_line_and_a_family_line_for_the_same_item_are_added_together(): void
    {
        $dish = $this->dish();
        $exe = $this->item('Exe', '2 kg');
        $fam = $this->family('Wheat flour', $this->g, [[$exe, 2000]]);
        $this->stock($exe, 10);
        $r = $this->lines()->save($dish, 1, false, null, [['variant_id' => $exe, 'quantity' => 1], ['family_id' => $fam, 'quantity' => 1000]]);
        $this->assertSame([$exe => 1.5], $this->need($r));
    }

    public function test_a_family_with_not_enough_on_the_shelf_says_so(): void
    {
        $dish = $this->dish();
        $fam = $this->family('Wheat flour', $this->g, [[$this->item('Exe', '2 kg'), 2000]]);
        $r = $this->lines()->save($dish, 1, false, null, [['family_id' => $fam, 'quantity' => 500]]);
        $this->expectExceptionMessage('Not enough Wheat flour');
        $this->need($r);
    }

    public function test_a_switched_off_ingredient_stops_the_recipe_with_a_clear_message(): void
    {
        $dish = $this->dish();
        $exe = $this->item('Exe', '2 kg');
        $fam = $this->family('Wheat flour', $this->g, [[$exe, 2000]]);
        $r = $this->lines()->save($dish, 1, false, null, [['family_id' => $fam, 'quantity' => 500]]);
        \App\Models\Menus\IngredientFamily::find($fam)->update(['is_active' => false]);
        $this->expectExceptionMessage('removed or switched off');
        $this->need($r->fresh());
    }

    // ------------------------------------------------------------ a sale of a dish made to order

    public function test_selling_a_dish_made_to_order_uses_the_ingredients_the_kitchen_would_pick(): void
    {
        $dish = $this->dish('Chapati');
        $exe = $this->item('Exe', '2 kg');
        $pembe = $this->item('Pembe', '24 kg');
        $fam = $this->family('Wheat flour', $this->g, [[$exe, 2000], [$pembe, 24000]]);
        $this->stock($exe, 0.1);      // 200 g left of the preferred
        $this->stock($pembe, 1);
        $this->lines()->save($dish, 4, true, null, [['family_id' => $fam, 'quantity' => 400]]);   // 400 g makes four: 100 g a chapati
        $this->assertTrue($this->lines()->isMadeToOrder($dish));
        $used = $this->lines()->consumption($dish, 5, self::BRANCH);   // five chapatis = 500 g
        $this->assertSame([$exe, $pembe], array_column($used, 'variant_id'));
        $this->assertEqualsWithDelta([0.1, 300 / 24000], array_column($used, 'quantity'), 0.00006);
        $this->assertSame('Exe', $used[0]['name']);
    }

    public function test_an_ordinary_item_is_not_made_to_order_and_a_recipe_made_ahead_is_not_either(): void
    {
        $dish = $this->dish();
        $oil = $this->item('Oil', '1 l');
        $this->assertNull($this->lines()->consumption($dish, 1, self::BRANCH));
        $this->lines()->save($dish, 1, false, null, [['variant_id' => $oil, 'quantity' => 1]]);   // made ahead
        $this->assertFalse($this->lines()->isMadeToOrder($dish));
        $this->assertNull($this->lines()->consumption($dish, 1, self::BRANCH));
    }

    public function test_with_menus_switched_off_nothing_is_made_to_order(): void
    {
        $dish = $this->dish();
        $oil = $this->item('Oil', '1 l');
        $this->lines()->save($dish, 1, true, null, [['variant_id' => $oil, 'quantity' => 1]]);
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->with('menus')->andReturn(false));
        $this->assertFalse($this->lines()->isMadeToOrder($dish));
    }

    // ------------------------------------------------------------ a production run

    private function production(): array
    {
        $stock = $this->mock(VariantStockService::class);
        $stock->shouldReceive('applyDelta')->andReturnUsing(function (int $variant, int $location, float $delta, array $o = []) {
            $this->moves[] = ['variant' => $variant, 'location' => $location, 'delta' => round($delta, 4)];
            if ($delta > 0) {
                return [['batch_id' => 900, 'qty' => $delta, 'unit_cost' => $o['unit_cost'] ?? 0, 'created' => true]];
            }
            $b = DB::table('stock_batches')->where('variant_id', $variant)->first();
            DB::table('stock_batch_balances')->where('batch_id', $b->id)->decrement('quantity', -$delta);

            return [['batch_id' => (int) $b->id, 'qty' => $delta, 'unit_cost' => (float) $b->unit_cost, 'created' => false]];
        });

        return [app(ProductionService::class), $stock];
    }

    public function test_a_production_run_takes_the_ingredients_from_the_items_the_family_picks_and_costs_the_batch_from_them(): void
    {
        $dish = $this->dish('Dough');
        $exe = $this->item('Exe', '2 kg');
        $pembe = $this->item('Pembe', '24 kg');
        $fam = $this->family('Wheat flour', $this->g, [[$exe, 2000], [$pembe, 24000]]);
        $this->stock($exe, 1, 400);       // 0.20 a gram
        $this->stock($pembe, 1, 2400);    // 0.10 a gram
        $r = $this->lines()->save($dish, 10, false, null, [['family_id' => $fam, 'quantity' => 3000]]);   // 3 kg makes 10
        [$svc] = $this->production();
        $run = $svc->run($r->fresh(), self::BRANCH, 10);
        $this->assertSame([[$exe, -1.0], [$pembe, -0.0417]], array_map(fn ($m) => [$m['variant'], $m['delta']], array_slice($this->moves, 0, 2)), 'the preferred item first, the rest from the next');
        $this->assertEqualsWithDelta((2000 * 0.20 + 1000.8 * 0.10) / 10, (float) $run->unit_cost, 0.01, 'the batch costs what was really used');
        $this->assertSame(2, $run->lines->count());
    }

    public function test_a_production_run_refuses_when_the_family_is_short_and_takes_nothing(): void
    {
        $dish = $this->dish('Dough');
        $exe = $this->item('Exe', '2 kg');
        $fam = $this->family('Wheat flour', $this->g, [[$exe, 2000]]);
        $this->stock($exe, 1);
        $r = $this->lines()->save($dish, 10, false, null, [['family_id' => $fam, 'quantity' => 3000]]);
        [$svc] = $this->production();
        try {
            $svc->run($r->fresh(), self::BRANCH, 10);
            $this->fail('should be refused');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Not enough Wheat flour', $e->getMessage());
        }
        $this->assertSame([], $this->moves);
        $this->assertSame(0, Production::count());
    }

    // ------------------------------------------------------------ what it costs

    public function test_the_cost_follows_the_batch_that_would_be_used_with_waste_paid_for(): void
    {
        $dish = $this->dish();
        $exe = $this->item('Exe', '2 kg');
        $oil = $this->item('Oil', '1 l');
        $fam = $this->family('Wheat flour', $this->g, [[$exe, 2000]]);
        $this->stock($exe, 5, 400);    // 0.20 a gram
        $this->stock($oil, 5, 300);
        $r = $this->lines()->save($dish, 4, false, null, [['family_id' => $fam, 'quantity' => 1000, 'unit_id' => $this->g, 'waste_pct' => 20], ['variant_id' => $oil, 'quantity' => 0.5]]);
        $c = app(RecipeCosting::class)->for($r->fresh(), self::BRANCH);
        $this->assertTrue($c['complete']);
        $this->assertEqualsWithDelta(1250 * 0.20, $c['lines'][0]['cost'], 0.001, '1000 g after 20 % waste is 1250 g bought');
        $this->assertEqualsWithDelta(0.5 * 300, $c['lines'][1]['cost'], 0.001);
        $this->assertEqualsWithDelta((250 + 150) / 4, $c['per_unit'], 0.001);
        $this->assertFalse($c['lines'][0]['estimated']);
    }

    public function test_a_dish_that_is_sold_out_still_has_a_cost_from_the_last_price_paid_and_says_it_is_an_estimate(): void
    {
        $dish = $this->dish();
        $exe = $this->item('Exe', '2 kg');
        $fam = $this->family('Wheat flour', $this->g, [[$exe, 2000]]);
        $b = $this->stock($exe, 0, 400);
        $r = $this->lines()->save($dish, 1, false, null, [['family_id' => $fam, 'quantity' => 500]]);
        $c = app(RecipeCosting::class)->for($r->fresh(), self::BRANCH);
        $this->assertEqualsWithDelta(100.0, $c['total'], 0.001);
        $this->assertTrue($c['lines'][0]['estimated']);
        $this->assertTrue($b > 0);
    }

    public function test_a_line_with_no_known_cost_makes_the_total_incomplete(): void
    {
        $dish = $this->dish();
        $oil = $this->item('Oil', '1 l');
        $r = $this->lines()->save($dish, 2, false, null, [['variant_id' => $oil, 'quantity' => 1]]);
        $c = app(RecipeCosting::class)->for($r->fresh(), self::BRANCH);
        $this->assertFalse($c['complete']);
        $this->assertNull($c['per_unit']);
        $this->assertNull($c['lines'][0]['cost']);
    }

    public function test_an_exact_item_cannot_be_its_own_ingredient(): void
    {
        $dish = $this->dish();
        $this->expectExceptionMessage('cannot be an ingredient of itself');
        $this->lines()->save($dish, 1, false, null, [['variant_id' => $dish, 'quantity' => 1]]);
    }

    public function test_a_waste_figure_that_got_into_the_data_some_other_way_can_not_divide_by_zero(): void
    {
        $dish = $this->dish();
        $oil = $this->item('Oil', '1 l');
        $r = $this->lines()->save($dish, 1, false, null, [['variant_id' => $oil, 'quantity' => 1]]);
        DB::table('recipe_items')->where('recipe_id', $r->id)->update(['waste_pct' => 100]);
        $this->assertSame([$oil => 10.0], $this->need($r->fresh()), 'at most 90 % is counted as lost: ten times what is left');
        DB::table('recipe_items')->where('recipe_id', $r->id)->update(['waste_pct' => -50]);
        $this->assertSame([$oil => 1.0], $this->need($r->fresh()), 'and never less than nothing lost');
    }

    public function test_a_line_whose_unit_does_not_fit_its_ingredient_is_stopped_when_it_is_used(): void
    {
        $dish = $this->dish();
        $fam = $this->family('Flour', $this->g, [[$this->item('Flour', '2 kg'), 2000]]);
        $r = $this->lines()->save($dish, 1, false, null, [['family_id' => $fam, 'quantity' => 1]]);
        DB::table('recipe_items')->where('recipe_id', $r->id)->update(['unit_id' => $this->ml]);   // changed behind the screen's back
        $this->expectExceptionMessage('can not be turned into it');
        $this->need($r->fresh());
    }

    // ------------------------------------------------------------ what a customer's choices change

    private function burgerRecipe(): array
    {
        $d = $this->dish('Burger');
        $onion = $this->item('Onions', '1 kg');
        $cheese = $this->item('Cheese', '1 kg');
        $oil = $this->item('Oil', '1 l');
        $onionFam = $this->family('Onion', $this->g, [[$onion, 1000]]);
        $cheeseFam = $this->family('Cheese', $this->g, [[$cheese, 1000]]);
        foreach ([[$onion, 100], [$cheese, 100], [$oil, 10]] as [$v, $q]) {
            $this->stock($v, $q);
        }
        $r = $this->lines()->save($d, 1, true, null, [['family_id' => $onionFam, 'quantity' => 30], ['variant_id' => $oil, 'quantity' => 0.05]]);

        return [$d, $r, $onion, $cheese, $oil, $onionFam, $cheeseFam];
    }

    public function test_a_choice_that_leaves_something_out_takes_that_line_out_of_what_is_used(): void
    {
        [, $r, $onion, , $oil, $onionFam] = $this->burgerRecipe();
        $rows = app(RecipeLines::class)->requirements($r->fresh(), 2.0, self::BRANCH, [['mode' => 'remove', 'family_id' => $onionFam]], 2.0);
        $this->assertSame([$oil => 0.1], array_column($rows, 'quantity', 'variant_id'), 'no onion for either burger');
        $rows = app(RecipeLines::class)->requirements($r->fresh(), 2.0, self::BRANCH, [['mode' => 'remove', 'variant_id' => $oil]], 2.0);
        $this->assertSame([$onion => 0.06], array_column($rows, 'quantity', 'variant_id'), 'or no oil: an exact item can be left out too');
    }

    public function test_leaving_out_something_the_recipe_does_not_use_changes_nothing(): void
    {
        [, $r, $onion, , $oil] = $this->burgerRecipe();
        $rows = app(RecipeLines::class)->requirements($r->fresh(), 1.0, self::BRANCH, [['mode' => 'remove', 'variant_id' => 99999]], 1.0);
        $this->assertSame([$onion => 0.03, $oil => 0.05], array_column($rows, 'quantity', 'variant_id'));
    }

    public function test_a_choice_that_uses_more_adds_that_much_per_portion_and_adds_to_what_the_recipe_already_uses(): void
    {
        [, $r, $onion, $cheese, , $onionFam, $cheeseFam] = $this->burgerRecipe();
        $uses = [['mode' => 'add', 'family_id' => $cheeseFam, 'quantity' => 20], ['mode' => 'add', 'family_id' => $onionFam, 'quantity' => 0.01, 'unit_id' => $this->kg]];
        $rows = app(RecipeLines::class)->requirements($r->fresh(), 3.0, self::BRANCH, $uses, 3.0);
        $by = array_column($rows, 'quantity', 'variant_id');
        $this->assertSame(0.06, $by[$cheese], '20 g of cheese on each of three burgers');
        $this->assertSame(round(30 / 1000 * 3 + 0.01 * 3, 4), $by[$onion], 'the recipe\'s onion and the extra onion are one number');
    }

    public function test_extras_for_a_made_to_order_dish_are_counted_per_portion_not_per_batch(): void
    {
        [$d, , , $cheese, , , $cheeseFam] = $this->burgerRecipe();
        $used = $this->lines()->consumption($d, 2, self::BRANCH, [['mode' => 'add', 'family_id' => $cheeseFam, 'quantity' => 20]]);
        $this->assertSame(0.04, array_column($used, 'quantity', 'variant_id')[$cheese]);
        $this->assertSame('Cheese', array_column($used, 'name', 'variant_id')[$cheese]);
    }

    public function test_a_dish_made_ahead_can_still_take_the_extras_that_were_asked_for(): void
    {
        [, , , $cheese, , , $cheeseFam] = $this->burgerRecipe();
        $extras = $this->lines()->extrasFor(3, self::BRANCH, [['mode' => 'add', 'family_id' => $cheeseFam, 'quantity' => 10], ['mode' => 'remove', 'family_id' => $cheeseFam]]);
        $this->assertSame([[$cheese, 0.03]], array_map(fn ($e) => [$e['variant_id'], $e['quantity']], $extras), 'a removal takes nothing');
        $this->assertSame([], $this->lines()->extrasFor(0, self::BRANCH, [['mode' => 'add', 'family_id' => $cheeseFam, 'quantity' => 10]]));
        $this->assertSame([], $this->lines()->extrasFor(3, self::BRANCH, [['mode' => 'add', 'family_id' => $cheeseFam, 'quantity' => 0]]));
    }

    public function test_extras_that_the_shelf_cannot_cover_are_refused_with_the_ingredient_named(): void
    {
        [$d, , , , , , $cheeseFam] = $this->burgerRecipe();
        $this->expectExceptionMessage('Not enough Cheese');
        $this->lines()->consumption($d, 1, self::BRANCH, [['mode' => 'add', 'family_id' => $cheeseFam, 'quantity' => 150000]]);
    }

    // ------------------------------------------------------------ the books carry the choices through

    private function plan(array $lines, string $base = 'sales', string $effect = 'out'): array
    {
        $this->mock(\App\Services\Stock\StockPolicy::class, fn ($m) => $m->shouldReceive('forProduct')->andReturn(['min_days_online' => 0, 'min_days_till' => 0, 'sell_expired' => 'blocked']));
        $type = (new \App\Models\Books\VoucherType())->forceFill(['base_type' => $base, 'stock_effect' => $effect]);
        $m = new \ReflectionMethod(\App\Services\Books\VoucherService::class, 'stockPlan');
        $m->setAccessible(true);

        return $m->invoke(app(\App\Services\Books\VoucherService::class), $lines, $type, self::BRANCH);
    }

    private function soldLine(int $variantId, float $qty, array $uses): array
    {
        return ['is_header' => false, 'children' => [], 'variant_id' => $variantId, 'stock_qty' => $qty, 'description' => 'Burger', 'location_id' => self::BRANCH, 'menu_uses' => $uses, 'product_id' => null, 'track_expiry' => false];
    }

    public function test_a_sale_of_a_made_to_order_dish_takes_the_choices_into_account_when_stock_moves(): void
    {
        [$d, , $onion, $cheese, $oil, $onionFam, $cheeseFam] = $this->burgerRecipe();
        $moves = $this->plan([$this->soldLine($d, 2, [['mode' => 'remove', 'family_id' => $onionFam], ['mode' => 'add', 'family_id' => $cheeseFam, 'quantity' => 20]])]);
        $this->assertSame([$oil => -0.1, $cheese => -0.04], array_column($moves, 'qty', 'variant_id'));
    }

    public function test_a_sale_with_no_choices_moves_stock_exactly_as_before(): void
    {
        [$d, , $onion, , $oil] = $this->burgerRecipe();
        $moves = $this->plan([$this->soldLine($d, 2, [])]);
        $this->assertSame([$onion => -0.06, $oil => -0.1], array_column($moves, 'qty', 'variant_id'));
    }

    public function test_a_credit_note_for_a_dish_made_to_order_moves_no_stock_whatever_the_choices_were(): void
    {
        [$d, , , , , , $cheeseFam] = $this->burgerRecipe();
        $this->assertSame([], $this->plan([$this->soldLine($d, 1, [['mode' => 'add', 'family_id' => $cheeseFam, 'quantity' => 20]])], 'credit_note', 'in'));
    }

    public function test_a_dish_made_ahead_goes_out_of_stock_as_itself_and_takes_its_extras(): void
    {
        $d = $this->dish('Samosa');
        $filling = $this->item('Filling', '1 kg');
        $cheese = $this->item('Cheese', '1 kg');
        $fam = $this->family('Cheese', $this->g, [[$cheese, 1000]]);
        $this->stock($cheese, 10);
        $this->lines()->save($d, 10, false, null, [['variant_id' => $filling, 'quantity' => 1]]);
        $moves = $this->plan([$this->soldLine($d, 3, [['mode' => 'add', 'family_id' => $fam, 'quantity' => 10], ['mode' => 'remove', 'family_id' => $fam]])]);
        $by = array_column($moves, 'qty', 'variant_id');
        $this->assertSame([$cheese => -0.03, $d => -3.0], $by, 'the samosas themselves, and the extra cheese');
    }

    public function test_a_line_remembers_its_choices_when_the_books_copy_it_into_an_invoice(): void
    {
        $uses = [['mode' => 'add', 'family_id' => 3, 'quantity' => 20, 'variant_id' => null, 'unit_id' => null]];
        $item = (new \App\Models\Books\VoucherItem())->forceFill(['item_type' => 'product', 'is_header' => false, 'unit_factor' => 1, 'rate' => 10, 'discount_amount' => 0, 'amount' => 10, 'cost_amount' => 0, 'menu_uses' => $uses]);
        $item->setRelation('taxes', collect());
        $m = new \ReflectionMethod(\App\Services\Books\VoucherService::class, 'cloneLine');
        $m->setAccessible(true);
        $line = $m->invoke(app(\App\Services\Books\VoucherService::class), $item, 1.0, 1.0, 1.0);
        $this->assertSame($uses, $line['menu_uses']);
        $plain = (new \App\Models\Books\VoucherItem())->forceFill(['item_type' => 'product', 'is_header' => false, 'unit_factor' => 1, 'rate' => 10, 'discount_amount' => 0, 'amount' => 10, 'cost_amount' => 0]);
        $plain->setRelation('taxes', collect());
        $this->assertNull($m->invoke(app(\App\Services\Books\VoucherService::class), $plain, 1.0, 1.0, 1.0)['menu_uses']);
    }

    public function test_a_line_with_choices_is_saved_with_them_and_a_line_without_never_mentions_the_column(): void
    {
        Schema::create('voucher_items', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('parent_item_id')->nullable(); $t->integer('line_no')->default(1); $t->string('item_type'); $t->boolean('is_header')->default(false);
            foreach (['product_id', 'variant_id', 'variant_unit_id', 'service_id', 'service_variant_id', 'hamper_id', 'tax_rate_id', 'ledger_id', 'location_id', 'source_item_id', 'discount_ledger_id', 'shipping_option_id', 'gift_voucher_id', 'paid_ledger_id'] as $c) { $t->unsignedBigInteger($c)->nullable(); }
            foreach (['description', 'variant_label', 'sku', 'unit_code', 'notes', 'discount_source', 'discount_ref', 'batch_no', 'material_mode'] as $c) { $t->string($c)->nullable(); }
            foreach (['unit_factor', 'quantity', 'base_quantity', 'rate', 'discount_amount', 'amount', 'tax_amount', 'delivered_quantity', 'invoiced_quantity'] as $c) { $t->decimal($c, 18, 4)->default(0); }
            $t->decimal('tax_rate_percent', 18, 4)->nullable(); $t->decimal('cost_amount', 18, 2)->nullable();
            $t->boolean('pending_price')->default(false); $t->json('gift_meta')->nullable(); $t->date('mfg_date')->nullable(); $t->date('expiry_date')->nullable(); $t->json('menu_uses')->nullable(); $t->timestamps();
        });
        Schema::create('voucher_item_taxes', function ($t) { $t->id(); $t->unsignedBigInteger('item_id'); $t->unsignedBigInteger('tax_rate_id')->nullable(); $t->unsignedBigInteger('ledger_id')->nullable(); $t->string('label')->nullable(); $t->decimal('base_amount', 18, 2)->default(0); $t->decimal('tax_amount', 18, 2)->default(0); $t->timestamps(); });
        $svc = app(\App\Services\Books\VoucherService::class);
        $blank = new \ReflectionMethod($svc, 'blank');
        $blank->setAccessible(true);
        $make = new \ReflectionMethod($svc, 'createItem');
        $make->setAccessible(true);
        $voucher = (new \App\Models\Books\Voucher())->forceFill(['id' => 1, 'location_id' => self::BRANCH]);
        $uses = [['mode' => 'add', 'family_id' => 3, 'variant_id' => null, 'quantity' => 20.0, 'unit_id' => null]];
        $with = $make->invoke($svc, $voucher, ['menu_uses' => $uses, 'description' => 'Burger'] + $blank->invoke($svc, 'product'), 1, null);
        $without = $make->invoke($svc, $voucher, ['description' => 'Tea'] + $blank->invoke($svc, 'product'), 2, null);
        $this->assertEquals($uses, \App\Models\Books\VoucherItem::find($with->id)->menu_uses);
        $this->assertNull(\App\Models\Books\VoucherItem::find($without->id)->menu_uses);
    }
}

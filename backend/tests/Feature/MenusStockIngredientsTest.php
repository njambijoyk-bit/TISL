<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusIngredientsController;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Services\Books\BooksException;
use App\Services\Menus\Ingredients;
use Illuminate\Http\Request;
use Tests\TestCase;

/** Menus stock, step 1: ingredients that stand on their own (script 181): a base and an alternate unit of the same kind, variants with pack sizes, no product behind any of it. */
class MenusStockIngredientsTest extends TestCase
{
    use Concerns\CreatesMenusTables, Concerns\RunsSqlScripts;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createMenusTables();
        $this->runSqlScripts('181_menus_ingredients_own.sql');
    }

    private function flour(array $over = []): Ingredient
    {
        return app(Ingredients::class)->save($over + ['name' => 'Wheat flour', 'base_unit_id' => $this->g, 'alt_unit_id' => $this->kg, 'allergens' => ['wheat'], 'tags' => ['gluten'], 'variants' => [
            ['name' => 'Exe 2 kg', 'pack_size' => 2, 'pack_unit_id' => $this->kg],
            ['name' => 'Pembe 24 kg', 'pack_size' => 24, 'pack_unit_id' => $this->kg, 'track_expiry' => true],
            ['name' => 'Soko', 'code' => 'SOKO'],
        ]]);
    }

    public function test_an_ingredient_has_a_base_and_an_alternate_unit_and_variants_in_order(): void
    {
        $f = $this->flour();
        $this->assertSame([$this->g, $this->kg], [(int) $f->base_unit_id, (int) $f->alt_unit_id]);
        $this->assertSame(['Exe 2 kg', 'Pembe 24 kg', 'Soko'], $f->variants->pluck('name')->all());
        $this->assertSame([1, 2, 3], $f->variants->pluck('preference')->all());
        $this->assertTrue((bool) $f->variants[1]->track_expiry);
        $this->assertFalse((bool) $f->variants[0]->track_expiry);
    }

    public function test_a_pack_size_typed_in_kilograms_is_kept_in_the_base_unit(): void
    {
        $f = $this->flour();
        $this->assertEquals(2000, $f->variants[0]->pack_size);
        $this->assertEquals(24000, $f->variants[1]->pack_size);
        $this->assertNull($f->variants[2]->pack_size, 'a variant with no pack size has none');
    }

    public function test_a_pack_size_without_a_unit_is_in_the_base_unit(): void
    {
        $f = $this->flour(['variants' => [['name' => 'Loose', 'pack_size' => 500]]]);
        $this->assertEquals(500, $f->variants[0]->pack_size);
    }

    public function test_the_alternate_unit_must_measure_the_same_thing_and_differ_from_the_base(): void
    {
        foreach ([['alt_unit_id' => $this->l, 'must' => 'same thing'], ['alt_unit_id' => $this->g, 'must' => 'different unit']] as $c) {
            try {
                $this->flour(['alt_unit_id' => $c['alt_unit_id']]);
                $this->fail('accepted');
            } catch (BooksException $e) {
                $this->assertStringContainsString($c['must'], $e->getMessage());
            }
        }
        $this->assertSame(0, Ingredient::count());
        $this->assertNull($this->flour(['alt_unit_id' => null, 'variants' => [['name' => 'Exe']]])->alt_unit_id, 'the alternate unit is optional');
    }

    public function test_a_pack_size_can_only_be_given_in_the_base_or_alternate_unit(): void
    {
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('can be given in g or kg only');
        $this->flour(['variants' => [['name' => 'Odd', 'pack_size' => 1, 'pack_unit_id' => $this->l]]]);
    }

    public function test_names_must_be_unique_and_variants_need_a_name(): void
    {
        $this->flour();
        foreach ([
            [fn () => $this->flour(), 'already an ingredient'],
            [fn () => $this->flour(['name' => 'Self-raising', 'variants' => [['name' => 'Exe'], ['name' => 'EXE']]]), 'listed twice'],
            [fn () => $this->flour(['name' => 'Cake flour', 'variants' => [['name' => '  ']]]), 'name'],
            [fn () => $this->flour(['name' => 'Bad', 'variants' => [['name' => 'X', 'pack_size' => -1]]]), 'more than nothing'],
        ] as [$do, $says]) {
            try {
                $do();
                $this->fail("accepted: {$says}");
            } catch (BooksException $e) {
                $this->assertStringContainsString($says, $e->getMessage());
            }
        }
    }

    public function test_editing_keeps_the_variants_reorders_them_and_removes_the_ones_left_out(): void
    {
        $f = $this->flour();
        [$exe, $pembe, $soko] = $f->variants->pluck('id')->all();
        $f = app(Ingredients::class)->save(['name' => 'Wheat flour', 'base_unit_id' => $this->g, 'alt_unit_id' => $this->kg, 'variants' => [
            ['id' => $soko, 'name' => 'Soko'], ['id' => $exe, 'name' => 'Exe 2 kg', 'pack_size' => 2000], ['name' => 'Jogoo'],
        ]], $f->id);
        $this->assertSame(['Soko', 'Exe 2 kg', 'Jogoo'], $f->variants->pluck('name')->all());
        $this->assertSame([$soko, $exe], $f->variants->take(2)->pluck('id')->all(), 'the same rows, not new ones');
        $this->assertNull(IngredientItem::find($pembe), 'left out, so removed');
        $this->assertEquals(2000, IngredientItem::find($exe)->pack_size);
    }

    public function test_two_variants_can_swap_names_in_one_save(): void
    {
        $f = app(Ingredients::class)->save(['name' => 'Sugar', 'base_unit_id' => $this->g, 'variants' => [['name' => 'A'], ['name' => 'B']]]);
        [$a, $b] = $f->variants->pluck('id')->all();
        $f = app(Ingredients::class)->save(['name' => 'Sugar', 'base_unit_id' => $this->g, 'variants' => [['id' => $a, 'name' => 'B'], ['id' => $b, 'name' => 'A']]], $f->id);
        $this->assertSame(['B', 'A'], $f->variants->pluck('name')->all());
    }

    public function test_a_variant_of_another_ingredient_cannot_be_borrowed(): void
    {
        $f = $this->flour();
        $sugar = app(Ingredients::class)->save(['name' => 'Sugar', 'base_unit_id' => $this->g]);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('does not belong');
        app(Ingredients::class)->save(['name' => 'Sugar', 'base_unit_id' => $this->g, 'variants' => [['id' => $f->variants[0]->id, 'name' => 'Stolen']]], $sugar->id);
    }

    public function test_unknown_allergens_and_pick_rules_are_refused(): void
    {
        foreach ([['allergens' => ['unobtainium'], 'says' => 'Unknown allergen'], ['pick_rule' => 'random', 'says' => 'how the kitchen picks']] as $c) {
            try {
                $this->flour(['name' => 'X'.rand()] + $c);
                $this->fail('accepted');
            } catch (BooksException $e) {
                $this->assertStringContainsString($c['says'], $e->getMessage());
            }
        }
    }

    public function test_the_list_shows_pack_sizes_in_the_bigger_unit_and_the_units_to_choose_from(): void
    {
        $this->flour();
        $out = app(MenusIngredientsController::class)->index()->getData(true);
        $row = $out['ingredients'][0];
        $this->assertSame(['g', 'kg'], [$row['base_unit'], $row['alt_unit']]);
        $this->assertEquals(2, $row['variants'][0]['pack_size']);
        $this->assertSame('kg', $row['variants'][0]['pack_unit']);
        $this->assertEquals(2000, $row['variants'][0]['pack_size_base']);
        $this->assertNull($row['variants'][2]['pack_size']);
        $this->assertGreaterThanOrEqual(5, count($out['units']));
        $this->assertArrayHasKey('first_expiring', $out['pick_rules']);
    }

    public function test_the_door_saves_through_the_controller_and_answers_a_refusal_in_words(): void
    {
        $c = app(MenusIngredientsController::class);
        $ok = $c->save(Request::create('/x', 'POST', ['name' => 'Milk', 'base_unit_id' => $this->ml, 'alt_unit_id' => $this->l, 'variants' => [['name' => 'Brookside 500 ml', 'pack_size' => 0.5, 'pack_unit_id' => $this->l]]]));
        $this->assertSame(201, $ok->getStatusCode());
        $this->assertEquals(500, $ok->getData(true)['ingredient']['variants'][0]['pack_size_base']);
        $bad = $c->save(Request::create('/x', 'POST', ['name' => 'Milk', 'base_unit_id' => $this->ml]));
        $this->assertSame(422, $bad->getStatusCode());
        $this->assertStringContainsString('already an ingredient', $bad->getData(true)['message']);
    }

    public function test_an_ingredient_can_be_removed_with_its_variants(): void
    {
        $f = $this->flour();
        app(MenusIngredientsController::class)->destroy($f->id);
        $this->assertSame(0, Ingredient::count());
        $this->assertSame(0, IngredientItem::count());
    }
}

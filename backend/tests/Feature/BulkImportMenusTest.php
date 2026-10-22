<?php

namespace Tests\Feature;

use App\Models\Menus\DishRecipe;
use App\Models\Menus\Ingredient;
use App\Services\BulkImport\ImportRegistry;
use App\Services\BulkImport\ImportRunner;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Bulk import of Menus things against the real services and tables: dependencies, the module switch, all-or-nothing, and the recipe being checked like a hand-made one. */
class BulkImportMenusTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private bool $menusOn = true;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $m = $this->createMock(LicenseManager::class);
        $m->method('isLicensed')->willReturn(true);
        $m->method('isActive')->willReturnCallback(fn ($k) => $k !== 'menus' || $this->menusOn);
        $this->app->instance(LicenseManager::class, $m);
    }

    private function import(string $key, string $csv, bool $commit = true): array
    {
        $p = tempnam(sys_get_temp_dir(), 'imp').'.csv';
        file_put_contents($p, $csv);

        return app(ImportRunner::class)->run(app(ImportRegistry::class)->find($key), $p, 'csv', $commit);
    }

    public function test_ingredients_are_imported_with_variants_and_units(): void
    {
        $r = $this->import('menus.ingredients', "name,base_unit,alt_unit,pick_rule,variants,is_active\nWheat flour,g,kg,preferred,Exe;Pembe,yes\nSalt,Gram,,,,\n");
        $this->assertTrue($r['committed'], json_encode($r['errors']));
        $flour = Ingredient::where('name', 'Wheat flour')->first();
        $this->assertSame(['Exe', 'Pembe'], $flour->variants->pluck('name')->all());
        $this->assertSame($this->kg, (int) $flour->alt_unit_id);
        $this->assertTrue(Ingredient::where('name', 'Salt')->exists());
    }

    public function test_one_bad_ingredient_saves_none_and_each_problem_says_why(): void
    {
        $r = $this->import('menus.ingredients', "name,base_unit,alt_unit,allergens\nFlour,g,kg,\nSugar,furlong,,\nRice,g,l,\nNuts,g,,unobtainium\nFlour,g,,\n");
        $this->assertFalse($r['committed']);
        $this->assertSame(0, Ingredient::count());
        $codes = collect($r['errors'])->map(fn ($e) => $e['row'].':'.$e['code'])->all();
        $this->assertContains('3:unknown_reference', $codes);   // furlong
        $this->assertContains('4:rejected', $codes);             // litres are not a weight (the service's own rule)
        $this->assertContains('5:unknown_reference', $codes);   // allergen
        $this->assertContains('6:duplicate_in_file', $codes);
    }

    public function test_an_existing_ingredient_is_refused_not_overwritten(): void
    {
        $this->pantry('Flour');
        $r = $this->import('menus.ingredients', "name,base_unit\nflour,g\nSugar,g\n");
        $this->assertSame('already_exists', $r['errors'][0]['code']);
        $this->assertFalse(Ingredient::where('name', 'Sugar')->exists());
    }

    public function test_recipes_wait_for_ingredients_and_then_import_as_one_record_per_name(): void
    {
        $csv = "name,yield_qty,ingredient,quantity,unit,waste_pct\nTomato base,4,Tomatoes,500,g,5\nTomato base,4,Onions,200,g,\n";
        $r = $this->import('menus.recipes', $csv);
        $this->assertSame('dependency_missing', $r['errors'][0]['code']);

        $this->pantry('Tomatoes');
        $this->pantry('Onions');
        $r = $this->import('menus.recipes', $csv);
        $this->assertTrue($r['committed'], json_encode($r['errors']));
        $recipe = DishRecipe::where('name', 'Tomato base')->first();
        $this->assertCount(2, $recipe->lines);
        $this->assertSame(4.0, (float) $recipe->yield_qty);
    }

    public function test_a_recipe_naming_an_unknown_ingredient_or_a_wrong_unit_blames_that_row(): void
    {
        $this->pantry('Tomatoes');
        $r = $this->import('menus.recipes', "name,ingredient,quantity,unit\nGood,Tomatoes,100,g\nBad,Tomatoes,1,furlong\nWorse,Dragonfruit,1,g\n");
        $this->assertFalse($r['committed']);
        $this->assertFalse(DishRecipe::where('name', 'Good')->exists(), 'the good recipe is not kept when another fails');
        $by = collect($r['errors'])->map(fn ($e) => $e['row'].':'.$e['column'].':'.$e['code'])->all();
        $this->assertContains('3:unit:invalid_value', $by);
        $this->assertContains('4:ingredient:unknown_reference', $by);
    }

    public function test_the_preview_changes_nothing(): void
    {
        $r = $this->import('menus.ingredients', "name,base_unit\nFlour,g\n", false);
        $this->assertTrue($r['ok']);
        $this->assertSame(0, Ingredient::count());
        $this->assertSame(0, (int) DB::table('menus_ingredient_items')->count());
    }

    public function test_with_menus_switched_off_nothing_can_be_imported(): void
    {
        $this->menusOn = false;
        $r = $this->import('menus.ingredients', "name,base_unit\nFlour,g\n");
        $this->assertSame('module_off', $r['errors'][0]['code']);
        $this->assertSame(0, Ingredient::count());
    }
}

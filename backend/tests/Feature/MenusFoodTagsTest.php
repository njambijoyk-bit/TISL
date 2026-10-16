<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusFoodTagsController;
use App\Models\Menus\FoodTag;
use App\Services\Books\BooksException;
use App\Services\Menus\DietBadges;
use App\Services\Menus\FoodTagCatalog;
use App\Services\Menus\FoodTags;
use App\Services\Menus\FoodTagService;
use App\Services\Menus\Ingredients;
use Illuminate\Http\Request;
use Tests\TestCase;

/** Menus, Allergens (script 186): the allergens and "what it is" tags are rows an admin keeps, each saying which diet badges it rules out. */
class MenusFoodTagsTest extends TestCase
{
    use Concerns\CreatesDishTables;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createDishTables();
        $this->runSqlScripts('186_menus_food_tags.sql');
    }

    private function svc(): FoodTagService
    {
        return app(FoodTagService::class);
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

    public function test_with_no_rows_yet_the_lists_menus_always_had_are_used(): void
    {
        $this->assertSame(0, FoodTag::count());
        $this->assertSame(14, count(FoodTags::allergens()));
        $this->assertSame(11, count(FoodTags::tags()));
        $this->assertSame('Wheat / gluten', FoodTags::allergens()['wheat']);
        $this->assertSame(['vegetarian', 'vegan', 'halal_friendly', 'gluten_free', 'dairy_free', 'nut_free'], DietBadges::for([], []));
        $this->assertSame(['halal_friendly', 'gluten_free', 'dairy_free', 'nut_free'], DietBadges::for([], ['meat']));
    }

    public function test_the_script_puts_in_exactly_the_default_rows(): void
    {
        $sql = file_get_contents(base_path('database/sql/186_menus_food_tags.sql'));
        preg_match_all("/SELECT '(allergen|tag)'(?: AS kind)?, '([a-z_]+)'(?: AS code)?, '([^']+)'(?: AS label)?, (JSON_ARRAY\(([^)]*)\)|NULL)/", $sql, $m, PREG_SET_ORDER);
        $fromScript = array_map(fn ($r) => [$r[1], $r[2], $r[3], isset($r[5]) && $r[5] !== '' ? array_map(fn ($x) => trim($x, " '"), explode(',', $r[5])) : []], $m);
        $this->assertSame(FoodTags::DEFAULTS, $fromScript, 'the script and FoodTags::DEFAULTS say the same');
        $this->assertSame(25, $this->svc()->seedDefaults());
        $this->assertSame(0, $this->svc()->seedDefaults(), 'twice puts in nothing more');
    }

    public function test_once_rows_exist_they_are_what_the_lists_are(): void
    {
        $this->svc()->seedDefaults();
        $this->svc()->delete(FoodTag::where('kind', 'allergen')->where('code', 'lupin')->first());
        $this->assertArrayNotHasKey('lupin', FoodTags::allergens());
        $this->assertCount(13, FoodTags::allergens());
    }

    public function test_the_diets_a_dish_suits_follow_the_rules_kept_with_each_tag(): void
    {
        $this->svc()->seedDefaults();
        $this->assertSame(['halal_friendly', 'gluten_free', 'dairy_free', 'nut_free'], DietBadges::for(['fish'], []));
        $this->assertSame(['vegetarian', 'gluten_free', 'nut_free', 'halal_friendly'], array_values(array_intersect(['vegetarian', 'gluten_free', 'nut_free', 'halal_friendly'], DietBadges::for(['milk', 'eggs'], ['dairy', 'egg']))));
        $gelatine = $this->svc()->save(['kind' => 'tag', 'label' => 'Gelatine', 'rules_out' => ['vegetarian', 'vegan']]);
        $this->assertSame('gelatine', $gelatine->code);
        $this->assertNotContains('vegetarian', DietBadges::for([], ['gelatine']), 'a tag the admin made counts like the built-in ones');
        $this->assertContains('halal_friendly', DietBadges::for([], ['gelatine']));
        $this->svc()->save(['label' => 'Gelatine', 'rules_out' => ['vegetarian', 'vegan', 'halal_friendly']], $gelatine);
        $this->assertNotContains('halal_friendly', DietBadges::for([], ['gelatine']), 'changing the rules changes every dish at once');
    }

    public function test_a_new_allergen_can_be_put_on_an_ingredient_and_an_unknown_one_is_refused(): void
    {
        $this->svc()->seedDefaults();
        $this->svc()->save(['kind' => 'allergen', 'label' => 'Kiwi fruit']);
        $ing = fn (array $over) => app(Ingredients::class)->save($over + ['name' => 'Smoothie mix', 'base_unit_id' => $this->g, 'variants' => [['name' => 'Mix']]]);
        $this->assertSame(['kiwi_fruit'], $ing(['allergens' => ['kiwi_fruit']])->allergens);
        $this->fails(fn () => $ing(['name' => 'Other', 'allergens' => ['mango']]), 'Unknown allergen: mango');
    }

    public function test_a_tag_that_ingredients_carry_cannot_be_removed_until_it_is_taken_off(): void
    {
        $this->svc()->seedDefaults();
        $milk = FoodTag::where('kind', 'allergen')->where('code', 'milk')->first();
        $i = app(Ingredients::class)->save(['name' => 'Butter', 'base_unit_id' => $this->g, 'allergens' => ['milk'], 'variants' => [['name' => 'Block']]]);
        \Illuminate\Support\Facades\DB::table('menus_dishes')->insert(['name' => 'Toast', 'slug' => 'toast', 'allergens_override' => json_encode(['milk']), 'is_active' => 1]);
        $this->fails(fn () => $this->svc()->delete($milk), 'used by 1 ingredient and 1 dish that declares their own');
        $this->assertSame(['ingredients' => 1, 'dishes' => 1], $this->svc()->usage($milk));
        app(Ingredients::class)->save(['name' => 'Butter', 'base_unit_id' => $this->g, 'allergens' => [], 'variants' => [['id' => $i->variants->first()->id, 'name' => 'Block']]], $i->id);
        \Illuminate\Support\Facades\DB::table('menus_dishes')->update(['allergens_override' => null]);
        $this->svc()->delete($milk);
        $this->assertSame(0, FoodTag::where('code', 'milk')->count());
    }

    public function test_names_codes_and_rules_are_checked(): void
    {
        $this->svc()->seedDefaults();
        $this->fails(fn () => $this->svc()->save(['kind' => 'tag', 'label' => '  ']), 'Give it a name');
        $this->fails(fn () => $this->svc()->save(['kind' => 'other', 'label' => 'X']), 'allergen or what the ingredient is');
        $this->fails(fn () => $this->svc()->save(['kind' => 'tag', 'label' => 'Meat']), 'already one called Meat');
        $this->fails(fn () => $this->svc()->save(['kind' => 'tag', 'label' => 'MEAT']), 'already one called');
        $this->fails(fn () => $this->svc()->save(['kind' => 'tag', 'label' => 'Offal', 'rules_out' => ['kosher']]), 'Unknown diet: kosher');
        $this->svc()->save(['kind' => 'allergen', 'label' => 'Meat']);   // the same words in the other list are fine
        $a = $this->svc()->save(['kind' => 'tag', 'label' => 'Sweet & sour']);
        $b = $this->svc()->save(['kind' => 'allergen', 'label' => 'Sweet and sour']);
        $this->assertSame(['sweet_sour', 'sweet_and_sour'], [$a->code, $b->code]);
        $c = $this->svc()->save(['kind' => 'tag', 'label' => 'Sweet! sour']);
        $this->assertSame('sweet_sour_2', $c->code, 'a code is never reused within a list');
        $renamed = $this->svc()->save(['label' => 'Sweet and sour glaze'], $a);
        $this->assertSame(['sweet_sour', 'Sweet and sour glaze'], [$renamed->code, $renamed->label], 'a rename does not change the code that ingredients keep');
    }

    public function test_the_order_can_be_changed_and_new_ones_come_last(): void
    {
        $this->svc()->seedDefaults();
        $ids = FoodTag::where('kind', 'tag')->orderBy('sort_order')->pluck('id')->all();
        $this->svc()->reorder('tag', array_reverse($ids));
        $this->assertSame('spicy', array_key_first(FoodTags::tags()));
        $new = $this->svc()->save(['kind' => 'tag', 'label' => 'Smoked']);
        $this->assertSame('smoked', array_key_last(FoodTags::tags()));
        $this->assertSame(array_key_first(FoodTags::allergens()), 'milk', 'the other list is untouched');
        $this->assertGreaterThan(0, $new->sort_order);
    }

    public function test_the_page_reads_and_writes_through_the_controller(): void
    {
        $c = app(MenusFoodTagsController::class);
        $this->assertTrue($c->index()->getData(true)['ready']);
        $this->assertSame(0, count($c->index()->getData(true)['allergens']));
        $this->svc()->seedDefaults();
        $out = $c->index()->getData(true);
        $this->assertSame([14, 11], [count($out['allergens']), count($out['tags'])]);
        $this->assertSame(['vegan', 'dairy_free'], $out['allergens'][0]['rules_out']);
        $this->assertSame(201, $c->store(Request::create('/x', 'POST', ['kind' => 'tag', 'label' => 'Offal', 'rules_out' => ['halal_friendly']]))->status());
        $bad = $c->store(Request::create('/x', 'POST', ['kind' => 'tag', 'label' => 'Offal']));
        $this->assertSame([422, 'There is already one called Offal.'], [$bad->status(), $bad->getData(true)['message']]);
        $id = FoodTag::where('code', 'offal')->value('id');
        $this->assertSame(200, $c->update(Request::create('/x', 'PUT', ['label' => 'Offal and organ meat']), $id)->status());
        $this->assertSame('Offal and organ meat', FoodTags::tags()['offal']);
        $this->assertSame(200, $c->destroy($id)->status());
        $this->assertSame(11, count(FoodTags::tags()));
        $this->assertTrue(FoodTagCatalog::installed());
    }
}

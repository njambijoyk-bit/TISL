<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusIngredientController;
use App\Models\Menus\IngredientFamily;
use App\Models\Menus\IngredientVariant;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use App\Services\Menus\IngredientFamilies;
use App\Services\Menus\IngredientResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus step 1.1: ingredient families ("Wheat flour") and the stock items the kitchen takes them from. */
class MenusIngredientsTest extends TestCase
{
    private int $g;
    private int $kg;
    private int $each;
    private const BRANCH = 1;

    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('units_of_measure', function ($t) { $t->id(); $t->string('code'); $t->string('name'); $t->string('dimension'); $t->string('unit_system')->nullable(); $t->decimal('to_base_factor', 18, 10)->default(1); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->boolean('is_for_sale')->default(true); $t->boolean('is_visible')->default(true); $t->softDeletes(); $t->timestamps(); });
        Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('name')->nullable(); $t->string('sku')->nullable(); $t->decimal('net_content_qty', 18, 4)->nullable(); $t->unsignedBigInteger('net_content_unit_id')->nullable(); $t->timestamps(); });
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); $t->boolean('is_active')->default(true); $t->boolean('is_default')->default(false); });
        Schema::create('stock_batches', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->string('status')->default('active'); $t->date('expiry_date')->nullable(); $t->decimal('unit_cost', 18, 4)->default(0); });
        Schema::create('stock_batch_balances', function ($t) { $t->unsignedBigInteger('batch_id'); $t->unsignedBigInteger('location_id'); $t->decimal('quantity', 18, 4)->default(0); });
        Schema::create('menus_ingredient_families', function ($t) { $t->id(); $t->string('name')->unique(); $t->unsignedBigInteger('unit_id'); $t->string('pick_rule', 16)->default('preferred'); $t->json('allergens')->nullable(); $t->json('tags')->nullable(); $t->string('notes')->nullable(); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('menus_ingredient_variants', function ($t) { $t->id(); $t->unsignedBigInteger('family_id'); $t->unsignedBigInteger('variant_id')->unique(); $t->unsignedSmallInteger('rank')->default(1); $t->decimal('units_per_stock', 18, 6)->default(1); $t->boolean('is_allowed')->default(true); $t->boolean('sell_retail')->default(false); $t->timestamps(); });
        DB::table('locations')->insert(['id' => self::BRANCH, 'name' => 'Kitchen', 'is_default' => true]);
        $this->g = DB::table('units_of_measure')->insertGetId(['code' => 'g', 'name' => 'Gram', 'dimension' => 'mass', 'to_base_factor' => 1]);
        $this->kg = DB::table('units_of_measure')->insertGetId(['code' => 'kg', 'name' => 'Kilogram', 'dimension' => 'mass', 'to_base_factor' => 1000]);
        $this->each = DB::table('units_of_measure')->insertGetId(['code' => 'each', 'name' => 'Each', 'dimension' => 'count', 'to_base_factor' => 1]);
    }

    private function item(string $product, ?string $variant = null, array $extra = []): int
    {
        $p = DB::table('products')->where('name', $product)->value('id') ?? DB::table('products')->insertGetId(['name' => $product]);

        return DB::table('product_variants')->insertGetId(['product_id' => $p, 'name' => $variant] + $extra);
    }

    private function stock(int $variant, float $qty, float $cost = 100, ?string $expiry = null, string $status = 'active'): int
    {
        $b = DB::table('stock_batches')->insertGetId(['variant_id' => $variant, 'status' => $status, 'expiry_date' => $expiry, 'unit_cost' => $cost]);
        DB::table('stock_batch_balances')->insert(['batch_id' => $b, 'location_id' => self::BRANCH, 'quantity' => $qty]);

        return $b;
    }

    private function flour(string $rule = 'preferred'): array
    {
        $exe = $this->item('Exe flour', '2 kg');
        $pembe = $this->item('Pembe flour', '24 kg');
        $brown = $this->item('Brown flour', 'organic 1 kg');
        $f = app(IngredientFamilies::class)->save(['name' => 'Wheat flour', 'unit_id' => $this->g, 'pick_rule' => $rule, 'allergens' => ['wheat'], 'variants' => [
            ['variant_id' => $exe, 'units_per_stock' => 2000], ['variant_id' => $pembe, 'units_per_stock' => 24000], ['variant_id' => $brown, 'units_per_stock' => 1000],
        ]]);

        return [$f, $exe, $pembe, $brown];
    }

    private function plan(IngredientFamily $f, float $need): array
    {
        return app(IngredientResolver::class)->plan($f->fresh(), $need, self::BRANCH);
    }

    // ------------------------------------------------------------ the kitchen picks

    public function test_the_preferred_item_is_used_first_and_the_amount_is_in_its_own_stock_unit(): void
    {
        [$f, $exe, $pembe] = $this->flour();
        $this->stock($exe, 10);        // ten 2 kg packs
        $this->stock($pembe, 1);
        $plan = $this->plan($f, 500);   // 500 g = a quarter of a 2 kg pack
        $this->assertSame([['variant_id' => $exe, 'stock_qty' => 0.25, 'family_qty' => 500.0]], $plan);
    }

    public function test_when_the_preferred_item_runs_out_the_next_one_covers_the_rest(): void
    {
        [$f, $exe, $pembe, $brown] = $this->flour();
        $this->stock($exe, 1);          // 2000 g
        $this->stock($pembe, 0.5);      // 12000 g
        $plan = $this->plan($f, 5000);
        $this->assertSame([$exe, $pembe], array_column($plan, 'variant_id'));
        $this->assertSame([1.0, 0.125], array_column($plan, 'stock_qty'));
        $this->assertSame(5000.0, array_sum(array_column($plan, 'family_qty')));
        $this->assertNotContains($brown, array_column($plan, 'variant_id'));
    }

    public function test_not_enough_in_total_is_refused_with_the_amounts(): void
    {
        [$f, $exe] = $this->flour();
        $this->stock($exe, 1);
        try {
            $this->plan($f, 2500);
            $this->fail('should be refused');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Not enough Wheat flour: need 2500 g, have 2000', $e->getMessage());
        }
    }

    public function test_an_item_marked_not_allowed_is_never_used(): void
    {
        [$f, $exe, $pembe] = $this->flour();
        $this->stock($exe, 1);
        $this->stock($pembe, 1);
        IngredientVariant::where('variant_id', $exe)->update(['is_allowed' => false]);
        $this->assertSame([$pembe], array_column($this->plan($f, 100), 'variant_id'));
    }

    public function test_stock_that_may_not_be_used_does_not_count(): void
    {
        [$f, $exe, $pembe] = $this->flour();
        $this->stock($exe, 5, 100, today()->subDay()->toDateString());   // expired yesterday
        $this->stock($exe, 5, 100, null, 'quarantined');
        $this->stock($exe, 5, 100, null, 'recalled');
        $this->stock($pembe, 1);
        $this->assertSame([$pembe], array_column($this->plan($f, 100), 'variant_id'));
        $this->assertSame(24000.0, app(IngredientResolver::class)->available($f, self::BRANCH));
    }

    public function test_the_cheapest_rule_goes_by_cost_per_family_unit_not_per_pack(): void
    {
        [$f, $exe, $pembe, $brown] = $this->flour('cheapest');
        $this->stock($exe, 5, 300);      // 0.15 per g
        $this->stock($pembe, 1, 2400);   // 0.10 per g: a bigger, dearer pack that is cheaper per gram
        $this->stock($brown, 5, 200);    // 0.20 per g
        $this->assertSame([$pembe], array_column($this->plan($f, 1000), 'variant_id'));
        $this->assertEqualsWithDelta(0.10, app(IngredientResolver::class)->unitCost($f->fresh(), self::BRANCH), 0.0000001);
    }

    public function test_the_first_expiring_rule_uses_what_goes_off_first_and_undated_stock_last(): void
    {
        [$f, $exe, $pembe, $brown] = $this->flour('first_expiring');
        $this->stock($exe, 5);                                              // no date
        $this->stock($pembe, 5, 100, today()->addDays(30)->toDateString());
        $this->stock($brown, 5, 100, today()->addDays(3)->toDateString());
        $this->assertSame([$brown], array_column($this->plan($f, 100), 'variant_id'));
        $f->update(['pick_rule' => 'preferred']);
        $this->assertSame([$exe], array_column($this->plan($f, 100), 'variant_id'), 'the same shelf, the preferred rule');
    }

    public function test_the_cost_only_looks_at_stock_that_could_be_used_here(): void
    {
        [$f, $exe] = $this->flour();
        $this->stock($exe, 5, 100);
        $this->stock($exe, 5, 10, null, 'quarantined');        // cheap, but held
        DB::table('locations')->insert(['id' => 2, 'name' => 'Cafe']);
        $b = DB::table('stock_batches')->insertGetId(['variant_id' => $exe, 'status' => 'active', 'unit_cost' => 1]);
        DB::table('stock_batch_balances')->insert(['batch_id' => $b, 'location_id' => 2, 'quantity' => 9]);   // cheap, but at the cafe
        $this->assertEqualsWithDelta(0.05, app(IngredientResolver::class)->unitCost($f->fresh(), self::BRANCH), 0.0000001);
        $this->assertEqualsWithDelta(0.0005, app(IngredientResolver::class)->unitCost($f->fresh(), 2), 0.0000001);
    }

    public function test_it_is_the_branchs_own_shelf(): void
    {
        [$f, $exe] = $this->flour();
        $this->stock($exe, 5);
        DB::table('locations')->insert(['id' => 2, 'name' => 'Cafe']);
        $this->expectException(BooksException::class);
        app(IngredientResolver::class)->plan($f->fresh(), 100, 2);
    }

    // ------------------------------------------------------------ making families

    public function test_the_items_keep_the_order_they_were_given_in_as_their_preference(): void
    {
        [$f, $exe, $pembe, $brown] = $this->flour();
        $this->assertSame([$exe, $pembe, $brown], $f->variants->pluck('variant_id')->map(fn ($i) => (int) $i)->all());
        $this->assertSame([1, 2, 3], $f->variants->pluck('rank')->map(fn ($i) => (int) $i)->all());
        $f = app(IngredientFamilies::class)->save(['name' => 'Wheat flour', 'unit_id' => $this->g, 'variants' => [['variant_id' => $brown, 'units_per_stock' => 1000], ['variant_id' => $exe, 'units_per_stock' => 2000]]], $f->id);
        $this->assertSame([$brown, $exe], $f->variants->pluck('variant_id')->map(fn ($i) => (int) $i)->all());
        $this->assertSame(0, IngredientVariant::where('variant_id', $pembe)->count(), 'an item left out of the list is taken out of the family');
    }

    public function test_an_item_belongs_to_one_family_only(): void
    {
        [, $exe] = $this->flour();
        $this->expectExceptionMessage('is already in Wheat flour');
        app(IngredientFamilies::class)->save(['name' => 'Bread flour', 'unit_id' => $this->g, 'variants' => [['variant_id' => $exe, 'units_per_stock' => 2000]]]);
    }

    public function test_bad_input_is_refused_with_a_reason_a_person_can_act_on(): void
    {
        $svc = app(IngredientFamilies::class);
        $one = $this->item('Salt', '1 kg');
        $cases = [
            'name' => [['name' => '  ', 'unit_id' => $this->g], 'Give the ingredient a name'],
            'unit' => [['name' => 'Salt', 'unit_id' => 9999], 'Choose the unit recipes use'],
            'rule' => [['name' => 'Salt', 'unit_id' => $this->g, 'pick_rule' => 'random'], 'Choose how the kitchen picks'],
            'allergen' => [['name' => 'Salt', 'unit_id' => $this->g, 'allergens' => ['milk', 'glitter']], 'Unknown allergen: glitter'],
            'tag' => [['name' => 'Salt', 'unit_id' => $this->g, 'tags' => ['meat', 'unicorn']], 'Unknown tag: unicorn'],
            'zero' => [['name' => 'Salt', 'unit_id' => $this->g, 'variants' => [['variant_id' => $one, 'units_per_stock' => 0]]], 'Say how much'],
            'twice' => [['name' => 'Salt', 'unit_id' => $this->g, 'variants' => [['variant_id' => $one, 'units_per_stock' => 1000], ['variant_id' => $one, 'units_per_stock' => 1000]]], 'listed twice'],
            'missing' => [['name' => 'Salt', 'unit_id' => $this->g, 'variants' => [['variant_id' => 9999, 'units_per_stock' => 1]]], 'not in the catalogue'],
        ];
        foreach ($cases as $label => [$input, $message]) {
            try {
                $svc->save($input);
                $this->fail("{$label} should have been refused");
            } catch (BooksException $e) {
                $this->assertStringContainsString($message, $e->getMessage(), $label);
            }
        }
        $this->assertSame(0, IngredientFamily::count());
        $svc->save(['name' => 'Salt', 'unit_id' => $this->g]);
        $this->expectExceptionMessage('There is already an ingredient called Salt');
        $svc->save(['name' => 'Salt', 'unit_id' => $this->g]);
    }

    public function test_allergens_and_tags_are_kept_in_a_steady_order_without_repeats(): void
    {
        $f = app(IngredientFamilies::class)->save(['name' => 'Cheese', 'unit_id' => $this->g, 'allergens' => ['soy', 'MILK', 'milk'], 'tags' => ['dairy', 'spicy', 'dairy']]);
        $this->assertSame(['milk', 'soy'], $f->allergens);
        $this->assertSame(['dairy', 'spicy'], $f->tags);
    }

    public function test_ingredients_are_hidden_from_the_shop_unless_they_are_also_sold(): void
    {
        $hidden = $this->item('Cooking oil', '5 l');
        $retail = $this->item('Spice jar', '100 g');
        app(IngredientFamilies::class)->save(['name' => 'Oil', 'unit_id' => $this->g, 'variants' => [['variant_id' => $hidden, 'units_per_stock' => 5000]]]);
        app(IngredientFamilies::class)->save(['name' => 'Spice', 'unit_id' => $this->g, 'variants' => [['variant_id' => $retail, 'units_per_stock' => 100, 'sell_retail' => true]]]);
        $oil = DB::table('products')->where('name', 'Cooking oil')->first();
        $spice = DB::table('products')->where('name', 'Spice jar')->first();
        $this->assertSame([0, 0], [(int) $oil->is_for_sale, (int) $oil->is_visible]);
        $this->assertSame([1, 1], [(int) $spice->is_for_sale, (int) $spice->is_visible]);
    }

    public function test_a_product_that_has_a_variant_that_is_not_an_ingredient_stays_in_the_shop(): void
    {
        $bulk = $this->item('Sugar', '50 kg');
        $this->item('Sugar', '1 kg retail pack');
        app(IngredientFamilies::class)->save(['name' => 'Sugar', 'unit_id' => $this->g, 'variants' => [['variant_id' => $bulk, 'units_per_stock' => 50000]]]);
        $this->assertSame(1, (int) DB::table('products')->where('name', 'Sugar')->value('is_for_sale'));
    }

    public function test_how_much_a_pack_holds_can_be_worked_out_from_its_net_content(): void
    {
        $pack = $this->item('Rice', '2 kg', ['net_content_qty' => 2, 'net_content_unit_id' => $this->kg]);
        $none = $this->item('Rice', 'loose');
        $eggs = $this->item('Eggs', 'tray', ['net_content_qty' => 30, 'net_content_unit_id' => $this->each]);
        $svc = app(IngredientFamilies::class);
        $g = UnitOfMeasure::find($this->g);
        $this->assertSame(2000.0, $svc->suggestUnitsPerStock($pack, $g));
        $this->assertNull($svc->suggestUnitsPerStock($none, $g));
        $this->assertNull($svc->suggestUnitsPerStock($eggs, $g), 'a tray of eggs does not say how many grams it is');
    }

    public function test_removing_an_ingredient_leaves_the_stock_items_alone(): void
    {
        [$f, $exe] = $this->flour();
        app(IngredientFamilies::class)->delete($f);
        $this->assertSame(0, IngredientFamily::count() + IngredientVariant::count());
        $this->assertSame(1, DB::table('product_variants')->where('id', $exe)->count());
    }

    // ------------------------------------------------------------ the screen's API

    public function test_the_list_shows_what_is_on_the_shelf_and_what_it_costs(): void
    {
        [$f, $exe] = $this->flour();
        $this->stock($exe, 3, 400);
        $data = app(MenusIngredientController::class)->index(Request::create('/x', 'GET'))->getData(true);
        $row = $data['families'][0];
        $this->assertEquals(['Wheat flour', 'g', 6000, 0.2], [$row['name'], $row['unit'], $row['on_hand'], $row['unit_cost']]);
        $this->assertSame('Exe flour — 2 kg', $row['variants'][0]['name']);
        $this->assertArrayHasKey('wheat', $data['allergens']);
        $this->assertArrayHasKey('first_expiring', $data['pick_rules']);
    }

    public function test_the_save_endpoint_answers_in_plain_words(): void
    {
        $item = $this->item('Milk', '1 l');
        $c = app(MenusIngredientController::class);
        $ok = $c->save(Request::create('/x', 'POST', ['name' => 'Milk', 'unit_id' => $this->g, 'allergens' => ['milk'], 'variants' => [['variant_id' => $item, 'units_per_stock' => 1000]]]));
        $this->assertSame(201, $ok->status());
        $again = $c->save(Request::create('/x', 'POST', ['name' => 'Milk', 'unit_id' => $this->g]));
        $this->assertSame(422, $again->status());
        $this->assertStringContainsString('already an ingredient called Milk', $again->getData(true)['message']);
        $edit = $c->save(Request::create('/x', 'PUT', ['name' => 'Fresh milk', 'unit_id' => $this->g, 'variants' => [['variant_id' => $item, 'units_per_stock' => 1000]]]), IngredientFamily::first()->id);
        $this->assertSame([200, 'Fresh milk'], [$edit->status(), IngredientFamily::first()->name]);
    }
}

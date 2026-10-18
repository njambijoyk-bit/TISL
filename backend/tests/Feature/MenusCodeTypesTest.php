<?php

namespace Tests\Feature;

use App\Models\Menus\DishRecipe;
use App\Services\Codes\CodeException;
use App\Services\Codes\Items\CodeCatalogue;
use App\Services\Codes\Items\LabelService;
use App\Services\Codes\Items\MenusCodeItems;
use App\Services\Codes\Linear\Gs1;
use App\Services\Licensing\LicenseManager;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\PrepProduction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The Codes page for the kitchen, build step 9.1: what Menus can put a code on, the code each carries, and finding it again from a scan. */
class MenusCodeTypesTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private CodeCatalogue $items;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $this->runSqlScripts('193_menus_config_foundation.sql', '198_menus_prepared_food.sql', '199_menus_prepared_waste_counts.sql');
        DB::table('ledgers')->insert(['name' => 'Prepared Food Inventory', 'group_id' => DB::table('ledger_groups')->where('name', 'Stock-in-hand')->value('id')]);
        Schema::create('menus_chefs', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->default(0); $t->string('display_name'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); });
        if (! Schema::hasTable('products')) {
            Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('currency_id')->nullable(); $t->softDeletes(); });
        }
        if (! Schema::hasTable('product_variants')) {
            Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('sku')->nullable(); $t->string('barcode', 64)->nullable(); $t->string('name')->nullable(); $t->softDeletes(); });
        }
        if (! Schema::hasTable('product_variant_units')) {
            Schema::create('product_variant_units', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('unit_id')->nullable(); $t->string('role')->default('base'); $t->decimal('contains_qty', 12, 4)->nullable(); $t->decimal('base_factor', 14, 4)->nullable(); $t->decimal('price', 12, 2)->nullable(); $t->string('barcode', 64)->nullable(); });
        }
        if (! Schema::hasTable('inventory_items')) {
            Schema::create('inventory_items', function ($t) { $t->id(); $t->string('name'); });
        }
        if (! Schema::hasTable('inventory_instances')) {
            Schema::create('inventory_instances', function ($t) { $t->id(); $t->unsignedBigInteger('item_id'); $t->string('serial_number')->nullable(); $t->string('asset_tag')->nullable(); $t->string('barcode')->nullable(); $t->softDeletes(); });
        }
        if (! Schema::hasTable('stock_batches')) {
            Schema::create('stock_batches', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->string('batch_no')->nullable(); $t->date('expiry_date')->nullable(); });
        }
        if (! Schema::hasTable('code_settings')) {
            Schema::create('code_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        }
        if (! Schema::hasTable('code_sequences')) {
            Schema::create('code_sequences', function ($t) { $t->string('name', 40)->primary(); $t->unsignedBigInteger('next_value')->default(1); });
        }
        if (! Schema::hasTable('code_aliases')) {
            Schema::create('code_aliases', function ($t) { $t->id(); $t->string('item_type', 20); $t->unsignedBigInteger('item_id'); $t->string('code', 80); $t->string('reason')->nullable(); $t->unsignedBigInteger('retired_by')->nullable(); $t->timestamps(); });
        }
        if (! Schema::hasTable('code_prints')) {
            Schema::create('code_prints', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('template')->nullable(); $t->string('size')->nullable(); $t->unsignedInteger('label_count')->default(0); $t->json('items')->nullable(); $t->timestamps(); });
        }
        $this->licence(true);
        $this->pantry('Maize flour', 10000, 0.1);
    }

    private function licence(bool $on): void
    {
        $this->app->instance(LicenseManager::class, new class($on) extends LicenseManager {
            public function __construct(private bool $on)
            {
            }

            public function isActive(string $moduleKey): bool
            {
                return $this->on;
            }
        });
        $this->items = new CodeCatalogue();
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (CodeException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected: {$part}");
    }

    private function ugali(): DishRecipe
    {
        $flour = (int) DB::table('menus_ingredients')->where('name', 'Maize flour')->value('id');

        return app(DishRecipes::class)->saveStandalone(['name' => 'Ugali', 'yield_qty' => 2, 'yield_unit_id' => $this->kg, 'lines' => [['ingredient_id' => $flour, 'quantity' => 800]]]);
    }

    public function test_the_kitchens_types_are_on_offer_only_while_menus_is_on(): void
    {
        $this->assertSame(['dish', 'recipe', 'prep_lot', 'stock_lot', 'kitchen_item'], array_keys(MenusCodeItems::offered()));
        $dish = $this->dish('Pancakes', 120);
        $this->licence(false);
        $this->assertSame([], MenusCodeItems::offered());
        $this->assertSame([0, null], [$this->items->list('dish')['total'], $this->items->find('dish', $dish->id)], 'nothing is listed or found while it is off');
        $this->assertSame([], $this->items->lookup('DSH'.str_pad((string) $dish->id, 8, '0', STR_PAD_LEFT)));
    }

    public function test_a_dish_carries_a_code_made_from_its_number_and_a_scan_finds_it(): void
    {
        $d = $this->dish('Pancakes', 120);
        $row = $this->items->list('dish')['data'][0];
        $this->assertSame(['dish', 'Pancakes', true, 120.0, 'DSH'.str_pad((string) $d->id, 8, '0', STR_PAD_LEFT)], [$row['type'], $row['label'], $row['derived'], $row['price'], $row['code']]);

        $hit = $this->items->lookup(strtolower($row['code']));
        $this->assertSame([1, 'dish', $d->id], [count($hit), $hit[0]['type'], $hit[0]['id']], 'any way it is typed');
        $this->assertSame($row['code'], $this->items->generate('dish', $d->id), 'giving it a code just says what it is');
        $this->fails(fn () => $this->items->setCode('dish', $d->id, 'MYDISH', null), 'made from the number');
        $this->assertSame([1, 0], [$this->items->list('dish', ['q' => 'Pancake'])['total'], $this->items->list('dish', ['q' => 'waffle'])['total']], 'a search by name');
    }

    public function test_a_recipe_of_its_own_and_a_dishs_recipe_are_each_named(): void
    {
        $own = $this->ugali();
        $dish = $this->dish('Pancakes', 120, [['Maize flour', 100]]);
        $names = array_column($this->items->list('recipe')['data'], 'label');
        $this->assertContains('Ugali', $names);
        $this->assertContains('Pancakes', $names, 'a dish\'s recipe takes the dish\'s name');
        $row = collect($this->items->list('recipe')['data'])->firstWhere('label', 'Ugali');
        $this->assertSame('RCP'.str_pad((string) $own->id, 8, '0', STR_PAD_LEFT), $row['code']);
        $this->assertSame('recipe', $this->items->lookup($row['code'])[0]['type']);
    }

    public function test_a_prepared_batch_and_an_ingredient_lot_carry_codes_with_their_dates(): void
    {
        $run = app(PrepProduction::class)->run($this->ugali(), 1, 2.0, ['date' => '2026-10-17', 'expiry_date' => '2026-10-20']);
        $lot = \App\Models\Menus\PrepLot::first();
        $row = $this->items->find('prep_lot', $lot->id);
        $this->assertSame(['PBL'.str_pad((string) $lot->id, 8, '0', STR_PAD_LEFT), '2026-10-20', true], [$row['code'], $row['expiry'], str_contains($row['label'], 'Ugali') && str_contains($row['label'], 'use by 2026-10-20')]);
        $this->assertSame('prep_lot', $this->items->lookup($row['code'])[0]['type']);

        $batch = \App\Models\Menus\StockBatch::first();
        $b = $this->items->find('stock_lot', $batch->id);
        $this->assertSame(['ILT'.str_pad((string) $batch->id, 8, '0', STR_PAD_LEFT), true], [$b['code'], str_contains($b['label'], 'Maize flour')]);
        $this->assertSame('stock_lot', $this->items->lookup($b['code'])[0]['type']);
        $this->assertNotNull($run);
    }

    public function test_a_kitchen_stock_item_stores_its_code_and_a_suppliers_barcode_can_replace_it_keeping_the_old_one(): void
    {
        $coke = $this->makeIngredient('Coke', $this->each, null, [['name' => 'Coke 500ml']], 'preferred', []);
        $id = $this->itemId('Coke 500ml');
        $this->assertNull($this->items->find('kitchen_item', $id)['code']);
        $this->assertSame(1, $this->items->list('kitchen_item', ['missing' => true, 'q' => 'Coke'])['total'], 'listed among those with no code');

        $made = $this->items->generate('kitchen_item', $id);
        $this->assertSame('KIT'.str_pad((string) $id, 8, '0', STR_PAD_LEFT), $made);
        $this->assertSame($made, DB::table('menus_ingredient_items')->where('id', $id)->value('code'));

        $body = '600123456789';
        $barcode = $body.Gs1::checkDigit($body);
        $this->items->setCode('kitchen_item', $id, $barcode, null, 'Supplier barcode');
        $this->assertSame($barcode, $this->items->lookup($barcode)[0]['code']);
        $old = $this->items->lookup($made)[0];
        $this->assertSame([true, $barcode], [$old['retired'], $old['code']], 'labels already stuck on crates still scan, marked old');
        $this->fails(fn () => $this->items->setCode('kitchen_item', $id, '6001234567890', null), 'check digit');
        $this->assertNotNull($coke);
    }

    public function test_the_shapes_made_from_a_number_are_kept_for_what_they_belong_to(): void
    {
        $d = $this->dish('Pancakes', 120);
        $this->makeIngredient('Coke', $this->each, null, [['name' => 'Coke 500ml']], 'preferred', []);
        $id = $this->itemId('Coke 500ml');
        $this->fails(fn () => $this->items->setCode('kitchen_item', $id, 'DSH'.str_pad((string) $d->id, 8, '0', STR_PAD_LEFT), null), 'already used');
        $this->fails(fn () => $this->items->setCode('kitchen_item', $id, 'PBL00000007', null), 'already used');
    }

    public function test_a_label_for_a_dish_is_a_qr_code_and_a_lot_label_says_when_it_was_made_and_goes_off(): void
    {
        $d = $this->dish('Pancakes', 120);
        app(PrepProduction::class)->run($this->ugali(), 1, 2.0, ['date' => '2026-10-17', 'expiry_date' => '2026-10-20']);
        $lot = \App\Models\Menus\PrepLot::first();

        $out = app(LabelService::class)->build([['type' => 'dish', 'id' => $d->id, 'copies' => 2], ['type' => 'prep_lot', 'id' => $lot->id]], ['price' => true], null);
        $this->assertSame([], $out['skipped']);
        $dish = $out['labels'][0];
        $this->assertSame(['qr', 2, true], [$dish['kind'], $dish['copies'], (bool) $dish['two_d']]);
        $this->assertContains('name', array_column($dish['lines'], 'role'));
        $this->assertContains('price', array_column($dish['lines'], 'role'));
        $prep = $out['labels'][1];
        $this->assertSame('code128', $prep['kind']);
        $this->assertStringContainsString('use by 2026-10-20', collect($prep['lines'])->firstWhere('role', 'batch')['text']);
        $this->assertNotNull($d);
    }

    // ------------------------------------------------------------ 9.2 dishes and recipes: what the QR holds

    public function test_the_qr_of_a_dish_opens_its_place_on_the_public_menu_and_scanning_it_finds_the_dish(): void
    {
        config(['app.frontend_url' => 'https://food.example.com/']);
        $d = $this->dish('Pancakes', 120);
        $url = 'https://food.example.com/menu?dish='.$d->slug;
        $this->assertSame($url, $this->items->find('dish', $d->id)['payload']);

        $label = app(LabelService::class)->build([['type' => 'dish', 'id' => $d->id]], [], null)['labels'][0];
        $this->assertSame(['qr', $url], [$label['kind'], $label['encodes']], 'the picture holds the link, the text under it the code');
        $this->assertSame(\App\Services\Codes\CodeFactory::make('qr', $url, ['text' => true, 'level' => 'M'])->svg(['unit' => 2, 'height' => 60, 'fontSize' => 11, 'text' => true]), $label['svg'], 'the picture really is the link');
        $this->assertSame('dish', $this->items->lookup($url)[0]['type'], 'a scan of the QR gives a link: it finds the dish');
        $this->assertSame('dish', $this->items->lookup($url.'&utm=x')[0]['type']);
        $this->assertSame([], $this->items->lookup('https://food.example.com/menu?dish=no-such-dish'));

        $linear = app(LabelService::class)->build([['type' => 'dish', 'id' => $d->id]], ['kind' => 'code128'], null)['labels'][0];
        $this->assertSame($this->items->find('dish', $d->id)['code'], $linear['encodes'], 'a barcode can not hold a link: it holds the code');
    }

    public function test_the_qr_of_a_recipe_opens_its_kitchen_card_for_staff(): void
    {
        config(['app.frontend_url' => 'https://food.example.com']);
        $own = $this->ugali();
        $url = 'https://food.example.com/admin/menus/recipes?card='.$own->id;
        $this->assertSame($url, $this->items->find('recipe', $own->id)['payload']);
        $hit = $this->items->lookup($url);
        $this->assertSame(['recipe', $own->id], [$hit[0]['type'], $hit[0]['id']]);
        $this->assertSame($url, app(LabelService::class)->build([['type' => 'recipe', 'id' => $own->id]], [], null)['labels'][0]['encodes']);
        $this->assertNull($this->items->find('prep_lot', 999), 'only dishes and recipes carry a link');
    }

    // ------------------------------------------------------------ 9.3 batch and lot labels

    public function test_a_prepared_batch_label_says_what_it_is_the_batch_number_who_made_it_when_and_the_use_by(): void
    {
        DB::table('menus_chefs')->insert(['id' => 1, 'user_id' => 1, 'display_name' => 'Chef Wanjiru', 'is_active' => true]);
        app(PrepProduction::class)->run($this->ugali(), 1, 2.0, ['date' => '2026-10-17', 'expiry_date' => '2026-10-20', 'chef_id' => 1, 'started_at' => '2026-10-17 13:50', 'finished_at' => '2026-10-17 14:30']);
        $lot = \App\Models\Menus\PrepLot::first();

        $label = app(LabelService::class)->build([['type' => 'prep_lot', 'id' => $lot->id]], [], null)['labels'][0];
        $lines = array_column($label['lines'], 'text', 'role');
        $this->assertSame('Ugali', $lines['name']);
        $this->assertSame('Made 17 Oct 14:30, Chef Wanjiru', $lines['made']);
        $this->assertStringContainsString('use by 2026-10-20', $lines['batch']);
        $this->assertStringContainsString('Batch '.$lot->lot_no, $lines['batch']);
        $this->assertSame($this->items->find('prep_lot', $lot->id)['code'], $label['encodes']);
        $this->assertArrayNotHasKey('made', array_column(app(LabelService::class)->build([['type' => 'prep_lot', 'id' => $lot->id]], ['made' => false], null)['labels'][0]['lines'], 'text', 'role'));
    }

    public function test_a_batch_made_with_no_chef_still_says_when_and_a_lot_that_came_in_says_when_it_was_received(): void
    {
        app(PrepProduction::class)->run($this->ugali(), 1, 2.0, ['date' => '2026-10-17', 'started_at' => '2026-10-17 09:00', 'finished_at' => '2026-10-17 09:40']);
        $prep = app(LabelService::class)->build([['type' => 'prep_lot', 'id' => \App\Models\Menus\PrepLot::first()->id]], [], null)['labels'][0];
        $this->assertSame('Made 17 Oct 09:40', collect($prep['lines'])->firstWhere('role', 'made')['text']);

        $lot = app(LabelService::class)->build([['type' => 'stock_lot', 'id' => \App\Models\Menus\StockBatch::first()->id]], [], null)['labels'][0];
        $this->assertStringStartsWith('Received ', collect($lot['lines'])->firstWhere('role', 'made')['text']);
    }
}

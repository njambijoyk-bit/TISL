<?php

namespace Tests\Feature;

use App\Models\Menus\IngredientItem;
use App\Models\Menus\StockBatch;
use App\Services\Books\BooksException;
use App\Services\Codes\CodeException;
use App\Services\Codes\Items\CodeCatalogue;
use App\Services\Codes\Linear\Gs1;
use App\Services\Licensing\LicenseManager;
use App\Services\Menus\Ingredients;
use App\Services\Menus\StockScan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus scanning at the stock screens and supplier barcodes, build steps 9.4 and 9.5: a code finds the kitchen item, a barcode is learnt once and kept honest. */
class MenusStockScanTest extends TestCase
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
        $this->coke = $this->makeIngredient('Coke', $this->each, null, [['name' => 'Coke 500ml', 'pack' => 24]]);
        $this->cokeItem = $this->itemId('Coke 500ml');
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


    private int $cokeItem;
    private object $coke;

    private function scan(): StockScan
    {
        return app(StockScan::class);
    }

    private function ean(string $body = '600123456789'): string
    {
        return $body.Gs1::checkDigit($body);
    }

    private function fails(callable $fn, string $part): void
    {
        try {
            $fn();
        } catch (BooksException|CodeException $e) {
            $this->assertStringContainsString($part, $e->getMessage());

            return;
        }
        $this->fail("Expected: {$part}");
    }

    // ------------------------------------------------------------ 9.4 scanning

    public function test_a_scan_finds_the_item_by_its_code_with_the_unit_it_is_counted_in(): void
    {
        $code = $this->items->generate('kitchen_item', $this->cokeItem);
        $r = $this->scan()->scan($code);
        $m = $r['matches'][0];
        $this->assertSame([true, $this->cokeItem, 'Coke', 'Coke 500ml', 'pack', false], [$r['found'], $m['item_id'], $m['ingredient'], $m['name'], $m['unit_kind'], $m['retired']], 'a pack of 24: counted by the pack');
        $this->assertSame($this->cokeItem, $this->scan()->scan(strtolower($code))['matches'][0]['item_id'], 'however it is typed');
    }

    public function test_the_label_of_a_lot_finds_the_item_the_lot_is_of(): void
    {
        $lot = $this->items->find('stock_lot', StockBatch::first()->id);
        $r = $this->scan()->scan($lot['code']);
        $this->assertSame(['stock_lot', (int) IngredientItem::where('name', 'Maize flour')->value('id')], [$r['matches'][0]['type'], $r['matches'][0]['item_id']]);
        $this->assertStringContainsString('lot', $r['matches'][0]['lot']);
    }

    public function test_a_dish_or_an_unknown_code_is_not_an_item_and_says_what_it_is(): void
    {
        $dish = $this->dish('Pancakes', 120);
        $code = $this->items->find('dish', $dish->id)['code'];
        $r = $this->scan()->scan($code);
        $this->assertFalse($r['found']);
        $this->assertStringContainsString('Pancakes (Dish)', $r['other'][0]);
        $this->assertSame(['found' => false, 'matches' => [], 'other' => []], $this->scan()->scan('NOSUCHCODE'));
    }

    // ------------------------------------------------------------ 9.5 supplier barcodes

    public function test_a_suppliers_barcode_is_learnt_the_first_time_and_the_old_code_still_scans_marked_old(): void
    {
        $old = $this->items->generate('kitchen_item', $this->cokeItem);
        $barcode = $this->ean();
        $this->assertFalse($this->scan()->scan($barcode)['found'], 'nothing has it yet');

        $this->scan()->learn($this->cokeItem, $barcode, null);
        $this->assertSame([$this->cokeItem, false], [$this->scan()->scan($barcode)['matches'][0]['item_id'], $this->scan()->scan($barcode)['matches'][0]['retired']]);
        $o = $this->scan()->scan($old)['matches'][0];
        $this->assertSame([$this->cokeItem, true, $barcode], [$o['item_id'], $o['retired'], $o['code']], 'a crate with the old label still scans');
    }

    public function test_a_barcode_is_refused_when_its_check_digit_is_wrong_or_something_else_has_it(): void
    {
        $this->fails(fn () => $this->scan()->learn($this->cokeItem, '6001234567890', null), 'check digit');
        $other = $this->makeIngredient('Sprite', $this->each, null, [['name' => 'Sprite 500ml']]);
        $this->assertNotNull($other);
        $sprite = $this->itemId('Sprite 500ml');
        $this->scan()->learn($this->cokeItem, $this->ean(), null);
        $this->fails(fn () => $this->scan()->learn($sprite, $this->ean(), null), 'already used');
        $this->fails(fn () => $this->scan()->learn($sprite, 'DSH00000001', null), 'already used');
    }

    public function test_the_item_form_keeps_the_same_rules_and_retires_the_old_code_on_a_change(): void
    {
        $ing = app(Ingredients::class);
        $variant = fn (array $o = []) => $o + ['id' => $this->cokeItem, 'name' => 'Coke 500ml', 'pack_size' => 24];
        $save = fn (array $v) => $ing->save(['name' => 'Coke', 'base_unit_id' => $this->each, 'variants' => $v], (int) $this->coke->id);

        $this->fails(fn () => $save([$variant(['code' => '6001234567890'])]), 'Coke 500ml: This looks like a retail barcode');
        $this->fails(fn () => $save([$variant(['code' => 'DSH00000001'])]), 'already used');
        $this->fails(fn () => $save([$variant(['code' => 'AB-1']), ['name' => 'Coke 1l', 'code' => 'ab-1']]), 'on two variants');

        $save([$variant(['code' => $this->ean()])]);
        $this->assertSame($this->ean(), IngredientItem::find($this->cokeItem)->code);
        $save([$variant(['code' => $this->ean()])]);   // the same again: nothing to check, nothing retired
        $this->assertSame(0, DB::table('code_aliases')->count());

        $new = $this->ean('600987654321');
        $save([$variant(['code' => $new])]);
        $this->assertSame([$this->ean()], DB::table('code_aliases')->where('item_type', 'kitchen_item')->pluck('code')->all(), 'the old barcode is kept');
        $this->assertTrue($this->scan()->scan($this->ean())['matches'][0]['retired']);
        $this->assertFalse($this->scan()->scan($new)['matches'][0]['retired']);
    }
}

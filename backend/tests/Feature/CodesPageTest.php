<?php

namespace Tests\Feature;

use App\Services\Codes\CodeException;
use App\Services\Codes\CodeSettings;
use App\Services\Codes\Items\CodeCatalogue;
use App\Services\Codes\Items\LabelService;
use App\Services\Codes\Linear\Gs1;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The Codes page behind the scenes: what can carry a code, giving codes, changing them without losing the old ones, finding what a scan is, and the labels. */
class CodesPageTest extends TestCase
{
    private CodeCatalogue $items;

    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code'); });
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('currency_id')->nullable(); $t->softDeletes(); });
        Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('sku')->nullable(); $t->string('barcode', 64)->nullable(); $t->string('name')->nullable(); $t->softDeletes(); });
        Schema::create('units_of_measure', function ($t) { $t->id(); $t->string('name'); });
        Schema::create('product_variant_units', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->unsignedBigInteger('unit_id')->nullable(); $t->string('role')->default('base'); $t->decimal('contains_qty', 12, 4)->nullable(); $t->decimal('base_factor', 14, 4)->nullable(); $t->decimal('price', 12, 2)->nullable(); $t->string('barcode', 64)->nullable(); });
        Schema::create('inventory_items', function ($t) { $t->id(); $t->string('name'); });
        Schema::create('inventory_instances', function ($t) { $t->id(); $t->unsignedBigInteger('item_id'); $t->string('serial_number')->nullable(); $t->string('asset_tag')->nullable(); $t->string('barcode')->nullable(); $t->softDeletes(); });
        Schema::create('stock_batches', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->string('batch_no')->nullable(); $t->date('expiry_date')->nullable(); });
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); });
        Schema::create('code_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('code_sequences', function ($t) { $t->string('name', 40)->primary(); $t->unsignedBigInteger('next_value')->default(1); });
        Schema::create('code_aliases', function ($t) { $t->id(); $t->string('item_type', 20); $t->unsignedBigInteger('item_id'); $t->string('code', 80); $t->string('reason')->nullable(); $t->unsignedBigInteger('retired_by')->nullable(); $t->timestamps(); });
        Schema::create('code_prints', function ($t) { $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('template')->nullable(); $t->string('size')->nullable(); $t->unsignedInteger('label_count')->default(0); $t->json('items')->nullable(); $t->timestamps(); });
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES']);
        $this->items = app(CodeCatalogue::class);
    }

    private function variant(string $product, ?string $name, ?string $sku, ?string $barcode = null, ?float $price = null): int
    {
        $pid = DB::table('products')->insertGetId(['name' => $product, 'currency_id' => 1]);
        $vid = DB::table('product_variants')->insertGetId(['product_id' => $pid, 'name' => $name, 'sku' => $sku, 'barcode' => $barcode]);
        DB::table('product_variant_units')->insert(['variant_id' => $vid, 'role' => 'base', 'price' => $price]);

        return $vid;
    }

    private function asset(string $item, ?string $tag, ?string $barcode = null): int
    {
        $iid = DB::table('inventory_items')->insertGetId(['name' => $item]);

        return DB::table('inventory_instances')->insertGetId(['item_id' => $iid, 'asset_tag' => $tag, 'barcode' => $barcode]);
    }

    // ------------------------------------------------------------ listing

    public function test_products_list_with_their_name_sku_code_and_price(): void
    {
        $a = $this->variant('Oak chair', 'Oak chair', 'CH-1', '5901234123457', 4500);
        $b = $this->variant('T-shirt', 'Blue / M', 'TS-BM', null, 800);
        $r = $this->items->list('variant');
        $this->assertSame(2, $r['total']);
        $row = collect($r['data'])->firstWhere('id', $a);
        $this->assertSame(['Oak chair', 'CH-1', '5901234123457', 4500.0, 'KES'], [$row['label'], $row['sku'], $row['code'], $row['price'], $row['currency']], 'a variant that repeats the product name is not named twice');
        $this->assertSame('T-shirt · Blue / M', collect($r['data'])->firstWhere('id', $b)['label']);
        $this->assertNull(collect($r['data'])->firstWhere('id', $b)['code']);
    }

    public function test_the_list_can_show_only_what_has_no_code_search_and_page(): void
    {
        $this->variant('A', 'A', 'SKU-A', '111');
        $this->variant('B', 'B', 'SKU-B', null);
        $this->variant('C', 'C', 'SKU-C', '');
        $this->assertSame(['SKU-C', 'SKU-B'], array_column($this->items->list('variant', ['missing' => true])['data'], 'sku'));
        $this->assertSame(['SKU-B'], array_column($this->items->list('variant', ['q' => 'sku-b'])['data'], 'sku'));
        $this->assertSame(['SKU-A'], array_column($this->items->list('variant', ['q' => '111'])['data'], 'sku'), 'search finds a code too');
        $page = $this->items->list('variant', ['per_page' => 2, 'page' => 2]);
        $this->assertSame([3, 1, 2, 2], [$page['total'], count($page['data']), $page['last_page'], $page['page']]);
        $v = $this->variant('Gone', 'Gone', 'SKU-G');
        DB::table('product_variants')->where('id', $v)->update(['deleted_at' => now()]);
        $this->assertSame(3, $this->items->list('variant')['total'], 'deleted products are not listed');
    }

    public function test_packs_assets_and_batches_list_too(): void
    {
        $v = $this->variant('Water', 'Water 500ml', 'W-500', '6001', 30);
        DB::table('units_of_measure')->insert(['id' => 1, 'name' => 'Carton']);
        DB::table('product_variant_units')->insert(['variant_id' => $v, 'unit_id' => 1, 'role' => 'compound', 'contains_qty' => 24, 'barcode' => '6001C']);
        $this->asset('Laptop', 'AT-7', null);
        DB::table('stock_batches')->insert(['id' => 12, 'variant_id' => $v, 'batch_no' => 'B-77', 'expiry_date' => '2027-03-31']);

        $this->assertSame(1, $this->items->list('pack')['total'], 'the base unit is the product itself, not a pack');
        $pack = $this->items->list('pack')['data'][0];
        $this->assertSame(['Water · Water 500ml · Carton × 24', '6001C'], [$pack['label'], $pack['code']]);
        $this->assertSame(['Laptop · AT-7', null], [$this->items->list('asset')['data'][0]['label'], $this->items->list('asset')['data'][0]['code']]);
        $b = $this->items->list('batch')['data'][0];
        $this->assertSame(['LOT00000012', true, 'Water · Water 500ml · batch B-77 · expires 2027-03-31'], [$b['code'], $b['derived'], $b['label']]);
        $this->assertSame(12, $this->items->list('batch', ['q' => 'LOT00000012'])['data'][0]['id']);
    }

    public function test_packs_are_empty_until_script_119_adds_the_column(): void
    {
        Schema::table('product_variant_units', fn ($t) => $t->dropColumn('barcode'));
        $this->assertFalse(CodeCatalogue::packsReady());
        $this->assertSame(0, $this->items->list('pack')['total']);
        $this->assertSame([], $this->items->lookup('6001C'));
    }

    // ------------------------------------------------------------ giving codes

    public function test_a_product_without_a_code_gets_a_valid_internal_ean13_that_is_never_reused(): void
    {
        $ids = [$this->variant('A', 'A', 'A'), $this->variant('B', 'B', 'B'), $this->variant('C', 'C', 'C')];
        $codes = array_map(fn ($id) => $this->items->generate('variant', $id), $ids);
        foreach ($codes as $c) {
            $this->assertMatchesRegularExpression('/^29\d{11}$/', $c);
            $this->assertTrue(Gs1::valid($c), $c);
        }
        $this->assertCount(3, array_unique($codes));
        $this->assertSame($codes[0], $this->items->find('variant', $ids[0])['code'], 'and it is saved');
        $this->assertSame(4, DB::table('code_sequences')->value('next_value'));
    }

    public function test_the_internal_code_skips_numbers_already_taken_and_follows_the_prefix_setting(): void
    {
        CodeSettings::save(['internal_prefix' => '21'], 1);
        $first = '210000000001' . Gs1::checkDigit('210000000001');
        $this->variant('Taken', 'Taken', 'T', $first);
        $id = $this->variant('New', 'New', 'N');
        $code = $this->items->generate('variant', $id);
        $this->assertNotSame($first, $code);
        $this->assertStringStartsWith('21', $code);
    }

    public function test_an_asset_gets_a_code_from_its_number_and_a_batch_already_has_one(): void
    {
        $a = $this->asset('Drill', 'AT-1');
        $this->assertSame('AST' . str_pad((string) $a, 8, '0', STR_PAD_LEFT), $this->items->generate('asset', $a));
        DB::table('stock_batches')->insert(['id' => 5, 'variant_id' => $this->variant('X', 'X', 'X'), 'batch_no' => 'b']);
        $this->assertSame('LOT00000005', $this->items->generate('batch', 5));
        try {
            $this->items->generate('asset', $a);
            $this->fail('Expected a refusal');
        } catch (CodeException $e) {
            $this->assertStringContainsString('already has a code', $e->getMessage());
        }
    }

    public function test_assigning_to_a_list_gives_codes_to_those_without_and_reports_the_rest(): void
    {
        $with = $this->variant('Has', 'Has', 'H', '5901234123457');
        $without = $this->variant('Not', 'Not', 'N');
        $r = $this->items->assign([['type' => 'variant', 'id' => $with], ['type' => 'variant', 'id' => $without], ['type' => 'variant', 'id' => 999]], 5);
        $this->assertSame([1, 1, 1], [count($r['made']), $r['kept'], count($r['failed'])]);
        $this->assertSame($without, $r['made'][0]['id']);
        $this->assertSame('That item was not found.', $r['failed'][0]['message']);
    }

    // ------------------------------------------------------------ choosing a code by hand

    public function test_a_typed_code_is_checked(): void
    {
        $v = $this->variant('A', 'A', 'A');
        $other = $this->variant('B', 'B', 'B', '4006381333931');
        foreach ([['5901234123456', 'check digit is wrong'], ['4006381333931', 'already used'], ['LOT00000001', 'already used'], ['caf' . "\u{e9}", 'plain letters'], ['', ''], [str_repeat('x', 65), '1 to 64']] as [$code, $msg]) {
            try {
                $this->items->setCode('variant', $v, $code, 1);
                $this->fail("{$code} should be refused");
            } catch (CodeException $e) {
                $this->assertStringContainsString($msg, $e->getMessage());
            }
        }
        $this->items->setCode('variant', $v, '5901234123457', 1);
        $this->items->setCode('variant', $v, 'SHELF-A-1', 1);
        $this->assertSame('SHELF-A-1', $this->items->find('variant', $v)['code']);
        $this->assertSame('4006381333931', $this->items->find('variant', $other)['code']);
        try {
            $this->items->setCode('batch', 1, 'X', 1);
            $this->fail('A batch code cannot be changed');
        } catch (CodeException $e) {
            $this->assertStringContainsString('can not be changed', $e->getMessage());
        }
    }

    public function test_a_replaced_code_stays_findable_but_cannot_be_given_to_something_else(): void
    {
        $v = $this->variant('A', 'A', 'A', '5901234123457');
        $w = $this->variant('B', 'B', 'B');
        $this->items->setCode('variant', $v, 'NEWCODE', 5, 'Relabelled');
        $this->assertSame([1, 'Relabelled'], [DB::table('code_aliases')->where('code', '5901234123457')->count(), DB::table('code_aliases')->value('reason')]);
        $m = $this->items->lookup('5901234123457');
        $this->assertSame([$v, true], [$m[0]['id'], $m[0]['retired']], 'an old label still scans, marked retired');
        $this->assertSame($v, $this->items->lookup('NEWCODE')[0]['id']);
        $this->assertFalse($this->items->lookup('NEWCODE')[0]['retired']);
        try {
            $this->items->setCode('variant', $w, '5901234123457', 5);
            $this->fail('A retired code is not given to another item');
        } catch (CodeException $e) {
            $this->assertStringContainsString('already used', $e->getMessage());
        }
        $this->items->setCode('variant', $v, '5901234123457', 5);   // the item may take its own old code back
        $this->assertSame('5901234123457', $this->items->find('variant', $v)['code']);
    }

    // ------------------------------------------------------------ finding what a scan is

    public function test_a_scan_finds_the_product_pack_asset_or_batch_it_belongs_to(): void
    {
        $v = $this->variant('Oak chair', 'Oak chair', 'CH-1', '5901234123457', 4500);
        DB::table('units_of_measure')->insert(['id' => 1, 'name' => 'Carton']);
        $packId = DB::table('product_variant_units')->insertGetId(['variant_id' => $v, 'unit_id' => 1, 'role' => 'compound', 'contains_qty' => 6, 'barcode' => 'CTN-1']);
        $a = $this->asset('Laptop', 'AT-7', 'AST00000001');
        DB::table('stock_batches')->insert(['id' => 3, 'variant_id' => $v, 'batch_no' => 'B1']);
        $this->assertSame([['variant', $v]], array_map(fn ($m) => [$m['type'], $m['id']], $this->items->lookup('5901234123457')));
        $this->assertSame([['pack', $packId]], array_map(fn ($m) => [$m['type'], $m['id']], $this->items->lookup('CTN-1')));
        $this->assertSame([['asset', $a]], array_map(fn ($m) => [$m['type'], $m['id']], $this->items->lookup('AT-7')), 'an asset tag finds it too');
        $this->assertSame([['asset', $a]], array_map(fn ($m) => [$m['type'], $m['id']], $this->items->lookup('AST00000001')));
        $this->assertSame([['batch', 3]], array_map(fn ($m) => [$m['type'], $m['id']], $this->items->lookup('lot00000003')));
        $this->assertSame([['variant', $v]], array_map(fn ($m) => [$m['type'], $m['id']], $this->items->lookup('ch-1')), 'a SKU is the last resort');
        $this->assertSame([], $this->items->lookup('nothing'));
        $this->assertSame([], $this->items->lookup('   '));
    }

    public function test_a_upc_a_scan_finds_the_ean13_it_is_stored_as_and_the_other_way_round(): void
    {
        $v = $this->variant('Cola', 'Cola', 'C', '0036000291452');
        $this->assertSame($v, $this->items->lookup('036000291452')[0]['id'], 'scanner dropped the leading 0');
        $w = $this->variant('Fanta', 'Fanta', 'F', '012345678905');
        $this->assertSame($w, $this->items->lookup('0012345678905')[0]['id'], 'scanner added a leading 0');
    }

    // ------------------------------------------------------------ labels

    private function labels(): LabelService
    {
        return app(LabelService::class);
    }

    public function test_labels_carry_the_chosen_lines_and_the_picture_of_the_code(): void
    {
        $v = $this->variant('Oak chair', 'Oak chair', 'CH-1', '5901234123457', 4500);
        $r = $this->labels()->build([['type' => 'variant', 'id' => $v, 'copies' => 3]], ['price' => true], 5);
        $l = $r['labels'][0];
        $this->assertSame([3, 3, 'ean13', false], [$r['total'], $l['copies'], $l['kind'], $l['two_d']]);
        $this->assertSame([['role' => 'name', 'text' => 'Oak chair'], ['role' => 'sku', 'text' => 'CH-1'], ['role' => 'price', 'text' => 'KES 4,500.00']], $l['lines']);
        $this->assertStringStartsWith('<svg', $l['svg']);
        $this->assertStringContainsString('>123457<', $l['svg'], 'the digits are printed under the bars');
        $off = $this->labels()->build([['type' => 'variant', 'id' => $v]], ['name' => false, 'sku' => false, 'code_text' => false], 5)['labels'][0];
        $this->assertSame([], $off['lines']);
        $this->assertStringNotContainsString('<text', $off['svg']);
    }

    public function test_a_batch_label_shows_its_batch_and_expiry(): void
    {
        $v = $this->variant('Milk', 'Milk 1L', 'M1');
        DB::table('stock_batches')->insert(['id' => 9, 'variant_id' => $v, 'batch_no' => 'L24-9', 'expiry_date' => '2026-12-31']);
        $l = $this->labels()->build([['type' => 'batch', 'id' => 9]], [], 5)['labels'][0];
        $this->assertSame('LOT00000009', $l['code']);
        $this->assertContains(['role' => 'batch', 'text' => 'Batch L24-9 · exp 2026-12-31'], $l['lines']);
    }

    public function test_a_retail_kind_that_does_not_fit_falls_back_to_code_128_and_a_qr_can_be_asked_for(): void
    {
        $v = $this->variant('Odd', 'Odd', 'O', 'SHELF-1');
        $this->assertSame('code128', $this->labels()->build([['type' => 'variant', 'id' => $v]], ['kind' => 'ean13'], 5)['labels'][0]['kind']);
        $qr = $this->labels()->build([['type' => 'variant', 'id' => $v]], ['kind' => 'qr'], 5)['labels'][0];
        $this->assertSame(['qr', true], [$qr['kind'], $qr['two_d']]);
        $g = $this->variant('Gtin', 'Gtin', 'G', '5901234123457');
        $this->assertSame('ean13', $this->labels()->build([['type' => 'variant', 'id' => $g]], [], 5)['labels'][0]['kind'], 'a real GTIN keeps its retail code by default');
        $this->assertSame('code128', $this->labels()->build([['type' => 'variant', 'id' => $v]], [], 5)['labels'][0]['kind']);
    }

    public function test_items_without_a_code_are_skipped_with_a_reason_and_the_print_is_logged(): void
    {
        $with = $this->variant('Has', 'Has', 'H', '111');
        $without = $this->variant('Not', 'Not', 'N');
        $r = $this->labels()->build([['type' => 'variant', 'id' => $with, 'copies' => 2], ['type' => 'variant', 'id' => $without], ['type' => 'variant', 'id' => 404]], ['size' => 'a4-24'], 7);
        $this->assertSame([1, 2, 2], [count($r['labels']), $r['total'], count($r['skipped'])]);
        $this->assertStringContainsString('no code yet', $r['skipped'][0]['reason']);
        $log = DB::table('code_prints')->first();
        $this->assertSame([7, 2, 'a4-24'], [(int) $log->user_id, (int) $log->label_count, $log->size]);
        $this->labels()->build([['type' => 'variant', 'id' => $without]], [], 7);
        $this->assertSame(1, DB::table('code_prints')->count(), 'nothing printed, nothing logged');
    }

    public function test_too_many_labels_at_once_are_refused(): void
    {
        $v = $this->variant('Has', 'Has', 'H', '111');
        $this->expectException(CodeException::class);
        $items = [];
        for ($i = 0; $i < 5; $i++) {
            $items[] = ['type' => 'variant', 'id' => $v, 'copies' => 500];
        }
        $this->labels()->build($items, [], 1);
    }

    // ------------------------------------------------------------ settings

    public function test_settings_have_defaults_and_refuse_nonsense(): void
    {
        $this->assertSame('29', CodeSettings::all()['internal_prefix']);
        $s = CodeSettings::save(['internal_prefix' => '24', 'kinds' => ['asset' => 'qr'], 'label' => ['price' => true, 'size' => 'roll-50x25', 'bogus' => 1]], 3);
        $this->assertSame(['24', 'qr', true, 'roll-50x25', 'code128'], [$s['internal_prefix'], $s['kinds']['asset'], $s['label']['price'], $s['label']['size'], $s['kinds']['batch']]);
        $this->assertSame('24', CodeSettings::all()['internal_prefix'], 'kept');
        foreach ([['internal_prefix' => '35'], ['internal_prefix' => '2'], ['kinds' => ['asset' => 'hologram']], ['kinds' => ['planet' => 'qr']]] as $bad) {
            try {
                CodeSettings::save($bad, 3);
                $this->fail('Expected a refusal');
            } catch (CodeException) {
                $this->addToAssertionCount(1);
            }
        }
    }
}

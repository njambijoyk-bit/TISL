<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusStockController;
use App\Models\Books\Voucher;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\Receipt;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Menus\FoodLedgers;
use App\Services\Menus\IngredientReceiving;
use App\Services\Menus\IngredientStock;
use App\Services\Menus\Ingredients;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus stock, step 2 (script 182): ingredients come in as a supplier bill in the books and batches on Menus' own shelf, in packs, the alternate unit or the base unit. */
class MenusIngredientStockTest extends TestCase
{
    use Concerns\CreatesMenusTables, Concerns\RunsSqlScripts;

    private array $posted = [];
    private int $inventory;
    private int $supplier;
    private int $exe;
    private int $pembe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createMenusTables();
        $this->runSqlScripts('181_menus_ingredients_own.sql', '182_menus_ingredient_stock.sql');
        Schema::create('ledger_groups', function ($t) { $t->id(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('nature')->nullable(); $t->timestamps(); });
        Schema::create('ledgers', function ($t) { $t->id(); $t->string('name'); $t->unsignedBigInteger('group_id'); $t->boolean('is_active')->default(true); $t->timestamps(); $t->softDeletes(); });
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        Schema::create('vouchers', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_type_id')->nullable(); $t->string('voucher_number')->nullable(); $t->string('status')->default('posted'); $t->unsignedBigInteger('location_id')->nullable(); $t->decimal('subtotal', 18, 2)->default(0); $t->decimal('tax_total', 18, 2)->default(0); $t->decimal('total_amount', 18, 2)->default(0); $t->json('meta')->nullable(); $t->timestamps(); });
        Schema::create('voucher_items', function ($t) { $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedInteger('line_no')->default(1); $t->decimal('tax_amount', 18, 2)->default(0); });
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->unsignedBigInteger('opening_balance_ledger_id')->nullable(); $t->integer('edit_window_days')->default(30); $t->timestamps(); });
        Schema::create('currencies', function ($t) { $t->id(); $t->string('code', 8); $t->boolean('is_base')->default(false); $t->timestamps(); });
        DB::table('currencies')->insert(['id' => 1, 'code' => 'KES', 'is_base' => true]);
        DB::table('accounting_settings')->insert(['id' => 1, 'edit_window_days' => 30]);
        DB::table('voucher_types')->insert([['id' => 1, 'base_type' => 'purchase'], ['id' => 2, 'base_type' => 'journal']]);

        $stock = DB::table('ledger_groups')->insertGetId(['name' => 'Stock-in-hand']);
        $creditors = DB::table('ledger_groups')->insertGetId(['name' => 'Sundry Creditors']);
        $direct = DB::table('ledger_groups')->insertGetId(['name' => 'Direct Expenses']);
        $this->inventory = DB::table('ledgers')->insertGetId(['name' => 'Food Ingredients Inventory', 'group_id' => $stock]);
        DB::table('ledgers')->insert([['name' => 'Food Cost of Sales', 'group_id' => $direct], ['name' => 'Food Waste Expense', 'group_id' => $direct]]);
        $this->supplier = DB::table('ledgers')->insertGetId(['name' => 'Naivas Wholesale', 'group_id' => $creditors]);

        // the books are stood in for: what is asked of them is kept in $posted
        $books = $this->createMock(VoucherService::class);
        $books->method('create')->willReturnCallback(function (array $d) {
            $this->posted[] = $d;
            $sub = collect($d['lines'] ?? [])->sum(fn ($l) => round($l['quantity'] * $l['rate'], 2));
            $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => $d['voucher_type_id'], 'voucher_number' => 'PV-'.count($this->posted), 'location_id' => $d['location_id'] ?? null,
                'subtotal' => $sub, 'tax_total' => 0, 'total_amount' => $sub, 'created_at' => now(), 'updated_at' => now()]);
            foreach (array_values($d['lines'] ?? []) as $i => $l) {
                DB::table('voucher_items')->insert(['voucher_id' => $id, 'line_no' => $i + 1, 'tax_amount' => 0]);
            }

            return Voucher::find($id);
        });
        $books->method('cancel')->willReturnCallback(function (Voucher $v) {
            app(IngredientReceiving::class)->beforeVoucherCancelled($v, null);   // what VoucherService::cancel does for a voucher that names a receipt
            $v->update(['status' => 'cancelled']);

            return $v;
        });
        $this->app->instance(VoucherService::class, $books);

        $flour = app(Ingredients::class)->save(['name' => 'Wheat flour', 'base_unit_id' => $this->g, 'alt_unit_id' => $this->kg, 'variants' => [
            ['name' => 'Exe 2 kg', 'pack_size' => 2, 'pack_unit_id' => $this->kg],
            ['name' => 'Pembe 24 kg', 'pack_size' => 24, 'pack_unit_id' => $this->kg, 'track_expiry' => true],
            ['name' => 'Loose'],
        ]]);
        [$this->exe, $this->pembe] = $flour->variants->pluck('id')->all();
    }

    private function receive(array $lines, array $over = [])
    {
        return app(IngredientReceiving::class)->receive($over + ['location_id' => self::BRANCH, 'date' => '2026-10-16', 'supplier_ledger_id' => $this->supplier, 'supplier_invoice_no' => 'INV-77', 'lines' => $lines], null);
    }

    public function test_packs_arrive_as_base_units_with_a_supplier_bill_in_the_books(): void
    {
        $r = $this->receive([['item_id' => $this->exe, 'quantity' => 10, 'unit' => 'pack', 'rate' => 260]]);

        $batch = StockBatch::where('receipt_id', $r->id)->firstOrFail();
        $this->assertEquals(20000, $batch->qty_in);
        $this->assertEquals(20000, $batch->qty_left);
        $this->assertEquals(0.13, $batch->unit_cost, 'what one gram cost');
        $this->assertSame('purchase', $batch->source);
        $line = $r->lines[0];
        $this->assertEquals(10, $line->input_qty);
        $this->assertSame('pack', $line->input_unit);
        $this->assertEquals(2600, $line->amount);

        $voucher = $this->posted[0];
        $this->assertSame(1, $voucher['voucher_type_id'], 'a Purchase voucher');
        $this->assertSame($this->supplier, $voucher['party_ledger_id'], 'the supplier is credited');
        $this->assertSame('INV-77', $voucher['supplier_invoice_no']);
        $this->assertSame(self::BRANCH, $voucher['location_id']);
        $this->assertCount(1, $voucher['lines']);
        $this->assertEquals(['custom', $this->inventory, 10, 260], [$voucher['lines'][0]['type'], $voucher['lines'][0]['ledger_id'], $voucher['lines'][0]['quantity'], $voucher['lines'][0]['rate']], 'a plain line posted to the inventory account');
        $this->assertStringContainsString('Wheat flour – Exe 2 kg: 10 packs', $voucher['lines'][0]['description']);
        $this->assertSame($r->id, Voucher::find($r->voucher_id)->meta['menus_receipt_id'], 'the voucher names its receipt, so Books can not edit it');
        $this->assertEquals(2600, $r->total);
    }

    public function test_the_alternate_and_base_units_work_and_cost_the_same_per_gram(): void
    {
        $this->receive([['item_id' => $this->exe, 'quantity' => 5, 'unit' => 'alt', 'rate' => 130]]);
        $this->receive([['item_id' => $this->exe, 'quantity' => 1000, 'unit' => 'base', 'rate' => 0.13]]);
        $batches = StockBatch::orderBy('id')->get();
        $this->assertEquals([5000, 1000], $batches->pluck('qty_in')->map(fn ($q) => (float) $q)->all());
        $this->assertEquals([0.13, 0.13], $batches->pluck('unit_cost')->map(fn ($q) => (float) $q)->all());
        $this->assertEquals(6000, app(IngredientStock::class)->onHand($this->exe, self::BRANCH));
    }

    public function test_every_receipt_leaves_a_move_for_every_batch(): void
    {
        $r = $this->receive([['item_id' => $this->exe, 'quantity' => 2, 'unit' => 'pack', 'rate' => 260], ['item_id' => $this->exe, 'quantity' => 500, 'unit' => 'base', 'rate' => 0.13]]);
        $this->assertSame(2, StockMove::where('receipt_id', $r->id)->where('kind', 'purchase')->count());
        $this->assertEquals([4000, 500], StockMove::orderBy('id')->pluck('quantity')->map(fn ($q) => (float) $q)->all());
    }

    public function test_a_pack_needs_a_pack_size_and_the_alternate_unit_needs_one_set(): void
    {
        $loose = IngredientItem::where('name', 'Loose')->value('id');
        foreach ([[$loose, 'pack', 'no pack size'], [$this->exe, 'litres', 'packs, in the alternate unit or in the base unit']] as [$item, $unit, $says]) {
            try {
                $this->receive([['item_id' => $item, 'quantity' => 1, 'unit' => $unit, 'rate' => 10]]);
                $this->fail('accepted');
            } catch (BooksException $e) {
                $this->assertStringContainsString($says, $e->getMessage());
            }
        }
        $sugar = app(Ingredients::class)->save(['name' => 'Sugar', 'base_unit_id' => $this->g, 'variants' => [['name' => 'Kabras']]])->variants[0];
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('no alternate unit');
        $this->receive([['item_id' => $sugar->id, 'quantity' => 1, 'unit' => 'alt', 'rate' => 10]]);
    }

    public function test_a_variant_that_expires_needs_its_expiry_date_and_keeps_it(): void
    {
        try {
            $this->receive([['item_id' => $this->pembe, 'quantity' => 1, 'unit' => 'pack', 'rate' => 2400]]);
            $this->fail('accepted');
        } catch (BooksException $e) {
            $this->assertStringContainsString('expires', $e->getMessage());
        }
        $this->receive([['item_id' => $this->pembe, 'quantity' => 1, 'unit' => 'pack', 'rate' => 2400, 'expiry_date' => '2027-01-31', 'batch_no' => 'B-9']]);
        $b = StockBatch::firstOrFail();
        $this->assertSame(['2027-01-31', 'B-9'], [$b->expiry_date->toDateString(), $b->batch_no]);
        $this->assertEquals(24000, $b->qty_in);
    }

    public function test_a_refused_receipt_leaves_nothing_behind(): void
    {
        $bad = [
            [fn () => $this->receive([]), 'at least one'],
            [fn () => $this->receive([['item_id' => $this->exe, 'quantity' => 0, 'unit' => 'pack', 'rate' => 1]]), 'how much'],
            [fn () => $this->receive([['item_id' => $this->exe, 'quantity' => 1, 'unit' => 'pack', 'rate' => -5]]), 'cost'],
            [fn () => $this->receive([['item_id' => 999, 'quantity' => 1, 'unit' => 'pack', 'rate' => 5]]), 'choose an ingredient variant'],
            [fn () => $this->receive([['item_id' => $this->exe, 'quantity' => 1, 'unit' => 'pack', 'rate' => 5]], ['supplier_ledger_id' => null]), 'supplier'],
        ];
        foreach ($bad as [$do, $says]) {
            try {
                $do();
                $this->fail("accepted: {$says}");
            } catch (BooksException $e) {
                $this->assertStringContainsString($says, $e->getMessage());
            }
        }
        $this->assertSame([0, 0, 0, 0], [Receipt::count(), StockBatch::count(), StockMove::count(), count($this->posted)]);
    }

    public function test_paying_at_once_needs_no_supplier(): void
    {
        $cash = DB::table('ledgers')->insertGetId(['name' => 'Petty cash', 'group_id' => 1]);
        $this->receive([['item_id' => $this->exe, 'quantity' => 1, 'unit' => 'pack', 'rate' => 260]], ['supplier_ledger_id' => null, 'paid_ledger_id' => $cash]);
        $this->assertSame($cash, $this->posted[0]['paid_ledger_id']);
        $this->assertArrayNotHasKey('party_ledger_id', $this->posted[0]);
    }

    public function test_cancelling_takes_the_stock_back_only_while_none_has_been_used(): void
    {
        $r = $this->receive([['item_id' => $this->exe, 'quantity' => 10, 'unit' => 'pack', 'rate' => 260]]);
        $stock = app(IngredientStock::class);
        StockBatch::where('receipt_id', $r->id)->update(['qty_left' => 19000]);   // 1 kg went into a dish
        try {
            app(IngredientReceiving::class)->cancel($r, 'wrong supplier', null);
            $this->fail('cancelled though some was used');
        } catch (BooksException $e) {
            $this->assertStringContainsString('has been used', $e->getMessage());
            $this->assertStringContainsString('19000 of 20000', $e->getMessage());
        }
        $this->assertSame('posted', $r->fresh()->status);
        $this->assertEquals(19000, $stock->onHand($this->exe, self::BRANCH));

        StockBatch::where('receipt_id', $r->id)->update(['qty_left' => 20000]);
        app(IngredientReceiving::class)->cancel($r, 'wrong supplier', null);
        $this->assertSame('cancelled', $r->fresh()->status);
        $this->assertEquals(0, $stock->onHand($this->exe, self::BRANCH));
        $this->assertSame(['purchase', 'reversal'], StockMove::orderBy('id')->pluck('kind')->all());
        $this->assertEquals(-20000, StockMove::where('kind', 'reversal')->value('quantity'));
        $this->assertSame('cancelled', Voucher::find($r->voucher_id)->status);
    }

    public function test_opening_stock_is_a_journal_against_the_opening_balance_account(): void
    {
        $equity = DB::table('ledgers')->insertGetId(['name' => 'Opening Balance Equity', 'group_id' => 1]);
        try {
            app(IngredientReceiving::class)->opening(['location_id' => self::BRANCH, 'lines' => [['item_id' => $this->exe, 'quantity' => 3, 'unit' => 'pack', 'rate' => 250]]], null);
            $this->fail('accepted with no opening balance account');
        } catch (BooksException $e) {
            $this->assertStringContainsString('opening balance account', $e->getMessage());
        }
        $this->assertSame(0, Receipt::count());

        DB::table('accounting_settings')->where('id', 1)->update(['opening_balance_ledger_id' => $equity]);
        $r = app(IngredientReceiving::class)->opening(['location_id' => self::BRANCH, 'date' => '2026-10-01', 'lines' => [['item_id' => $this->exe, 'quantity' => 3, 'unit' => 'pack', 'rate' => 250]]], null);

        $j = $this->posted[0];
        $this->assertSame(2, $j['voucher_type_id'], 'a Journal');
        $this->assertEquals([[$this->inventory, 'D', 750], [$equity, 'C', 750]], array_map(fn ($e) => [$e['ledger_id'], $e['side'], $e['amount']], $j['entries']));
        $b = StockBatch::firstOrFail();
        $this->assertSame('opening', $b->source);
        $this->assertEquals(6000, $b->qty_in);
        $this->assertSame('opening', StockMove::firstOrFail()->kind);
        $this->assertSame('opening', $r->kind);
    }

    public function test_the_three_accounts_are_found_by_name_and_a_missing_one_says_which_script_to_run(): void
    {
        $this->assertSame($this->inventory, FoodLedgers::inventory());
        $this->assertSame('Food Cost of Sales', DB::table('ledgers')->where('id', FoodLedgers::cost())->value('name'));
        $this->assertSame('Food Waste Expense', DB::table('ledgers')->where('id', FoodLedgers::waste())->value('name'));
        DB::table('ledgers')->where('name', 'Food Cost of Sales')->delete();
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('182_menus_ingredient_stock.sql');
        FoodLedgers::cost();
    }

    public function test_the_stock_screen_shows_each_variant_in_packs_and_both_units_with_its_value(): void
    {
        $this->receive([['item_id' => $this->exe, 'quantity' => 10, 'unit' => 'pack', 'rate' => 260]]);
        $this->receive([['item_id' => $this->pembe, 'quantity' => 3, 'unit' => 'pack', 'rate' => 2400, 'expiry_date' => '2027-02-01']]);
        $out = app(MenusStockController::class)->index(Request::create('/x', 'GET', ['location_id' => self::BRANCH]))->getData(true);
        $flour = $out['ingredients'][0];
        $exe = $flour['variants'][0];
        $this->assertEquals([20000, 20, 10, 2600], [$exe['qty_base'], $exe['qty_alt'], $exe['packs'], $exe['value']]);
        $this->assertEquals(1000, $flour['alt_factor']);
        $pembe = $flour['variants'][1];
        $this->assertEquals([72000, 72, 3, '2027-02-01'], [$pembe['qty_base'], $pembe['qty_alt'], $pembe['packs'], $pembe['next_expiry']], '3 packs of 24 kg is 72 kg');
        $this->assertEquals([92000, 92, 9800], [$flour['qty_base'], $flour['qty_alt'], $flour['value']], 'the ingredient adds its variants up');
        $this->assertSame([['id' => $this->supplier, 'name' => 'Naivas Wholesale']], $out['suppliers']);
    }

    public function test_the_door_answers_a_receipt_in_201_and_a_refusal_in_words(): void
    {
        $c = app(MenusStockController::class);
        $ok = $c->receive(Request::create('/x', 'POST', ['location_id' => self::BRANCH, 'supplier_ledger_id' => $this->supplier, 'lines' => [['item_id' => $this->exe, 'quantity' => 1, 'unit' => 'pack', 'rate' => 260]]]));
        $this->assertSame(201, $ok->getStatusCode());
        $this->assertSame(1, Receipt::count());

        $loose = IngredientItem::where('name', 'Loose')->value('id');
        $bad = $c->receive(Request::create('/x', 'POST', ['location_id' => self::BRANCH, 'supplier_ledger_id' => $this->supplier, 'lines' => [['item_id' => $loose, 'quantity' => 1, 'unit' => 'pack', 'rate' => 5]]]));
        $this->assertSame(422, $bad->getStatusCode());
        $this->assertStringContainsString('no pack size', $bad->getData(true)['message']);
        $this->assertSame(1, Receipt::count(), 'the refused one left nothing');
    }

    public function test_books_may_not_edit_or_return_a_voucher_that_received_ingredients_and_cancelling_it_takes_the_stock_back(): void
    {
        $source = file_get_contents(base_path('app/Services/Books/VoucherService.php'));
        $this->assertSame(3, substr_count($source, "meta['menus_receipt_id']"), 'edit, return and cancel each look for the receipt');
        $this->assertStringContainsString('IngredientReceiving::class)->beforeVoucherCancelled', $source);
    }
}

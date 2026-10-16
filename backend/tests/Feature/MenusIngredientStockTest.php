<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\MenusStockController;
use App\Models\Books\Voucher;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
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

/** Menus stock (scripts 182 and 187): ingredients come in on a Purchase voucher (one line per variant) and as lots on Menus' own shelf, in packs, the alternate unit or the base unit. */
class MenusIngredientStockTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $exe;
    private int $pembe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $flour = app(Ingredients::class)->save(['name' => 'Wheat flour', 'base_unit_id' => $this->g, 'alt_unit_id' => $this->kg, 'variants' => [
            ['name' => 'Exe 2 kg', 'pack_size' => 2, 'pack_unit_id' => $this->kg],
            ['name' => 'Pembe 24 kg', 'pack_size' => 24, 'pack_unit_id' => $this->kg, 'track_expiry' => true],
            ['name' => 'Loose'],
        ]]);
        [$this->exe, $this->pembe] = $flour->variants->pluck('id')->all();
    }

    private function receive(array $lines, array $over = []): Voucher
    {
        return app(IngredientReceiving::class)->receive($over + ['location_id' => self::BRANCH, 'date' => '2026-10-16', 'supplier_ledger_id' => $this->supplier, 'supplier_invoice_no' => 'INV-77', 'lines' => $lines], null);
    }

    private function open(array $lines): array
    {
        return app(IngredientReceiving::class)->opening(['location_id' => self::BRANCH, 'date' => '2026-10-01', 'lines' => $lines], null);
    }

    public function test_packs_arrive_as_base_units_on_a_purchase_voucher_line_of_their_own(): void
    {
        $v = $this->receive([['item_id' => $this->exe, 'quantity' => 10, 'unit' => 'pack', 'rate' => 260]]);

        $batch = StockBatch::where('voucher_id', $v->id)->firstOrFail();
        $this->assertEquals(20000, $batch->qty_in);
        $this->assertEquals(20000, $batch->qty_left);
        $this->assertEquals(0.13, $batch->unit_cost, 'what one gram cost');
        $this->assertSame('purchase', $batch->source);
        $this->assertNotNull($batch->voucher_item_id, 'the lot knows the voucher line it came in on');

        $line = DB::table('voucher_items')->where('voucher_id', $v->id)->first();
        $this->assertSame(['ingredient', $this->exe, 'Wheat flour', 'Exe 2 kg'], [$line->item_type, (int) $line->ingredient_item_id, $line->description, $line->variant_label], 'item = the ingredient, variant = the variant');
        $this->assertEquals([10, 2000, 20000, 260, 2600], [$line->quantity, $line->unit_factor, $line->base_quantity, $line->rate, $line->amount], 'ten packs of 2000 g at 260 a pack');

        $posted = $this->posted[0];
        $this->assertSame(1, $posted['voucher_type_id'], 'a Purchase voucher');
        $this->assertSame($this->supplier, $posted['party_ledger_id'], 'the supplier is credited');
        $this->assertSame('INV-77', $posted['supplier_invoice_no']);
        $this->assertSame(self::BRANCH, $posted['location_id']);
        $this->assertSame(['ingredient', $this->exe, 'pack'], [$posted['lines'][0]['type'], $posted['lines'][0]['ingredient_item_id'], $posted['lines'][0]['unit']], 'an ingredient line, not a plain one');
        $this->assertEquals(2600, $v->total_amount);
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

    public function test_every_voucher_line_leaves_a_move_for_its_batch(): void
    {
        $v = $this->receive([['item_id' => $this->exe, 'quantity' => 2, 'unit' => 'pack', 'rate' => 260], ['item_id' => $this->exe, 'quantity' => 500, 'unit' => 'base', 'rate' => 0.13]]);
        $this->assertSame(2, StockMove::where('voucher_id', $v->id)->where('kind', 'purchase')->count());
        $this->assertEquals([4000, 500], StockMove::orderBy('id')->pluck('quantity')->map(fn ($q) => (float) $q)->all());
        $this->assertSame(2, DB::table('voucher_items')->where('voucher_id', $v->id)->count(), 'one voucher line for each');
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
        $this->assertSame([0, 0, 0, 0], [DB::table('voucher_items')->count(), StockBatch::count(), StockMove::count(), count($this->posted)]);
    }

    public function test_paying_at_once_needs_no_supplier(): void
    {
        $cash = DB::table('ledgers')->insertGetId(['name' => 'Petty cash', 'group_id' => 1]);
        $this->receive([['item_id' => $this->exe, 'quantity' => 1, 'unit' => 'pack', 'rate' => 260]], ['supplier_ledger_id' => null, 'paid_ledger_id' => $cash]);
        $this->assertSame($cash, $this->posted[0]['paid_ledger_id']);
        $this->assertArrayNotHasKey('party_ledger_id', $this->posted[0]);
    }

    public function test_cancelling_the_voucher_takes_the_stock_back_only_while_none_has_been_used(): void
    {
        $v = $this->receive([['item_id' => $this->exe, 'quantity' => 10, 'unit' => 'pack', 'rate' => 260]]);
        $stock = app(IngredientStock::class);
        StockBatch::where('voucher_id', $v->id)->update(['qty_left' => 19000]);   // 1 kg went into a dish
        try {
            app(IngredientReceiving::class)->cancelVoucher($v, 'wrong supplier', null);
            $this->fail('cancelled though some was used');
        } catch (BooksException $e) {
            $this->assertStringContainsString('has been used', $e->getMessage());
            $this->assertStringContainsString('19000 of 20000', $e->getMessage());
        }
        $this->assertSame('posted', $v->fresh()->status);
        $this->assertEquals(19000, $stock->onHand($this->exe, self::BRANCH));

        StockBatch::where('voucher_id', $v->id)->update(['qty_left' => 20000]);
        app(IngredientReceiving::class)->cancelVoucher($v, 'wrong supplier', null);
        $this->assertSame('cancelled', $v->fresh()->status);
        $this->assertEquals(0, $stock->onHand($this->exe, self::BRANCH));
        $this->assertSame(['purchase', 'reversal'], StockMove::orderBy('id')->pluck('kind')->all());
        $this->assertEquals(-20000, StockMove::where('kind', 'reversal')->value('quantity'));
        $this->assertSame([$v->id, 'wrong supplier'], end($this->cancelled));
    }

    public function test_opening_stock_is_one_opening_stock_voucher_for_each_variant_against_the_opening_balance_account(): void
    {
        $equity = DB::table('ledgers')->insertGetId(['name' => 'Opening Balance Equity', 'group_id' => 1]);
        try {
            $this->open([['item_id' => $this->exe, 'quantity' => 3, 'unit' => 'pack', 'rate' => 250]]);
            $this->fail('accepted with no opening balance account');
        } catch (BooksException $e) {
            $this->assertStringContainsString('opening balance account', $e->getMessage());
        }
        $this->assertSame(0, StockBatch::count());

        DB::table('accounting_settings')->where('id', 1)->update(['opening_balance_ledger_id' => $equity]);
        $made = $this->open([['item_id' => $this->exe, 'quantity' => 3, 'unit' => 'pack', 'rate' => 250], ['item_id' => $this->pembe, 'quantity' => 1, 'unit' => 'pack', 'rate' => 2400, 'expiry_date' => '2027-03-01']]);

        $this->assertCount(2, $made, 'a voucher for each variant');
        $this->assertSame([7, 7], array_map(fn ($v) => (int) $v->voucher_type_id, $made), 'Opening stock vouchers, not a journal');
        $this->assertSame([1, 1], array_map(fn ($v) => DB::table('voucher_items')->where('voucher_id', $v->id)->count(), $made), 'one line each');
        $this->assertSame([$this->exe, $this->pembe], array_map(fn ($v) => (int) DB::table('voucher_items')->where('voucher_id', $v->id)->value('ingredient_item_id'), $made));
        $b = StockBatch::where('item_id', $this->exe)->firstOrFail();
        $this->assertSame('opening', $b->source);
        $this->assertEquals(6000, $b->qty_in);
        $this->assertSame(['opening', 'opening'], StockMove::orderBy('id')->pluck('kind')->all());
        $this->assertSame([$made[0]->id, $made[1]->id], StockMove::orderBy('id')->pluck('voucher_id')->map(fn ($i) => (int) $i)->all(), 'each move names its voucher');
    }

    public function test_a_variant_can_not_be_listed_twice_on_opening_stock(): void
    {
        DB::table('accounting_settings')->where('id', 1)->update(['opening_balance_ledger_id' => DB::table('ledgers')->insertGetId(['name' => 'Opening Balance Equity', 'group_id' => 1])]);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('listed twice');
        $this->open([['item_id' => $this->exe, 'quantity' => 1, 'unit' => 'pack', 'rate' => 250], ['item_id' => $this->exe, 'quantity' => 2, 'unit' => 'pack', 'rate' => 250]]);
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
        $this->assertSame(1, StockBatch::count());

        $loose = IngredientItem::where('name', 'Loose')->value('id');
        $bad = $c->receive(Request::create('/x', 'POST', ['location_id' => self::BRANCH, 'supplier_ledger_id' => $this->supplier, 'lines' => [['item_id' => $loose, 'quantity' => 1, 'unit' => 'pack', 'rate' => 5]]]));
        $this->assertSame(422, $bad->getStatusCode());
        $this->assertStringContainsString('no pack size', $bad->getData(true)['message']);
        $this->assertSame(1, StockBatch::count(), 'the refused one left nothing');
    }

    public function test_the_receipts_list_shows_the_vouchers_that_brought_ingredients_in(): void
    {
        $this->receive([['item_id' => $this->exe, 'quantity' => 1, 'unit' => 'pack', 'rate' => 260]]);
        DB::table('accounting_settings')->where('id', 1)->update(['opening_balance_ledger_id' => DB::table('ledgers')->insertGetId(['name' => 'Opening Balance Equity', 'group_id' => 1])]);
        $this->open([['item_id' => $this->exe, 'quantity' => 1, 'unit' => 'pack', 'rate' => 250]]);
        $rows = app(MenusStockController::class)->receipts(Request::create('/x', 'GET', ['location_id' => self::BRANCH]))->getData(true)['receipts'];
        $this->assertSame(['purchase', 'opening'], collect($rows)->sortBy('id')->pluck('kind')->values()->all());
        $this->assertSame([false, false], collect($rows)->pluck('legacy')->all());
    }

    public function test_the_books_hand_a_voucher_with_ingredient_lines_to_the_shelf_and_take_them_back(): void
    {
        $source = file_get_contents(base_path('app/Services/Books/VoucherService.php'));
        $this->assertStringContainsString('IngredientVoucherStock::class)->apply($voucher', $source, 'saving a voucher puts its ingredient lots on the shelf');
        $this->assertStringContainsString('IngredientVoucherStock::class)->undo($voucher', $source, 'undoing it takes them off again');
        $this->assertStringContainsString("meta['menus_receipt_id']", $source, 'older receipts are still recognised');
    }
}

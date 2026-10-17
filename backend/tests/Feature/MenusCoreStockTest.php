<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\StockJournalController;
use App\Models\Books\StockMovement;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Models\StockCount;
use App\Models\StockTransfer;
use App\Models\Location;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Licensing\LicenseManager;
use App\Services\Menus\IngredientItemSource;
use App\Services\Menus\IngredientReceiving;
use App\Services\Stock\Items\StockItemRegistry;
use App\Services\Stock\StockCountService;
use App\Services\Stock\StockTransferService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The kitchen's ingredients on the core Purchases pages (script 187): counts, transfers and the stock journal take them along with products when Menus is on. */
class MenusCoreStockTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private const OTHER = 2;
    private int $exe;
    private int $pembe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturn(true));
        $this->createIngredientWorld();
        Schema::create('stock_movements', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id')->nullable(); $t->unsignedBigInteger('voucher_item_id')->nullable(); $t->unsignedBigInteger('variant_id')->nullable(); $t->unsignedBigInteger('location_id')->nullable();
            $t->decimal('quantity', 18, 4); $t->string('movement_type', 30); $t->date('movement_date'); $t->dateTime('created_at')->nullable(); $t->unsignedBigInteger('batch_id')->nullable(); $t->decimal('unit_cost', 18, 4)->default(0);
            $t->string('ref_type', 30)->nullable(); $t->unsignedBigInteger('ref_id')->nullable(); $t->boolean('reversed')->default(false); $t->string('item_type', 40)->nullable(); $t->unsignedBigInteger('item_id')->nullable();
        });
        Schema::table('stock_batches', fn ($t) => $t->string('batch_no')->nullable());
        DB::table('locations')->insert(['id' => self::OTHER, 'name' => 'Westlands', 'is_default' => false]);
        Location::forgetCapabilities();
        $flour = $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Exe 2 kg', 'pack' => 2000], ['name' => 'Pembe 24 kg', 'pack' => 24000, 'expires' => true]]);
        [$this->exe, $this->pembe] = $flour->variants->pluck('id')->all();
    }

    private function receive(int $item, float $qty, float $rate, string $unit = 'pack', array $o = []): \App\Models\Books\Voucher
    {
        return app(IngredientReceiving::class)->receive(['location_id' => self::BRANCH, 'date' => '2026-10-10', 'supplier_ledger_id' => $this->supplier, 'lines' => [['item_id' => $item, 'quantity' => $qty, 'unit' => $unit, 'rate' => $rate] + $o]], null);
    }

    private function journal(array $query = []): array
    {
        return app(StockJournalController::class)->index(Request::create('/x', 'GET', $query))->getData(true);
    }

    // ------------------------------------------------------------ the stock journal

    public function test_ingredient_movements_appear_in_the_core_stock_movements_and_the_journal_names_them(): void
    {
        $v = $this->receive($this->exe, 10, 260);
        $m = StockMovement::where('item_type', IngredientItemSource::TYPE)->firstOrFail();
        $this->assertSame([$this->exe, 'purchase', 20000.0, $v->id], [(int) $m->item_id, $m->movement_type, (float) $m->quantity, (int) $m->voucher_id]);

        $out = $this->journal();
        $row = $out['rows'][0];
        $this->assertEquals(['Wheat flour — Exe 2 kg', 'Purchase', 20000, 'g', IngredientItemSource::TYPE], [$row['product'], $row['label'], $row['quantity'], $row['unit'], $row['kind']]);
        $this->assertEquals(2600, $row['value'], '20000 g at 0.13');
        $this->assertContains(IngredientItemSource::TYPE, collect($out['kinds'])->pluck('type')->all(), 'a kind to filter by');
    }

    public function test_the_journal_can_be_searched_by_ingredient_or_variant_and_filtered_to_ingredients(): void
    {
        $this->receive($this->exe, 1, 260);
        $this->receive($this->pembe, 1, 2400, 'pack', ['expiry_date' => '2027-01-01']);
        $this->assertCount(1, $this->journal(['q' => 'Pembe'])['rows']);
        $this->assertCount(2, $this->journal(['q' => 'flour'])['rows']);
        $this->assertCount(2, $this->journal(['kind' => IngredientItemSource::TYPE])['rows']);
        $this->assertCount(0, $this->journal(['kind' => 'product_variant'])['rows']);
    }

    public function test_a_cancelled_voucher_takes_its_ingredient_movements_out_of_the_journal(): void
    {
        $v = $this->receive($this->exe, 1, 260);
        app(IngredientReceiving::class)->cancelVoucher($v, 'wrong', null);
        $this->assertCount(0, $this->journal()['rows']);
        $this->assertSame(0.0, (float) StockMovement::where('item_type', IngredientItemSource::TYPE)->where('reversed', false)->sum('quantity'));
    }

    public function test_the_registry_knows_ingredients_only_while_menus_is_on(): void
    {
        $this->assertInstanceOf(IngredientItemSource::class, StockItemRegistry::get(IngredientItemSource::TYPE));
        $this->assertSame([$this->exe], StockItemRegistry::get(IngredientItemSource::TYPE)->search('Exe'));
        $this->assertSame('Wheat flour — Exe 2 kg', StockItemRegistry::get(IngredientItemSource::TYPE)->describe([$this->exe])[$this->exe]['name']);
    }

    public function test_opening_stock_is_the_opening_column_of_the_summary_whatever_its_date_and_purchases_are_inwards(): void
    {
        DB::table('accounting_settings')->where('id', 1)->update(['opening_balance_ledger_id' => DB::table('ledgers')->insertGetId(['name' => 'Opening Balance Equity', 'group_id' => 1])]);
        app(IngredientReceiving::class)->opening(['location_id' => self::BRANCH, 'date' => '2026-10-01', 'lines' => [['item_id' => $this->exe, 'quantity' => 3, 'unit' => 'pack', 'rate' => 260]]], null);   // 6000 g
        $this->receive($this->exe, 1, 260);   // 2000 g bought on 2026-10-10
        $s = app(\App\Services\Stock\StockReportService::class)->summary(['from' => '2026-01-01', 'to' => '2026-10-31']);
        $item = collect($s['groups'])->flatMap(fn ($g) => $g['items'])->firstWhere('item_id', $this->exe);
        $this->assertEquals([6000, 2000, 0, 8000], [$item['opening']['qty'], $item['inward']['qty'], $item['outward']['qty'], $item['closing']['qty']]);
        $this->assertEquals(780, $item['opening']['value']);
        $m = app(\App\Services\Stock\StockReportService::class)->monthly(IngredientItemSource::TYPE, $this->exe, ['from' => '2026-01-01', 'to' => '2026-10-31']);
        $this->assertEquals([6000, 2000, 8000], [$m['opening']['qty'], $m['months'][0]['inward']['qty'], $m['closing']['qty']]);
    }

    public function test_the_stock_query_lists_one_row_for_each_branch_and_batch_not_one_for_each_lot(): void
    {
        $this->receive($this->exe, 1, 260);
        $this->receive($this->exe, 2, 260);
        $this->receive($this->pembe, 1, 2400, 'pack', ['expiry_date' => '2027-01-01']);
        $places = (new IngredientItemSource())->places($this->exe);
        $this->assertSame([[ 'Kitchen', 6000.0 ]], array_map(fn ($p) => [$p['location'], (float) $p['quantity']], $places), 'three packs in two lots, one row');
    }

    public function test_a_reversal_with_nothing_to_hide_is_a_movement_of_its_own(): void
    {
        // an older receipt's reversal names a voucher whose movements were never tied to it: the stock still went out, so the journal must show it
        $this->receive($this->exe, 1, 260);   // +2000
        StockMove::create(['item_id' => $this->exe, 'location_id' => self::BRANCH, 'batch_id' => StockBatch::value('id'), 'kind' => 'reversal', 'quantity' => -2000, 'unit_cost' => 0.13, 'voucher_id' => 999, 'moved_on' => '2026-10-16']);
        $this->assertSame(0.0, (float) StockMovement::where('item_type', IngredientItemSource::TYPE)->where('reversed', false)->sum('quantity'));
    }

    // ------------------------------------------------------------ debit notes

    private function debit(\App\Models\Books\Voucher $purchase, int $item, float $packs, bool $moves = true): \App\Models\Books\Voucher
    {
        return app(VoucherService::class)->create(['voucher_type_id' => 9, 'date' => '2026-10-12', 'location_id' => self::BRANCH, 'source_voucher_id' => $purchase->id, 'moves_stock' => $moves,
            'lines' => [['type' => 'ingredient', 'ingredient_item_id' => $item, 'unit' => 'pack', 'quantity' => $packs, 'rate' => 260]]]);
    }

    public function test_a_debit_note_takes_the_ingredients_off_the_lots_of_the_purchase_and_cancelling_it_puts_them_back(): void
    {
        $p = $this->receive($this->exe, 10, 260);   // 20000 g
        $note = $this->debit($p, $this->exe, 3);    // 6000 g back to the supplier
        $stock = app(\App\Services\Menus\IngredientStock::class);
        $this->assertEquals(14000, $stock->onHand($this->exe, self::BRANCH));
        $m = StockMove::where('voucher_id', $note->id)->firstOrFail();
        $this->assertSame(['supplier_return', -6000.0, 0.13], [$m->kind, (float) $m->quantity, (float) $m->unit_cost]);
        $row = StockMovement::where('voucher_id', $note->id)->firstOrFail();
        $this->assertSame(['debit_note', IngredientItemSource::TYPE], [$row->movement_type, $row->item_type], 'the journal shows it as returned to the supplier');

        app(IngredientReceiving::class)->cancelVoucher($note, 'changed my mind', null);
        $this->assertEquals(20000, $stock->onHand($this->exe, self::BRANCH));
        $this->assertSame(0, StockMovement::where('voucher_id', $note->id)->where('reversed', false)->count(), 'its movements leave the journal');
        app(IngredientReceiving::class)->cancelVoucher($note, 'again', null);   // safe twice
        $this->assertEquals(20000, $stock->onHand($this->exe, self::BRANCH));
    }

    public function test_a_debit_note_can_not_send_back_more_than_is_left_of_that_purchase(): void
    {
        $p = $this->receive($this->exe, 10, 260);
        StockBatch::where('voucher_id', $p->id)->update(['qty_left' => 17000]);   // 3 kg went into dishes
        try {
            $this->debit($p, $this->exe, 9);   // 18000 g
            $this->fail('accepted');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Only 17000 g', $e->getMessage());
        }
        $this->assertEquals(17000, app(\App\Services\Menus\IngredientStock::class)->onHand($this->exe, self::BRANCH));
        $this->debit($p, $this->exe, 8);   // 16000 g is fine
        $this->assertEquals(1000, app(\App\Services\Menus\IngredientStock::class)->onHand($this->exe, self::BRANCH));
    }

    public function test_a_price_correction_on_a_debit_note_moves_no_stock_and_the_purchase_can_not_be_cancelled_under_a_live_note(): void
    {
        $p = $this->receive($this->exe, 10, 260);
        $this->debit($p, $this->exe, 1, false);
        $this->assertEquals(20000, app(\App\Services\Menus\IngredientStock::class)->onHand($this->exe, self::BRANCH));
        $this->assertSame(0, StockMove::where('kind', 'supplier_return')->count());

        $this->debit($p, $this->exe, 2);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('used or written off');
        app(IngredientReceiving::class)->cancelVoucher($p, 'wrong', null);
    }

    public function test_a_debit_note_shows_in_the_stock_summary_as_outwards_at_the_lots_cost(): void
    {
        $p = $this->receive($this->exe, 10, 260);
        $this->debit($p, $this->exe, 5);
        $s = app(\App\Services\Stock\StockReportService::class)->summary(['from' => '2026-01-01', 'to' => '2026-10-31']);
        $item = collect($s['groups'])->flatMap(fn ($g) => $g['items'])->firstWhere('item_id', $this->exe);
        $this->assertEquals([20000, 10000, 10000, 1300], [$item['inward']['qty'], $item['outward']['qty'], $item['closing']['qty'], $item['closing']['value']]);
    }

    // ------------------------------------------------------------ counts

    public function test_a_count_lists_the_ingredient_variants_on_the_shelf_and_posts_them_with_a_journal_of_their_own(): void
    {
        $this->receive($this->exe, 10, 260);       // 20 kg
        $this->receive($this->pembe, 1, 2400, 'pack', ['expiry_date' => '2027-01-01']);   // 24 kg
        $counts = app(StockCountService::class);
        $c = $counts->start(self::BRANCH, 'Monday', null);
        $this->assertSame(2, $c->ingredientLines()->count(), 'a line for each variant with stock');
        $exe = $c->ingredientLines()->where('item_id', $this->exe)->first();
        $pembe = $c->ingredientLines()->where('item_id', $this->pembe)->first();
        $this->assertEquals([20000, 0.13], [$exe->expected_qty, $exe->unit_cost]);

        $r = $counts->post($c, [], null, null, [$exe->id => ['quantity' => 9, 'unit' => 'pack'], $pembe->id => ['quantity' => '']]);   // 9 packs of 2 kg = 18 kg (2 kg short); Pembe not counted

        $this->assertSame(1, $r['lines']);
        $this->assertEqualsWithDelta(260.0, $r['loss'], 0.001, '2000 g x 0.13');
        $this->assertNotNull($r['ingredient_voucher_id']);
        $c->refresh();
        $this->assertSame(['posted', $r['ingredient_voucher_id']], [$c->status, (int) $c->ingredient_voucher_id]);
        $this->assertEquals(18000, app(\App\Services\Menus\IngredientStock::class)->onHand($this->exe, self::BRANCH));
        $this->assertEquals(24000, app(\App\Services\Menus\IngredientStock::class)->onHand($this->pembe, self::BRANCH), 'what was not counted stays');
        $j = end($this->posted);
        $this->assertSame([$this->waste(), 'D'], [$j['entries'][0]['ledger_id'], $j['entries'][0]['side']], 'Dr Food Waste Expense');
        $this->assertSame([$this->inventory, 'C', 260.0], [$j['entries'][1]['ledger_id'], $j['entries'][1]['side'], (float) $j['entries'][1]['amount']], 'Cr Food Ingredients Inventory');
        $this->assertSame(['stock_count' => ['count_id' => $c->id, 'ingredients' => true]], $j['meta']);
        $line = $exe->fresh();
        $this->assertEquals([-2000, -260], [$line->variance_qty, $line->value_change]);
        $this->assertSame('count_loss', StockMovement::where('item_type', IngredientItemSource::TYPE)->where('movement_type', 'count_loss')->value('movement_type'), 'the journal sees the shortage');
    }

    public function test_a_count_with_nothing_to_count_is_refused_and_counted_quantities_can_not_be_negative(): void
    {
        $counts = app(StockCountService::class);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('no stock at this branch');
        $counts->start(self::OTHER, null, null);
    }

    public function test_saving_a_count_keeps_what_was_typed_and_negative_is_refused(): void
    {
        $this->receive($this->exe, 10, 260);
        $counts = app(StockCountService::class);
        $c = $counts->start(self::BRANCH, null, null);
        $l = $c->ingredientLines()->first();
        $counts->save($c, [], [$l->id => ['quantity' => 4, 'unit' => 'alt']]);
        $l->refresh();
        $this->assertEquals([4, 'alt', 4000], [$l->input_qty, $l->input_unit, $l->counted_qty]);
        $this->expectException(BooksException::class);
        $counts->save($c, [], [$l->id => ['quantity' => -1, 'unit' => 'alt']]);
    }

    public function test_a_stock_count_started_with_menus_off_has_no_ingredient_lines(): void
    {
        $this->receive($this->exe, 10, 260);
        $this->mock(LicenseManager::class, fn ($m) => $m->shouldReceive('isActive')->andReturn(false));
        $this->expectException(BooksException::class);   // and so nothing is there to count
        app(StockCountService::class)->start(self::BRANCH, null, null);
    }

    // ------------------------------------------------------------ transfers

    public function test_an_ingredient_transfer_is_in_transit_then_received_with_its_cost_expiry_and_batch(): void
    {
        $this->receive($this->pembe, 2, 2400, 'pack', ['expiry_date' => '2027-01-01', 'batch_no' => 'B-7']);   // 48 kg
        $t = app(StockTransferService::class)->send(self::BRANCH, self::OTHER, [], 'to Westlands', null, [['item_id' => $this->pembe, 'quantity' => 30000]]);
        $stock = app(\App\Services\Menus\IngredientStock::class);
        $this->assertSame('in_transit', $t->status);
        $this->assertEquals([18000, 0], [$stock->onHand($this->pembe, self::BRANCH), $stock->onHand($this->pembe, self::OTHER)], 'off the sending shelf, not yet on the other');
        $this->assertEquals(30000, $t->ingredientLines->sum('quantity'));
        $this->assertSame(3000.0, app(StockTransferService::class)->inTransitValue(), '30000 g on the road at 0.10');

        $t = app(StockTransferService::class)->receive($t, [], null);
        $this->assertSame('received', $t->status);
        $there = StockBatch::where('location_id', self::OTHER)->firstOrFail();
        $this->assertSame([30000.0, 0.1, '2027-01-01', 'B-7'], [(float) $there->qty_left, (float) $there->unit_cost, $there->expiry_date->toDateString(), $there->batch_no]);
        $types = StockMovement::where('item_type', IngredientItemSource::TYPE)->whereIn('movement_type', ['transfer_out', 'transfer_in'])->orderBy('id')->pluck('movement_type')->all();
        $this->assertSame(['transfer_out', 'transfer_in'], $types, 'the journal shows both ends');
        $this->assertSame(0.0, app(StockTransferService::class)->inTransitValue(), 'nothing is on the road once it is received');
    }

    public function test_a_short_delivery_of_ingredients_is_written_off_to_food_waste(): void
    {
        $this->receive($this->exe, 10, 260);   // 0.13 a gram
        $svc = app(StockTransferService::class);
        $t = $svc->send(self::BRANCH, self::OTHER, [], null, null, [['item_id' => $this->exe, 'quantity' => 10000]]);
        $line = $t->ingredientLines->first();
        $svc->receive($t, [], null, [$line->id => 9000]);
        $this->assertEquals(9000, app(\App\Services\Menus\IngredientStock::class)->onHand($this->exe, self::OTHER));
        $j = end($this->posted);
        $this->assertSame([$this->waste(), 'D', 130.0, $this->inventory, 'C'], [$j['entries'][0]['ledger_id'], $j['entries'][0]['side'], (float) $j['entries'][0]['amount'], $j['entries'][1]['ledger_id'], $j['entries'][1]['side']], '1000 g x 0.13');
        $this->assertSame(['transfer_shortfall' => ['transfer_id' => $t->id, 'ingredients' => true]], $j['meta']);
    }

    public function test_cancelling_a_transfer_in_transit_puts_the_ingredients_back_and_hides_its_movements(): void
    {
        $this->receive($this->exe, 10, 260);
        $svc = app(StockTransferService::class);
        $t = $svc->send(self::BRANCH, self::OTHER, [], null, null, [['item_id' => $this->exe, 'quantity' => 5000]]);
        $svc->cancel($t->load('lines', 'ingredientLines'));
        $this->assertEquals(20000, app(\App\Services\Menus\IngredientStock::class)->onHand($this->exe, self::BRANCH));
        $this->assertSame(['cancelled', 0], [$t->fresh()->status, StockMovement::where('ref_type', 'transfer')->where('reversed', false)->count()]);
        $this->assertSame(0.0, $svc->inTransitValue());
    }

    public function test_only_good_stock_that_is_there_can_be_sent(): void
    {
        $this->receive($this->exe, 1, 260);
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('Only 2000 g');
        app(StockTransferService::class)->send(self::BRANCH, self::OTHER, [], null, null, [['item_id' => $this->exe, 'quantity' => 3000]]);
    }

    /** Gloves of the kind Supplies, carried on Kitchen Supplies Inventory and charged to Kitchen Supplies Used when counted short. @return array{item: int, used: int, shelf: int} */
    private function gloves(): array
    {
        $stock = (int) DB::table('ledger_groups')->where('name', 'Stock-in-hand')->value('id');
        $direct = (int) DB::table('ledger_groups')->where('name', 'Direct Expenses')->value('id');
        $used = DB::table('ledgers')->insertGetId(['name' => 'Kitchen Supplies Used', 'group_id' => $direct]);
        $shelf = DB::table('ledgers')->insertGetId(['name' => 'Kitchen Supplies Inventory', 'group_id' => $stock]);
        app(\App\Services\Menus\IngredientKinds::class)->seedDefaults();
        $kind = \App\Models\Menus\IngredientKind::where('code', 'supplies')->firstOrFail();
        $kind->update(['expense_ledger_id' => $used, 'stock_ledger_id' => $shelf]);
        $ing = $this->makeIngredient('Disposable gloves', $this->each, null, [['name' => 'Box of 100', 'pack' => 100]], 'preferred', ['kind_id' => $kind->id]);

        return ['item' => (int) $ing->variants->first()->id, 'used' => $used, 'shelf' => $shelf];
    }

    public function test_a_count_that_finds_fewer_gloves_charges_the_supplies_account_not_waste_and_flour_still_goes_to_waste(): void
    {
        $g = $this->gloves();
        $this->receive($this->exe, 10, 260);   // flour: 0.13 a gram
        $this->receive($g['item'], 3, 350);    // 3 boxes of 100 at 350: 3.50 each
        $counts = app(StockCountService::class);
        $c = $counts->start(self::BRANCH, 'Friday', null);
        $exe = $c->ingredientLines()->where('item_id', $this->exe)->first();
        $box = $c->ingredientLines()->where('item_id', $g['item'])->first();
        $counts->post($c, [], null, null, [$exe->id => ['quantity' => 9, 'unit' => 'pack'], $box->id => ['quantity' => 2, 'unit' => 'pack']]);   // 1 box (350) and 2 kg of flour (260) short
        $j = end($this->posted);
        $by = collect($j['entries'])->mapWithKeys(fn ($e) => [$e['ledger_id'].$e['side'] => (float) $e['amount']]);
        $this->assertSame(260.0, $by[$this->waste().'D'], 'flour: Dr Food Waste Expense');
        $this->assertSame(260.0, $by[$this->inventory.'C'], 'flour: Cr Food Ingredients Inventory');
        $this->assertSame(350.0, $by[$g['used'].'D'], 'gloves: Dr Kitchen Supplies Used, the using');
        $this->assertSame(350.0, $by[$g['shelf'].'C'], 'gloves: Cr Kitchen Supplies Inventory');
        $this->assertCount(4, $j['entries']);
    }

    public function test_waste_of_gloves_is_still_waste_but_comes_off_the_supplies_account(): void
    {
        $g = $this->gloves();
        $this->receive($g['item'], 2, 350);
        app(\App\Services\Menus\WasteService::class)->record(['location_id' => self::BRANCH, 'item_id' => $g['item'], 'quantity' => 1, 'unit' => 'pack', 'kind' => 'other', 'note' => 'dropped in the bin'], null);
        $j = end($this->posted);
        $this->assertSame([$this->waste(), 'D', 350.0, $g['shelf'], 'C'], [$j['entries'][0]['ledger_id'], $j['entries'][0]['side'], (float) $j['entries'][0]['amount'], $j['entries'][1]['ledger_id'], $j['entries'][1]['side']]);
    }

    public function test_a_short_delivery_of_gloves_is_charged_to_the_supplies_account(): void
    {
        $g = $this->gloves();
        $this->receive($g['item'], 2, 350);   // 200 gloves, 3.50 each
        $svc = app(StockTransferService::class);
        $t = $svc->send(self::BRANCH, self::OTHER, [], null, null, [['item_id' => $g['item'], 'quantity' => 100]]);
        $svc->receive($t, [], null, [$t->ingredientLines->first()->id => 90]);   // 10 gloves went missing: 35.00
        $j = end($this->posted);
        $this->assertSame([$g['used'], 'D', 35.0, $g['shelf'], 'C'], [$j['entries'][0]['ledger_id'], $j['entries'][0]['side'], (float) $j['entries'][0]['amount'], $j['entries'][1]['ledger_id'], $j['entries'][1]['side']]);
    }

    public function test_the_reports_call_it_kitchen_stock_and_group_each_ingredient_under_its_kind(): void
    {
        $source = new IngredientItemSource();
        $this->assertSame('Kitchen stock', $source->label());
        $this->assertSame('Cooking ingredient: Wheat flour', $source->describe([$this->exe])[$this->exe]['group']);
        $g = $this->gloves();
        $this->assertSame('Supplies: Disposable gloves', $source->describe([$g['item']])[$g['item']]['group']);
        \Illuminate\Support\Facades\DB::table('menus_ingredients')->update(['kind_id' => null]);
        $this->assertSame('Kitchen stock: Wheat flour', $source->describe([$this->exe])[$this->exe]['group'], 'an ingredient with no kind yet');
    }

    private function waste(): int
    {
        return (int) DB::table('ledgers')->where('name', 'Food Waste Expense')->value('id');
    }
}

<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Menus\IngredientKind;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\OrderPackaging;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockUse;
use App\Services\Menus\DishStock;
use App\Services\Menus\IngredientKinds;
use App\Services\Menus\PackagingStock;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus packaging, build step 5.6: the packaging that went out with a sale comes off the shelf, free or charged, and goes back if the sale is cancelled. */
class MenusPackagingStockTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private int $box;
    private int $foil;
    private int $supplies;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        Schema::create('menus_settings', function ($t) { $t->unsignedTinyInteger('id')->primary(); $t->json('settings')->nullable(); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::table('accounting_settings', function ($t) { $t->unsignedBigInteger('tips_payable_ledger_id')->nullable(); $t->unsignedBigInteger('default_sales_ledger_id')->nullable(); });
        $this->runSqlScripts('193_menus_config_foundation.sql', '207_menus_packaging_prices.sql', '208_menus_packaging_rules.sql', '209_menus_order_packaging.sql', '210_menus_order_packaging_waived.sql', '211_menus_condiments.sql');
        app(IngredientKinds::class)->seedDefaults();
        $packaging = (int) IngredientKind::where('code', 'packaging')->value('id');
        $this->supplies = DB::table('ledgers')->insertGetId(['name' => 'Kitchen Supplies Used', 'group_id' => DB::table('ledger_groups')->where('name', 'Direct Expenses')->value('id') ?: 1]);
        IngredientKind::whereKey($packaging)->update(['expense_ledger_id' => $this->supplies]);
        $this->makeIngredient('Container', $this->each, null, [['name' => 'Container']], 'preferred', ['kind_id' => $packaging]);
        $this->makeIngredient('Foil', $this->each, null, [['name' => 'Foil']], 'preferred', ['kind_id' => $packaging]);
        $this->box = $this->itemId('Container');
        $this->foil = $this->itemId('Foil');
        $this->shelve('Container', 10, 5.0);
        $this->shelve('Foil', 10, 1.0);
        $this->posted = [];
    }

    /** A paid order whose packaging list is: [item id => [count, charged]]. */
    private function order(array $lines): array
    {
        $o = (new MenuOrder())->forceFill(['id' => 5, 'location_id' => 1, 'number' => 'MO-5']);
        foreach ($lines as $item => [$qty, $charged]) {
            OrderPackaging::create(['order_id' => 5, 'item_id' => $item, 'name' => 'x', 'quantity' => $qty, 'asked' => $qty, 'unit_price' => $charged ? 15 : 0, 'amount' => $charged ? 15 * $qty : 0, 'charged' => $charged, 'compulsory' => false, 'receipt' => 'auto', 'source' => 'rule']);
        }
        $sale = Voucher::find(DB::table('vouchers')->insertGetId(['voucher_type_id' => 3, 'voucher_number' => 'INV-9', 'status' => 'posted', 'location_id' => 1, 'date' => '2026-10-16', 'moves_stock' => true, 'created_at' => now(), 'updated_at' => now()]));

        return [$o, $sale];
    }

    private function left(string $name): float
    {
        return (float) StockBatch::whereIn('item_id', DB::table('menus_ingredient_items')->where('name', $name)->pluck('id'))->sum('qty_left');
    }

    public function test_free_and_charged_packaging_both_come_off_the_shelf_and_the_cost_is_booked_to_the_kinds_account(): void
    {
        [$o, $sale] = $this->order([$this->box => [4, true], $this->foil => [3, false]]);
        app(PackagingStock::class)->apply($o, $sale, null);
        $this->assertSame([6.0, 7.0], [$this->left('Container'), $this->left('Foil')]);
        $this->assertCount(1, $this->posted, 'one journal for the lot');
        $debits = array_values(array_filter($this->posted[0]['entries'], fn ($e) => $e['side'] === 'D'));
        $this->assertSame([[$this->supplies, 23.0]], array_map(fn ($e) => [$e['ledger_id'], $e['amount']], $debits), '4 x 5 and 3 x 1, to Kitchen Supplies Used');
        $this->assertSame(2, StockUse::where('ref_type', 'voucher')->where('ref_id', $sale->id)->count());
    }

    public function test_a_line_that_was_taken_off_uses_nothing_and_an_order_with_no_packaging_posts_nothing(): void
    {
        [$o, $sale] = $this->order([$this->box => [0, true]]);
        app(PackagingStock::class)->apply($o, $sale, null);
        $this->assertSame([10.0, []], [$this->left('Container'), $this->posted]);
        app(PackagingStock::class)->apply((new MenuOrder())->forceFill(['id' => 99, 'location_id' => 1]), $sale, null);
        $this->assertSame([], $this->posted);
    }

    public function test_a_shortage_never_stops_the_sale_what_is_there_is_taken(): void
    {
        [$o, $sale] = $this->order([$this->box => [14, true]]);
        app(PackagingStock::class)->apply($o, $sale, null);
        $this->assertSame(0.0, $this->left('Container'), 'the 10 there were taken, and the sale went through');
        $this->assertEqualsWithDelta(50.0, array_sum(array_map(fn ($e) => $e['side'] === 'D' ? $e['amount'] : 0, $this->posted[0]['entries'])), 0.001);
    }

    public function test_cancelling_the_sale_gives_the_packaging_back_with_everything_else(): void
    {
        [$o, $sale] = $this->order([$this->box => [4, true], $this->foil => [3, false]]);
        app(PackagingStock::class)->apply($o, $sale, null);
        app(DishStock::class)->undo($sale, null);
        $this->assertSame([10.0, 10.0], [$this->left('Container'), $this->left('Foil')]);
        $this->assertCount(1, $this->cancelled);
    }

    public function test_the_condiments_given_come_off_the_shelf_not_the_ones_allowed(): void
    {
        $this->makeIngredient('Ketchup', $this->each, null, [['name' => 'Ketchup']], 'preferred', ['kind_id' => (int) IngredientKind::where('code', 'packaging')->value('id')]);
        $this->shelve('Ketchup', 20, 0.5);
        [$o, $sale] = $this->order([$this->box => [1, true]]);
        $ketchup = (int) DB::table('menus_ingredients')->where('name', 'Ketchup')->value('id');
        \App\Models\Menus\OrderCondiment::create(['order_id' => 5, 'ingredient_id' => $ketchup, 'name' => 'Ketchup', 'allowed' => 6, 'given' => 9]);
        app(PackagingStock::class)->apply($o, $sale, null);
        $this->assertSame([11.0, 9.0], [$this->left('Ketchup'), $this->left('Container')], '9 given, though 6 were allowed');
        $this->assertCount(1, $this->posted, 'one journal for the packaging and the condiments');
        $this->assertEqualsWithDelta(5.0 + 4.5, array_sum(array_map(fn ($e) => $e['side'] === 'D' ? $e['amount'] : 0, $this->posted[0]['entries'])), 0.001);
        $this->assertSame(2, StockUse::where('ref_type', 'voucher')->where('ref_id', $sale->id)->count());
    }

    public function test_an_order_with_only_condiments_and_no_packaging_still_takes_them(): void
    {
        $this->makeIngredient('Mayo', $this->each, null, [['name' => 'Mayo']], 'preferred', []);
        $this->shelve('Mayo', 5, 1.0);
        $o = (new MenuOrder())->forceFill(['id' => 6, 'location_id' => 1, 'number' => 'MO-6']);
        \App\Models\Menus\OrderCondiment::create(['order_id' => 6, 'ingredient_id' => (int) DB::table('menus_ingredients')->where('name', 'Mayo')->value('id'), 'name' => 'Mayo', 'allowed' => 3, 'given' => 3]);
        $sale = Voucher::find(DB::table('vouchers')->insertGetId(['voucher_type_id' => 3, 'voucher_number' => 'INV-10', 'status' => 'posted', 'location_id' => 1, 'date' => '2026-10-16', 'moves_stock' => true, 'created_at' => now(), 'updated_at' => now()]));
        app(PackagingStock::class)->apply($o, $sale, null);
        $this->assertSame(2.0, $this->left('Mayo'));
    }
}

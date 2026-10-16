<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Menus\DishBatch;
use App\Models\Menus\DishMove;
use App\Models\Menus\Production;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockUse;
use App\Services\Books\BooksException;
use App\Services\Menus\DishProduction;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\DishStock;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Menus stock, step 4 (script 184): what a sold dish takes off the shelf, made to order or made ahead, booked as one journal and undone exactly; and making a batch ahead. */
class MenusDishStockTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createIngredientWorld();
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Pembe']]);
        $this->makeIngredient('Cheese', $this->g, null, [['name' => 'Mozzarella']]);
        $this->makeIngredient('Onion', $this->g, null, [['name' => 'Red onions']]);
        $this->shelve('Pembe', 10000, 0.10);
        $this->shelve('Mozzarella', 1000, 1.00);
        $this->shelve('Red onions', 1000, 0.10);
    }

    private function ing(string $name): int
    {
        return (int) DB::table('menus_ingredients')->where('name', $name)->value('id');
    }

    private function pizza(bool $toOrder = true): \App\Models\Menus\Dish
    {
        $d = $this->dish('Pizza');
        app(DishRecipes::class)->save($d, ['made_to_order' => $toOrder, 'yield_qty' => 1, 'lines' => [
            ['ingredient_id' => $this->ing('Wheat flour'), 'quantity' => 200], ['ingredient_id' => $this->ing('Cheese'), 'quantity' => 100], ['ingredient_id' => $this->ing('Onion'), 'quantity' => 30],
        ]]);

        return $d;
    }

    private function left(string $item): float
    {
        return (float) StockBatch::where('item_id', $this->itemId($item))->sum('qty_left');
    }

    // ------------------------------------------------------------ made to order

    public function test_an_invoice_uses_the_ingredients_of_every_dish_line_and_books_one_journal_for_the_whole_voucher(): void
    {
        $pizza = $this->pizza();
        $v = $this->sale([['dish' => $pizza, 'qty' => 2], ['dish' => $pizza, 'qty' => 1]]);
        app(DishStock::class)->apply($v, null);

        $this->assertEquals([10000 - 600, 1000 - 300, 1000 - 90], [$this->left('Pembe'), $this->left('Mozzarella'), $this->left('Red onions')]);
        $cost = 3 * (200 * 0.10 + 100 * 1.00 + 30 * 0.10);   // 3 portions at 123 each
        $this->assertCount(1, $this->posted, 'one journal, not one per line');
        $this->assertEquals([[$this->costOfSales, 'D', $cost], [$this->inventory, 'C', $cost]], array_map(fn ($e) => [$e['ledger_id'], $e['side'], $e['amount']], $this->posted[0]['entries']));
        $uses = StockUse::where('ref_type', 'voucher')->where('ref_id', $v->id)->get();
        $this->assertCount(2, $uses);
        $this->assertSame([$this->journalId()], $uses->pluck('journal_id')->unique()->map(fn ($x) => (int) $x)->all());
    }

    private function journalId(): int
    {
        return (int) DB::table('vouchers')->where('voucher_type_id', 2)->value('id');
    }

    public function test_an_order_or_a_voucher_that_does_not_move_stock_uses_nothing(): void
    {
        $pizza = $this->pizza();
        app(DishStock::class)->apply($this->sale([['dish' => $pizza, 'qty' => 1]], true, 4), null);    // a sales order
        app(DishStock::class)->apply($this->sale([['dish' => $pizza, 'qty' => 1]], false, 3), null);   // an invoice whose delivery note moved it
        $this->assertSame([0, 0], [StockUse::count(), count($this->posted)]);
        $this->assertEquals(10000, $this->left('Pembe'));
    }

    public function test_a_dish_with_no_recipe_takes_nothing(): void
    {
        app(DishStock::class)->apply($this->sale([['dish' => $this->dish('Table water'), 'qty' => 5]]), null);
        $this->assertSame(0, StockUse::count());
    }

    public function test_the_customers_choices_leave_an_ingredient_out_or_use_more_of_one(): void
    {
        $pizza = $this->pizza();
        $uses = [['mode' => 'remove', 'ingredient_id' => $this->ing('Onion')], ['mode' => 'add', 'ingredient_id' => $this->ing('Cheese'), 'quantity' => 50, 'unit' => 'base']];
        app(DishStock::class)->apply($this->sale([['dish' => $pizza, 'qty' => 2, 'uses' => $uses]]), null);
        $this->assertEquals([10000 - 400, 1000 - 2 * 150, 1000], [$this->left('Pembe'), $this->left('Mozzarella'), $this->left('Red onions')], 'no onion, and 50 g more cheese on each of two');
        $this->assertEquals(2 * (200 * 0.10 + 150 * 1.00), $this->posted[0]['entries'][0]['amount']);
    }

    public function test_a_shortage_refuses_the_whole_voucher_and_the_books_rolling_back_leaves_nothing_used(): void
    {
        $pizza = $this->pizza();
        DB::table('menus_stock_batches')->where('item_id', $this->itemId('Mozzarella'))->update(['qty_left' => 150]);
        $v = $this->sale([['dish' => $pizza, 'qty' => 1], ['dish' => $pizza, 'qty' => 1]]);
        try {
            DB::transaction(fn () => app(DishStock::class)->apply($v, null));   // the books run it inside their transaction
            $this->fail('sold more than the cheese allows');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Not enough Cheese', $e->getMessage());
        }
        $this->assertEquals([10000, 150, 1000], [$this->left('Pembe'), $this->left('Mozzarella'), $this->left('Red onions')]);
        $this->assertSame(0, StockUse::count());
    }

    public function test_cancelling_or_changing_a_voucher_gives_the_stock_back_and_it_can_be_used_again(): void
    {
        $pizza = $this->pizza();
        $v = $this->sale([['dish' => $pizza, 'qty' => 2]]);
        $stock = app(DishStock::class);
        $stock->apply($v, null);
        $stock->undo($v, null, 'cancelled');
        $this->assertEquals([10000, 1000, 1000], [$this->left('Pembe'), $this->left('Mozzarella'), $this->left('Red onions')]);
        $this->assertSame('cancelled', Voucher::find($this->journalId())->status);
        $stock->undo($v, null);   // twice is harmless
        $this->assertEquals(10000, $this->left('Pembe'));

        DB::table('voucher_items')->where('voucher_id', $v->id)->update(['quantity' => 3]);   // edited to three, the books apply it again
        $stock->apply($v->fresh(), null);
        $this->assertEquals(10000 - 600, $this->left('Pembe'));
        $this->assertSame(['posted'], StockUse::where('status', 'posted')->pluck('status')->unique()->all());
    }

    // ------------------------------------------------------------ made ahead

    public function test_a_batch_made_ahead_uses_the_ingredients_and_puts_costed_portions_on_the_shelf(): void
    {
        $cake = $this->pizza(false);   // (a made-ahead recipe: the lines are for one portion here)
        $p = app(DishProduction::class)->run($cake, 1, 4, ['expiry_date' => '2027-01-01'], null);
        $this->assertSame('MB-'.str_pad((string) $p->id, 6, '0', STR_PAD_LEFT), $p->number);
        $this->assertEquals([10000 - 800, 1000 - 400, 1000 - 120], [$this->left('Pembe'), $this->left('Mozzarella'), $this->left('Red onions')]);
        $this->assertEquals(492.0, (float) $p->cost);
        $this->assertEquals(123.0, (float) $p->unit_cost, 'what one portion cost');
        $b = DishBatch::findOrFail($p->batch_id);
        $this->assertEquals([4, 4, 123], [(float) $b->qty_in, (float) $b->qty_left, (float) $b->unit_cost]);
        $this->assertSame([], $this->posted, 'value only moves within the inventory account: nothing is booked until portions are sold');
        $this->assertEquals(4.0, app(DishStock::class)->portionsAhead($cake, 1));
    }

    public function test_selling_a_dish_made_ahead_takes_the_soonest_expiring_portions_first_at_what_they_cost(): void
    {
        $cake = $this->pizza(false);
        $later = DishBatch::create(['dish_id' => $cake->id, 'location_id' => 1, 'made_on' => '2026-10-10', 'expiry_date' => '2027-03-01', 'unit_cost' => 100, 'qty_in' => 5, 'qty_left' => 5, 'status' => 'ok']);
        $sooner = DishBatch::create(['dish_id' => $cake->id, 'location_id' => 1, 'made_on' => '2026-10-12', 'expiry_date' => '2027-02-01', 'unit_cost' => 120, 'qty_in' => 3, 'qty_left' => 3, 'status' => 'ok']);
        $v = $this->sale([['dish' => $cake, 'qty' => 4]]);
        app(DishStock::class)->apply($v, null);
        $this->assertEquals([4, 0], [(float) $later->fresh()->qty_left, (float) $sooner->fresh()->qty_left]);
        $this->assertEquals(3 * 120 + 1 * 100, $this->posted[0]['entries'][0]['amount']);
        $this->assertEquals(10000, $this->left('Pembe'), 'the ingredients were used when it was made, not when it is sold');

        app(DishStock::class)->undo($v, null);
        $this->assertEquals([5, 3], [(float) $later->fresh()->qty_left, (float) $sooner->fresh()->qty_left]);
        $this->assertSame(2, DishMove::where('kind', 'sale_reversal')->count());
    }

    public function test_not_enough_portions_made_says_so_and_expired_or_held_batches_do_not_count(): void
    {
        $cake = $this->pizza(false);
        DishBatch::create(['dish_id' => $cake->id, 'location_id' => 1, 'made_on' => '2020-01-01', 'expiry_date' => '2020-01-05', 'unit_cost' => 1, 'qty_in' => 9, 'qty_left' => 9, 'status' => 'ok']);
        DishBatch::create(['dish_id' => $cake->id, 'location_id' => 1, 'made_on' => '2026-10-01', 'unit_cost' => 1, 'qty_in' => 9, 'qty_left' => 9, 'status' => 'held']);
        DishBatch::create(['dish_id' => $cake->id, 'location_id' => 1, 'made_on' => '2026-10-01', 'unit_cost' => 1, 'qty_in' => 2, 'qty_left' => 2, 'status' => 'ok']);
        $this->assertEquals(2.0, app(DishStock::class)->portionsAhead($cake, 1));
        $this->expectException(BooksException::class);
        $this->expectExceptionMessage('Not enough Pizza made: need 3, have 2. Make a batch first.');
        app(DishStock::class)->apply($this->sale([['dish' => $cake, 'qty' => 3]]), null);
    }

    public function test_a_batch_can_be_cancelled_only_while_all_of_it_is_there_and_gives_the_ingredients_back(): void
    {
        $cake = $this->pizza(false);
        $p = app(DishProduction::class)->run($cake, 1, 4, [], null);
        $v = $this->sale([['dish' => $cake, 'qty' => 1]]);
        app(DishStock::class)->apply($v, null);
        try {
            app(DishProduction::class)->cancel($p, null);
            $this->fail('cancelled a batch that was partly sold');
        } catch (BooksException $e) {
            $this->assertStringContainsString('already been sold', $e->getMessage());
        }
        app(DishStock::class)->undo($v, null);
        $done = app(DishProduction::class)->cancel($p->fresh(), null);
        $this->assertSame('cancelled', $done->status);
        $this->assertEquals([10000, 1000, 1000], [$this->left('Pembe'), $this->left('Mozzarella'), $this->left('Red onions')]);
        $this->assertEquals(0, (float) DishBatch::find($p->batch_id)->qty_left);
        $this->assertSame('cancelled', Production::find($p->id)->status);
    }

    public function test_a_batch_is_refused_for_a_dish_made_to_order_a_dish_with_no_recipe_nothing_made_or_too_little_stock(): void
    {
        $maker = app(DishProduction::class);
        foreach ([
            [fn () => $maker->run($this->pizza(true), 1, 2, [], null), 'made to order'],
            [fn () => $maker->run($this->dish('Bare'), 1, 2, [], null), 'has no recipe'],
        ] as [$do, $says]) {
            try {
                $do();
                $this->fail("accepted: {$says}");
            } catch (BooksException $e) {
                $this->assertStringContainsString($says, $e->getMessage());
            }
        }
        $cake = $this->dish('Cake');
        app(DishRecipes::class)->save($cake, ['made_to_order' => false, 'lines' => [['ingredient_id' => $this->ing('Cheese'), 'quantity' => 500]]]);
        try {
            $maker->run($cake, 1, 0, [], null);
            $this->fail('made nothing');
        } catch (BooksException $e) {
            $this->assertStringContainsString('how many portions', $e->getMessage());
        }
        try {
            $maker->run($cake, 1, 5, [], null);   // 2500 g of cheese, 1000 on the shelf
            $this->fail('made it from stock it did not have');
        } catch (BooksException $e) {
            $this->assertStringContainsString('Not enough Cheese', $e->getMessage());
        }
        $this->assertSame([0, 0], [DishBatch::count(), StockUse::count()], 'the refused attempts left nothing');
        $this->assertEquals(1000, $this->left('Mozzarella'));
    }
}

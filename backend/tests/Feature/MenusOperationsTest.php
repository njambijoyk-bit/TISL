<?php

namespace Tests\Feature;

use App\Models\Menus\Count;
use App\Models\Menus\DishBatch;
use App\Models\Menus\StockBatch;
use App\Models\Menus\StockMove;
use App\Models\Menus\StockUse;
use App\Models\Menus\Waste;
use App\Services\Books\BooksException;
use App\Services\Menus\IngredientReceiving;
use App\Services\Menus\IngredientStock;
use App\Services\Menus\PrepService;
use App\Services\Menus\ReorderService;
use App\Services\Menus\StockCounts;
use App\Services\Menus\StockTransfers;
use App\Services\Menus\WasteService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus stock, step 5 (script 185): wastage, the prep list, what to buy, stock taking by packs, moving stock between branches and the expiry list, all on ingredient variants. */
class MenusOperationsTest extends TestCase
{
    use Concerns\CreatesIngredientWorld;

    private const BRANCH = 1;
    private const OTHER = 2;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-10-16 09:00', 'Africa/Nairobi'));
        $this->createIngredientWorld();
        DB::table('locations')->insert(['id' => self::OTHER, 'name' => 'Westlands']);
        DB::table('voucher_types')->insert(['id' => 5, 'base_type' => 'purchase_order', 'stock_effect' => 'none', 'is_active' => 1]);
        Schema::create('menus_orders', function ($t) {
            $t->id(); $t->string('number', 20); $t->string('track_token', 40); $t->string('name')->nullable(); $t->unsignedBigInteger('location_id')->default(self::BRANCH); $t->dateTime('fulfil_at')->nullable();
            $t->string('status', 12)->default('completed'); $t->string('payment', 10)->default('paid'); $t->decimal('subtotal', 12, 2)->default(0); $t->dateTime('created_at')->nullable();
        });
        Schema::create('users', function ($t) { $t->id(); $t->string('name'); });
        Schema::create('menus_order_lines', function ($t) { $t->id(); $t->unsignedBigInteger('order_id'); $t->unsignedBigInteger('dish_id'); $t->string('name')->nullable(); $t->decimal('quantity', 12, 2)->default(1); });
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function waste(): WasteService
    {
        return app(WasteService::class);
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

    private function flour(): void
    {
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Exe 2 kg', 'pack' => 2000], ['name' => 'Pembe 24 kg', 'pack' => 24000]]);
    }

    private function in(string $item, float $qty, array $o = []): array
    {
        return $o + ['location_id' => self::BRANCH, 'item_id' => $this->itemId($item), 'quantity' => $qty, 'kind' => 'spoilage'];
    }

    /** The last journal the books were asked to post: [debit ledger, credit ledger, amount]. */
    private function lastJournal(): array
    {
        $d = end($this->posted);

        return [$d['entries'][0]['ledger_id'], $d['entries'][1]['ledger_id'], (float) $d['entries'][0]['amount']];
    }

    private function wasteLedger(): int
    {
        return (int) DB::table('ledgers')->where('name', 'Food Waste Expense')->value('id');
    }

    private function left(StockBatch $b): float
    {
        return (float) StockBatch::find($b->id)->qty_left;
    }

    // ------------------------------------------------------------ waste

    public function test_a_waste_entry_needs_a_reason_an_amount_an_item_and_a_day_that_has_come(): void
    {
        $this->flour();
        $this->shelve('Exe 2 kg', 10000);
        $this->fails(fn () => $this->waste()->record($this->in('Exe 2 kg', 1, ['kind' => 'because'])), 'why it was wasted');
        $this->fails(fn () => $this->waste()->record($this->in('Exe 2 kg', 0)), 'how much');
        $this->fails(fn () => $this->waste()->record(['location_id' => self::BRANCH, 'quantity' => 1, 'kind' => 'spoilage']), 'what was wasted');
        $this->fails(fn () => $this->waste()->record($this->in('Exe 2 kg', 1, ['location_id' => 999])), 'branch');
        $this->fails(fn () => $this->waste()->record($this->in('Exe 2 kg', 1, ['date' => '2099-01-01'])), 'not come yet');
        $this->fails(fn () => $this->waste()->record($this->in('Exe 2 kg', 10001)), 'Only 10000 g');
        $this->fails(fn () => $this->waste()->record($this->in('Pembe 24 kg', 1, ['unit' => 'alt']) + ['dish_id' => null]), 'Only 0 g');
        $this->assertSame([0, 0, 0], [Waste::count(), StockMove::where('kind', 'waste')->count(), count($this->posted)], 'a refused entry writes nothing off');
    }

    public function test_stock_leaves_first_expiring_first_expired_included_at_the_cost_of_the_lots_and_is_booked_to_waste(): void
    {
        $this->flour();
        $fresh = $this->shelve('Exe 2 kg', 10000, 0.10, '2026-12-01');
        $old = $this->shelve('Exe 2 kg', 3000, 0.08, '2026-10-01');   // already expired
        $none = $this->shelve('Exe 2 kg', 5000, 0.12, null);
        $w = $this->waste()->record($this->in('Exe 2 kg', 5, ['unit' => 'alt', 'note' => 'went off']), null);   // 5 kg
        $this->assertSame([0.0, 8000.0, 5000.0], [$this->left($old), $this->left($fresh), $this->left($none)], 'the expired lot first, then the next to expire; a lot with no date last');
        $this->assertEqualsWithDelta(440.0, (float) $w->cost, 0.001, '3000 x 0.08 + 2000 x 0.10');
        $this->assertSame([5000.0, 'spoilage', 'Spoilage: went off'], [(float) $w->quantity, $w->kind, StockMove::where('kind', 'waste')->first()->note === 'Spoilage' ? 'Spoilage: went off' : 'x']);
        $this->assertSame([$this->wasteLedger(), $this->inventory, 440.0], $this->lastJournal(), 'Dr Food Waste Expense, Cr Food Ingredients Inventory');
        $this->assertCount(1, $w->voucher_ids);
        $this->assertSame([-3000.0, -2000.0], StockMove::where('kind', 'waste')->orderBy('id')->pluck('quantity')->map(fn ($q) => (float) $q)->all());
    }

    public function test_waste_can_be_typed_in_packs(): void
    {
        $this->flour();
        $b = $this->shelve('Exe 2 kg', 20000, 0.10);
        $w = $this->waste()->record($this->in('Exe 2 kg', 3, ['unit' => 'pack']), null);
        $this->assertSame([14000.0, 6000.0], [$this->left($b), (float) $w->quantity]);
        $this->fails(fn () => $this->waste()->record($this->in('Exe 2 kg', 1, ['unit' => 'bags'])), 'packs');
    }

    public function test_a_dish_made_to_order_that_was_thrown_away_writes_off_what_it_is_made_of(): void
    {
        $this->makeIngredient('Oil', $this->ml, null, [['name' => 'Oil']]);
        $this->makeIngredient('Flour', $this->g, null, [['name' => 'Flour']]);
        $oil = $this->shelve('Oil', 5000, 0.2);
        $flour = $this->shelve('Flour', 5000, 0.1);
        $d = $this->dish('Chapati', 50, [['Oil', 500], ['Flour', 250]]);
        $w = $this->waste()->record(['location_id' => self::BRANCH, 'dish_id' => $d->id, 'quantity' => 2, 'kind' => 'plate'], null);
        $this->assertSame([4000.0, 4500.0], [$this->left($oil), $this->left($flour)], 'two portions: a litre of oil and half a kilo of flour');
        $this->assertEqualsWithDelta(250.0, (float) $w->cost, 0.001, '1000 x 0.2 + 500 x 0.1');
        $this->assertSame([$this->wasteLedger(), $this->inventory, 250.0], $this->lastJournal(), 'booked to waste, not to cost of sales');
        $this->assertSame(1, count($this->posted), 'one journal');
        $this->assertSame($w->voucher_ids[0], (int) StockUse::where('ref_type', 'waste')->value('journal_id'));
    }

    public function test_a_dish_made_ahead_that_was_thrown_away_writes_off_its_own_portions(): void
    {
        $d = $this->dish('Cake slice', 120);
        $this->stockDish($d, 10, false, 30.0);
        $w = $this->waste()->record(['location_id' => self::BRANCH, 'dish_id' => $d->id, 'quantity' => 4, 'kind' => 'over_prep'], null);
        $this->assertSame([6.0, 120.0], [(float) DishBatch::where('dish_id', $d->id)->value('qty_left'), (float) $w->cost]);
        $this->assertSame([$this->wasteLedger(), $this->inventory, 120.0], $this->lastJournal());
        $this->fails(fn () => $this->waste()->record(['location_id' => self::BRANCH, 'dish_id' => $d->id, 'quantity' => 7, 'kind' => 'plate']), 'Only 6 of Cake slice');
        $bare = $this->dish('Soda', 50);
        $this->fails(fn () => $this->waste()->record(['location_id' => self::BRANCH, 'dish_id' => $bare->id, 'quantity' => 1, 'kind' => 'plate']), 'no recipe');
    }

    public function test_an_entry_taken_back_returns_the_stock_and_cancels_the_journal_once(): void
    {
        $this->flour();
        $b = $this->shelve('Exe 2 kg', 10000, 0.10);
        $w = $this->waste()->record($this->in('Exe 2 kg', 4, ['unit' => 'alt']), null);
        $this->assertSame(6000.0, $this->left($b));
        $voided = $this->waste()->void($w);
        $this->assertSame([10000.0, true, 1], [$this->left($b), $voided->voided_at !== null, count($this->cancelled)], 'the lot has its quantity back and the journal is cancelled');
        $this->assertSame(1, StockMove::where('kind', 'waste_reversal')->count());
        $this->fails(fn () => $this->waste()->void($voided), 'already taken back');
        $this->assertSame(0.0, $this->waste()->report('2026-10-01', '2026-10-31')['total'], 'a taken-back entry is not counted');
    }

    public function test_a_made_to_order_dish_taken_back_returns_its_ingredients(): void
    {
        $this->makeIngredient('Flour', $this->g, null, [['name' => 'Flour']]);
        $b = $this->shelve('Flour', 1000, 0.1);
        $d = $this->dish('Chapati', 50, [['Flour', 250]]);
        $w = $this->waste()->record(['location_id' => self::BRANCH, 'dish_id' => $d->id, 'quantity' => 2, 'kind' => 'plate'], null);
        $this->assertSame(500.0, $this->left($b));
        $this->waste()->void($w);
        $this->assertSame([1000.0, 1], [$this->left($b), count($this->cancelled)], 'the same lot gets it back and the one journal is cancelled once');
    }

    public function test_the_report_counts_by_reason_item_and_day_against_food_sales(): void
    {
        $this->makeIngredient('Tomatoes', $this->g, null, [['name' => 'Tomatoes']]);
        $this->makeIngredient('Beef', $this->g, null, [['name' => 'Beef']]);
        $this->shelve('Tomatoes', 50000, 0.1);
        $this->shelve('Beef', 50000, 0.5);
        $this->waste()->record($this->in('Tomatoes', 2000, ['date' => '2026-10-10']), null);
        $this->waste()->record($this->in('Beef', 1000, ['date' => '2026-10-10', 'kind' => 'staff_meal']), null);
        $this->waste()->record($this->in('Beef', 1000, ['date' => '2026-10-11', 'kind' => 'over_prep']), null);
        DB::table('menus_orders')->insert(['number' => 'M1', 'track_token' => str_repeat('a', 40), 'status' => 'completed', 'payment' => 'paid', 'subtotal' => 10000, 'created_at' => '2026-10-10 12:00:00']);
        DB::table('menus_orders')->insert(['number' => 'M2', 'track_token' => str_repeat('b', 40), 'status' => 'cancelled', 'payment' => 'paid', 'subtotal' => 99999, 'created_at' => '2026-10-10 12:00:00']);
        $r = $this->waste()->report('2026-10-01', '2026-10-31', self::BRANCH);
        $this->assertSame([1200.0, 3, 10000.0, 12.0], [$r['total'], $r['entries'], $r['sales'], $r['percent_of_sales']], 'a cancelled order is not a sale');
        $kinds = collect($r['by_kind'])->keyBy('kind');
        $this->assertSame([200.0, 500.0, 500.0], [$kinds['spoilage']['cost'], $kinds['staff_meal']['cost'], $kinds['over_prep']['cost']]);
        $this->assertSame(['Beef Beef', 1000.0, 2000.0, 'g'], [$r['by_item'][0]['name'], $r['by_item'][0]['cost'], $r['by_item'][0]['quantity'], $r['by_item'][0]['unit']], 'the dearest item first');
        $this->assertSame([['2026-10-10', 700.0], ['2026-10-11', 500.0]], array_map(fn ($d) => [$d['date'], $d['cost']], $r['by_day']));
        $this->assertSame(0.0, $this->waste()->report('2026-09-01', '2026-09-30')['total']);
        $this->assertSame('Beef Beef', $this->waste()->recent(self::BRANCH)[0]['item']);
    }

    // ------------------------------------------------------------ stock taking

    private function counts(): StockCounts
    {
        return app(StockCounts::class);
    }

    public function test_stock_is_counted_in_packs_and_a_shortage_is_taken_off_and_booked_as_a_loss(): void
    {
        $this->flour();
        $old = $this->shelve('Exe 2 kg', 12000, 0.10, '2026-11-01');
        $new = $this->shelve('Exe 2 kg', 13000, 0.12, '2027-01-01');   // 25 kg on the books
        $c = $this->counts()->post(['location_id' => self::BRANCH, 'date' => '2026-10-16', 'lines' => [['item_id' => $this->itemId('Exe 2 kg'), 'quantity' => 10, 'unit' => 'pack']]], null);   // 10 packs of 2 kg = 20 kg
        $line = $c->lines->first();
        $this->assertSame([25000.0, 20000.0, -5000.0], [(float) $line->expected, (float) $line->counted, (float) $line->variance]);
        $this->assertSame([7000.0, 13000.0], [$this->left($old), $this->left($new)], 'the lot expiring first is short');
        $this->assertEqualsWithDelta(-500.0, (float) $c->value_change, 0.001, '5000 x 0.10');
        $this->assertSame([$this->wasteLedger(), $this->inventory, 500.0], $this->lastJournal());
        $this->assertSame('SC-'.str_pad((string) $c->id, 6, '0', STR_PAD_LEFT), $c->number);
        $this->assertSame(5000.0, abs((float) StockMove::where('kind', 'count')->value('quantity')));
    }

    public function test_stock_found_becomes_a_lot_at_the_last_cost_and_is_booked_as_a_gain(): void
    {
        $this->flour();
        $this->shelve('Exe 2 kg', 10000, 0.15);
        $c = $this->counts()->post(['location_id' => self::BRANCH, 'lines' => [['item_id' => $this->itemId('Exe 2 kg'), 'quantity' => 14, 'unit' => 'alt']]], null);
        $found = StockBatch::where('source', 'count')->first();
        $this->assertSame([4000.0, 0.15], [(float) $found->qty_left, (float) $found->unit_cost]);
        $this->assertEqualsWithDelta(600.0, (float) $c->value_change, 0.001);
        $this->assertSame([$this->inventory, $this->wasteLedger(), 600.0], $this->lastJournal(), 'Dr Inventory, Cr Food Waste Expense');
        $this->assertSame(14000.0, app(StockCounts::class)->expected($this->itemId('Exe 2 kg'), self::BRANCH));
    }

    public function test_a_count_that_agrees_books_nothing_and_a_refused_count_changes_nothing(): void
    {
        $this->flour();
        $this->shelve('Exe 2 kg', 10000, 0.1);
        $exe = $this->itemId('Exe 2 kg');
        $c = $this->counts()->post(['location_id' => self::BRANCH, 'lines' => [['item_id' => $exe, 'quantity' => 10, 'unit' => 'alt']]], null);
        $this->assertSame([0, null], [count($this->posted), $c->journal_id]);
        $this->fails(fn () => $this->counts()->post(['location_id' => self::BRANCH, 'lines' => [['item_id' => $exe, 'quantity' => 1, 'unit' => 'alt'], ['item_id' => $exe, 'quantity' => 2]]], null), 'counted twice');
        $this->fails(fn () => $this->counts()->post(['location_id' => self::BRANCH, 'lines' => [['item_id' => $exe, 'quantity' => -1]]], null), 'how much');
        $this->fails(fn () => $this->counts()->post(['location_id' => self::BRANCH, 'lines' => []], null), 'at least one');
        $this->fails(fn () => $this->counts()->post(['location_id' => 99, 'lines' => [['item_id' => $exe, 'quantity' => 1]]], null), 'branch');
        $this->fails(fn () => $this->counts()->post(['location_id' => self::BRANCH, 'lines' => [['item_id' => $exe, 'quantity' => 3, 'unit' => 'alt'], ['item_id' => 999, 'quantity' => 1]]], null), 'choose an ingredient');
        $this->assertSame([1, 10000.0], [Count::count(), app(StockCounts::class)->expected($exe, self::BRANCH)], 'the failed counts left no trace (and the shelf is as it was)');
    }

    // ------------------------------------------------------------ between branches

    public function test_stock_sent_to_another_branch_keeps_its_cost_expiry_and_batch_number(): void
    {
        $this->flour();
        $a = $this->shelve('Exe 2 kg', 3000, 0.10, '2026-11-01');
        $b = $this->shelve('Exe 2 kg', 5000, 0.14, '2027-02-01');
        StockBatch::whereKey($a->id)->update(['batch_no' => 'B-1']);
        $exe = $this->itemId('Exe 2 kg');
        $t = app(StockTransfers::class)->send(['from_location_id' => self::BRANCH, 'to_location_id' => self::OTHER, 'lines' => [['item_id' => $exe, 'quantity' => 4, 'unit' => 'alt']]], null);   // 4 kg
        $this->assertSame([0.0, 4000.0], [$this->left($a), $this->left($b)], 'the lot expiring first goes first');
        $there = StockBatch::where('location_id', self::OTHER)->orderBy('id')->get();
        $this->assertSame([[3000.0, 0.10, '2026-11-01', 'B-1'], [1000.0, 0.14, '2027-02-01', null]], $there->map(fn ($x) => [(float) $x->qty_left, (float) $x->unit_cost, $x->expiry_date->toDateString(), $x->batch_no])->all());
        $this->assertSame([4000.0, 0.11], [(float) $t->lines->first()->quantity, (float) $t->lines->first()->unit_cost], '(3000 x 0.10 + 1000 x 0.14) / 4000');
        $this->assertSame(2, StockMove::where('kind', 'transfer_in')->count());
        $this->assertSame([4000.0, 4000.0], [app(StockCounts::class)->expected($exe, self::BRANCH), app(StockCounts::class)->expected($exe, self::OTHER)]);
    }

    public function test_only_good_stock_that_is_there_can_be_sent_to_a_branch_that_exists(): void
    {
        $this->flour();
        $this->shelve('Exe 2 kg', 2000, 0.1, '2026-10-01');                 // expired
        $this->shelve('Exe 2 kg', 3000, 0.1, '2027-01-01', 1, 'held');       // held back
        $this->shelve('Exe 2 kg', 1000, 0.1);
        $exe = $this->itemId('Exe 2 kg');
        $send = fn (array $o) => app(StockTransfers::class)->send($o + ['from_location_id' => self::BRANCH, 'to_location_id' => self::OTHER, 'lines' => [['item_id' => $exe, 'quantity' => 1500]]], null);
        $this->fails(fn () => $send([]), 'Only 1000 g');
        $this->fails(fn () => $send(['to_location_id' => self::BRANCH]), 'different branches');
        $this->fails(fn () => $send(['to_location_id' => 99]), 'two branches');
        $this->fails(fn () => $send(['lines' => []]), 'at least one');
        $this->fails(fn () => $send(['lines' => [['item_id' => $exe, 'quantity' => 0]]]), 'how much');
        $this->assertSame([0, 6000.0], [StockBatch::where('location_id', self::OTHER)->count(), app(StockCounts::class)->expected($exe, self::BRANCH)]);
    }

    // ------------------------------------------------------------ expiry

    public function test_the_expiry_list_names_what_has_expired_and_what_will_soon(): void
    {
        $this->flour();
        $this->shelve('Exe 2 kg', 2000, 0.1, '2026-10-10');
        $this->shelve('Exe 2 kg', 5000, 0.2, '2026-10-20');
        $this->shelve('Exe 2 kg', 5000, 0.2, '2026-12-20');   // not soon
        $this->shelve('Exe 2 kg', 0, 0.2, '2026-10-17');       // used up
        $rows = app(IngredientStock::class)->expiring(self::BRANCH, 7);
        $this->assertSame([['2026-10-10', -6, true, 2000.0, 200.0], ['2026-10-20', 4, false, 5000.0, 1000.0]], array_map(fn ($r) => [$r['expiry_date'], $r['days_left'], $r['expired'], $r['quantity'], $r['value']], $rows));
        $this->assertSame('Wheat flour Exe 2 kg', $rows[0]['name']);
        $this->assertCount(0, app(IngredientStock::class)->expiring(self::OTHER, 7));
    }

    // ------------------------------------------------------------ the prep list

    private function sale(int $dishId, float $qty, string $at, array $o = []): void
    {
        $id = DB::table('menus_orders')->insertGetId($o + ['number' => 'M'.random_int(1, 999999), 'track_token' => str_repeat('c', 40), 'location_id' => self::BRANCH, 'fulfil_at' => $at, 'status' => 'completed', 'payment' => 'paid', 'created_at' => $at]);
        DB::table('menus_order_lines')->insert(['order_id' => $id, 'dish_id' => $dishId, 'name' => 'x', 'quantity' => $qty]);
    }

    private function prep(): PrepService
    {
        return app(PrepService::class);
    }

    public function test_the_expected_sales_are_the_average_of_the_same_weekday_over_the_days_it_was_open(): void
    {
        $d = $this->dish('Chapati', 50);
        // the target is Monday 19 Oct 2026; earlier Mondays: 5 Oct sold 20, 12 Oct sold 40; Tuesday 13 Oct sold 100 (not a Monday); 28 Sep nothing (closed)
        $this->sale($d->id, 20, '2026-10-05 12:00:00');
        $this->sale($d->id, 40, '2026-10-12 12:00:00');
        $this->sale($d->id, 100, '2026-10-13 12:00:00');
        $this->sale($d->id, 500, '2026-10-12 13:00:00', ['status' => 'cancelled']);
        $this->sale($d->id, 500, '2026-10-12 13:00:00', ['payment' => 'failed']);
        $this->sale($d->id, 500, '2026-10-12 13:00:00', ['location_id' => 77]);
        $f = $this->prep()->forecast(Carbon::parse('2026-10-19'), self::BRANCH, 4, 10);
        $this->assertSame(['Monday', 30.0, 33], [$f['weekday'], $f['dishes'][0]['average'], $f['dishes'][0]['expect']], '(20 + 40) / 2 Mondays = 30, and a tenth more');
        $this->assertSame(30.0, $this->prep()->average(Carbon::parse('2026-10-19'), self::BRANCH, 4)[$d->id]);
    }

    public function test_what_is_already_ordered_for_the_day_counts_when_it_is_more(): void
    {
        $d = $this->dish('Chapati', 50);
        $this->sale($d->id, 10, '2026-10-12 12:00:00');
        $this->sale($d->id, 60, '2026-10-19 18:00:00', ['status' => 'placed', 'payment' => 'later']);
        $this->sale($d->id, 5, '2026-10-19 19:00:00', ['status' => 'cancelled']);
        $this->sale($d->id, 5, '2026-10-20 19:00:00', ['status' => 'placed']);
        $this->sale($d->id, 500, '2026-10-19 10:00:00', ['status' => 'placed', 'payment' => 'failed']);   // never paid for
        $this->sale($d->id, 500, '2026-10-19 09:00:00');   // already served: not still to be made
        $f = $this->prep()->forecast(Carbon::parse('2026-10-19'), self::BRANCH);
        $this->assertSame([60.0, 60], [$f['dishes'][0]['booked'], $f['dishes'][0]['expect']], 'booked 60 beats 11');
    }

    public function test_a_dish_made_ahead_is_made_up_to_what_is_expected_and_only_that_uses_ingredients(): void
    {
        $this->makeIngredient('Filling', $this->g, $this->kg, [['name' => 'Filling']]);
        $this->shelve('Filling', 3000, 0.1);
        $d = $this->dish('Samosa', 30, [['Filling', 100]], false, 10);   // 100 g makes ten samosas
        DishBatch::create(['dish_id' => $d->id, 'location_id' => self::BRANCH, 'made_on' => '2026-10-15', 'unit_cost' => 5, 'qty_in' => 25, 'qty_left' => 25, 'status' => 'ok']);
        $this->sale($d->id, 50, '2026-10-12 12:00:00');
        $f = $this->prep()->forecast(Carbon::parse('2026-10-19'), self::BRANCH, 4, 0);
        $x = $f['dishes'][0];
        $this->assertSame(['ahead', 50, 25.0, 25.0, 3], [$x['mode'], $x['expect'], $x['on_shelf'], $x['to_make'], $x['batches']], '25 more are needed: three batches of ten');
        $i = $f['ingredients'][0];
        $this->assertSame(['Filling', 250.0, 3000.0, 0.0, 'g'], [$i['name'], $i['need'], $i['on_hand'], $i['short'], $i['unit']], '25 samosas take 250 g');
    }

    public function test_a_dish_made_to_order_needs_ingredients_for_all_of_it_and_the_list_says_what_is_short(): void
    {
        $this->flour();
        $this->shelve('Exe 2 kg', 2000, 0.1);
        $d = $this->dish('Chapati', 50, [['Wheat flour', 100]]);   // 100 g each
        $this->sale($d->id, 30, '2026-10-12 12:00:00');
        $f = $this->prep()->forecast(Carbon::parse('2026-10-19'), self::BRANCH, 4, 0);
        $this->assertSame(['to_order', 30, null], [$f['dishes'][0]['mode'], $f['dishes'][0]['expect'], $f['dishes'][0]['on_shelf']]);
        $i = $f['ingredients'][0];
        $this->assertSame(['Wheat flour', 3000.0, 2000.0, 1000.0, 'g'], [$i['name'], $i['need'], $i['on_hand'], $i['short'], $i['unit']], 'in the ingredient\'s own unit');
    }

    public function test_stock_that_cannot_be_used_does_not_count_as_on_hand_for_the_prep_list(): void
    {
        $this->flour();
        $this->shelve('Exe 2 kg', 2000, 0.1, '2026-10-01');               // expired
        $this->shelve('Exe 2 kg', 2000, 0.1, null, 1, 'held');
        $d = $this->dish('Chapati', 50, [['Wheat flour', 100]]);
        $this->sale($d->id, 10, '2026-10-12 12:00:00');
        $i = $this->prep()->forecast(Carbon::parse('2026-10-19'), self::BRANCH, 4, 0)['ingredients'][0];
        $this->assertSame([1000.0, 0.0, 1000.0], [$i['need'], $i['on_hand'], $i['short']]);
    }

    public function test_dishes_without_a_recipe_are_listed_but_ask_for_nothing(): void
    {
        $d = $this->dish('Soda', 50);
        $this->sale($d->id, 8, '2026-10-12 12:00:00');
        $f = $this->prep()->forecast(Carbon::parse('2026-10-19'), self::BRANCH, 4, 0);
        $this->assertSame([['no_recipe', 8], []], [[$f['dishes'][0]['mode'], $f['dishes'][0]['expect']], $f['ingredients']]);
    }

    // ------------------------------------------------------------ what to buy

    private function bought(string $item, float $qty, float $rate, string $unit = 'base', ?int $supplier = null): void
    {
        app(IngredientReceiving::class)->receive(['location_id' => self::BRANCH, 'date' => '2026-10-01', 'supplier_ledger_id' => $supplier ?? $this->supplier, 'lines' => [['item_id' => $this->itemId($item), 'quantity' => $qty, 'unit' => $unit, 'rate' => $rate, 'expiry_date' => '2027-01-01']]], null);
    }

    private function reorder(): ReorderService
    {
        return app(ReorderService::class);
    }

    private function supplier2(): int
    {
        return DB::table('ledgers')->insertGetId(['name' => 'Unga Traders', 'group_id' => DB::table('ledger_groups')->where('name', 'Sundry Creditors')->value('id')]);
    }

    public function test_the_forecast_use_of_the_coming_days_less_the_shelf_is_what_to_buy(): void
    {
        $this->makeIngredient('Oil', $this->ml, $this->l, [['name' => 'Oil 1 L', 'pack' => 1000]]);
        $this->bought('Oil 1 L', 2, 250, 'pack');   // 2 packs of a litre at 250 each
        $d = $this->dish('Chapati', 50, [['Oil', 100]]);   // 100 ml each
        // every Monday sells 50: the next 7 days include exactly one Monday
        $this->sale($d->id, 50, '2026-10-05 12:00:00');
        $this->sale($d->id, 50, '2026-10-12 12:00:00');
        $rows = $this->reorder()->suggest(self::BRANCH, 7, Carbon::parse('2026-10-12'), 4, 0);   // 13 to 19 October
        $this->assertCount(1, $rows);
        $r = $rows[0];
        $this->assertSame([5000.0, 2000.0, 3.0, 'packs', 'pack', 'forecast', 'Naivas Wholesale', 250.0], [$r['need'], $r['on_hand'], $r['quantity'], $r['unit'], $r['unit_kind'], $r['reason'], $r['supplier'], $r['unit_cost']], '5 litres used, 2 on the shelf: buy 3 packs');
        $this->bought('Oil 1 L', 10, 250, 'pack');
        $this->assertSame([], $this->reorder()->suggest(self::BRANCH, 7, Carbon::parse('2026-10-12'), 4, 0), 'enough on the shelf: nothing to buy');
    }

    public function test_an_ingredient_is_ordered_as_its_preferred_variant_and_the_level_to_keep_is_added(): void
    {
        $this->makeIngredient('Wheat flour', $this->g, $this->kg, [['name' => 'Pembe 24 kg', 'pack' => 24000], ['name' => 'Exe 2 kg', 'pack' => 2000, 'level' => 6000]]);
        $s2 = $this->supplier2();
        $this->bought('Pembe 24 kg', 1, 2400, 'pack', $s2);
        $this->bought('Exe 2 kg', 1, 260, 'pack');
        $d = $this->dish('Chapati', 50, [['Wheat flour', 100]]);
        $this->sale($d->id, 100, '2026-10-12 12:00:00');
        // the 24 kg bag is used up; 2 kg of Exe is on the shelf. Chapati needs 10 kg this week: 8 kg short = one bag of the preferred variant
        StockBatch::where('item_id', $this->itemId('Pembe 24 kg'))->update(['qty_left' => 0]);
        $rows = collect($this->reorder()->suggest(self::BRANCH, 7, Carbon::parse('2026-10-12'), 4, 0))->keyBy('item_id');
        $r = $rows[$this->itemId('Pembe 24 kg')];
        $this->assertSame([10000.0, 2000.0, 1.0, 'Unga Traders', 24000.0], [$r['need'], $r['on_hand'], $r['quantity'], $r['supplier'], $r['quantity_base']], '10 kg needed, 2 kg on hand: 8 kg is one 24 kg bag');
        // Exe sits under its own level (6 kg to keep, 2 kg there) so it is asked for too
        $low = $rows[$this->itemId('Exe 2 kg')];
        $this->assertSame(['below_par', 2.0, 6000.0, 2000.0], [$low['reason'], $low['quantity'], $low['par'], $low['on_hand']], '4 kg short is two 2 kg packs');
    }

    public function test_things_counted_in_packs_are_bought_whole_and_things_bought_by_weight_are_not(): void
    {
        $this->makeIngredient('Oil', $this->ml, $this->l, [['name' => 'Oil', 'level' => 2250]]);          // no pack size: the bigger unit, in hundredths
        $this->makeIngredient('Bags', $this->each, null, [['name' => 'Bags', 'level' => 3]]);               // counted by the piece: whole
        $this->makeIngredient('Salt', $this->g, null, [['name' => 'Salt 500 g', 'pack' => 500, 'level' => 1100]]);   // packs
        foreach (['Oil', 'Bags', 'Salt 500 g'] as $i) {
            $this->bought($i, 1, 1);
            StockBatch::where('item_id', $this->itemId($i))->update(['qty_left' => 0]);
        }
        $rows = collect($this->reorder()->suggest(self::BRANCH, 7, Carbon::parse('2026-10-12')))->keyBy('name');
        $this->assertSame([2.25, 'l', 3.0, 'each', 3.0, 'packs'], [$rows['Oil Oil']['quantity'], $rows['Oil Oil']['unit'], $rows['Bags Bags']['quantity'], $rows['Bags Bags']['unit'], $rows['Salt Salt 500 g']['quantity'], $rows['Salt Salt 500 g']['unit']],
            'a litre can be 2.25; a piece is whole; 1100 g of salt is three 500 g packs');
    }

    public function test_the_supplier_is_whoever_it_was_last_bought_from(): void
    {
        $this->makeIngredient('Oil', $this->ml, null, [['name' => 'Oil']]);
        $this->bought('Oil', 100, 1);
        $s2 = $this->supplier2();
        $this->bought('Oil', 100, 1, 'base', $s2);
        $this->assertSame($s2, $this->reorder()->supplier($this->itemId('Oil'))[0]);
        $this->makeIngredient('Mystery', $this->g, null, [['name' => 'Mystery']]);
        $this->assertSame([null, null], $this->reorder()->supplier($this->itemId('Mystery')));
    }

    public function test_orders_are_made_one_per_supplier_and_variants_with_no_known_supplier_are_named(): void
    {
        $this->makeIngredient('Oil', $this->ml, $this->l, [['name' => 'Oil 1 L', 'pack' => 1000]]);
        $this->makeIngredient('Beans', $this->g, $this->kg, [['name' => 'Beans']]);
        $this->makeIngredient('Salt', $this->g, null, [['name' => 'Salt']]);
        $this->makeIngredient('Mystery', $this->g, null, [['name' => 'Mystery']]);
        $s2 = $this->supplier2();
        $this->bought('Oil 1 L', 1, 250, 'pack');
        $this->bought('Beans', 1, 120, 'alt');
        $this->bought('Salt', 1000, 0.05, 'base', $s2);
        $r = $this->reorder()->makeOrders(self::BRANCH, [
            ['item_id' => $this->itemId('Oil 1 L'), 'quantity' => 3, 'unit' => 'pack'], ['item_id' => $this->itemId('Beans'), 'quantity' => 10, 'unit' => 'alt'],
            ['item_id' => $this->itemId('Salt'), 'quantity' => 2000, 'unit' => 'base'], ['item_id' => $this->itemId('Mystery'), 'quantity' => 1], ['item_id' => $this->itemId('Oil 1 L'), 'quantity' => 0],
        ], null);
        $this->assertSame([2, ['Mystery Mystery']], [count($r['created']), $r['skipped']]);
        $this->assertSame([2, 1], array_map(fn ($c) => $c['lines'], $r['created']));
        $po = array_values(array_filter($this->posted, fn ($d) => $d['voucher_type_id'] === 5));
        $first = $po[0];
        $this->assertSame([$this->supplier, self::BRANCH, [3.0, 10.0], [250.0, 120.0]], [$first['party_ledger_id'], $first['location_id'], array_map(fn ($l) => (float) $l['quantity'], $first['lines']), array_map(fn ($l) => (float) $l['rate'], $first['lines'])], 'a price per pack, per kg: what it last cost');
        $this->assertSame([$this->inventory, 'custom'], [$first['lines'][0]['ledger_id'], $first['lines'][0]['type']]);
        $this->assertStringContainsString('3 packs', $first['lines'][0]['description']);
        $this->assertSame(['Naivas Wholesale', 'Unga Traders'], array_column($r['created'], 'supplier'));
    }
}

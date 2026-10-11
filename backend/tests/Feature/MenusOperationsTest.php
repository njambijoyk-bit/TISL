<?php

namespace Tests\Feature;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Menus\Waste;
use App\Models\StockBatch;
use App\Services\Books\BooksException;
use App\Services\Books\VoucherService;
use App\Services\Menus\PrepService;
use App\Services\Menus\ReorderService;
use App\Services\Menus\WasteService;
use App\Services\Stock\StockWriteOffService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Menus step 9: kitchen operations. The waste log (and what it writes off), the prep list worked out from sales and bookings, and what to buy. */
class MenusOperationsTest extends TestCase
{
    use Concerns\CreatesCounterWorld;

    private array $writeOffs = [];
    private array $created = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createCounterWorld();
        Schema::create('menus_waste', function ($t) { $t->id(); $t->unsignedBigInteger('location_id'); $t->unsignedBigInteger('variant_id'); $t->decimal('quantity', 18, 4); $t->decimal('cost', 14, 2)->default(0); $t->string('kind', 12); $t->string('note', 200)->nullable(); $t->json('voucher_ids')->nullable(); $t->unsignedBigInteger('user_id')->nullable(); $t->date('wasted_on'); $t->dateTime('voided_at')->nullable(); $t->unsignedBigInteger('voided_by')->nullable(); $t->timestamps(); });
        Schema::table('stock_batches', fn ($t) => $t->unsignedBigInteger('received_voucher_id')->nullable());
        Schema::table('vouchers', fn ($t) => $t->unsignedBigInteger('party_ledger_id')->nullable());
        DB::table('ledgers')->insert([['id' => 90, 'name' => 'Mama Mboga Ltd', 'group_id' => 1], ['id' => 91, 'name' => 'Unga Traders', 'group_id' => 1]]);
        Schema::create('voucher_types', function ($t) { $t->id(); $t->string('base_type'); $t->boolean('is_active')->default(true); $t->timestamps(); });
        DB::table('voucher_types')->insert([['id' => 1, 'base_type' => 'sales_order', 'is_active' => 1], ['id' => 2, 'base_type' => 'purchase_order', 'is_active' => 1]]);
        // the stock write-off: takes the stock out of the batch and says what it cost
        $w = $this->createMock(StockWriteOffService::class);
        $w->method('writeOff')->willReturnCallback(function (StockBatch $b, ?int $loc, ?float $qty, string $reason) {
            $this->writeOffs[] = [$b->id, $qty, $reason];
            DB::table('stock_batch_balances')->where('batch_id', $b->id)->where('location_id', $loc)->decrement('quantity', $qty);
            $v = Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'J-'.count($this->writeOffs), 'total_amount' => 0]);

            return ['voucher_id' => $v->id, 'quantity' => $qty, 'cost' => round($qty * (float) $b->unit_cost, 2)];
        });
        $this->app->instance(StockWriteOffService::class, $w);
        $vouchers = $this->createMock(VoucherService::class);
        $vouchers->method('cancel')->willReturnCallback(function (Voucher $v) { $this->cancelled[] = $v->id; $v->update(['status' => 'cancelled']); return $v; });
        $vouchers->method('create')->willReturnCallback(function (array $d) {
            $this->created[] = $d;

            return Voucher::create(['voucher_type_id' => $d['voucher_type_id'], 'voucher_number' => 'PO-'.count($this->created), 'party_ledger_id' => $d['party_ledger_id']]);
        });
        $this->app->instance(VoucherService::class, $vouchers);
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

    private function in(int $variant, float $qty, array $o = []): array
    {
        return $o + ['location_id' => self::BRANCH, 'variant_id' => $variant, 'quantity' => $qty, 'kind' => 'spoilage'];
    }

    // ------------------------------------------------------------ waste

    public function test_a_waste_entry_needs_a_reason_an_amount_an_item_and_a_day_that_has_come(): void
    {
        $v = $this->item('Tomatoes', '1 kg');
        $this->stock($v, 10);
        $this->fails(fn () => $this->waste()->record($this->in($v, 1, ['kind' => 'because'])), 'why it was wasted');
        $this->fails(fn () => $this->waste()->record($this->in($v, 0)), 'how much');
        $this->fails(fn () => $this->waste()->record($this->in(999, 1)), 'what was wasted');
        $this->fails(fn () => $this->waste()->record($this->in($v, 1, ['location_id' => 999])), 'branch');
        $this->fails(fn () => $this->waste()->record($this->in($v, 1, ['date' => '2099-01-01'])), 'not come yet');
        $this->fails(fn () => $this->waste()->record($this->in($v, 11)), 'Only 10');
        $this->assertSame([[], 0], [$this->writeOffs, Waste::count()], 'a refused entry writes nothing off');
    }

    public function test_the_stock_leaves_first_expiring_first_expired_included_and_the_cost_is_the_batches(): void
    {
        $v = $this->item('Tomatoes', '1 kg');
        $fresh = $this->stock($v, 10, 100, '2026-12-01');
        $old = $this->stock($v, 3, 80, '2026-10-01');   // already expired
        $none = $this->stock($v, 5, 120, null);
        $w = $this->waste()->record($this->in($v, 5, ['note' => 'went off']), null);
        $this->assertSame([[$old, 3.0], [$fresh, 2.0]], array_map(fn ($x) => [$x[0], (float) $x[1]], $this->writeOffs), 'expired first, then the next to expire; a batch with no date last');
        $this->assertSame('Spoilage: went off', $this->writeOffs[0][2]);
        $this->assertSame([440.0, 5.0, 'spoilage', 2], [(float) $w->cost, (float) $w->quantity, $w->kind, count($w->voucher_ids)], '3 × 80 + 2 × 100');
        $this->assertSame(8.0, (float) DB::table('stock_batch_balances')->where('batch_id', $fresh)->value('quantity'));
        $this->assertSame(5.0, (float) DB::table('stock_batch_balances')->where('batch_id', $none)->value('quantity'));
    }

    public function test_a_dish_made_to_order_that_was_thrown_away_writes_off_what_it_is_made_of(): void
    {
        $oil = $this->item('Oil', '1 l');
        $flour = $this->item('Flour', '1 kg');
        $this->stock($oil, 5, 200);
        $this->stock($flour, 5, 100);
        $d = $this->make('Chapati', 50);
        $this->recipe($d, [['variant_id' => $oil, 'quantity' => 0.5], ['variant_id' => $flour, 'quantity' => 0.25]]);
        $w = $this->waste()->record($this->in((int) $d->variant_id, 2, ['kind' => 'plate']), null);
        $this->assertSame([1.0, 0.5], array_map(fn ($x) => (float) $x[1], $this->writeOffs), 'two portions: a litre of oil and half a kilo of flour');
        $this->assertSame([250.0, 2.0], [(float) $w->cost, (float) $w->quantity]);
    }

    public function test_an_entry_taken_back_cancels_its_journals_once(): void
    {
        $v = $this->item('Tomatoes', '1 kg');
        $this->stock($v, 10);
        $w = $this->waste()->record($this->in($v, 4), null);
        $voided = $this->waste()->void($w);
        $this->assertSame([$w->voucher_ids, true], [$this->cancelled, $voided->voided_at !== null]);
        $this->fails(fn () => $this->waste()->void($voided), 'already taken back');
        $this->assertSame(0.0, $this->waste()->report('2026-10-01', '2026-10-31')['total'], 'a taken-back entry is not counted');
    }

    public function test_the_report_counts_by_reason_item_and_day_against_food_sales(): void
    {
        $a = $this->item('Tomatoes', '1 kg');
        $b = $this->item('Beef', '1 kg');
        $this->stock($a, 50, 100);
        $this->stock($b, 50, 500);
        $this->waste()->record($this->in($a, 2, ['date' => '2026-10-10']), null);
        $this->waste()->record($this->in($b, 1, ['date' => '2026-10-10', 'kind' => 'staff_meal']), null);
        $this->waste()->record($this->in($b, 1, ['date' => '2026-10-11', 'kind' => 'over_prep']), null);
        DB::table('menus_orders')->insert(['number' => 'M1', 'track_token' => str_repeat('a', 40), 'name' => 'x', 'fulfil_at' => '2026-10-10 12:00:00', 'status' => 'completed', 'payment' => 'paid', 'subtotal' => 10000, 'created_at' => '2026-10-10 12:00:00']);
        DB::table('menus_orders')->insert(['number' => 'M2', 'track_token' => str_repeat('b', 40), 'name' => 'x', 'fulfil_at' => '2026-10-10 12:00:00', 'status' => 'cancelled', 'payment' => 'paid', 'subtotal' => 99999, 'created_at' => '2026-10-10 12:00:00']);
        $r = $this->waste()->report('2026-10-01', '2026-10-31', self::BRANCH);
        $this->assertSame([1200.0, 3, 10000.0, 12.0], [$r['total'], $r['entries'], $r['sales'], $r['percent_of_sales']], 'a cancelled order is not a sale');
        $kinds = collect($r['by_kind'])->keyBy('kind');
        $this->assertSame([200.0, 500.0, 500.0], [$kinds['spoilage']['cost'], $kinds['staff_meal']['cost'], $kinds['over_prep']['cost']]);
        $this->assertSame(['Beef', 1000.0], [trim(str_replace('1 kg', '', $r['by_item'][0]['name'])), $r['by_item'][0]['cost']], 'the dearest item first');
        $this->assertSame([['2026-10-10', 700.0], ['2026-10-11', 500.0]], array_map(fn ($d) => [$d['date'], $d['cost']], $r['by_day']));
        $this->assertSame(0.0, $this->waste()->report('2026-09-01', '2026-09-30')['total']);
    }

    // ------------------------------------------------------------ the prep list

    private function sale(int $dishId, float $qty, string $at, array $o = []): void
    {
        $id = DB::table('menus_orders')->insertGetId($o + ['number' => 'M'.random_int(1, 999999), 'track_token' => str_repeat('c', 40), 'name' => 'x', 'location_id' => self::BRANCH, 'fulfil_at' => $at, 'status' => 'completed', 'payment' => 'paid', 'created_at' => $at]);
        DB::table('menus_order_lines')->insert(['order_id' => $id, 'dish_id' => $dishId, 'variant_id' => 1, 'name' => 'x', 'quantity' => $qty]);
    }

    private function prep(): PrepService
    {
        return app(PrepService::class);
    }

    public function test_the_expected_sales_are_the_average_of_the_same_weekday_over_the_days_it_was_open(): void
    {
        $d = $this->make('Chapati', 50);
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
        $d = $this->make('Chapati', 50);
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
        $filling = $this->item('Filling', '1 kg');
        $this->stock($filling, 3, 100);
        $d = $this->make('Samosa', 30);
        $this->recipe($d, [['variant_id' => $filling, 'quantity' => 1]], 10, false);   // one kilo makes ten samosas
        $this->stock((int) $d->variant_id, 25);
        $this->sale($d->id, 50, '2026-10-12 12:00:00');
        $f = $this->prep()->forecast(Carbon::parse('2026-10-19'), self::BRANCH, 4, 0);
        $x = $f['dishes'][0];
        $this->assertSame(['ahead', 50, 25.0, 25.0, 3], [$x['mode'], $x['expect'], $x['on_shelf'], $x['to_make'], $x['batches']], '25 more are needed: three batches of ten');
        $i = $f['ingredients'][0];
        $this->assertSame([2.5, 3.0, 0.0], [$i['need'], $i['on_hand'], $i['short']], '25 samosas take 2.5 kg');
    }

    public function test_a_dish_made_to_order_needs_ingredients_for_all_of_it_and_the_list_says_what_is_short(): void
    {
        $flour = $this->item('Exe flour', '2 kg');
        $this->stock($flour, 1);   // 2000 g
        $fam = $this->family('Flour', [], [[$flour, 2000]]);
        $d = $this->make('Chapati', 50);
        $this->recipe($d, [['family_id' => $fam, 'quantity' => 100]]);   // 100 g each
        $this->sale($d->id, 30, '2026-10-12 12:00:00');
        $f = $this->prep()->forecast(Carbon::parse('2026-10-19'), self::BRANCH, 4, 0);
        $this->assertSame(['to_order', 30, null], [$f['dishes'][0]['mode'], $f['dishes'][0]['expect'], $f['dishes'][0]['on_shelf']]);
        $i = $f['ingredients'][0];
        $this->assertSame(['Flour', 3000.0, 2000.0, 1000.0, 'g'], [$i['name'], $i['need'], $i['on_hand'], $i['short'], $i['unit']], 'in the family\'s own unit');
    }

    public function test_dishes_without_a_recipe_are_listed_but_ask_for_nothing(): void
    {
        $d = $this->make('Soda', 50);
        $this->sale($d->id, 8, '2026-10-12 12:00:00');
        $f = $this->prep()->forecast(Carbon::parse('2026-10-19'), self::BRANCH, 4, 0);
        $this->assertSame([['no_recipe', 8], []], [[$f['dishes'][0]['mode'], $f['dishes'][0]['expect']], $f['ingredients']]);
    }

    // ------------------------------------------------------------ what to buy

    private function bought(int $variant, int $supplier, float $cost = 100): void
    {
        $v = Voucher::create(['voucher_type_id' => 1, 'voucher_number' => 'P-'.random_int(1, 99999), 'party_ledger_id' => $supplier]);
        DB::table('stock_batches')->insert(['variant_id' => $variant, 'status' => 'active', 'unit_cost' => $cost, 'received_voucher_id' => $v->id]);
    }

    private function reorder(): ReorderService
    {
        return app(ReorderService::class);
    }

    public function test_the_forecast_use_of_the_coming_days_less_the_shelf_is_what_to_buy(): void
    {
        $oil = $this->item('Oil', '1 l');
        $this->bought($oil, 90, 250);
        $this->stock($oil, 2, 250);
        $d = $this->make('Chapati', 50);
        $this->recipe($d, [['variant_id' => $oil, 'quantity' => 0.1]]);   // 0.1 l each
        // every Monday sells 50 (a tenth buffer off): the next 7 days include exactly one Monday
        $this->sale($d->id, 50, '2026-10-05 12:00:00');
        $this->sale($d->id, 50, '2026-10-12 12:00:00');
        $rows = $this->reorder()->suggest(self::BRANCH, 7, Carbon::parse('2026-10-12'), 4, 0);   // 13 to 19 October
        $this->assertCount(1, $rows);
        $this->assertSame([5.0, 2.0, 3.0, 'forecast', 'Mama Mboga Ltd', 250.0], [$rows[0]['need'], $rows[0]['on_hand'], $rows[0]['quantity'], $rows[0]['reason'], $rows[0]['supplier'], $rows[0]['unit_cost']], '5 litres used, 2 on the shelf: buy 3');
        $this->stock($oil, 10, 250);
        $this->assertSame([], $this->reorder()->suggest(self::BRANCH, 7, Carbon::parse('2026-10-12'), 4, 0), 'enough on the shelf: nothing to buy');
    }

    public function test_the_level_to_keep_is_added_and_a_family_is_ordered_as_its_preferred_item(): void
    {
        $pembe = $this->item('Pembe', '24 kg');
        $exe = $this->item('Exe', '2 kg');
        $fam = $this->family('Flour', [], [[$pembe, 24000], [$exe, 2000]]);   // Pembe is preferred
        $this->bought($pembe, 91, 3000);
        $this->stock($exe, 1);    // 2000 g
        $d = $this->make('Chapati', 50);
        $this->recipe($d, [['family_id' => $fam, 'quantity' => 100]]);
        $this->sale($d->id, 100, '2026-10-12 12:00:00');
        $rows = collect($this->reorder()->suggest(self::BRANCH, 7, Carbon::parse('2026-10-12'), 4, 0))->keyBy('variant_id');
        $this->assertSame(1, $rows->count());
        $r = $rows[$pembe];
        $this->assertSame([10000.0, 2000.0, 1.0, 'Flour', 'Unga Traders'], [$r['need'], $r['on_hand'], $r['quantity'], $r['for'], $r['supplier']], '10 kg of flour needed, 2 on hand: 8 kg = one 24 kg bag');
        // a plain ingredient under its level shows up even though no recipe forecast needs it
        $salt = $this->item('Salt', '1 kg');
        $this->bought($salt, 90, 50);
        $this->stock($salt, 1, 50);
        DB::table('variant_location_stock')->insert(['product_variant_id' => $salt, 'location_id' => self::BRANCH, 'quantity' => 1, 'reorder_level' => 5]);
        DB::table('menus_ingredient_variants')->insert(['family_id' => $fam, 'variant_id' => $salt, 'preference' => 9, 'units_per_stock' => 1000, 'is_allowed' => false]);
        $low = collect($this->reorder()->suggest(self::BRANCH, 7, Carbon::parse('2026-10-12'), 4, 0))->firstWhere('variant_id', $salt);
        $this->assertSame(['below_par', 4.0, 5.0], [$low['reason'], $low['quantity'], $low['par']]);
    }

    public function test_a_family_used_on_two_lines_is_added_up_and_a_shelf_that_just_covers_it_asks_for_nothing(): void
    {
        $exe = $this->item('Exe flour', '2 kg');
        $this->bought($exe, 90, 200);
        $this->stock($exe, 3);   // 6000 g
        $fam = $this->family('Flour', [], [[$exe, 2000]]);
        $d = $this->make('Chapati', 50);
        $r = $this->recipe($d, [['family_id' => $fam, 'quantity' => 100]]);   // the service refuses a repeat, old data may have one
        DB::table('recipe_items')->insert(['recipe_id' => $r->id, 'family_id' => $fam, 'quantity' => 100]);   // 200 g each
        $this->sale($d->id, 30, '2026-10-12 12:00:00');
        $f = $this->prep()->forecast(Carbon::parse('2026-10-19'), self::BRANCH, 4, 0);
        $this->assertCount(1, $f['ingredients']);
        $this->assertSame(6000.0, $f['ingredients'][0]['need'], 'both lines count');
        $this->assertSame([], $this->reorder()->suggest(self::BRANCH, 7, Carbon::parse('2026-10-12'), 4, 0), '6000 needed, 6000 on the shelf');
    }

    public function test_the_supplier_is_whoever_it_was_last_bought_from(): void
    {
        $oil = $this->item('Oil', '1 l');
        $this->bought($oil, 90);
        $this->bought($oil, 91);
        $this->assertSame(91, $this->reorder()->supplier($oil)[0]);
    }

    public function test_things_counted_in_packs_are_bought_whole_and_things_bought_by_weight_are_not(): void
    {
        $oil = $this->item('Oil', '1 l');
        $bags = $this->item('Bags', 'pack');
        DB::table('product_variant_units')->insert([['variant_id' => $oil, 'unit_id' => $this->l, 'role' => 'base', 'base_factor' => 1], ['variant_id' => $bags, 'unit_id' => $this->each, 'role' => 'base', 'base_factor' => 1]]);
        $this->bought($oil, 90);
        $this->bought($bags, 90);
        DB::table('variant_location_stock')->insert([['product_variant_id' => $oil, 'location_id' => self::BRANCH, 'quantity' => 0, 'reorder_level' => 2.25], ['product_variant_id' => $bags, 'location_id' => self::BRANCH, 'quantity' => 0, 'reorder_level' => 2.25]]);
        DB::table('recipe_items')->insert([['recipe_id' => 99, 'variant_id' => $oil, 'quantity' => 1], ['recipe_id' => 99, 'variant_id' => $bags, 'quantity' => 1]]);
        $rows = collect($this->reorder()->suggest(self::BRANCH, 7, Carbon::parse('2026-10-12')))->keyBy('variant_id');
        $this->assertSame([2.25, 3.0], [$rows[$oil]['quantity'], $rows[$bags]['quantity']], 'a litre can be 2.25; a pack is 3');
    }

    public function test_orders_are_made_one_per_supplier_and_items_with_no_known_supplier_are_named(): void
    {
        $oil = $this->item('Oil', '1 l');
        $beans = $this->item('Beans', '1 kg');
        $salt = $this->item('Salt', '1 kg');
        $mystery = $this->item('Mystery spice', '1 kg');
        $this->bought($oil, 90, 250);
        $this->bought($beans, 90, 120);
        $this->bought($salt, 91, 50);
        $r = $this->reorder()->makeOrders(self::BRANCH, [['variant_id' => $oil, 'quantity' => 3], ['variant_id' => $beans, 'quantity' => 10], ['variant_id' => $salt, 'quantity' => 2], ['variant_id' => $mystery, 'quantity' => 1], ['variant_id' => $oil, 'quantity' => 0]], null);
        $this->assertSame([2, ['Mystery spice']], [count($r['created']), $r['skipped']]);
        $this->assertSame([2, 1], array_map(fn ($c) => $c['lines'], $r['created']));
        $first = $this->created[0];
        $this->assertSame([2, 90, self::BRANCH, [3.0, 10.0], [250.0, 120.0]], [$first['voucher_type_id'], $first['party_ledger_id'], $first['location_id'], array_map(fn ($l) => (float) $l['quantity'], $first['lines']), array_map(fn ($l) => (float) $l['rate'], $first['lines'])], 'at the price last paid');
        $this->assertSame(['Mama Mboga Ltd', 'Unga Traders'], array_column($r['created'], 'supplier'));
    }
}

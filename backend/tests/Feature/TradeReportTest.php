<?php

namespace Tests\Feature;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\Engine\Reports\TradeReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Trade by party and item (docs/BOOKS_REPORTS_PLAN.md, step 6.7). With one currency it gives what the old Stock movement report gave, to the cent; what
 * changes is the restated currency rule (audit H3), the grouping of walk-in names (H5), the dates (a financial year by default, H1), the export and the
 * banners (H6).
 */
class TradeReportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['voucher_items', 'products', 'units_of_measure'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::table('vouchers', fn ($t) => $t->string('party_name')->nullable());
        Schema::create('units_of_measure', function ($t) { $t->id(); $t->string('code'); });
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); $t->string('sku')->nullable(); $t->unsignedBigInteger('default_unit_id')->nullable(); });
        Schema::create('voucher_items', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->string('item_type')->default('product'); $t->unsignedBigInteger('product_id')->nullable(); $t->decimal('quantity', 15, 4)->default(1);
            $t->decimal('base_quantity', 15, 4)->nullable(); $t->decimal('amount', 15, 2)->default(0); $t->string('variant_label')->nullable(); $t->boolean('is_header')->default(false);
        });
        DB::table('units_of_measure')->insert(['id' => 1, 'code' => 'kg']);
        DB::table('products')->insert([['id' => 1, 'name' => 'Sugar', 'sku' => 'SUG', 'default_unit_id' => 1], ['id' => 2, 'name' => 'Flour', 'sku' => 'FLR', 'default_unit_id' => 1]]);
        DB::table('voucher_types')->insert([['id' => 20, 'code' => 'T-SI', 'name' => 'Sales', 'base_type' => 'sales'], ['id' => 21, 'code' => 'T-CN', 'name' => 'Credit note', 'base_type' => 'credit_note'],
            ['id' => 22, 'code' => 'T-PI', 'name' => 'Purchase', 'base_type' => 'purchase'], ['id' => 23, 'code' => 'T-CS', 'name' => 'Cash sale', 'base_type' => 'cash_sale'], ['id' => 24, 'code' => 'T-SO', 'name' => 'Sales order', 'base_type' => 'sales_order']]);
        // [type, date, status, party ledger, party name, currency, [[product, qty, amount], ...]]
        foreach ([
            [20, '2026-03-01', 'posted', 3, null, 1, [[1, 10, 1000], [2, 5, 400]]],
            [21, '2026-03-05', 'posted', 3, null, 1, [[1, 2, 200]]],                    // a return counts against the sales
            [22, '2026-03-10', 'posted', 8, null, 1, [[1, 100, 6000]]],
            [20, '2026-04-01', 'draft', 3, null, 1, [[1, 99, 9999]]],                   // a draft: never counted
            [20, '2025-12-20', 'posted', 3, null, 1, [[1, 7, 700]]],                    // before the year
            [24, '2026-03-02', 'posted', 3, null, 1, [[1, 3, 300]]],                    // an order moves no value
            [23, '2026-05-01', 'posted', null, 'Walk In', 1, [[1, 1, 100]]],
            [23, '2026-05-02', 'posted', null, ' walk   in ', 1, [[1, 2, 200]]],        // the same person, spelt differently
            [23, '2026-05-03', 'posted', null, 'Mary', 1, [[1, 1, 100]]],
        ] as $i => [$type, $date, $status, $party, $name, $cur, $lines]) {
            $v = DB::table('vouchers')->insertGetId(['voucher_type_id' => $type, 'voucher_number' => 'TR' . ($i + 1), 'date' => $date, 'status' => $status, 'party_ledger_id' => $party, 'party_name' => $name,
                'currency_id' => $cur, 'exchange_rate' => 1, 'total_amount' => 1, 'base_total' => 1, 'location_id' => 1, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($lines as [$p, $q, $a]) {
                DB::table('voucher_items')->insert(['voucher_id' => $v, 'product_id' => $p, 'quantity' => $q, 'base_quantity' => $q, 'amount' => $a]);
            }
        }
    }

    protected function tearDown(): void
    {
        foreach (['voucher_items', 'products', 'units_of_measure'] as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function run_(array $opts, string $from = '2026-01-01', string $to = '2026-12-31'): array
    {
        return (new TradeReport())->run(Scope::fromInput(['from' => $from, 'to' => $to]), $opts);
    }

    public function test_a_ledgers_items_are_listed_with_what_was_sold_and_returned(): void
    {
        $new = $this->run_(['ledger_id' => 3]);
        $this->assertSame('ledger', $new['mode']);
        $sugar = collect($new['rows'])->firstWhere('name', 'Sugar');
        $this->assertEquals([8, 800], [$sugar['sale_qty'], $sugar['sale_value']], '10 sold less 2 returned; the draft, the order and last year are left out');
        $this->assertEquals(100.0, $sugar['sale_rate']);
    }

    public function test_an_items_parties_are_listed_and_walk_in_names_are_grouped(): void
    {
        $new = $this->run_(['item' => 'product:1']);
        $this->assertSame('item', $new['mode']);
        $walkIn = collect($new['rows'])->filter(fn ($r) => $r['ledger_id'] === null && str_contains(strtolower($r['name']), 'walk'));
        $this->assertCount(1, $walkIn, 'two spellings of one name are one row (H5)');
        $this->assertEquals([3, 300], [$walkIn->first()['sale_qty'], $walkIn->first()['sale_value']]);
    }

    public function test_a_party_and_an_item_give_the_vouchers_and_every_party_with_all(): void
    {
        $new = $this->run_(['ledger_id' => 3, 'item' => 'product:1']);
        $this->assertSame('vouchers', $new['mode']);
        $this->assertSame([['Sales', 8.0, 800.0, 2]], array_map(fn ($g) => [$g['kind'], (float) $g['qty'], (float) $g['value'], count($g['rows'])], $new['groups']), 'what one customer bought of the item: 10 sold, 2 returned');
        $all = $this->run_(['ledger_id' => 'all', 'item' => 'product:1']);
        $this->assertSame([['Sales', 12.0, 1200.0, 5], ['Purchases', 100.0, 6000.0, 1]], array_map(fn ($g) => [$g['kind'], (float) $g['qty'], (float) $g['value'], count($g['rows'])], $all['groups']), 'every party: sales and purchases of the item');
    }

    public function test_it_asks_for_a_party_or_an_item_first(): void
    {
        $r = $this->run_([]);
        $this->assertFalse($r['ready']);
    }

    public function test_it_runs_through_the_engine_with_the_year_by_default_and_exports(): void
    {
        $user = new \App\Models\User();
        $user->id = 5;
        $this->grant($user, ['books.view']);
        $engine = app(ReportEngine::class);
        $out = $engine->run('trade', ['ledger_id' => 3], $user);
        $this->assertSame('2026-01-01', $out['scope']['from']);
        $this->assertSame('ledger', $out['data']['mode']);
        $table = (new TradeReport())->table($out['data'], Scope::fromInput(['from' => '2026-01-01', 'to' => '2026-12-31']));
        $this->assertSame('Trade by party and item: Customer A', $table['title']);
        $this->assertCount(2, $table['rows']);
    }

    public function test_a_voucher_made_under_another_base_is_shown_at_todays_rate(): void
    {
        // dollars posted when the base currency was dollars (stored base = amount): today's rate is 130, so the old report's stored rate of 1 disagrees with the ledgers
        $v = DB::table('vouchers')->insertGetId(['voucher_type_id' => 20, 'voucher_number' => 'USD1', 'date' => '2026-06-01', 'status' => 'posted', 'party_ledger_id' => 3, 'currency_id' => 2,
            'exchange_rate' => 1, 'total_amount' => 500, 'base_total' => 500, 'location_id' => 1, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('voucher_items')->insert(['voucher_id' => $v, 'product_id' => 2, 'quantity' => 1, 'base_quantity' => 1, 'amount' => 500]);
        $flour = collect($this->run_(['ledger_id' => 3])['rows'])->firstWhere('name', 'Flour');
        $this->assertEquals(400 + 65000, $flour['sale_value'], 'KES 400 plus USD 500 at 130');
        $this->assertGreaterThan(0, $this->run_(['ledger_id' => 3])['restated_vouchers']);
    }
}

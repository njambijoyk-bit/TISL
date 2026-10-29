<?php

namespace Tests\Feature;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\MoneyFlowReport;
use App\Services\Books\Engine\Reports\ProfitLossReport;
use App\Services\Books\Engine\Scope;
use App\Services\Books\VisualsService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The second wave of Visual report charts, each held to the books it is drawn from. */
class VisualsMoreTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;

    private const TABLES = ['voucher_bill_refs', 'report_settings', 'report_settings_log', 'accounting_settings', 'voucher_items', 'recon_sessions', 'recon_statement_lines', 'recon_log',
        'variant_location_stock', 'product_variants', 'stock_movements', 'products'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (self::TABLES as $t) {
            Schema::dropIfExists($t);
        }
        Schema::create('report_settings', function ($t) { $t->string('setting_key')->primary(); $t->text('value'); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('report_settings_log', function ($t) { $t->id(); $t->string('setting_key'); $t->text('old_value')->nullable(); $t->text('new_value'); $t->unsignedBigInteger('changed_by')->nullable(); $t->string('changed_by_name')->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->unsignedBigInteger('gift_voucher_ledger_id')->nullable(); $t->unsignedBigInteger('loyalty_liability_ledger_id')->nullable(); $t->unsignedBigInteger('stock_ledger_id')->nullable(); $t->unsignedBigInteger('cogs_ledger_id')->nullable(); $t->date('locked_before')->nullable(); $t->integer('edit_window_days')->nullable(); $t->timestamps(); });
        Schema::create('voucher_bill_refs', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('ref_type'); $t->string('ref_name')->nullable(); $t->unsignedBigInteger('against_voucher_id')->nullable();
            $t->decimal('amount', 15, 2); $t->date('due_date')->nullable(); $t->timestamp('created_at')->nullable();
        });
        Schema::table('ledger_groups', function ($t) { $t->string('application_method')->nullable(); $t->string('application_mode')->nullable(); $t->unsignedBigInteger('receivable_ledger_id')->nullable(); $t->unsignedBigInteger('payable_ledger_id')->nullable(); });
        DB::table('voucher_types')->insert(['id' => 4, 'code' => 'PI', 'name' => 'Purchase', 'base_type' => 'purchase']);
        $now = now();
        // V1 (100,000 to Customer A, 10 Jan) is a bill due 10 Feb; a second sale of 30,000 on 20 Oct is due in ten days; a purchase bill of 20,000 from the supplier fell due on 20 Oct
        $v2 = DB::table('vouchers')->insertGetId(['voucher_type_id' => 2, 'party_ledger_id' => 3, 'voucher_number' => 'S2', 'date' => '2026-10-20', 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 30000, 'base_total' => 30000, 'location_id' => 1, 'created_at' => $now, 'updated_at' => $now]);
        $p = DB::table('vouchers')->insertGetId(['voucher_type_id' => 4, 'party_ledger_id' => 8, 'voucher_number' => 'P9', 'date' => '2026-10-01', 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 20000, 'base_total' => 20000, 'location_id' => 1, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('voucher_entries')->insert([
            ['voucher_id' => $v2, 'ledger_id' => 3, 'side' => 'D', 'amount' => 30000, 'base_amount' => 30000], ['voucher_id' => $v2, 'ledger_id' => 4, 'side' => 'C', 'amount' => 30000, 'base_amount' => 30000],
            ['voucher_id' => $p, 'ledger_id' => 5, 'side' => 'D', 'amount' => 20000, 'base_amount' => 20000], ['voucher_id' => $p, 'ledger_id' => 8, 'side' => 'C', 'amount' => 20000, 'base_amount' => 20000],
        ]);
        DB::table('voucher_bill_refs')->insert([
            ['voucher_id' => 1, 'ledger_id' => 3, 'ref_type' => 'new', 'amount' => 100000, 'due_date' => '2026-02-10', 'created_at' => $now],
            ['voucher_id' => $v2, 'ledger_id' => 3, 'ref_type' => 'new', 'amount' => 30000, 'due_date' => '2026-11-07', 'created_at' => $now],
            ['voucher_id' => $p, 'ledger_id' => 8, 'ref_type' => 'new', 'amount' => 20000, 'due_date' => '2026-10-20', 'created_at' => $now],
        ]);
    }

    protected function tearDown(): void
    {
        foreach (self::TABLES as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function set(string $key, $value): void
    {
        DB::table('report_settings')->updateOrInsert(['setting_key' => $key], ['value' => json_encode($value), 'created_at' => now(), 'updated_at' => now()]);
    }

    private function chart(string $key, string $from = '2026-01-01', string $to = '2026-10-28'): array
    {
        $keys = array_keys(array_filter(VisualsService::CATALOG, fn ($c) => $c['source'] === $key));

        return app(VisualsService::class)->chart($keys[0] ?? $key, Scope::dates($from, $to))['data'];
    }

    public function test_the_scorecard_agrees_with_the_statements_and_says_what_is_not_set_up(): void
    {
        $d = $this->chart('scorecard');
        $this->assertTrue($d['ready'], $d['message'] ?? '');
        $c = collect($d['cards'])->keyBy('key');
        $pl = app(ProfitLossReport::class)->run(Scope::dates('2026-01-01', '2026-10-28'), []);
        $this->assertEquals($pl['totals']['direct_income'], $c['revenue']['value']);
        $this->assertEquals($pl['totals']['net_profit'], $c['profit']['value']);
        $this->assertCount(10, $c['revenue']['series']);
        $cash = array_sum(array_map(fn ($id) => app(LedgerBalances::class)->balance($id, '2026-10-28'), app(MoneyFlowReport::class)->moneyLedgerIds()));
        $this->assertEquals(round($cash, 2), $c['cash']['value']);
        $this->assertNull($c['receivables']['value']);
        $this->assertStringContainsString('Not set up', $c['receivables']['note']);

        $this->set('ratio_inputs', ['debtors' => ['groups' => [5], 'statements' => []], 'creditors' => ['groups' => [10], 'statements' => []]]);
        LedgerBalances::forget();
        $c = collect($this->chart('scorecard')['cards'])->keyBy('key');
        $debtors = DB::table('ledgers')->where('group_id', 5)->pluck('id')->all();
        $this->assertEquals(round(array_sum(array_map(fn ($id) => app(LedgerBalances::class)->balance($id, '2026-10-28'), $debtors)), 2), $c['receivables']['value'], 'what the debtors group holds on the last day');
        $this->assertGreaterThan(130000, $c['receivables']['value']);
    }

    public function test_sales_margins_and_the_expense_stack_come_by_month(): void
    {
        $s = $this->chart('sales_year');
        $this->assertCount(10, $s['months']);
        $this->assertEquals(100000, collect($s['months'])->firstWhere('month', '2026-01')['revenue']);
        $m = collect($this->chart('margins')['months'])->firstWhere('month', '2026-01');
        $this->assertEquals(100.0, $m['gross_pct'], 'no cost of sales in January');
        $e = $this->chart('expenses_stacked');
        $this->assertContains('Indirect Expenses', $e['groups']);
        $this->assertEquals(12000, collect($e['months'])->firstWhere('month', '2026-06')['Indirect Expenses']);
    }

    public function test_collection_speed_needs_the_debtors_group_then_counts_days_of_sales_owed(): void
    {
        $this->assertFalse($this->chart('collection')['ready']);
        $this->set('ratio_inputs', ['debtors' => ['groups' => [5], 'statements' => []]]);
        $d = $this->chart('collection');
        $mar = collect($d['months'])->firstWhere('month', '2026-03');
        $this->assertEquals(130000, $mar['owed'], 'the dollar sale to Customer A on 1 March, at today\'s rate');
        $this->assertEquals(31.0, $mar['days'], '130,000 owed at the end of a month that sold 130,000, over 31 days');
        $this->assertNull(collect($d['months'])->firstWhere('month', '2026-05')['days'], 'a month with no sales has no days');
    }

    public function test_who_the_sales_depend_on_and_what_sold(): void
    {
        $c = $this->chart('concentration');
        $this->assertSame('Customer A', $c['rows'][0]['name']);
        $this->assertEquals(100.0, $c['top1']);
        $this->assertEquals(100.0, $c['rows'][0]['cumulative']);

        Schema::create('voucher_items', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->string('item_type')->default('product'); $t->unsignedBigInteger('product_id')->nullable(); $t->string('description')->nullable(); $t->decimal('quantity', 15, 4)->default(1);
            $t->decimal('amount', 15, 2)->default(0); $t->boolean('is_header')->default(false);
        });
        DB::table('voucher_items')->insert([['voucher_id' => 1, 'description' => 'Sugar', 'quantity' => 10, 'amount' => 80000], ['voucher_id' => 1, 'description' => 'Salt', 'quantity' => 4, 'amount' => 20000]]);
        $i = $this->chart('top_items');
        $this->assertSame(['Sugar', 'Salt'], array_column($i['rows'], 'name'));
        $this->assertEquals(80000, $i['rows'][0]['value']);
        $this->assertEquals(10, $i['rows'][0]['qty']);
    }

    public function test_what_is_due_and_what_is_overdue(): void
    {
        $d = $this->chart('due');
        $this->assertEquals(100000, $d['buckets'][0]['receivables'], 'the January bill is overdue');
        $this->assertEquals(20000, $d['buckets'][0]['payables'], 'the supplier bill fell due on 20 October');
        $this->assertEquals(30000, $d['buckets'][2]['receivables'], 'due 7 November: 10 days from 28 October is the second week');
        $this->assertEquals(130000, $d['receivables']);

        $o = $this->chart('overdue');
        $this->assertEquals(130000, $o['total']);
        $this->assertEquals(100000, $o['late']);
        $this->assertSame('Customer A', $o['worst'][0]['name']);
        $this->assertEquals(76.9, $o['late_share']);
        $this->assertEqualsWithDelta(130000, array_sum(array_column($o['buckets'], 'amount')), 0.01);
    }

    public function test_stock_value_and_turnover_say_what_they_need_and_then_work(): void
    {
        $this->assertFalse($this->chart('stock_value')['ready']);
        $this->assertFalse($this->chart('turnover')['ready']);
        $this->set('ratio_inputs', ['stock' => ['groups' => [4], 'statements' => []]]);   // the bank group stands in for stock: Cash and M-Pesa
        $v = $this->chart('stock_value');
        $this->assertEquals(145000, collect($v['months'])->firstWhere('month', '2026-01')['value'], 'opening 50,000 less 5,000 in December, plus 100,000 in January');
        DB::table('accounting_settings')->where('id', 1)->update(['cogs_ledger_id' => 5]);   // Purchases stands in for cost of sales
        $t = $this->chart('turnover');
        $this->assertTrue($t['ready'], $t['message'] ?? '');
        $this->assertEquals(65000, $t['cogs'], 'purchases of 40,000, 5,000 and 20,000');
        $this->assertGreaterThan(0, $t['turns']);
    }

    public function test_stock_that_has_not_moved_is_listed_longest_first(): void
    {
        foreach (['variant_location_stock', 'product_variants', 'stock_movements', 'products'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::create('products', function ($t) { $t->id(); $t->string('name'); });
        Schema::create('product_variants', function ($t) { $t->id(); $t->unsignedBigInteger('product_id'); $t->string('name')->nullable(); });
        Schema::create('variant_location_stock', function ($t) { $t->id(); $t->unsignedBigInteger('product_variant_id'); $t->unsignedBigInteger('location_id')->nullable(); $t->decimal('quantity', 15, 4); });
        Schema::create('stock_movements', function ($t) { $t->id(); $t->unsignedBigInteger('variant_id'); $t->decimal('quantity', 15, 4); $t->date('movement_date'); });
        DB::table('products')->insert([['id' => 1, 'name' => 'Sugar'], ['id' => 2, 'name' => 'Salt'], ['id' => 3, 'name' => 'Rice']]);
        DB::table('product_variants')->insert([['id' => 1, 'product_id' => 1, 'name' => 'Sugar'], ['id' => 2, 'product_id' => 2, 'name' => 'Salt'], ['id' => 3, 'product_id' => 3, 'name' => 'Rice']]);
        DB::table('variant_location_stock')->insert([['product_variant_id' => 1, 'quantity' => 5], ['product_variant_id' => 2, 'quantity' => 9], ['product_variant_id' => 3, 'quantity' => 0]]);
        DB::table('stock_movements')->insert([['variant_id' => 1, 'quantity' => -2, 'movement_date' => '2026-10-20'], ['variant_id' => 2, 'quantity' => -1, 'movement_date' => '2026-07-20']]);
        $s = $this->chart('slow_movers');
        $this->assertSame(['Salt', 'Sugar'], array_column($s['rows'], 'name'), 'Rice has none on hand; Salt went out longest ago');
        $this->assertSame([100, 8], array_column($s['rows'], 'days'));
    }

    public function test_tax_flow_fails_alone_when_the_tax_tables_are_missing(): void
    {
        $r = $this->chart('vat_flow');
        $this->assertFalse($r['ready']);
        $this->assertArrayHasKey('message', $r);
        $this->assertTrue($this->chart('sales_year')['ready'], 'the other charts are untouched');
    }

    public function test_reconciliation_by_area_lists_all_five_areas(): void
    {
        $r = $this->chart('recon_areas');
        $this->assertTrue($r['ready'], $r['message'] ?? '');
        $this->assertSame(['Bank and mobile money', 'Cash', 'Debtors', 'Creditors', 'Tax'], array_column($r['areas'], 'area'));
    }
}

<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\BalanceSheetReport;
use App\Services\Books\Engine\Reports\ProfitLossReport;
use App\Services\Books\Engine\Scope;
use App\Services\Books\VisualsService;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Extras visual reports (docs/BOOKS_REPORTS_PLAN.md, step 11): every chart is drawn from the engine's own figures, and the server refuses them unless Extras is on. */
class VisualsTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::dropIfExists('voucher_bill_refs');
        Schema::create('voucher_bill_refs', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('ref_type'); $t->string('ref_name')->nullable(); $t->unsignedBigInteger('against_voucher_id')->nullable();
            $t->decimal('amount', 15, 2); $t->date('due_date')->nullable(); $t->timestamp('created_at')->nullable();
        });
        DB::table('voucher_types')->insert(['id' => 4, 'code' => 'PI', 'name' => 'Purchase', 'base_type' => 'purchase']);
        $now = now();
        $p = DB::table('vouchers')->insertGetId(['voucher_type_id' => 4, 'party_ledger_id' => 8, 'voucher_number' => 'P9', 'date' => '2026-10-01', 'status' => 'posted', 'currency_id' => 1, 'total_amount' => 20000, 'base_total' => 20000, 'location_id' => 1, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('voucher_entries')->insert([['voucher_id' => $p, 'ledger_id' => 5, 'side' => 'D', 'amount' => 20000, 'base_amount' => 20000], ['voucher_id' => $p, 'ledger_id' => 8, 'side' => 'C', 'amount' => 20000, 'base_amount' => 20000]]);
        DB::table('voucher_bill_refs')->insert([
            ['voucher_id' => 1, 'ledger_id' => 3, 'ref_type' => 'new', 'amount' => 100000, 'due_date' => '2026-02-10', 'created_at' => $now],
            ['voucher_id' => $p, 'ledger_id' => 8, 'ref_type' => 'new', 'amount' => 20000, 'due_date' => '2026-10-20', 'created_at' => $now],
        ]);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('voucher_bill_refs');
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function charts(): array
    {
        return app(VisualsService::class)->data(Scope::dates('2026-01-01', '2026-10-28'))['charts'];
    }

    public function test_the_money_chart_runs_a_balance_that_ends_where_the_accounts_end(): void
    {
        $m = $this->charts()['money'];
        $this->assertTrue($m['ready']);
        $this->assertNotEmpty($m['series']);
        $this->assertEqualsWithDelta(array_sum(array_column($m['accounts'], 'closing')), end($m['series'])['balance'], 0.01);
        $this->assertEqualsWithDelta(45000, $m['opening'], 0.01);   // Cash opens at 50,000 and paid 5,000 of rent in December, the day before the period
    }

    public function test_expenses_come_with_a_donut_and_a_group_tree(): void
    {
        $e = $this->charts()['expenses'];
        // purchases 40,000 + 5,000 + 20,000 (the bill added here); rent 12,000 + 7,000 and bank charges 300; the draft and last year's rent are left out
        $this->assertEquals(84300, $e['total']);
        $this->assertSame([['name' => 'Purchase Accounts', 'value' => 65000.0], ['name' => 'Indirect Expenses', 'value' => 19300.0]], $e['donut']);
        $this->assertSame(['Purchase Accounts', 'Indirect Expenses'], array_column($e['tree'], 'name'));
        $this->assertEqualsCanonicalizing(['Rent', 'Bank charges'], array_column($e['tree'][1]['children'], 'name'));
    }

    public function test_top_customers_and_sales_against_purchases(): void
    {
        $c = $this->charts();
        $this->assertSame([['name' => 'Customer A', 'value' => 100000.0, 'invoices' => 1]], $c['top_customers']['rows']);
        $jan = collect($c['sales_purchases']['months'])->firstWhere('month', '2026-01');
        $this->assertEquals(100000, $jan['sales_credit']);
        $this->assertEquals(0, $jan['sales_cash']);
        $oct = collect($c['sales_purchases']['months'])->firstWhere('month', '2026-10');
        $this->assertEquals(20000, $oct['purchases_credit']);
        $this->assertCount(10, $c['sales_purchases']['months']);
    }

    public function test_outstanding_builds_up_to_a_net_position_and_each_customer_is_a_bubble(): void
    {
        $o = $this->charts()['outstanding'];
        $this->assertTrue($o['ready']);
        $this->assertSame([100000.0, -20000.0, 80000.0], array_map('floatval', array_column($o['build'], 'value')));
        $this->assertSame('Customer A', $o['bubbles'][0]['name']);
        $this->assertEquals(100000, $o['bubbles'][0]['amount']);
        $this->assertGreaterThan(200, $o['bubbles'][0]['days']);
        $this->assertEqualsWithDelta(100000, array_sum(array_column($o['ageing'], 'receivables')), 0.01);
    }

    public function test_the_waterfall_and_the_balance_agree_with_the_statements(): void
    {
        $c = $this->charts();
        $pl = app(ProfitLossReport::class)->run(Scope::dates('2026-01-01', '2026-10-28'), []);
        $this->assertEquals($pl['totals']['net_profit'], collect($c['waterfall']['steps'])->last()['value']);
        $bs = app(BalanceSheetReport::class)->run(Scope::dates(null, '2026-10-28'), []);
        $this->assertEquals($bs['totals']['assets'], $c['balance']['assets']);
    }

    public function test_profit_trend_the_heatmap_and_the_composition(): void
    {
        $c = $this->charts();
        $jun = collect($c['profit_trend']['months'])->firstWhere('month', '2026-06');
        $this->assertEquals(12000, $jun['expenses']);
        $this->assertEquals(-12000, $jun['profit']);
        $day = collect($c['heatmap']['days'])->firstWhere('date', '2026-01-10');
        $this->assertSame(1, $day['count']);
        $this->assertSame('2025-10-29', $c['heatmap']['from']);
        $names = json_encode($c['composition']['tree']);
        $this->assertStringContainsString('Cash', $names);
        $this->assertStringContainsString('Bank Accounts', $names);
    }

    public function test_reconciliation_status_says_what_is_missing_instead_of_failing_the_page(): void
    {
        $c = $this->charts();
        $this->assertFalse($c['recon']['ready']);
        $this->assertStringContainsString('233', $c['recon']['message']);
        $this->assertTrue($c['money']['ready']);   // the others are untouched
    }

    private function as(array $permissions): void
    {
        $u = new User();
        $u->id = 1;
        $this->grant($u, $permissions);
        Sanctum::actingAs($u, ['*']);
    }

    private function licence(bool $licensed, bool $active): void
    {
        $this->mock(LicenseManager::class, function ($m) use ($licensed, $active) {
            $m->shouldReceive('isLicensed')->andReturn($licensed);
            $m->shouldReceive('isActive')->andReturn($active);
        });
    }

    public function test_the_page_state_tells_not_licensed_from_licensed_but_off_and_the_server_refuses_the_figures_unless_active(): void
    {
        $this->as(['books.view']);
        $this->licence(false, false);
        $this->getJson('/api/admin/books/visuals/status')->assertOk()->assertJsonPath('state', 'not_licensed');
        $this->getJson('/api/admin/books/visuals?to=2026-10-28')->assertNotFound();

        $this->licence(true, false);
        $this->getJson('/api/admin/books/visuals/status')->assertJsonPath('state', 'off');
        $this->getJson('/api/admin/books/visuals?to=2026-10-28')->assertNotFound();

        $this->licence(true, true);
        $this->getJson('/api/admin/books/visuals/status')->assertJsonPath('state', 'active');
        $r = $this->getJson('/api/admin/books/visuals?from=2026-01-01&to=2026-10-28')->assertOk();
        $this->assertSame('2026-10-28', $r->json('to'));
        $this->assertTrue($r->json('charts.money.ready'));
    }

    public function test_a_person_without_the_books_cannot_see_either(): void
    {
        $this->as([]);
        $this->licence(true, true);
        $this->getJson('/api/admin/books/visuals/status')->assertForbidden();
        $this->getJson('/api/admin/books/visuals')->assertForbidden();
    }
}

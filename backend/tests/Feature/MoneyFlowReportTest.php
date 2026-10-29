<?php

namespace Tests\Feature;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\MoneyFlowReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Money flow on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.8). For plain receipts and payments it gives what the old report gave, to the cent; what
 * changes is the split tender (audit M4), transfers kept out of the totals unless shown (M3), the restated base (M2) and the money groups from settings (M1).
 */
class MoneyFlowReportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    /** A posted voucher in November 2026 with entries [[ledger, side, amount], ...]. */
    private function book(string $no, string $date, array $entries): void
    {
        $total = array_sum(array_map(fn ($e) => $e[1] === 'D' ? $e[2] : 0, $entries));
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 2, 'voucher_number' => $no, 'date' => $date, 'status' => 'posted', 'currency_id' => 1, 'total_amount' => $total, 'base_total' => $total,
            'location_id' => 1, 'created_at' => now(), 'updated_at' => now()]);
        foreach ($entries as $i => [$ledger, $side, $amt]) {
            DB::table('voucher_entries')->insert(['voucher_id' => $id, 'ledger_id' => $ledger, 'side' => $side, 'amount' => $amt, 'base_amount' => $amt, 'location_id' => 1, 'line_no' => $i + 1]);
        }
    }

    private function run_(array $opts = [], string $from = '2026-11-01', string $to = '2026-11-30'): array
    {
        return (new MoneyFlowReport())->run(Scope::fromInput(['from' => $from, 'to' => $to]), $opts);
    }

    private function byGroup(array $rows): array
    {
        return collect($rows)->groupBy('group')->map(fn ($g) => round($g->sum('amount'), 2))->all();
    }

    public function test_plain_receipts_and_payments_give_each_account_its_in_and_out(): void
    {
        $d = $this->run_([], '2026-05-01', '2026-12-31');
        $this->assertEquals($d['totals']['in'], array_sum(array_column($d['accounts'], 'in')));
        $this->assertEquals($d['totals']['out'], array_sum(array_column($d['accounts'], 'out')));
        $this->assertEquals($d['totals']['in'], array_sum(array_column($d['in'], 'amount')));
        $this->assertEquals($d['totals']['out'], array_sum(array_column($d['out'], 'amount')));
        $this->assertEqualsWithDelta($d['totals']['in'], array_sum(array_column($d['series'], 'in')), 0.01);
        $this->assertEqualsWithDelta($d['totals']['out'], array_sum(array_column($d['series'], 'out')), 0.01);
        $this->assertGreaterThan(0, $d['totals']['in']);
    }

    public function test_a_sale_paid_600_cash_and_400_mpesa_is_attributed_to_the_sales_and_the_vat_not_adjustments(): void
    {
        // Dr Cash 600, Dr M-Pesa 400; Cr Sales 862.07, Cr (the tax ledger) 137.93
        $this->book('S1', '2026-11-03', [[1, 'D', 600], [2, 'D', 400], [4, 'C', 862.07], [11, 'C', 137.93]]);
        $d = $this->run_();
        $this->assertEquals(1000, $d['totals']['in']);
        $this->assertArrayNotHasKey('Adjustments', $this->byGroup($d['in']));
        $names = collect($d['in'])->pluck('amount', 'name')->all();
        $this->assertEquals(862.07, $names['Sales']);
        $this->assertEquals(137.93, $names['Misc income']);
        $cash = collect($d['accounts'])->firstWhere('name', 'Cash');
        $this->assertEquals(600, $cash['in']);
    }

    public function test_a_sale_part_paid_in_cash_and_the_rest_on_account_shows_what_was_paid(): void
    {
        $this->book('S2', '2026-11-04', [[1, 'D', 600], [3, 'D', 400], [4, 'C', 1000]]);
        $d = $this->run_();
        $this->assertEquals(600, $d['totals']['in']);
        $this->assertEquals(600, collect($d['in'])->firstWhere('name', 'Sales')['amount']);
    }

    public function test_a_journal_that_does_not_add_up_is_still_an_adjustment(): void
    {
        $this->book('J1', '2026-11-05', [[1, 'D', 1000], [3, 'C', 900], [12, 'C', 50]]);   // 50 short of the money: cannot be pinned on one ledger
        $this->assertEquals(['Adjustments' => 1000.0], array_intersect_key($this->byGroup($this->run_()['in']), ['Adjustments' => 1]));
    }

    public function test_transfers_between_our_accounts_stay_out_of_the_totals_unless_shown(): void
    {
        $this->book('T1', '2026-11-07', [[2, 'D', 300], [1, 'C', 300]]);   // cash banked to M-Pesa
        $this->book('R1', '2026-11-08', [[1, 'D', 500], [4, 'C', 500]]);
        $hidden = $this->run_();
        $this->assertEquals([500, 0], [$hidden['totals']['in'], $hidden['totals']['out']]);
        $this->assertEquals([300, 300], [$hidden['totals']['transfers_in'], $hidden['totals']['transfers_out']]);
        $this->assertCount(2, $hidden['transfers']);
        $shown = $this->run_(['show_transfers' => '1']);
        $this->assertEquals([800, 300], [$shown['totals']['in'], $shown['totals']['out']]);
        $this->assertArrayHasKey('Transfers between our accounts', $this->byGroup($shown['in']));
    }

    public function test_the_money_accounts_come_from_the_settings_when_they_are_chosen(): void
    {
        $this->book('R2', '2026-11-09', [[1, 'D', 500], [4, 'C', 500]]);
        $this->book('R3', '2026-11-10', [[6, 'D', 200], [3, 'C', 200]]);
        \Illuminate\Support\Facades\Schema::dropIfExists('report_settings');
        \Illuminate\Support\Facades\Schema::dropIfExists('report_settings_log');
        \Illuminate\Support\Facades\Schema::create('report_settings', function ($t) { $t->string('setting_key')->primary(); $t->text('value'); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        \Illuminate\Support\Facades\Schema::create('report_settings_log', function ($t) { $t->id(); $t->string('setting_key'); $t->text('old_value')->nullable(); $t->text('new_value'); $t->unsignedBigInteger('changed_by')->nullable(); $t->string('changed_by_name')->nullable(); $t->timestamp('created_at')->nullable(); });
        DB::table('report_settings')->insert(['setting_key' => 'money_account_groups', 'value' => json_encode([8]), 'created_at' => now(), 'updated_at' => now()]);   // Indirect Expenses: Rent counts as a money account here
        $d = $this->run_();
        $this->assertSame(['Rent'], array_column($d['accounts'], 'name'));
        \Illuminate\Support\Facades\Schema::dropIfExists('report_settings');
        \Illuminate\Support\Facades\Schema::dropIfExists('report_settings_log');
    }
}

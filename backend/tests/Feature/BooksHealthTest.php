<?php

namespace Tests\Feature;

use App\Services\Books\BooksHealth;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportEngine;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The Books health panel (docs/BOOKS_REPORTS_PLAN.md, step 10): every check can be made to fail on test data and says where. */
class BooksHealthTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['report_settings', 'report_settings_log', 'payment_methods'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::create('report_settings', function ($t) { $t->string('setting_key')->primary(); $t->text('value'); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('report_settings_log', function ($t) { $t->id(); $t->string('setting_key'); $t->text('old_value')->nullable(); $t->text('new_value'); $t->unsignedBigInteger('changed_by')->nullable(); $t->string('changed_by_name')->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('kind')->default('cash'); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_active')->default(true); });
    }

    protected function tearDown(): void
    {
        foreach (['report_settings', 'report_settings_log', 'payment_methods'] as $t) {
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

    private function check(string $key, string $from = '2026-01-01', string $to = '2026-10-28'): array
    {
        $r = app(BooksHealth::class)->run(Scope::dates($from, $to));

        return collect($r['checks'])->firstWhere('key', $key);
    }

    public function test_opening_balances_that_do_not_net_fail_the_trial_balance_and_list_the_ledgers(): void
    {
        $c = $this->check('opening_difference');
        $this->assertSame('fail', $c['status']);
        $this->assertEqualsCanonicalizing(['Cash', 'Rent', 'Capital'], array_column($c['items'], 'label'));
        $this->assertStringContainsString('21,000.00', $c['summary']);
        $this->assertSame('fail', $this->check('trial_balance')['status']);

        DB::table('ledgers')->where('id', 7)->update(['opening_balance' => 51000]);
        $this->assertSame('pass', $this->check('opening_difference')['status']);
        $this->assertSame('pass', $this->check('trial_balance')['status']);
    }

    public function test_drafts_in_the_period_are_listed(): void
    {
        $c = $this->check('drafts');
        $this->assertSame('warn', $c['status']);
        $this->assertSame(['V6 · 2026-05-01'], array_column($c['items'], 'label'));
        $this->assertArrayHasKey('voucher', $c['items'][0]['to']);
        $this->assertSame('pass', $this->check('drafts', '2026-06-01', '2026-12-31')['status']);
    }

    public function test_a_voucher_entered_after_its_year_was_closed_is_found(): void
    {
        $this->assertSame('pass', $this->check('backdated')['status']);
        $y = DB::table('financial_years')->insertGetId(['name' => 'FY 2025', 'start_date' => '2025-01-01', 'end_date' => '2025-12-31', 'is_closed' => 1, 'closed_at' => '2026-01-05 10:00:00', 'created_at' => now(), 'updated_at' => now()]);
        $c = $this->check('backdated');
        $this->assertSame('fail', $c['status']);
        $this->assertSame(['V5 · 2025-12-20'], array_column($c['items'], 'label'));
        $this->assertStringContainsString('FY 2025', $c['items'][0]['detail']);
        $this->assertGreaterThan(0, $y);
    }

    public function test_an_overdrawn_money_account_and_a_stock_account_not_chosen(): void
    {
        $c = $this->check('negative_money');
        $this->assertSame('warn', $c['status']);
        $this->assertSame(['M-Pesa'], array_column($c['items'], 'label'));   // V8 pays 7,000 out of an empty account
        $this->assertEquals(7000, $c['items'][0]['amount']);
        $this->assertSame('setup', $this->check('negative_stock')['status']);

        $this->set('ratio_inputs', ['stock' => ['groups' => [7], 'statements' => []]]);   // Purchase Accounts hold debits only
        LedgerBalances::forget();
        $this->assertSame('pass', $this->check('negative_stock')['status']);
    }

    public function test_ledgers_on_no_statement_line_are_listed(): void
    {
        $c = $this->check('no_statement_line');
        $this->assertSame('warn', $c['status']);
        $this->assertContains('Misc income', array_column($c['items'], 'label'));
    }

    public function test_suspense_needs_the_groups_chosen_and_fails_while_they_hold_a_balance(): void
    {
        $this->assertSame('setup', $this->check('suspense')['status']);
        $this->set('suspense_groups', [11]);   // Other Receipts: Misc income holds 800
        $c = $this->check('suspense');
        $this->assertSame('fail', $c['status']);
        $this->assertSame(['Misc income'], array_column($c['items'], 'label'));
        $this->set('suspense_groups', [9]);
        $this->assertSame('fail', $this->check('suspense')['status']);   // Interest income holds 2,000
        DB::table('ledgers')->where('id', 11)->update(['group_id' => 1]);
        $this->set('suspense_groups', [11]);
        $this->assertSame('pass', $this->check('suspense')['status']);
    }

    public function test_near_duplicate_ledgers_are_flagged_but_numbered_ones_are_not(): void
    {
        $now = now();
        DB::table('ledgers')->insert([
            ['group_id' => 8, 'name' => 'Office Rent', 'opening_balance' => 0, 'opening_side' => 'D', 'created_at' => $now, 'updated_at' => $now],
            ['group_id' => 8, 'name' => 'office-rent', 'opening_balance' => 0, 'opening_side' => 'D', 'created_at' => $now, 'updated_at' => $now],
            ['group_id' => 8, 'name' => 'Staff Welfare 1', 'opening_balance' => 0, 'opening_side' => 'D', 'created_at' => $now, 'updated_at' => $now],
            ['group_id' => 8, 'name' => 'Staff Welfare 2', 'opening_balance' => 0, 'opening_side' => 'D', 'created_at' => $now, 'updated_at' => $now],
            ['group_id' => 8, 'name' => 'Telephone', 'opening_balance' => 0, 'opening_side' => 'D', 'created_at' => $now, 'updated_at' => $now],
            ['group_id' => 8, 'name' => 'Telephon', 'opening_balance' => 0, 'opening_side' => 'D', 'created_at' => $now, 'updated_at' => $now],
        ]);
        $c = $this->check('duplicates');
        $this->assertSame('warn', $c['status']);
        $labels = implode(' | ', array_column($c['items'], 'label'));
        $this->assertStringContainsString('Office Rent', $labels);
        $this->assertStringContainsString('Telephone', $labels);
        $this->assertStringNotContainsString('Staff Welfare', $labels);
        $this->assertCount(2, $c['items']);
    }

    public function test_the_receivables_and_payables_groups_come_from_the_settings(): void
    {
        $this->assertSame('warn', $this->check('control_groups')['status']);
        $this->set('ratio_inputs', ['debtors' => ['groups' => [5], 'statements' => []], 'creditors' => ['groups' => [10], 'statements' => []]]);
        $this->assertSame('pass', $this->check('control_groups')['status']);
    }

    public function test_a_check_without_its_set_up_says_so_instead_of_failing(): void
    {
        $this->assertSame('setup', $this->check('unreconciled')['status']);   // script 233 not run
        $this->assertSame('setup', $this->check('tax')['status']);           // script 229 not run
        $r = app(BooksHealth::class)->run(Scope::dates('2026-01-01', '2026-10-28'));
        $this->assertSame(array_sum($r['totals']), count($r['checks']));
        $this->assertSame(['from' => '2026-01-01', 'to' => '2026-10-28'], ['from' => $r['from'], 'to' => $r['to']]);
    }

    public function test_unmatched_statement_lines_and_unconfirmed_kinds_are_listed(): void
    {
        foreach (['recon_sessions', 'recon_statement_lines', 'recon_log'] as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('233_reconciliation.sql');
        $this->set('reconcilable_groups', [4]);
        $kinds = $this->check('kinds');
        $this->assertSame('warn', $kinds['status']);
        $this->assertEqualsCanonicalizing(['Cash', 'M-Pesa'], array_column($kinds['items'], 'label'));
        $this->set('reconcile_ledger_kinds', ['1' => 'cash', '2' => 'mobile_money']);
        $this->assertSame('pass', $this->check('kinds')['status']);

        $this->assertSame('pass', $this->check('unreconciled')['status']);
        $sid = DB::table('recon_sessions')->insertGetId(['ledger_id' => 2, 'kind' => 'mobile_money', 'statement_to' => '2026-09-30', 'statement_closing' => 0, 'status' => 'open', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('recon_statement_lines')->insert([['session_id' => $sid, 'line_date' => '2026-09-02', 'amount' => 500, 'matched_entry_id' => null, 'created_at' => now(), 'updated_at' => now()], ['session_id' => $sid, 'line_date' => '2026-09-03', 'amount' => -200, 'matched_entry_id' => 1, 'created_at' => now(), 'updated_at' => now()]]);
        $c = $this->check('unreconciled');
        $this->assertSame('warn', $c['status']);
        $this->assertSame(['M-Pesa'], array_column($c['items'], 'label'));
        $this->assertSame(1, $c['count']);
        DB::table('recon_sessions')->where('id', $sid)->update(['status' => 'locked']);
        $this->assertSame('pass', $this->check('unreconciled')['status']);
        foreach (['recon_sessions', 'recon_statement_lines', 'recon_log'] as $t) {
            Schema::dropIfExists($t);
        }
    }

    public function test_it_is_a_report_on_the_engine_with_an_export_table(): void
    {
        $def = app(ReportEngine::class)->find('books-health');
        $scope = Scope::dates('2026-01-01', '2026-10-28');
        $table = $def->table($def->run($scope, []), $scope);
        $this->assertSame(['title', 'status', 'summary'], array_keys($table['columns']));
        $this->assertNotEmpty($table['rows']);
    }
}

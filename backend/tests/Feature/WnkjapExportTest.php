<?php

namespace Tests\Feature;

use App\Services\Books\BudgetService;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Exchange\WnkjapExport;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The document inside a .wnkjap file after the new report engine (docs/WNKJAP_FORMAT.md, additions to version 1): statements, each ledger's line, the years. */
class WnkjapExportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['locations', 'year_closes', 'ledger_year_balances', 'year_close_log'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->boolean('is_active')->default(true); });
        $this->runSqlScripts('232_year_close.sql');
    }

    protected function tearDown(): void
    {
        foreach (['locations', 'year_closes', 'ledger_year_balances', 'year_close_log', 'budget_lines', 'budget_rows', 'budget_initiatives', 'budgets', 'budget_versions', 'budget_approvals', 'budget_transfers', 'users'] as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function doc(int $level): array
    {
        return app(WnkjapExport::class)->build($level, '2026-01-01', '2026-12-31', null, null);
    }

    public function test_a_summary_carries_the_statement_lines_and_each_ledgers_line(): void
    {
        $d = $this->doc(1);
        $this->assertSame(1, $d['version']);
        $this->assertSame(['groups', 'ledgers', 'statements', 'balances'], array_keys($d['sections']));
        $this->assertSame(20, $d['counts']['statements']);
        $this->assertContains('IS.REV', array_column($d['sections']['statements'], 'code'));
        $ledgers = collect($d['sections']['ledgers'])->keyBy('id');
        $this->assertSame(4, $ledgers[1]['statement_id'], 'Cash: the line of its group, Bank Accounts');
        $this->assertSame(12, $ledgers[12]['statement_id'], 'Bank charges: a line of its own');
        $this->assertNull($ledgers[8]['statement_id'], 'Supplier is on no line');
        $this->assertArrayNotHasKey('affects_gross_profit', $d['sections']['groups'][0], 'the retired flag is not in the file');
        $this->assertArrayHasKey('statement_id', $d['sections']['groups'][0]);
        $this->assertArrayHasKey('tax_country', $d['company']);
    }

    /** @return array{0: int, 1: int, 2: int} version, the company-wide row, the Nairobi row */
    private function budgetWorld(): array
    {
        foreach (['budget_lines', 'budget_rows', 'budget_initiatives', 'budgets', 'budget_versions', 'budget_approvals', 'budget_transfers'] as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('237_planning.sql', '239_budgeting.sql', '240_budget_versions.sql', '243_budget_transfers.sql');
        Schema::dropIfExists('budget_lines');
        Schema::create('budget_lines', function ($t) { $t->id(); $t->unsignedBigInteger('row_id')->nullable(); $t->string('period', 7); $t->string('target_type', 10); $t->unsignedBigInteger('target_id'); $t->decimal('amount', 18, 2)->default(0); $t->string('note')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::dropIfExists('budget_rows');
        Schema::create('budget_rows', function ($t) {
            $t->id(); $t->unsignedBigInteger('version_id')->nullable(); $t->string('target_type', 10); $t->unsignedBigInteger('target_id'); $t->unsignedBigInteger('cost_centre_id')->nullable(); $t->unsignedBigInteger('department_id')->nullable();
            $t->unsignedBigInteger('location_id')->nullable(); $t->unsignedBigInteger('initiative_id')->nullable(); $t->boolean('is_recovery')->default(false); $t->string('method', 20)->default('manual'); $t->text('method_params')->nullable();
            $t->string('dim_key', 60)->default('0-0-0-0-0'); $t->string('note', 160)->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps();
        });
        Schema::dropIfExists('users');
        Schema::create('users', function ($t) { $t->id(); $t->string('name')->nullable(); });
        DB::table('locations')->insert([['id' => 1, 'name' => 'Nairobi'], ['id' => 2, 'name' => 'Mombasa']]);
        $svc = app(BudgetService::class);
        $ini = $svc->saveInitiative(['name' => 'Cash sales'], null);
        $b = $svc->createBudget(['name' => '2026 operating', 'from_month' => '2026-01', 'to_month' => '2026-12'], null);
        $v = $svc->currentVersion($b);
        $ids = $svc->save([
            ['type' => 'ledger', 'target_id' => 6, 'initiative_id' => $ini, 'method' => 'fixed', 'method_params' => ['amount' => 100], 'note' => 'Rent', 'months' => ['2025-12' => 90, '2026-06' => 100, '2026-07' => 100]],
            ['type' => 'group', 'target_id' => 6, 'location_id' => 1, 'months' => ['2026-06' => 500]],
        ], null, $v);
        DB::table('budget_versions')->where('id', $v)->update(['status' => 'approved', 'submitted_by' => 7, 'approved_by' => 8, 'approved_at' => '2026-01-05 10:00:00']);
        DB::table('budget_transfers')->insert([['version_id' => $v, 'from_row_id' => $ids[0], 'to_row_id' => $ids[1], 'period' => '2026-06', 'amount' => 25, 'status' => 'approved', 'created_at' => now()],
            ['version_id' => $v, 'from_row_id' => $ids[0], 'to_row_id' => $ids[1], 'period' => '2026-07', 'amount' => 5, 'status' => 'withdrawn', 'created_at' => now()]]);

        return [$v, $ids[0], $ids[1]];
    }

    public function test_the_books_level_carries_the_budgets_without_who_did_what(): void
    {
        $this->assertArrayNotHasKey('budgets', $this->doc(2)['sections'], 'a company that has not run the budget scripts has no such section');
        [$v, $r1, $r2] = $this->budgetWorld();
        $d = $this->doc(2);
        $this->assertArrayNotHasKey('budgets', $this->doc(1)['sections'], 'a summary does not carry them');
        $s = $d['sections'];
        $this->assertSame(['2026 operating'], array_column($s['budgets'], 'name'));
        $this->assertSame($v, $s['budgets'][0]['current_version_id']);
        $this->assertSame(['Original'], array_column($s['budget_versions'], 'name'));
        $this->assertSame('approved', $s['budget_versions'][0]['status']);
        $this->assertSame('2026-01-05 10:00:00', $s['budget_versions'][0]['approved_at']);
        $this->assertStringNotContainsString('approved_by', json_encode($s['budget_versions']), 'dates and status, never people');
        $this->assertStringNotContainsString('submitted_by', json_encode($s));
        $rows = collect($s['budget_rows'])->keyBy('id');
        $this->assertSame(['Rent', 'ledger', 'fixed'], [$rows[$r1]['note'], $rows[$r1]['target_type'], $rows[$r1]['method']]);
        $this->assertSame('Rent', $rows[$r1]['target_name']);
        $this->assertSame('Sales Accounts', $rows[$r2]['target_name']);
        $this->assertSame(1, $rows[$r2]['location_id']);
        $this->assertNotNull($rows[$r1]['initiative_id']);
        $this->assertSame(['Cash sales'], array_column($s['initiatives'], 'name'));
        $this->assertSame([['2026-06', 100.0], ['2026-07', 100.0], ['2026-06', 500.0]], array_map(fn ($l) => [$l['period'], $l['amount']], $s['budget_lines']), 'December 2025 is outside the period asked for');
        $this->assertSame([25.0], array_column($s['budget_transfers'], 'amount'), 'a withdrawn request is not in the file');
        $this->assertSame($d['counts']['budget_rows'], 2);
    }

    public function test_an_export_for_one_branch_carries_only_that_branchs_budget_rows(): void
    {
        [, , $nairobi] = $this->budgetWorld();
        $d = app(WnkjapExport::class)->build(2, '2026-01-01', '2026-12-31', 1, null);
        $this->assertSame([$nairobi], array_column($d['sections']['budget_rows'], 'id'));
        $this->assertSame([], $d['sections']['budget_transfers'], 'a move between a branch row and one that is not in the file is left out');
        $mombasa = app(WnkjapExport::class)->build(2, '2026-01-01', '2026-12-31', 2, null);
        $this->assertSame([], $mombasa['sections']['budget_rows']);
        $this->assertSame([], $mombasa['sections']['budgets'], 'a budget with nothing for the branch is not listed');
    }

    public function test_the_books_level_adds_the_years_and_what_a_locked_close_carried_forward(): void
    {
        $y = (int) DB::table('financial_years')->value('id');
        $c = DB::table('year_closes')->insertGetId(['financial_year_id' => $y, 'status' => 'locked', 'created_at' => now(), 'updated_at' => now()]);
        $open = DB::table('year_closes')->insertGetId(['financial_year_id' => $y, 'status' => 'prepared', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('ledger_year_balances')->insert([
            ['year_close_id' => $c, 'financial_year_id' => $y, 'ledger_id' => 1, 'statement_id' => 4, 'closing_amount' => 1000, 'carried_amount' => 1000, 'created_at' => now(), 'updated_at' => now()],
            ['year_close_id' => $open, 'financial_year_id' => $y, 'ledger_id' => 1, 'statement_id' => 4, 'closing_amount' => 999, 'carried_amount' => 999, 'created_at' => now(), 'updated_at' => now()],
        ]);
        $d = $this->doc(2);
        $this->assertSame(['FY 2026'], array_column($d['sections']['financial_years'], 'name'));
        $this->assertCount(1, $d['sections']['year_balances'], 'only a locked close is in the file');
        $this->assertEquals(1000, $d['sections']['year_balances'][0]['carried_amount']);
        $this->assertNotEmpty($d['sections']['vouchers']);
        $this->assertArrayNotHasKey('financial_years', $this->doc(1)['sections'], 'a summary does not carry them');
    }
}

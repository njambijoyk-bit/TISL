<?php

namespace Tests\Feature;

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
        foreach (['locations', 'year_closes', 'ledger_year_balances', 'year_close_log'] as $t) {
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

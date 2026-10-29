<?php

namespace Tests\Feature;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\ProfitLossByCostCentreReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** Profit and loss by cost centre on the engine (docs/BOOKS_REPORTS_PLAN.md, step 12): the same rows and totals as the report it replaces. */
class ProfitLossByCostCentreReportTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RecordsGolden;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::dropIfExists('locations');
        Schema::create('locations', function ($t) { $t->id(); $t->string('name'); });
        Schema::table('cost_centres', function ($t) {
            $t->string('code')->nullable(); $t->string('type')->nullable(); $t->string('purpose')->nullable(); $t->text('description')->nullable(); $t->unsignedBigInteger('location_id')->nullable();
            $t->boolean('is_system')->default(0); $t->boolean('is_active')->default(1); $t->integer('sort_order')->default(0);
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('locations');
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function run_(?string $from, ?string $to, ?int $loc = null): array
    {
        return (new ProfitLossByCostCentreReport())->run(Scope::fromInput(['from' => $from, 'to' => $to, 'location_id' => $loc]), []);
    }

    public function test_it_gives_the_rows_and_totals_the_old_report_gave(): void
    {
        foreach ([['2026-01-01', '2026-12-31', null], [null, null, null], ['2026-06-01', '2026-08-31', null], ['2026-01-01', '2026-12-31', 1], ['2026-01-01', '2026-12-31', 2]] as [$from, $to, $loc]) {
            $old = $this->golden('profit_loss_by_cost_centre', json_encode([$from, $to, $loc]));
            $new = $this->run_($from, $to, $loc);
            $this->assertSame($old['rows'], $new['rows'], "rows {$from} {$to} {$loc}");
            $this->assertSame($old['totals'], $new['totals'], "totals {$from} {$to} {$loc}");
        }
    }

    public function test_a_branch_rolls_up_what_is_beneath_it_and_the_figures_are_real(): void
    {
        $d = $this->run_('2026-01-01', '2026-12-31');
        $rows = collect($d['rows'])->keyBy('cost_centre_id');
        $this->assertTrue($d['ready']);
        $this->assertEquals(1, $rows[11]['depth']);
        // Head office (10) includes Admin (11): its own figures plus the child's
        $this->assertEquals($rows[10]['own_expense'] + $rows[11]['own_expense'], $rows[10]['expense']);
        $this->assertEquals($rows[10]['own_income'] + $rows[11]['own_income'], $rows[10]['income']);
        $this->assertEquals($d['totals']['income'] - $d['totals']['expense'], $d['totals']['profit']);
        $this->assertGreaterThan(0, $d['totals']['income']);
    }

    public function test_the_export_table_carries_the_columns_and_the_whole_company_line(): void
    {
        $def = new ProfitLossByCostCentreReport();
        $scope = Scope::dates('2026-01-01', '2026-12-31');
        $t = $def->table($def->run($scope, []), $scope);
        $this->assertSame(['name', 'own_income', 'own_expense', 'income', 'expense', 'profit'], array_keys($t['columns']));
        $this->assertSame('Whole company', $t['totals']['name']);
        $this->assertStringStartsWith('  ', $t['rows'][1]['name']);   // the child is indented
    }
}

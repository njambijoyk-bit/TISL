<?php

namespace Tests\Feature;

use App\Services\Books\BudgetCommitments;
use App\Services\Books\BudgetMethods;
use App\Services\Books\BudgetTemplateService;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\DayBookReport;
use App\Services\Books\Engine\Reports\LedgerStatementReport;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The budget gaps: open purchase orders count as commitments, and reports can narrow to an initiative. */
class BudgetGapsTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::table('vouchers', function ($t) { $t->string('fulfilment_status')->nullable(); });
        Schema::create('voucher_items', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->boolean('is_header')->default(false); $t->unsignedBigInteger('ledger_id')->nullable(); $t->decimal('quantity', 15, 4)->default(1);
            $t->decimal('invoiced_quantity', 15, 4)->default(0); $t->decimal('amount', 15, 2)->default(0);
        });
        DB::table('voucher_types')->insert(['id' => 9, 'code' => 'PO', 'name' => 'Purchase order', 'base_type' => 'purchase_order']);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('voucher_items');
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function order(string $no, string $date, string $status, array $lines, float $rate = 1, string $fulfil = 'open'): int
    {
        $id = (int) DB::table('vouchers')->insertGetId(['voucher_type_id' => 9, 'voucher_number' => $no, 'date' => $date, 'status' => $status, 'exchange_rate' => $rate, 'fulfilment_status' => $fulfil]);
        foreach ($lines as [$ledger, $qty, $done, $amount]) {
            DB::table('voucher_items')->insert(['voucher_id' => $id, 'ledger_id' => $ledger, 'quantity' => $qty, 'invoiced_quantity' => $done, 'amount' => $amount]);
        }

        return $id;
    }

    public function test_open_orders_commit_what_has_not_arrived_on_expense_ledgers_only(): void
    {
        // Rent (6) and Bank charges (12) are expenses; Sales (4) is income
        $this->order('PO-1', '2026-10-10', 'posted', [[6, 10, 0, 1000.0], [4, 1, 0, 500.0]]);
        $this->order('PO-2', '2026-10-12', 'posted', [[12, 4, 1, 400.0]], 1, 'partial');   // a quarter has arrived: 300 is still promised
        $this->order('PO-3', '2026-10-14', 'cancelled', [[6, 1, 0, 9000.0]]);
        $this->order('PO-4', '2026-10-15', 'posted', [[6, 1, 1, 700.0]], 1, 'closed');
        $this->order('PO-5', '2026-11-20', 'posted', [[6, 1, 0, 800.0]]);   // another month
        $this->order('PO-6', '2026-10-16', 'posted', [[6, 1, 0, 200.0]], 2.5);   // in a foreign currency: at its own rate
        $rows = collect(app(BudgetCommitments::class)->open('2026-10-01', '2026-10-31'));
        $this->assertSame(['PO-1', 'PO-2', 'PO-6'], $rows->pluck('order')->unique()->values()->all());
        $this->assertSame(1000.0, (float) $rows->firstWhere('order', 'PO-1')['amount'], 'the income line is not a commitment');
        $this->assertSame(300.0, (float) $rows->firstWhere('order', 'PO-2')['amount']);
        $this->assertSame(500.0, (float) $rows->firstWhere('order', 'PO-6')['amount']);
        $this->assertSame(6, (int) $rows->firstWhere('order', 'PO-1')['ledger_id']);
    }

    public function test_the_order_a_purchase_is_made_from_is_left_out(): void
    {
        $po = $this->order('PO-1', '2026-10-10', 'posted', [[6, 1, 0, 1000.0]]);
        $this->assertCount(1, app(BudgetCommitments::class)->open('2026-10-01', '2026-10-31'));
        $this->assertSame([], app(BudgetCommitments::class)->open('2026-10-01', '2026-10-31', $po), 'its lines are in the purchase being checked, so not twice');
    }

    public function test_reports_offer_the_initiative_filter_and_the_day_book_and_statement_honour_it(): void
    {
        $this->assertContains('initiative', app(DayBookReport::class)->filters());
        $this->assertContains('initiative', app(LedgerStatementReport::class)->filters());
        $this->assertStringContainsString('initiative_id', file_get_contents((new \ReflectionClass(DayBookReport::class))->getFileName()));
        $this->assertStringContainsString('initiative_id', file_get_contents((new \ReflectionClass(LedgerStatementReport::class))->getFileName()));
    }

    public function test_a_template_line_takes_its_growth_or_percent_from_a_named_assumption(): void
    {
        Schema::create('budget_templates', function ($t) { $t->id(); $t->string('name'); $t->string('description')->nullable(); $t->string('budget_type')->default('operating'); $t->boolean('is_active')->default(true); $t->json('assumptions')->nullable(); $t->unsignedBigInteger('created_by')->nullable(); $t->timestamps(); });
        Schema::create('budget_template_lines', function ($t) {
            $t->id(); $t->unsignedBigInteger('template_id'); $t->string('target_type'); $t->unsignedBigInteger('target_id'); $t->string('method')->default('manual'); $t->text('method_params')->nullable(); $t->integer('sort_order')->default(0); $t->timestamps();
        });
        try {
            $tid = DB::table('budget_templates')->insertGetId(['name' => 'Operating']);
            $hist = DB::table('budget_template_lines')->insertGetId(['template_id' => $tid, 'target_type' => 'ledger', 'target_id' => 6, 'method' => 'history', 'method_params' => json_encode(['growth' => 3])]);
            $fixed = DB::table('budget_template_lines')->insertGetId(['template_id' => $tid, 'target_type' => 'ledger', 'target_id' => 12, 'method' => 'fixed', 'method_params' => json_encode(['amount' => 5])]);
            $svc = app(BudgetTemplateService::class);

            $saved = $svc->saveAssumptions($tid, [['label' => 'Inflation', 'value' => 6.5], ['label' => 'Inflation', 'value' => 9], ['label' => '  ', 'value' => 1]]);
            $this->assertSame(['inflation', 'inflation_2'], array_column($saved, 'key'), 'a blank name is dropped and a repeated one is kept apart');
            $svc->setLineAssumption($tid, $hist, 'inflation');
            $p = json_decode(DB::table('budget_template_lines')->where('id', $hist)->value('method_params'), true);
            $this->assertSame('inflation', $p['growth_ref']);
            $this->assertSame(['growth' => 6.5, 'growth_ref' => 'inflation'], BudgetTemplateService::resolveParams($p, ['inflation' => 6.5]) + [], 'the assumption\'s number is put in');
            $this->assertSame(['growth' => 10.0, 'growth_ref' => 'inflation'], BudgetTemplateService::resolveParams($p, ['inflation' => 10.0]), 'a what-if value wins');
            $months = ['2026-01', '2026-02'];
            $this->assertSame(['2026-01' => 106.5, '2026-02' => 213.0], BudgetMethods::fill('history', BudgetTemplateService::resolveParams($p, ['inflation' => 6.5]), $months, null, ['2026-01' => 100, '2026-02' => 200]));

            try {
                $svc->setLineAssumption($tid, $fixed, 'inflation');
                $this->fail('a fixed line has no growth or percent to point');
            } catch (\Illuminate\Validation\ValidationException $e) {
                $this->assertArrayHasKey('assumption', $e->errors());
            }
            $svc->saveAssumptions($tid, []);   // all removed: the line keeps its own number and stops pointing
            $p = json_decode(DB::table('budget_template_lines')->where('id', $hist)->value('method_params'), true);
            $this->assertSame(['growth' => 3], $p);
        } finally {
            Schema::dropIfExists('budget_template_lines');
            Schema::dropIfExists('budget_templates');
        }
    }
}

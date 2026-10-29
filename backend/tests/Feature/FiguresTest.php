<?php

namespace Tests\Feature;

use App\Services\Books\ControlAccountChecks;
use App\Services\Books\Engine\Figures;
use App\Services\Books\Engine\LedgerBalances;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** The engine's figures for the parts of the system that are not report screens (docs/BOOKS_REPORTS_PLAN.md, step 12), and the control-account checks. */
class FiguresTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['voucher_bill_refs', 'report_settings', 'report_settings_log'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::create('voucher_bill_refs', function ($t) {
            $t->id(); $t->unsignedBigInteger('voucher_id'); $t->unsignedBigInteger('ledger_id'); $t->string('ref_type'); $t->string('ref_name')->nullable(); $t->unsignedBigInteger('against_voucher_id')->nullable();
            $t->decimal('amount', 15, 2); $t->date('due_date')->nullable(); $t->timestamp('created_at')->nullable();
        });
        Schema::create('report_settings', function ($t) { $t->string('setting_key')->primary(); $t->text('value'); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('report_settings_log', function ($t) { $t->id(); $t->string('setting_key'); $t->text('old_value')->nullable(); $t->text('new_value'); $t->unsignedBigInteger('changed_by')->nullable(); $t->string('changed_by_name')->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::dropIfExists('accounting_settings');
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->unsignedBigInteger('gift_voucher_ledger_id')->nullable(); $t->unsignedBigInteger('loyalty_liability_ledger_id')->nullable(); $t->unsignedBigInteger('stock_ledger_id')->nullable(); $t->date('locked_before')->nullable(); $t->integer('edit_window_days')->nullable(); $t->timestamps(); });
        Schema::table('ledger_groups', function ($t) { $t->string('application_method')->nullable(); $t->string('application_mode')->nullable(); $t->unsignedBigInteger('receivable_ledger_id')->nullable(); $t->unsignedBigInteger('payable_ledger_id')->nullable(); });
        // V1 (100,000 to Customer A) is a bill due 10 Feb 2026, V10 (5,000) one due in the future
        DB::table('voucher_bill_refs')->insert([
            ['voucher_id' => 1, 'ledger_id' => 3, 'ref_type' => 'new', 'amount' => 100000, 'due_date' => '2026-02-10', 'created_at' => now()],
            ['voucher_id' => 10, 'ledger_id' => 3, 'ref_type' => 'new', 'amount' => 5000, 'due_date' => '2026-12-01', 'created_at' => now()],
        ]);
    }

    protected function tearDown(): void
    {
        foreach (['voucher_bill_refs', 'report_settings', 'report_settings_log', 'accounting_settings'] as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    public function test_ageing_for_one_ledger_lists_its_bills_and_says_how_much_is_late(): void
    {
        $a = app(Figures::class)->ageing('receivables', null, 3);
        $this->assertSame([2], [count($a['rows'][0]['bills'])]);
        $this->assertEquals(105000, $a['totals']['total']);
        $this->assertEquals(100000, $a['totals']['overdue'], 'the bill due in December is not late; the one due in February is');
        $this->assertEquals(105000, app(Figures::class)->ageing('receivables')['totals']['total'], 'for everyone: only Customer A owes');
        $this->assertEquals(0, app(Figures::class)->ageing('payables')['totals']['total']);
    }

    public function test_a_statement_for_a_customer_is_never_paged(): void
    {
        $s = app(Figures::class)->ledgerStatement(1, '2026-01-01', '2026-12-31');   // Cash: many lines
        $this->assertGreaterThan(5, count($s['rows']));
        $this->assertEquals($s['closing'], end($s['rows'])['balance']);
        $this->assertEquals($s['opening'] + $s['debit'] - $s['credit'], $s['closing']);
    }

    public function test_the_statements_carry_what_the_other_modules_list(): void
    {
        $f = app(Figures::class);
        $pl = $f->profitLoss('2026-01-01', '2026-12-31');
        $this->assertContains('Rent', array_column($pl['sections']['expense_indirect'], 'ledger'));
        $this->assertContains('Sales', array_column($pl['sections']['income_direct'], 'ledger'));
        $bs = $f->balanceSheet('2026-12-31');
        $this->assertContains('Cash', array_column($bs['asset_ledgers'], 'ledger'));
        $tb = $f->trialBalance('2026-01-01', '2026-12-31', 1);
        $this->assertTrue($tb['filtered'], 'a branch chosen: opening balances are left out');
        $this->assertArrayHasKey('total_debit', $tb);
        $this->assertNotEmpty($f->ratios('2026-01-01', '2026-10-28')['ratios']);
    }

    public function test_the_control_checks_use_the_chosen_groups_and_say_when_none_is_chosen(): void
    {
        $c = app(ControlAccountChecks::class)->checks('2026-10-28');
        $this->assertSame(['trial-balance'], array_column(array_filter($c['checks'], fn ($x) => in_array($x['key'], ['trial-balance', 'receivables', 'payables'], true)), 'key'));
        $this->assertSame(['receivables', 'payables'], array_column($c['not_set_up'], 'key'));
        $this->assertStringContainsString('Ratio analysis inputs', $c['not_set_up'][0]['message']);

        DB::table('report_settings')->insert(['setting_key' => 'ratio_inputs', 'value' => json_encode(['debtors' => ['groups' => [5], 'statements' => []], 'creditors' => ['groups' => [10], 'statements' => []]]), 'created_at' => now(), 'updated_at' => now()]);
        $c = app(ControlAccountChecks::class)->checks('2026-10-28');
        $this->assertSame([], $c['not_set_up']);
        $r = collect($c['checks'])->keyBy('key');
        $this->assertEquals(round(app(Figures::class)->ageing('receivables', '2026-10-28')['totals']['total'], 2), $r['receivables']['register']);
        $this->assertEquals(round(app(Figures::class)->ageing('payables', '2026-10-28')['totals']['total'], 2), $r['payables']['register']);
    }
}

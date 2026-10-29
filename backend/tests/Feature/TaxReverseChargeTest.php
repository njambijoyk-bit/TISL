<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\TaxLineService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Reverse charge (docs/TAX_CONTROL_PLAN.md, step T6b): on a purchase the buyer owes the tax and may claim it back. The line carries no tax to pay the
 * supplier (so every total is unchanged); the tax is kept as an amount owed and the ledger it is claimed into.
 */
class TaxReverseChargeTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['tax_control_settings', 'tax_control_log', 'ledger_taxes', 'tax_opt_outs', 'tax_applicability'] as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('229_tax_control.sql', '230_tax_resolution.sql');
        Schema::table('ledger_groups', function ($t) {
            $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->string('application_mode')->nullable(); $t->boolean('is_active')->default(1); $t->boolean('is_compound')->default(0);
            $t->string('application_method')->nullable(); $t->string('tax_category')->nullable(); $t->unsignedBigInteger('input_ledger_id')->nullable(); $t->unsignedBigInteger('cost_ledger_id')->nullable();
            $t->unsignedBigInteger('control_ledger_id')->nullable(); $t->unsignedBigInteger('payable_ledger_id')->nullable(); $t->unsignedBigInteger('receivable_ledger_id')->nullable();
        });
        Schema::table('ledgers', function ($t) {
            $t->string('rate_type')->nullable(); $t->decimal('rate_value', 12, 4)->nullable(); $t->date('valid_from')->nullable(); $t->date('valid_until')->nullable(); $t->string('classification')->nullable();
            $t->string('tax_nature')->nullable(); $t->string('side')->nullable(); $t->unsignedBigInteger('tax_rate_ledger_id')->nullable(); $t->unsignedBigInteger('unit_of_measure_id')->nullable();
            $t->unsignedBigInteger('currency_id')->nullable(); $t->string('calculation_base')->nullable(); $t->integer('calculation_sequence')->nullable(); $t->boolean('requires_certificate')->default(0);
            $t->decimal('secondary_rate_value', 18, 6)->nullable(); $t->string('tax_point', 20)->nullable(); $t->text('base_includes')->nullable();
        });
        Schema::create('tax_applicability', function ($t) { $t->id(); $t->string('taxable_type'); $t->unsignedBigInteger('taxable_id'); $t->unsignedBigInteger('tax_rule_id')->nullable(); $t->boolean('is_exempt')->default(0); $t->unsignedBigInteger('tax_legitimacy_certificate_id')->nullable(); $t->timestamps(); });
        $now = now();
        DB::table('ledger_groups')->insert(['id' => 30, 'name' => 'Duties & Taxes', 'nature' => 'liability', 'is_primary' => 1, 'behaviour' => 'standard', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledger_groups')->insert(['id' => 35, 'parent_id' => 30, 'name' => 'Import VAT', 'nature' => 'liability', 'behaviour' => 'tax', 'application_mode' => 'additive', 'application_method' => 'reverse_charge', 'tax_category' => 'vat_gst',
            'input_ledger_id' => 90, 'kind' => 'vat', 'code' => 'RCVAT', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledgers')->insert(['id' => 85, 'group_id' => 35, 'name' => 'Import VAT 16%', 'opening_balance' => 0, 'opening_side' => 'C', 'rate_type' => 'percent', 'rate_value' => 16,
            'calculation_base' => 'post_discount', 'valid_from' => '2020-01-01', 'classification' => 'standard', 'is_active' => 1, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledgers')->insert(['id' => 70, 'group_id' => 6, 'name' => 'Imported services', 'opening_balance' => 0, 'opening_side' => 'D', 'tax_nature' => 'taxable', 'tax_rate_ledger_id' => 85, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledger_taxes')->insert(['ledger_id' => 70, 'tax_type_id' => 35, 'tax_rate_id' => 85, 'treatment' => 'applies', 'sort_order' => 0, 'created_at' => $now, 'updated_at' => $now]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function calc(string $side): array
    {
        return app(TaxLineService::class)->fromAccount(Ledger::find(70), 1000.0, 1000.0, 1.0, $side, null, null, '2026-03-01', null);
    }

    public function test_a_purchase_owes_the_tax_and_claims_it_back_without_adding_to_the_bill(): void
    {
        $rows = $this->calc('input');
        $this->assertCount(1, $rows);
        $this->assertTrue($rows[0]['reverse_charge']);
        $this->assertEquals(160, $rows[0]['reverse_amount']);
        $this->assertEquals(0, $rows[0]['tax_amount'], 'nothing is added to what the supplier is paid');
        $this->assertSame(90, $rows[0]['input_ledger_id']);
        $this->assertSame(85, $rows[0]['ledger_id'], 'the amount owed goes to the tax ledger');
        $this->assertTrue($rows[0]['recoverable']);
        $this->assertTrue($rows[0]['snapshot']['reverse_charge']);
    }

    public function test_a_sale_never_reverse_charges(): void
    {
        $this->assertSame([], $this->calc('output'));
    }

    public function test_without_an_input_ledger_the_tax_is_a_cost(): void
    {
        DB::table('ledger_groups')->where('id', 35)->update(['input_ledger_id' => null, 'cost_ledger_id' => 91]);
        $rows = $this->calc('input');
        $this->assertSame(91, $rows[0]['input_ledger_id']);
        $this->assertFalse($rows[0]['recoverable']);
    }

    public function test_posting_adds_a_balanced_pair_and_leaves_the_amount_paid_alone(): void
    {
        Schema::dropIfExists('accounting_settings');
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->integer('edit_window_days')->default(30); $t->timestamps(); });
        $type = new \App\Models\Books\VoucherType();
        $type->base_type = \App\Models\Books\VoucherType::PURCHASE;
        $row = $this->calc('input')[0];
        $plan = ['rate' => 1.0, 'party' => null, 'paid_ledger_id' => 50, 'tenders' => [], 'lines' => [[
            'is_header' => false, 'children' => [], 'item_type' => 'service', 'description' => 'Imported service', 'ledger_id' => 70, 'amount' => 1000.0, 'discount_amount' => 0, 'taxes' => [$row],
        ]]];
        $m = new \ReflectionMethod(\App\Services\Books\VoucherService::class, 'itemEntries');
        $m->setAccessible(true);
        $entries = $m->invokeArgs(app(\App\Services\Books\VoucherService::class), [&$plan, $type, null]);
        $sum = fn (string $side) => array_sum(array_map(fn ($e) => $e['side'] === $side ? $e['amount'] : 0, $entries));
        $this->assertEquals($sum('D'), $sum('C'), 'the entries balance');
        $find = fn (int $ledger) => array_values(array_filter($entries, fn ($e) => $e['ledger_id'] === $ledger));
        $this->assertEquals([['D', 160]], array_map(fn ($e) => [$e['side'], $e['amount']], $find(90)), 'claimed back into the input tax ledger');
        $this->assertEquals([['C', 160]], array_map(fn ($e) => [$e['side'], $e['amount']], $find(85)), 'owed to the tax authority');
        $this->assertEquals([['C', 1000]], array_map(fn ($e) => [$e['side'], $e['amount']], $find(50)), 'the supplier is paid the price alone');
    }

    // ── health checks (T7) ─────────────────────────────────────────────

    private function codes(): array
    {
        return array_column(app(\App\Services\Books\TaxHealth::class)->checks(), 'code');
    }

    public function test_health_a_sound_setup_has_no_errors(): void
    {
        $this->assertNotContains('reverse_no_ledger', $this->codes());
        $this->assertNotContains('account_no_rate', $this->codes());
    }

    public function test_health_a_reverse_charge_with_nowhere_to_claim_is_an_error(): void
    {
        DB::table('ledger_groups')->where('id', 35)->update(['input_ledger_id' => null]);
        $this->assertContains('reverse_no_ledger', $this->codes());
        DB::table('ledger_groups')->where('id', 35)->update(['cost_ledger_id' => 91]);
        $this->assertNotContains('reverse_no_ledger', $this->codes());
    }

    public function test_health_an_account_tax_with_no_rate_or_an_ended_rate_is_found(): void
    {
        DB::table('ledger_taxes')->where('ledger_id', 70)->update(['tax_rate_id' => null]);
        $this->assertContains('account_no_rate', $this->codes());
        DB::table('ledger_taxes')->where('ledger_id', 70)->update(['tax_rate_id' => 85]);
        DB::table('ledgers')->where('id', 85)->update(['valid_until' => '2020-12-31']);
        $c = $this->codes();
        $this->assertContains('account_rate_ended', $c);
        $this->assertContains('no_rate_in_force', $c);
    }

    public function test_health_a_rate_that_adds_a_removed_tax_to_its_base_is_an_error(): void
    {
        DB::table('ledgers')->where('id', 85)->update(['base_includes' => json_encode([999])]);
        $this->assertContains('base_missing_type', $this->codes());
    }

    public function test_health_a_reverse_charge_on_a_sales_account_is_flagged(): void
    {
        DB::table('ledger_groups')->where('id', 6)->update(['behaviour' => 'sales']);
        $this->assertContains('reverse_on_sales', $this->codes());
    }
}

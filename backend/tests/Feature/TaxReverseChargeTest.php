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
            $t->string('application_method')->nullable(); $t->string('tax_category')->nullable(); $t->unsignedBigInteger('input_ledger_id')->nullable(); $t->unsignedBigInteger('cost_ledger_id')->nullable(); $t->string('recovery')->nullable(); $t->string('company_role')->nullable();
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

    // ── tax recovery (docs/TAX_CONTROL_PLAN.md, section 18) ────────────

    /** An account whose taxes are excise 10% then VAT 16%, on the same price. */
    private function recoveryWorld(array $excise = []): void
    {
        $now = now();
        DB::table('ledger_groups')->insert(['id' => 36, 'parent_id' => 30, 'name' => 'Excise duty', 'nature' => 'liability', 'behaviour' => 'tax', 'application_mode' => 'additive', 'application_method' => 'added',
            'tax_category' => 'excise', 'kind' => 'excise', 'code' => 'EXC', 'created_at' => $now, 'updated_at' => $now] + $excise);
        DB::table('ledger_groups')->insert(['id' => 37, 'parent_id' => 30, 'name' => 'VAT', 'nature' => 'liability', 'behaviour' => 'tax', 'application_mode' => 'additive', 'application_method' => 'added',
            'tax_category' => 'vat_gst', 'kind' => 'vat', 'code' => 'VAT', 'created_at' => $now, 'updated_at' => $now]);
        foreach ([[86, 36, 'Excise 10%', 10], [87, 37, 'VAT 16%', 16]] as [$id, $g, $n, $v]) {
            DB::table('ledgers')->insert(['id' => $id, 'group_id' => $g, 'name' => $n, 'opening_balance' => 0, 'opening_side' => 'C', 'rate_type' => 'percent', 'rate_value' => $v,
                'calculation_base' => 'post_discount', 'valid_from' => '2020-01-01', 'classification' => 'standard', 'is_active' => 1, 'created_at' => $now, 'updated_at' => $now]);
        }
        DB::table('ledgers')->insert(['id' => 72, 'group_id' => 6, 'name' => 'Spirits purchases', 'opening_balance' => 0, 'opening_side' => 'D', 'tax_nature' => 'taxable', 'tax_rate_ledger_id' => 86, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledger_taxes')->insert([['ledger_id' => 72, 'tax_type_id' => 36, 'tax_rate_id' => 86, 'treatment' => 'applies', 'sort_order' => 0, 'created_at' => $now, 'updated_at' => $now],
            ['ledger_id' => 72, 'tax_type_id' => 37, 'tax_rate_id' => 87, 'treatment' => 'applies', 'sort_order' => 1, 'created_at' => $now, 'updated_at' => $now]]);
    }

    private function purchase(): array
    {
        return app(TaxLineService::class)->fromAccount(Ledger::find(72), 1000.0, 1000.0, 1.0, 'input', null, null, '2026-03-01', null);
    }

    public function test_recovery_excise_is_part_of_the_cost_for_an_ordinary_purchaser_and_vat_is_claimed(): void
    {
        $this->recoveryWorld();
        $rows = collect($this->purchase())->keyBy('tax_type_id');
        $this->assertTrue($rows[36]['non_recoverable'] ?? false, 'excise: no recovery set, so the category default (not recoverable)');
        $this->assertSame('non_recoverable', $rows[36]['snapshot']['recovery']);
        $this->assertEquals(100, $rows[36]['tax_amount'], 'still charged by the supplier');
        $this->assertArrayNotHasKey('non_recoverable', $rows[37], 'VAT is claimed back as before');
    }

    public function test_recovery_a_sale_is_never_touched(): void
    {
        $this->recoveryWorld();
        foreach (app(TaxLineService::class)->fromAccount(Ledger::find(72), 1000.0, 1000.0, 1.0, 'output', null, null, '2026-03-01', null) as $r) {
            $this->assertArrayNotHasKey('non_recoverable', $r, 'what a manufacturer or importer charges is a liability');
        }
    }

    public function test_recovery_can_be_set_and_conditional_follows_the_companys_position(): void
    {
        $this->recoveryWorld(['recovery' => 'recoverable']);
        $this->assertArrayNotHasKey('non_recoverable', collect($this->purchase())->keyBy('tax_type_id')[36]);
        DB::table('ledger_groups')->where('id', 36)->update(['recovery' => 'conditional', 'company_role' => 'ordinary']);
        $this->app->forgetInstance(\App\Services\Books\TaxResolver::class);
        $this->assertTrue(collect($this->purchase())->keyBy('tax_type_id')[36]['non_recoverable'] ?? false, 'conditional, and the company is an ordinary purchaser');
        DB::table('ledger_groups')->where('id', 36)->update(['company_role' => 'manufacturer']);
        $this->app->forgetInstance(\App\Services\Books\TaxResolver::class);
        $this->assertArrayNotHasKey('non_recoverable', collect($this->purchase())->keyBy('tax_type_id')[36], 'a licensed manufacturer recovers it');
    }

    public function test_recovery_posting_puts_the_tax_in_the_cost_and_balances(): void
    {
        Schema::dropIfExists('accounting_settings');
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->integer('edit_window_days')->default(30); $t->timestamps(); });
        $this->recoveryWorld();
        $type = new \App\Models\Books\VoucherType();
        $type->base_type = \App\Models\Books\VoucherType::PURCHASE;
        $plan = ['rate' => 1.0, 'party' => null, 'paid_ledger_id' => 50, 'tenders' => [], 'lines' => [[
            'is_header' => false, 'children' => [], 'item_type' => 'service', 'description' => 'Whisky', 'ledger_id' => 72, 'amount' => 1000.0, 'discount_amount' => 0, 'taxes' => $this->purchase(),
        ]]];
        $m = new \ReflectionMethod(\App\Services\Books\VoucherService::class, 'itemEntries');
        $m->setAccessible(true);
        $entries = $m->invokeArgs(app(\App\Services\Books\VoucherService::class), [&$plan, $type, null]);
        $on = fn (int $ledger) => array_values(array_map(fn ($e) => [$e['side'], $e['amount']], array_filter($entries, fn ($e) => $e['ledger_id'] === $ledger)));
        $this->assertEquals([['D', 1100]], $on(72), 'the price and the excise it carried: the cost of the goods');
        $this->assertSame([], $on(86), 'no input tax in the excise ledger');
        $this->assertEquals([['D', 160]], $on(87), 'VAT is still input tax');
        $this->assertEquals([['C', 1260]], $on(50), 'the supplier is owed the price, the excise and the VAT');
        $d = array_sum(array_map(fn ($e) => $e['side'] === 'D' ? $e['amount'] : 0, $entries));
        $c = array_sum(array_map(fn ($e) => $e['side'] === 'C' ? $e['amount'] : 0, $entries));
        $this->assertEquals($d, $c);
    }

    public function test_recovery_a_cost_ledger_on_the_type_takes_the_tax_instead_of_the_item(): void
    {
        $this->recoveryWorld(['cost_ledger_id' => 91]);
        $row = collect($this->purchase())->keyBy('tax_type_id')[36];
        $this->assertSame(91, $row['cost_ledger_id']);
    }

    public function test_health_excise_claimed_back_is_questioned(): void
    {
        $this->recoveryWorld(['recovery' => 'recoverable', 'company_role' => 'ordinary']);
        $this->assertContains('excise_recoverable', $this->codes());
        DB::table('ledger_groups')->where('id', 36)->update(['recovery' => 'non_recoverable']);
        $this->assertNotContains('excise_recoverable', $this->codes());
    }
}

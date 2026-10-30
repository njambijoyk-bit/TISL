<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\Books\VoucherType;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** A customer ledger set to exempt or zero-rated changes the tax an accounting invoice line would carry. */
class PartyTaxOnInvoiceTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['tax_control_settings', 'tax_control_log', 'ledger_taxes'] as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('229_tax_control.sql');
        Schema::table('ledger_groups', function ($t) {
            $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->string('application_mode')->nullable(); $t->boolean('is_active')->default(1);
            $t->string('tax_category')->nullable(); $t->string('application_method')->nullable();
        });
        Schema::table('ledgers', function ($t) {
            $t->string('rate_type')->nullable(); $t->decimal('rate_value', 12, 4)->nullable(); $t->date('valid_from')->nullable(); $t->date('valid_until')->nullable();
            $t->string('tax_nature')->nullable(); $t->string('side')->nullable(); $t->unsignedBigInteger('tax_rate_ledger_id')->nullable(); $t->unsignedBigInteger('currency_id')->nullable();
            $t->decimal('secondary_rate_value', 18, 6)->nullable(); $t->string('tax_point', 20)->nullable(); $t->unsignedBigInteger('unit_of_measure_id')->nullable();
        });
    }

    protected function tearDown(): void
    {
        foreach (['tax_control_settings', 'tax_control_log', 'ledger_taxes'] as $t) {
            Schema::dropIfExists($t);
        }
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function line(?Ledger $party): array
    {
        $now = now();
        DB::table('ledger_groups')->updateOrInsert(['id' => 30], ['name' => 'Duties & Taxes', 'nature' => 'liability', 'is_primary' => 1, 'behaviour' => 'standard', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledger_groups')->updateOrInsert(['id' => 31], ['parent_id' => 30, 'name' => 'VAT', 'nature' => 'liability', 'behaviour' => 'tax', 'application_mode' => 'additive', 'tax_category' => 'vat_gst', 'application_method' => 'added', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledgers')->updateOrInsert(['id' => 43], ['group_id' => 31, 'name' => 'VAT 16%', 'opening_balance' => 0, 'opening_side' => 'C', 'rate_type' => 'percentage', 'rate_value' => 16, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledgers')->where('id', 4)->update(['tax_nature' => 'taxable', 'tax_rate_ledger_id' => 43]);   // Sales carries VAT 16%
        $m = new \ReflectionMethod(VoucherService::class, 'customLine');
        $m->setAccessible(true);
        $ctx = ['type' => new VoucherType(['code' => 'SI', 'name' => 'Sales', 'base_type' => 'sales']), 'customer' => null, 'party' => $party, 'currency' => null, 'locationId' => null, 'date' => '2026-10-30'];

        return $m->invoke(app(VoucherService::class), ['description' => 'Booking fee', 'ledger_id' => 4, 'rate' => 1000, 'quantity' => 1], $ctx);
    }

    public function test_a_customer_with_no_treatment_pays_the_accounts_vat_an_exempt_one_does_not_and_a_zero_rated_one_shows_none(): void
    {
        $this->assertGreaterThan(0.0, $this->line(Ledger::find(3))['tax_amount'], 'nothing on the customer: the sales account decides');
        DB::table('ledgers')->where('id', 3)->update(['tax_nature' => 'exempt']);
        $this->assertSame(0.0, $this->line(Ledger::find(3))['tax_amount']);
        $this->assertSame([], $this->line(Ledger::find(3))['taxes']);
        DB::table('ledgers')->where('id', 3)->update(['tax_nature' => 'zero_rated']);
        $this->assertSame(0.0, $this->line(Ledger::find(3))['tax_amount'], 'zero-rated: the line carries a tax of nothing');
    }
}

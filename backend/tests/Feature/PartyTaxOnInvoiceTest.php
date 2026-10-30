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
        DB::table('ledgers')->updateOrInsert(['id' => 43], ['group_id' => 31, 'name' => 'VAT 16%', 'opening_balance' => 0, 'opening_side' => 'C', 'rate_type' => 'percent', 'rate_value' => 16, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledgers')->where('id', 4)->update(['tax_nature' => 'taxable', 'tax_rate_ledger_id' => 43]);   // Sales carries VAT 16%
        $m = new \ReflectionMethod(VoucherService::class, 'customLine');
        $m->setAccessible(true);
        $ctx = ['type' => new VoucherType(['code' => 'SI', 'name' => 'Sales', 'base_type' => 'sales']), 'customer' => null, 'party' => $party, 'currency' => null, 'locationId' => null, 'date' => '2026-10-30'];

        return $m->invoke(app(VoucherService::class), ['description' => 'Booking fee', 'ledger_id' => 4, 'rate' => 1000, 'quantity' => 1], $ctx);
    }

    public function test_a_customer_with_no_treatment_pays_the_accounts_vat_an_exempt_one_does_not_and_a_zero_rated_one_shows_none(): void
    {
        $this->assertSame(160.0, $this->line(Ledger::find(3))['tax_amount'], 'nothing on the customer: the sales account decides');
        DB::table('ledgers')->where('id', 3)->update(['tax_nature' => 'exempt']);
        $this->assertSame(0.0, $this->line(Ledger::find(3))['tax_amount']);
        $this->assertSame([], $this->line(Ledger::find(3))['taxes']);
        DB::table('ledgers')->where('id', 3)->update(['tax_nature' => 'zero_rated']);
        $this->assertSame(0.0, $this->line(Ledger::find(3))['tax_amount'], 'zero-rated: the line carries a tax of nothing');
    }

    private function taxLine(array $in, string $base = 'sales'): array
    {
        $this->line(null);   // makes the VAT 16% rate
        $m = new \ReflectionMethod(VoucherService::class, 'taxLine');
        $m->setAccessible(true);
        $ctx = ['type' => new VoucherType(['code' => 'X', 'name' => 'X', 'base_type' => $base]), 'customer' => null, 'party' => null, 'currency' => null, 'locationId' => null, 'date' => '2026-10-30'];

        return $m->invoke(app(VoucherService::class), $in, $ctx);
    }

    public function test_a_tax_line_works_the_tax_out_of_a_taxable_amount_or_takes_the_amount_typed(): void
    {
        $worked = $this->taxLine(['tax_rate_id' => 43, 'base' => 1000]);
        $this->assertSame(0.0, $worked['amount'], 'it sells nothing');
        $this->assertSame(160.0, $worked['tax_amount'], '16% of 1,000');
        $this->assertSame(VoucherService::TAX_LINE, $worked['notes']);
        $this->assertSame($worked['tax_amount'], $worked['taxes'][0]['tax_amount']);

        $typed = $this->taxLine(['tax_rate_id' => 43, 'base' => 1000, 'amount' => 123.45]);
        $this->assertSame(123.45, $typed['tax_amount'], 'the amount typed wins');
        $this->assertSame(123.45, $this->taxLine(['tax_rate_id' => 43, 'amount' => 123.45], 'purchase')['tax_amount'], 'no taxable amount is needed when the tax is typed');
    }

    public function test_a_tax_line_needs_a_tax_and_an_amount_or_a_base(): void
    {
        $this->expectException(\App\Services\Books\BooksException::class);
        $this->taxLine(['tax_rate_id' => 43]);
    }
}

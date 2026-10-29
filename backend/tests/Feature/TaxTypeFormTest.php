<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The tax type and rate forms (docs/TAX_CONTROL_PLAN.md, step T4): a tax type has a category and a method that Tax control allows, how it is applied cannot
 * change afterwards, the old kind and mode stay in step, and the new rate types and the tax point are stored.
 */
class TaxTypeFormTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['tax_control_settings', 'tax_control_log', 'ledger_taxes', 'units_of_measure', 'tax_districts', 'tax_applications'] as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('229_tax_control.sql');
        Schema::table('ledger_groups', function ($t) {
            $t->string('code')->nullable(); $t->string('kind')->nullable(); $t->string('application_mode')->nullable(); $t->boolean('is_active')->default(1); $t->boolean('is_compound')->default(0);
            $t->unsignedBigInteger('control_ledger_id')->nullable(); $t->unsignedBigInteger('payable_ledger_id')->nullable(); $t->unsignedBigInteger('receivable_ledger_id')->nullable();
            $t->string('tax_category')->nullable(); $t->string('application_method')->nullable(); $t->unsignedBigInteger('jurisdiction_id')->nullable();
            $t->unsignedBigInteger('input_ledger_id')->nullable(); $t->unsignedBigInteger('cost_ledger_id')->nullable();
        });
        Schema::table('ledgers', function ($t) {
            $t->string('rate_type')->nullable(); $t->decimal('rate_value', 12, 4)->nullable(); $t->date('valid_from')->nullable(); $t->date('valid_until')->nullable(); $t->string('classification')->nullable();
            $t->string('tax_nature')->nullable(); $t->string('side')->nullable(); $t->unsignedBigInteger('tax_rate_ledger_id')->nullable(); $t->unsignedBigInteger('unit_of_measure_id')->nullable();
            $t->unsignedBigInteger('currency_id')->nullable(); $t->string('calculation_base')->nullable(); $t->integer('calculation_sequence')->nullable(); $t->boolean('requires_certificate')->default(0);
            $t->decimal('secondary_rate_value', 18, 6)->nullable(); $t->string('tax_point', 20)->nullable(); $t->text('base_includes')->nullable();
        });
        Schema::create('units_of_measure', function ($t) { $t->id(); $t->string('code'); $t->string('name')->nullable(); });
        Schema::create('tax_districts', function ($t) { $t->id(); $t->string('locale')->nullable(); $t->string('level')->nullable(); $t->unsignedBigInteger('parent_id')->nullable(); $t->string('name'); $t->string('code')->nullable(); $t->boolean('is_active')->default(1); $t->timestamps(); });
        Schema::create('tax_applications', function ($t) { $t->id(); $t->unsignedBigInteger('tax_rate_id')->nullable(); });
        DB::table('units_of_measure')->insert(['id' => 1, 'code' => 'L', 'name' => 'Litre']);
        DB::table('tax_districts')->insert(['id' => 1, 'level' => 'county', 'name' => 'Nairobi', 'created_at' => now(), 'updated_at' => now()]);
        $now = now();
        DB::table('ledger_groups')->insert(['id' => 30, 'name' => 'Duties & Taxes', 'nature' => 'liability', 'is_primary' => 1, 'behaviour' => 'standard', 'created_at' => $now, 'updated_at' => $now]);
        $u = new User();
        $u->id = 7777;
        $this->grant($u, ['admin.access', 'books.view', 'tax.view', 'tax.manage']);
        Sanctum::actingAs($u, ['*']);
    }

    protected function tearDown(): void
    {
        foreach (['tax_control_settings', 'tax_control_log', 'ledger_taxes', 'units_of_measure', 'tax_districts', 'tax_applications'] as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function control(string $key, mixed $value): void
    {
        DB::table('tax_control_settings')->updateOrInsert(['setting_key' => $key], ['value' => json_encode($value), 'created_at' => now(), 'updated_at' => now()]);
    }

    private function createType(array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/admin/tax/types', $extra + ['name' => 'VAT', 'code' => 'VAT']);
    }

    public function test_a_type_is_created_with_a_category_and_a_method_and_the_old_columns_follow(): void
    {
        $this->createType(['tax_category' => 'vat_gst', 'application_method' => 'added', 'jurisdiction_id' => 1])->assertCreated();
        $row = DB::table('ledger_groups')->where('code', 'VAT')->first();
        $this->assertSame(['vat_gst', 'added', 1, 'vat', 'additive'], [$row->tax_category, $row->application_method, (int) $row->jurisdiction_id, $row->kind, $row->application_mode]);
        $this->createType(['name' => 'WHT', 'code' => 'WHT', 'tax_category' => 'withholding_income', 'application_method' => 'withheld'])->assertCreated();
        $w = DB::table('ledger_groups')->where('code', 'WHT')->first();
        $this->assertSame(['withheld', 'withholding_income'], [$w->application_mode, $w->kind]);
        $this->assertNotNull($w->payable_ledger_id, 'a withheld type still gets its payable and receivable ledgers');
    }

    public function test_the_old_way_of_asking_still_works_and_fills_the_new_columns(): void
    {
        $this->createType(['kind' => 'excise', 'application_mode' => 'additive', 'name' => 'Excise', 'code' => 'EXC'])->assertCreated();
        $row = DB::table('ledger_groups')->where('code', 'EXC')->first();
        $this->assertSame(['excise', 'added'], [$row->tax_category, $row->application_method]);
        $this->createType(['application_mode' => 'withheld', 'name' => 'W2', 'code' => 'W2'])->assertCreated();
        $this->assertSame('withholding_income', DB::table('ledger_groups')->where('code', 'W2')->value('tax_category'), 'a withheld type with no kind is withholding income tax, as before');
    }

    public function test_a_category_that_tax_control_has_switched_off_is_refused(): void
    {
        $this->control('enabled_categories', ['vat_gst']);
        $r = $this->createType(['tax_category' => 'excise', 'application_method' => 'added', 'name' => 'Excise', 'code' => 'EXC'])->assertStatus(422);
        $this->assertStringContainsString('Excise duty is switched off', $r->json('errors.tax_category.0'));
        $this->createType(['tax_category' => 'vat_gst', 'application_method' => 'added'])->assertCreated();
    }

    public function test_a_method_the_category_does_not_allow_is_refused_with_what_it_does_allow(): void
    {
        $r = $this->createType(['tax_category' => 'customs', 'application_method' => 'withheld'])->assertStatus(422);
        $this->assertStringContainsString('Customs / import duty cannot be applied as "withheld from a payment"', $r->json('errors.application_method.0'));
        $this->assertStringContainsString('added to the transaction amount', $r->json('errors.application_method.0'));
    }

    public function test_a_method_the_books_cannot_post_yet_is_refused_plainly(): void
    {
        $r = $this->createType(['tax_category' => 'vat_gst', 'application_method' => 'included'])->assertStatus(422);
        $this->assertStringContainsString('not available yet', $r->json('errors.application_method.0'));
        $this->assertSame(0, DB::table('ledger_groups')->where('code', 'VAT')->count(), 'nothing was created');
    }

    public function test_a_reverse_charge_type_is_created_as_an_added_tax_that_is_charged_to_the_buyer(): void
    {
        $this->createType(['tax_category' => 'vat_gst', 'application_method' => 'reverse_charge'])->assertCreated();
        $row = DB::table('ledger_groups')->where('code', 'VAT')->first();
        $this->assertSame(['reverse_charge', 'additive'], [$row->application_method, $row->application_mode]);
    }

    public function test_an_unknown_category_or_area_is_refused(): void
    {
        $this->createType(['tax_category' => 'made_up', 'application_method' => 'added'])->assertStatus(422)->assertJsonValidationErrors(['tax_category']);
        $this->createType(['tax_category' => 'vat_gst', 'application_method' => 'added', 'jurisdiction_id' => 999])->assertStatus(422);
        $this->createType([])->assertStatus(422);
    }

    public function test_how_a_tax_is_applied_cannot_change_but_the_category_and_the_name_can(): void
    {
        $id = $this->createType(['tax_category' => 'vat_gst', 'application_method' => 'added'])->assertCreated()->json('tax_type.id');
        $r = $this->putJson("/api/admin/tax/types/{$id}", ['application_method' => 'withheld'])->assertStatus(422);
        $this->assertStringContainsString('cannot be changed once it exists', $r->json('errors.application_method.0'));
        $this->putJson("/api/admin/tax/types/{$id}", ['application_mode' => 'withheld'])->assertStatus(422);   // the old way of saying the same
        $this->putJson("/api/admin/tax/types/{$id}", ['application_method' => 'added', 'name' => 'Value added tax'])->assertOk();
        $this->putJson("/api/admin/tax/types/{$id}", ['tax_category' => 'sales_tax'])->assertOk();
        $row = DB::table('ledger_groups')->where('id', $id)->first();
        $this->assertSame(['sales_tax', 'other', 'Value added tax'], [$row->tax_category, $row->kind, $row->name]);
        $this->control('category_methods', ['vat_gst' => ['added'], 'excise' => ['withheld']] + \App\Services\Books\TaxControlDefinitions::DEFAULT_METHODS);
        $this->putJson("/api/admin/tax/types/{$id}", ['tax_category' => 'excise'])->assertStatus(422);   // excise here may only be withheld, and this tax is added
        $this->putJson("/api/admin/tax/types/{$id}", ['jurisdiction_id' => 1])->assertOk();
    }

    public function test_the_form_is_told_what_it_may_offer(): void
    {
        $this->control('enabled_categories', ['vat_gst', 'excise']);
        $o = $this->getJson('/api/admin/tax/type-options')->assertOk()->json();
        $this->assertSame(['vat_gst', 'excise'], array_column($o['categories'], 'key'));
        $this->assertSame(['added', 'withheld', 'reverse_charge'], $o['postable_methods']);
        $this->assertSame(['added', 'included', 'reverse_charge'], collect($o['categories'])->firstWhere('key', 'vat_gst')['methods']);
        $this->assertSame(['Nairobi'], array_column($o['areas'], 'name'));
        $this->assertContains('removal', $o['tax_points']);
        $this->assertTrue($o['ready']);
    }

    private function exciseType(): int
    {
        return $this->createType(['name' => 'Excise', 'code' => 'EXC', 'tax_category' => 'excise', 'application_method' => 'added'])->assertCreated()->json('tax_type.id');
    }

    public function test_a_combined_excise_rate_is_stored_with_its_per_unit_part_and_its_tax_point(): void
    {
        $type = $this->exciseType();
        $r = $this->postJson('/api/admin/tax/rates', ['tax_type_id' => $type, 'rate_type' => 'combined', 'rate_value' => 10, 'secondary_rate_value' => 20, 'unit_of_measure_id' => 1,
            'valid_from' => '2026-01-01', 'tax_point' => 'removal'])->assertCreated();
        $row = DB::table('ledgers')->where('id', $r->json('tax_rate.id'))->first();
        $this->assertSame(['combined', 20.0, 'removal', 1], [$row->rate_type, (float) $row->secondary_rate_value, $row->tax_point, (int) $row->currency_id], 'the base currency is kept as its own id');
        $this->assertEquals(2100, \App\Models\TaxRate::find($row->id)->calculate(1000, 100));
    }

    public function test_the_new_rate_types_need_their_per_unit_part_and_a_tax_that_is_added(): void
    {
        $type = $this->exciseType();
        $base = ['tax_type_id' => $type, 'rate_value' => 10, 'valid_from' => '2026-01-01'];
        $this->postJson('/api/admin/tax/rates', $base + ['rate_type' => 'higher_of', 'unit_of_measure_id' => 1])->assertStatus(422)->assertJsonValidationErrors(['secondary_rate_value']);
        $this->postJson('/api/admin/tax/rates', $base + ['rate_type' => 'lower_of', 'secondary_rate_value' => 5])->assertStatus(422)->assertJsonValidationErrors(['unit_of_measure_id']);
        $this->postJson('/api/admin/tax/rates', $base + ['rate_type' => 'combined', 'secondary_rate_value' => 5, 'unit_of_measure_id' => 1, 'tax_point' => 'whenever'])->assertStatus(422)->assertJsonValidationErrors(['tax_point']);
        $w = $this->createType(['name' => 'WHT', 'code' => 'WHT', 'tax_category' => 'withholding_income', 'application_method' => 'withheld'])->json('tax_type.id');
        $r = $this->postJson('/api/admin/tax/rates', ['tax_type_id' => $w, 'rate_type' => 'combined', 'rate_value' => 5, 'secondary_rate_value' => 1, 'unit_of_measure_id' => 1, 'valid_from' => '2026-01-01'])->assertStatus(422);
        $this->assertStringContainsString('added to the price', $r->json('errors.rate_type.0'));
    }

    public function test_a_plain_percentage_rate_is_still_created_as_before(): void
    {
        $type = $this->createType(['tax_category' => 'vat_gst', 'application_method' => 'added'])->assertCreated()->json('tax_type.id');
        $r = $this->postJson('/api/admin/tax/rates', ['tax_type_id' => $type, 'rate_type' => 'percentage', 'rate_value' => 16, 'valid_from' => '2026-01-01'])->assertCreated();
        $row = DB::table('ledgers')->where('id', $r->json('tax_rate.id'))->first();
        $this->assertSame(['percent', null, null, null], [$row->rate_type, $row->secondary_rate_value, $row->tax_point, $row->currency_id]);
    }

    public function test_a_rate_can_be_changed_into_a_mixed_one_only_with_its_per_unit_part(): void
    {
        $type = $this->exciseType();
        $id = $this->postJson('/api/admin/tax/rates', ['tax_type_id' => $type, 'rate_type' => 'percentage', 'rate_value' => 10, 'valid_from' => '2026-01-01'])->assertCreated()->json('tax_rate.id');
        $this->putJson("/api/admin/tax/rates/{$id}", ['rate_type' => 'combined'])->assertStatus(422)->assertJsonValidationErrors(['secondary_rate_value']);
        $this->putJson("/api/admin/tax/rates/{$id}", ['rate_type' => 'combined', 'secondary_rate_value' => 15, 'unit_of_measure_id' => 1, 'tax_point' => 'import'])->assertOk();
        $this->assertSame(['combined', 'import'], [DB::table('ledgers')->where('id', $id)->value('rate_type'), DB::table('ledgers')->where('id', $id)->value('tax_point')]);
    }

    public function test_a_rate_can_list_the_taxes_its_base_includes(): void
    {
        $exc = $this->exciseType();
        $vat = $this->createType(['name' => 'VAT', 'code' => 'VAT', 'tax_category' => 'vat_gst', 'application_method' => 'added'])->json('tax_type.id');
        $r = $this->postJson('/api/admin/tax/rates', ['tax_type_id' => $vat, 'rate_type' => 'percentage', 'rate_value' => 16, 'valid_from' => '2026-01-01',
            'calculation_base' => 'total_payable', 'base_includes' => [$exc]])->assertCreated();
        $id = $r->json('tax_rate.id');
        $this->assertSame([$exc], \App\Services\Books\TaxResolver::includes(\App\Models\TaxRate::find($id)));
        $this->postJson('/api/admin/tax/rates', ['tax_type_id' => $vat, 'rate_type' => 'percentage', 'rate_value' => 16, 'valid_from' => '2026-01-01', 'base_includes' => [999]])->assertStatus(422);
        $this->putJson("/api/admin/tax/rates/{$id}", ['calculation_base' => 'post_discount'])->assertOk();
        $this->assertNull(DB::table('ledgers')->where('id', $id)->value('base_includes'), 'a base without earlier taxes has no list');
    }

    public function test_a_product_can_opt_out_of_a_tax_and_the_list_is_replaced_each_time(): void
    {
        foreach (['tax_opt_outs', 'products'] as $t) { Schema::dropIfExists($t); }
        $this->runSqlScripts('230_tax_resolution.sql');
        Schema::create('products', function ($t) { $t->id(); $t->string('name')->nullable(); $t->softDeletes(); $t->timestamps(); });
        DB::table('products')->insert(['id' => 5, 'name' => 'Bread']);
        $exc = $this->exciseType();
        $this->putJson('/api/admin/tax/opt-outs', ['taxable_type' => 'product', 'taxable_id' => 5, 'opt_outs' => [['tax_type_id' => $exc, 'reason' => 'Not excisable']]])->assertOk();
        $this->assertSame([['tax_type_id' => $exc, 'reason' => 'Not excisable']], $this->getJson('/api/admin/tax/opt-outs?taxable_type=product&taxable_id=5')->assertOk()->json('opt_outs'));
        $this->putJson('/api/admin/tax/opt-outs', ['taxable_type' => 'product', 'taxable_id' => 5, 'opt_outs' => []])->assertOk();
        $this->assertSame(0, DB::table('tax_opt_outs')->count());
        $this->putJson('/api/admin/tax/opt-outs', ['taxable_type' => 'product', 'taxable_id' => 5, 'opt_outs' => [['tax_type_id' => 999]]])->assertStatus(422);
        $this->putJson('/api/admin/tax/opt-outs', ['taxable_type' => 'customer', 'taxable_id' => 5, 'opt_outs' => []])->assertStatus(422);
        Schema::dropIfExists('tax_opt_outs'); Schema::dropIfExists('products');
    }

    public function test_a_reverse_charge_type_keeps_the_ledger_its_claim_goes_to(): void
    {
        $in = DB::table('ledgers')->insertGetId(['group_id' => 3, 'name' => 'TEST Input VAT', 'opening_balance' => 0, 'opening_side' => 'D', 'created_at' => now(), 'updated_at' => now()]);
        $id = $this->createType(['name' => 'Import VAT', 'code' => 'IMPV', 'tax_category' => 'vat_gst', 'application_method' => 'reverse_charge', 'input_ledger_id' => $in])->assertCreated()->json('tax_type.id');
        $this->assertSame($in, (int) DB::table('ledger_groups')->where('id', $id)->value('input_ledger_id'));
        $this->putJson("/api/admin/tax/types/{$id}", ['input_ledger_id' => null, 'cost_ledger_id' => $in])->assertOk();
        $this->assertSame([null, $in], [DB::table('ledger_groups')->where('id', $id)->value('input_ledger_id'), (int) DB::table('ledger_groups')->where('id', $id)->value('cost_ledger_id')]);
        $this->putJson("/api/admin/tax/types/{$id}", ['input_ledger_id' => 99999])->assertStatus(422);
    }
}

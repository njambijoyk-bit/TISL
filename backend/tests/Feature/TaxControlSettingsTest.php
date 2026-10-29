<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\TaxControlDefinitions;
use App\Services\Books\TaxControlSettings;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The Tax control settings (docs/TAX_CONTROL_PLAN.md, step T3): defaults, who may open and change which section, validation, the rule that what an existing
 * tax type uses cannot be switched off, and the change log.
 */
class TaxControlSettingsTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;
    use Concerns\StandsInForAccess;

    private const URL = '/api/admin/books/tax-control';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['tax_control_settings', 'tax_control_log', 'ledger_taxes'] as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('229_tax_control.sql');
        Schema::table('ledger_groups', function ($t) {
            $t->string('application_mode')->nullable(); $t->string('tax_category')->nullable(); $t->string('application_method')->nullable();
        });
        $now = now();
        DB::table('ledger_groups')->insert(['id' => 30, 'name' => 'Duties & Taxes', 'nature' => 'liability', 'is_primary' => 1, 'behaviour' => 'standard', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledger_groups')->insert(['id' => 31, 'parent_id' => 30, 'name' => 'VAT', 'nature' => 'liability', 'behaviour' => 'tax', 'application_mode' => 'additive', 'tax_category' => 'vat_gst', 'application_method' => 'added', 'created_at' => $now, 'updated_at' => $now]);
        DB::table('ledger_groups')->insert(['id' => 32, 'parent_id' => 30, 'name' => 'Transaction levy', 'nature' => 'liability', 'behaviour' => 'tax', 'application_mode' => 'additive', 'tax_category' => 'transaction_levy', 'application_method' => 'added', 'created_at' => $now, 'updated_at' => $now]);
    }

    protected function tearDown(): void
    {
        foreach (['tax_control_settings', 'tax_control_log', 'ledger_taxes'] as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    protected function person(array $permissions): User
    {
        $u = new User();
        $u->id = 100 + crc32(implode(',', $permissions)) % 100000;
        $u->name = 'Joy Accountant';
        $this->grant($u, $permissions);

        return $u;
    }

    protected function as(array $permissions): void
    {
        Sanctum::actingAs($this->person($permissions), ['*']);
    }

    private function section(array $r, string $id): array
    {
        return collect($r['sections'])->firstWhere('id', $id);
    }

    public function test_with_nothing_saved_every_setting_is_its_default(): void
    {
        $v = app(TaxControlSettings::class)->values();
        $this->assertSame(array_keys(TaxControlDefinitions::CATEGORIES), $v['enabled_categories']);
        $this->assertSame(TaxControlDefinitions::DEFAULT_METHODS, $v['category_methods']);
        $this->assertEquals(['rounding' => 'per_line', 'prices_include_tax' => false, 'override_needs_reason' => true, 'filing_due_day' => 20, 'return_period' => 'monthly'],
            array_intersect_key($v, array_flip(['rounding', 'prices_include_tax', 'override_needs_reason', 'filing_due_day', 'return_period'])));
    }

    public function test_the_tab_needs_the_view_permission_and_a_viewer_cannot_change_anything(): void
    {
        $this->as(['books.view']);
        $this->getJson(self::URL)->assertForbidden();
        $this->as(['books.view', 'books.tax.view']);
        $r = $this->getJson(self::URL)->assertOk()->json();
        $this->assertTrue($r['ready']);
        $this->assertCount(6, $r['sections']);
        foreach ($r['sections'] as $s) {
            $this->assertFalse($s['can_edit'], "{$s['id']} is read-only for a viewer");
        }
        $this->putJson(self::URL . '/filing', ['values' => ['filing_due_day' => 15]])->assertForbidden();
        $this->assertSame(20, app(TaxControlSettings::class)->get('filing_due_day'));
    }

    public function test_a_tax_administrator_changes_the_registrations_and_filing_but_not_how_tax_behaves(): void
    {
        $this->as(['books.view', 'books.tax.view', 'books.tax.admin']);
        $r = $this->getJson(self::URL)->json();
        $this->assertTrue($this->section($r, 'jurisdiction')['can_edit']);
        $this->assertTrue($this->section($r, 'filing')['can_edit']);
        foreach (['categories', 'mapping', 'calculation', 'regardless'] as $id) {
            $this->assertFalse($this->section($r, $id)['can_edit'], "{$id} stays with the owner");
        }
        $this->putJson(self::URL . '/jurisdiction', ['values' => ['tax_country' => 'ke', 'tax_registrations' => [['name' => 'VAT', 'number' => 'P051234567X'], ['name' => '', 'number' => '']]]])
            ->assertOk()->assertJsonPath('changed', ['tax_country', 'tax_registrations']);
        $this->assertSame('KE', app(TaxControlSettings::class)->get('tax_country'), 'stored in capitals');
        $this->assertSame([['name' => 'VAT', 'number' => 'P051234567X']], app(TaxControlSettings::class)->get('tax_registrations'), 'an empty row is dropped');
        $this->putJson(self::URL . '/filing', ['values' => ['return_period' => 'quarterly', 'filing_due_day' => 28, 'certificate_threshold' => '5000']])->assertOk();
        $this->putJson(self::URL . '/calculation', ['values' => ['rounding' => 'per_document']])->assertForbidden();
        $this->putJson(self::URL . '/categories', ['values' => ['enabled_categories' => ['vat_gst']]])->assertForbidden();
    }

    public function test_the_owner_changes_everything_and_each_change_is_logged_once(): void
    {
        $this->as(['books.view', 'books.tax.view', 'books.tax.control']);
        $this->putJson(self::URL . '/calculation', ['values' => ['rounding' => 'per_document', 'prices_include_tax' => true]])->assertOk()->assertJsonPath('changed', ['rounding', 'prices_include_tax']);
        $this->putJson(self::URL . '/calculation', ['values' => ['rounding' => 'per_document']])->assertOk()->assertJsonPath('message', 'Nothing had changed');
        $log = $this->getJson(self::URL . '/log')->assertOk()->json('rows');
        $this->assertCount(2, $log);
        $first = collect($log)->firstWhere('key', 'rounding');
        $this->assertSame(['per_line', 'per_document', 'Joy Accountant'], [$first['old'], $first['new'], $first['by']]);
        $this->assertSame('Round tax', $first['label']);
        $this->getJson(self::URL . '/log?key=nothing')->assertNotFound();
        $this->getJson(self::URL . '/log?key=rounding')->assertOk()->assertJsonCount(1, 'rows');
    }

    public function test_values_are_checked(): void
    {
        $this->as(['books.view', 'books.tax.view', 'books.tax.control']);
        $this->putJson(self::URL . '/jurisdiction', ['values' => ['tax_country' => 'KENYA']])->assertStatus(422)->assertJsonValidationErrors(['values.tax_country']);
        $this->putJson(self::URL . '/jurisdiction', ['values' => ['tax_registrations' => [['name' => 'VAT', 'number' => '']]]])->assertStatus(422)->assertJsonValidationErrors(['values.tax_registrations']);
        $this->putJson(self::URL . '/filing', ['values' => ['filing_due_day' => 40]])->assertStatus(422)->assertJsonValidationErrors(['values.filing_due_day']);
        $this->putJson(self::URL . '/filing', ['values' => ['return_period' => 'weekly']])->assertStatus(422)->assertJsonValidationErrors(['values.return_period']);
        $this->putJson(self::URL . '/categories', ['values' => ['enabled_categories' => ['vat_gst', 'made_up']]])->assertStatus(422)->assertJsonValidationErrors(['values.enabled_categories']);
        $this->putJson(self::URL . '/categories', ['values' => ['category_methods' => ['vat_gst' => ['teleport']]]])->assertStatus(422)->assertJsonValidationErrors(['values.category_methods']);
        $this->putJson(self::URL . '/filing', ['values' => ['rounding' => 'per_line']])->assertStatus(422)->assertJsonValidationErrors(['values.rounding']);   // not a setting of this section
        $this->putJson(self::URL . '/nonsense', ['values' => ['x' => 1]])->assertNotFound();
        $this->assertSame([], app(TaxControlSettings::class)->log(), 'nothing invalid was written or logged');
    }

    public function test_a_category_in_use_must_have_a_way_of_being_applied(): void
    {
        $this->as(['books.view', 'books.tax.view', 'books.tax.control']);
        $this->putJson(self::URL . '/categories', ['values' => ['category_methods' => ['excise' => []]]])->assertStatus(422)->assertJsonValidationErrors(['values.category_methods']);
        $this->putJson(self::URL . '/categories', ['values' => ['enabled_categories' => ['vat_gst', 'transaction_levy'], 'category_methods' => ['vat_gst' => ['added'], 'transaction_levy' => ['added']]]])->assertOk();
    }

    public function test_what_an_existing_tax_type_uses_cannot_be_switched_off(): void
    {
        $this->as(['books.view', 'books.tax.view', 'books.tax.control']);
        $r = $this->putJson(self::URL . '/categories', ['values' => ['enabled_categories' => ['vat_gst']]])->assertStatus(422)->assertJsonValidationErrors(['values.enabled_categories']);
        $this->assertStringContainsString('Transaction levy', $r->json('errors')['values.enabled_categories'][0]);
        $this->assertStringContainsString('"Transaction levy"', $r->json('errors')['values.enabled_categories'][0]);
        $m = $this->putJson(self::URL . '/categories', ['values' => ['category_methods' => ['vat_gst' => ['included', 'reverse_charge']]]])->assertStatus(422);
        $this->assertStringContainsString('"VAT"', $m->json('errors')['values.category_methods'][0], 'VAT is applied as added, so VAT/GST must still allow it');
        $this->putJson(self::URL . '/categories', ['values' => ['category_methods' => ['vat_gst' => ['added', 'reverse_charge']] + TaxControlDefinitions::DEFAULT_METHODS]])->assertOk();   // the screen always sends the whole table
    }

    public function test_the_group_that_holds_taxes_and_the_starting_ledgers_must_exist(): void
    {
        $this->as(['books.view', 'books.tax.view', 'books.tax.control']);
        $this->putJson(self::URL . '/mapping', ['values' => ['tax_group_id' => 9999]])->assertStatus(422)->assertJsonValidationErrors(['values.tax_group_id']);
        $this->putJson(self::URL . '/mapping', ['values' => ['category_ledgers' => ['vat_gst' => ['payable_ledger_id' => 9999]]]])->assertStatus(422)->assertJsonValidationErrors(['values.category_ledgers']);
        $this->putJson(self::URL . '/mapping', ['values' => ['tax_group_id' => 30, 'category_ledgers' => ['vat_gst' => ['payable_ledger_id' => 1, 'input_ledger_id' => '2'], 'excise' => ['payable_ledger_id' => null]]]])->assertOk();
        $this->assertSame(30, app(TaxControlSettings::class)->get('tax_group_id'));
        $this->assertSame(['vat_gst' => ['payable_ledger_id' => 1, 'input_ledger_id' => 2, 'cost_ledger_id' => null]], app(TaxControlSettings::class)->get('category_ledgers'), 'a category with nothing chosen is not kept');
    }

    public function test_a_tax_that_applies_regardless_names_a_real_tax_its_exemption_behaviour_and_its_documents(): void
    {
        $this->as(['books.view', 'books.tax.view', 'books.tax.control']);
        $row = ['tax_type_id' => 32, 'exemption_behaviour' => 'apply_independently', 'documents' => ['sales']];
        $this->putJson(self::URL . '/regardless', ['values' => ['apply_regardless' => [['tax_type_id' => 30] + $row]]])->assertStatus(422);                    // Duties & Taxes is not a tax type
        $this->putJson(self::URL . '/regardless', ['values' => ['apply_regardless' => [$row, $row]]])->assertStatus(422);                                    // listed twice
        $this->putJson(self::URL . '/regardless', ['values' => ['apply_regardless' => [['exemption_behaviour' => 'whatever'] + $row]]])->assertStatus(422);
        $this->putJson(self::URL . '/regardless', ['values' => ['apply_regardless' => [['documents' => []] + $row]]])->assertStatus(422);
        $this->putJson(self::URL . '/regardless', ['values' => ['apply_regardless' => [$row]]])->assertOk();
        $this->assertSame([$row], app(TaxControlSettings::class)->get('apply_regardless'));
    }

    public function test_the_screen_gets_the_choices_it_needs(): void
    {
        $this->as(['books.view', 'books.tax.view']);
        $l = $this->getJson(self::URL)->json('lookups');
        $this->assertSame(['VAT', 'Transaction levy'], array_column($l['tax_types'], 'name') === ['Transaction levy', 'VAT'] ? ['VAT', 'Transaction levy'] : []);
        $this->assertSame('vat_gst', collect($l['tax_types'])->firstWhere('name', 'VAT')['category']);
        $this->assertArrayHasKey('reverse_charge', $l['methods']);
        $this->assertArrayHasKey('apply_independently', $l['exemptions']);
        $this->assertContains('Duties & Taxes', array_column($l['groups'], 'name'));
    }

    public function test_without_the_script_the_tab_says_so(): void
    {
        Schema::dropIfExists('tax_control_settings');
        $this->as(['books.view', 'books.tax.view', 'books.tax.control']);
        $r = $this->getJson(self::URL)->assertOk()->json();
        $this->assertFalse($r['ready']);
        $this->assertStringContainsString('229_tax_control.sql', $r['message']);
        $this->putJson(self::URL . '/filing', ['values' => ['filing_due_day' => 5]])->assertStatus(409);
    }

    // ── the company details carry the country and registrations (script 234) ──

    private function companyTable(): void
    {
        Schema::dropIfExists('company_profile');
        Schema::create('company_profile', function ($t) {
            $t->id(); $t->string('name')->nullable(); $t->string('short_code')->nullable(); $t->string('country')->nullable(); $t->text('phones')->nullable(); $t->text('emails')->nullable();
            $t->string('tax_country', 2)->nullable(); $t->text('tax_registrations')->nullable(); $t->boolean('show_tax_jurisdiction')->default(false); $t->boolean('show_tax_registrations')->default(false);
            $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps();
        });
        DB::table('company_profile')->insert(['id' => 1, 'name' => 'Acme', 'short_code' => 'ACME', 'created_at' => now(), 'updated_at' => now()]);
        \App\Models\CompanyProfile::forget();
    }

    public function test_saving_the_jurisdiction_copies_it_to_the_company_details(): void
    {
        $this->companyTable();
        $this->as(['books.view', 'books.tax.view', 'books.tax.admin']);
        $this->putJson(self::URL . '/jurisdiction', ['values' => ['tax_country' => 'ke', 'tax_registrations' => [['name' => 'VAT', 'number' => 'P051234567X'], ['name' => 'PAYE', 'number' => 'A0012']]]])->assertOk();
        $row = DB::table('company_profile')->first();
        $this->assertSame('KE', $row->tax_country);
        $this->assertSame([['name' => 'VAT', 'number' => 'P051234567X'], ['name' => 'PAYE', 'number' => 'A0012']], json_decode($row->tax_registrations, true));
        $this->putJson(self::URL . '/jurisdiction', ['values' => ['tax_registrations' => []]])->assertOk();
        $this->assertNull(DB::table('company_profile')->value('tax_registrations'), 'emptied here, emptied there');
        $this->assertSame('KE', DB::table('company_profile')->value('tax_country'), 'what was not changed is left alone');
        Schema::dropIfExists('company_profile');
    }

    public function test_documents_print_only_what_the_company_chose_and_read_the_company_not_tax_control(): void
    {
        $this->companyTable();
        DB::table('company_profile')->update(['tax_country' => 'KE', 'tax_registrations' => json_encode([['name' => 'VAT', 'number' => 'P051234567X']])]);
        \App\Models\CompanyProfile::forget();
        $this->assertSame([], \App\Models\CompanyProfile::current()->taxLines(), 'both switches start off');
        DB::table('company_profile')->update(['show_tax_registrations' => 1]);
        \App\Models\CompanyProfile::forget();
        $this->assertSame(['VAT: P051234567X'], \App\Models\CompanyProfile::current()->taxLines());
        DB::table('company_profile')->update(['show_tax_jurisdiction' => 1]);
        \App\Models\CompanyProfile::forget();
        $lines = \App\Models\CompanyProfile::current()->taxLines();
        $this->assertCount(2, $lines);
        $this->assertStringStartsWith('Tax jurisdiction: ', $lines[0]);
        // a customer-facing read of the company never touches Tax control: with its tables gone the lines are still there
        Schema::dropIfExists('tax_control_settings');
        Schema::dropIfExists('tax_control_log');
        \App\Models\CompanyProfile::forget();
        $this->assertCount(2, \App\Models\CompanyProfile::current()->taxLines());
        $this->getJson('/api/company')->assertOk()->assertJsonPath('tax_lines.1', 'VAT: P051234567X');
        Schema::dropIfExists('company_profile');
    }
}

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
 * Tax in the chart of accounts (docs/TAX_CONTROL_PLAN.md, step T5): the tax group is kept out of the ordinary forms, an existing rate's amounts are left to
 * Tax and compliance, and a sales, purchase or charge account carries several taxes with the old columns following its first.
 */
class TaxAccountsTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;
    use Concerns\StandsInForAccess;

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
        $now = now();
        $g = fn (array $r) => DB::table('ledger_groups')->insert($r + ['nature' => 'liability', 'created_at' => $now, 'updated_at' => $now]);
        $g(['id' => 30, 'name' => 'Duties & Taxes', 'is_primary' => 1, 'behaviour' => 'standard']);
        $g(['id' => 31, 'parent_id' => 30, 'name' => 'VAT', 'behaviour' => 'tax', 'application_mode' => 'additive', 'tax_category' => 'vat_gst', 'application_method' => 'added', 'code' => 'VAT']);
        $g(['id' => 32, 'parent_id' => 30, 'name' => 'Excise duty', 'behaviour' => 'tax', 'application_mode' => 'additive', 'tax_category' => 'excise', 'application_method' => 'added', 'code' => 'EXC']);
        $g(['id' => 33, 'parent_id' => 30, 'name' => 'PAYE payable', 'behaviour' => 'standard']);
        foreach ([[43, 31, 'VAT 16%', 16], [44, 31, 'VAT 8%', 8], [45, 32, 'Excise 10%', 10]] as [$id, $grp, $name, $v]) {
            DB::table('ledgers')->insert(['id' => $id, 'group_id' => $grp, 'name' => $name, 'opening_balance' => 0, 'opening_side' => 'C', 'rate_type' => 'percent', 'rate_value' => $v, 'created_at' => $now, 'updated_at' => $now]);
        }
        $u = new User();
        $u->id = 8888;
        $this->grant($u, ['books.view', 'books.post']);
        Sanctum::actingAs($u, ['*']);
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

    private function sales(array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/admin/books/ledgers', $extra + ['name' => 'Sales - spirits', 'group_id' => 6]);
    }

    private function rows(int $ledger): array
    {
        return DB::table('ledger_taxes')->where('ledger_id', $ledger)->orderBy('sort_order')->get(['tax_type_id', 'tax_rate_id', 'treatment'])
            ->map(fn ($r) => [(int) $r->tax_type_id, $r->tax_rate_id ? (int) $r->tax_rate_id : null, $r->treatment])->all();
    }

    // ── the guard ──────────────────────────────────────────────────────

    public function test_a_ledger_cannot_be_made_directly_under_the_tax_group_but_a_subgroup_of_it_can_hold_one(): void
    {
        $r = $this->postJson('/api/admin/books/ledgers', ['name' => 'My own tax', 'group_id' => 30])->assertStatus(422)->assertJsonValidationErrors(['group_id']);
        $this->assertStringContainsString('Tax and compliance', $r->json('errors.group_id.0'));
        $this->postJson('/api/admin/books/ledgers', ['name' => 'PAYE owed', 'group_id' => 33])->assertCreated();
        $id = DB::table('ledgers')->where('name', 'PAYE owed')->value('id');
        $this->putJson("/api/admin/books/ledgers/{$id}", ['group_id' => 30])->assertStatus(422);   // nor moved into it
    }

    public function test_the_group_named_in_tax_control_is_the_tax_group(): void
    {
        DB::table('tax_control_settings')->insert(['setting_key' => 'tax_group_id', 'value' => '33', 'created_at' => now(), 'updated_at' => now()]);
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Now allowed', 'group_id' => 30])->assertCreated();
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Now refused', 'group_id' => 33])->assertStatus(422);
    }

    public function test_a_tax_type_is_not_made_or_changed_in_the_chart_but_a_plain_subgroup_is_fine(): void
    {
        $this->postJson('/api/admin/books/groups', ['name' => 'Fake tax', 'parent_id' => 30, 'behaviour' => 'tax'])->assertStatus(422)->assertJsonValidationErrors(['behaviour']);
        $this->postJson('/api/admin/books/groups', ['name' => 'Other duties', 'parent_id' => 30])->assertCreated();
        $this->putJson('/api/admin/books/groups/31', ['name' => 'Renamed VAT'])->assertStatus(422);
        $this->putJson('/api/admin/books/groups/30', ['name' => 'Taxes'])->assertStatus(422);
        $this->putJson('/api/admin/books/groups/31', ['settings' => ['note' => 'ok']])->assertOk();
        $this->assertSame('VAT', DB::table('ledger_groups')->where('id', 31)->value('name'));
    }

    public function test_an_existing_rates_amounts_are_left_to_tax_and_compliance(): void
    {
        $this->putJson('/api/admin/books/ledgers/43', ['rate_value' => 20])->assertStatus(422)->assertJsonValidationErrors(['rate_value']);
        $this->putJson('/api/admin/books/ledgers/43', ['rate_value' => '16.0000', 'valid_from' => null, 'notes' => 'checked'])->assertOk();   // the same amount is not a change
        $this->assertEquals(16, DB::table('ledgers')->where('id', 43)->value('rate_value'));
    }

    // ── several taxes on one account ───────────────────────────────────

    public function test_an_account_carries_several_taxes_and_the_old_columns_follow_the_first(): void
    {
        $r = $this->sales(['taxes' => [['tax_rate_id' => 45, 'treatment' => 'applies'], ['tax_rate_id' => 43, 'treatment' => 'applies']]])->assertCreated();
        $id = $r->json('data.id');
        $this->assertSame([[32, 45, 'applies'], [31, 43, 'applies']], $this->rows($id));
        $l = DB::table('ledgers')->where('id', $id)->first();
        $this->assertSame(['taxable', 45], [$l->tax_nature, (int) $l->tax_rate_ledger_id], 'excise is the primary tax, so it is the one the books charge today');
        $list = collect($this->getJson('/api/admin/books/ledgers?all=1')->json())->firstWhere('id', $id);
        $this->assertSame(['Excise duty', 'VAT'], array_column($list['taxes'], 'tax_type'));
    }

    public function test_an_exempt_row_with_no_tax_named_goes_to_the_one_vat_type(): void
    {
        $id = $this->sales(['taxes' => [['treatment' => 'exempt']]])->assertCreated()->json('data.id');
        $this->assertSame([[31, null, 'exempt']], $this->rows($id));
        $this->assertSame('exempt', DB::table('ledgers')->where('id', $id)->value('tax_nature'));
    }

    public function test_a_bad_list_of_taxes_is_refused(): void
    {
        $this->sales(['taxes' => [['tax_rate_id' => 43], ['tax_rate_id' => 44]]])->assertStatus(422)->assertJsonValidationErrors(['taxes']);                      // VAT twice
        $this->sales(['taxes' => [['tax_type_id' => 31, 'treatment' => 'applies']]])->assertStatus(422)->assertJsonValidationErrors(['taxes']);                  // charged, no rate
        $this->sales(['taxes' => [['tax_type_id' => 32, 'tax_rate_id' => 43]]])->assertStatus(422)->assertJsonValidationErrors(['taxes']);                       // the rate is VAT's
        $this->sales(['taxes' => [['tax_type_id' => 33, 'treatment' => 'exempt']]])->assertStatus(422)->assertJsonValidationErrors(['taxes']);                   // not a tax type
        $this->sales(['taxes' => [['tax_rate_id' => 43, 'treatment' => 'nonsense']]])->assertStatus(422)->assertJsonValidationErrors(['taxes']);
        $this->sales(['taxes' => []])->assertStatus(422)->assertJsonValidationErrors(['tax_nature']);                                                          // a sales account must say its tax
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Petty float', 'group_id' => 4, 'taxes' => [['tax_rate_id' => 43]]])->assertStatus(422)->assertJsonValidationErrors(['taxes']);   // a bank account carries none
        $this->assertSame(0, DB::table('ledgers')->where('name', 'Sales - spirits')->count(), 'nothing was created');
    }

    public function test_the_list_can_be_replaced_and_reordered(): void
    {
        $id = $this->sales(['taxes' => [['tax_rate_id' => 43], ['tax_rate_id' => 45]]])->assertCreated()->json('data.id');
        $this->putJson("/api/admin/books/ledgers/{$id}", ['taxes' => [['tax_rate_id' => 45], ['tax_rate_id' => 44]]])->assertOk();
        $this->assertSame([[32, 45, 'applies'], [31, 44, 'applies']], $this->rows($id));
        $this->assertSame(45, (int) DB::table('ledgers')->where('id', $id)->value('tax_rate_ledger_id'));
        $this->putJson("/api/admin/books/ledgers/{$id}", ['taxes' => []])->assertStatus(422)->assertJsonValidationErrors(['tax_nature']);
        $this->assertCount(2, $this->rows($id), 'a refused save changes nothing');
    }

    public function test_saving_the_old_way_rewrites_the_first_tax_and_keeps_the_others(): void
    {
        $id = $this->sales(['taxes' => [['tax_rate_id' => 43], ['tax_rate_id' => 45]]])->assertCreated()->json('data.id');
        $this->putJson("/api/admin/books/ledgers/{$id}", ['tax_nature' => 'exempt', 'tax_rate_ledger_id' => null])->assertOk();
        $this->assertSame([[31, null, 'exempt'], [32, 45, 'applies']], $this->rows($id), 'VAT became exempt; excise stayed');
        $this->putJson("/api/admin/books/ledgers/{$id}", ['tax_nature' => 'taxable', 'tax_rate_ledger_id' => 44])->assertOk();
        $this->assertSame([[31, 44, 'applies'], [32, 45, 'applies']], $this->rows($id));
        $this->putJson("/api/admin/books/ledgers/{$id}", ['notes' => 'renamed'])->assertOk();
        $this->assertCount(2, $this->rows($id), 'saving something else leaves the taxes alone');
    }

    public function test_a_new_account_made_the_old_way_gets_its_row(): void
    {
        $id = $this->sales(['tax_nature' => 'taxable', 'tax_rate_ledger_id' => 43])->assertCreated()->json('data.id');
        $this->assertSame([[31, 43, 'applies']], $this->rows($id));
    }

    public function test_without_the_script_taxes_are_ignored_and_the_old_way_still_works(): void
    {
        Schema::dropIfExists('ledger_taxes');
        $r = $this->sales(['taxes' => [['tax_rate_id' => 43]], 'tax_nature' => 'taxable', 'tax_rate_ledger_id' => 43])->assertCreated();
        $this->assertSame(43, (int) DB::table('ledgers')->where('id', $r->json('data.id'))->value('tax_rate_ledger_id'));
    }
}

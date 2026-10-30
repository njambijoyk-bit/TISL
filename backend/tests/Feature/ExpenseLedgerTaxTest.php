<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\User;
use App\Services\Books\AccountTaxes;
use App\Services\Books\Engine\LedgerBalances;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** An account under Indirect or Direct Expenses, Fixed Assets or Indirect Incomes may carry a tax (as Buyer premium carries VAT) but does not have to; other plain groups still cannot. */
class ExpenseLedgerTaxTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::table('ledgers', function ($t) {
            $t->string('rate_type')->nullable(); $t->decimal('rate_value', 12, 4)->nullable(); $t->date('valid_from')->nullable(); $t->date('valid_until')->nullable(); $t->string('classification')->nullable();
            $t->string('tax_nature')->nullable(); $t->string('side')->nullable(); $t->unsignedBigInteger('tax_rate_ledger_id')->nullable(); $t->unsignedBigInteger('unit_of_measure_id')->nullable(); $t->unsignedBigInteger('currency_id')->nullable();
        });
        $u = new User();
        $u->id = 31;
        $this->grant($u, ['books.view', 'books.post']);
        Sanctum::actingAs($u, ['*']);
    }

    protected function tearDown(): void
    {
        LedgerBalances::forget();
        parent::tearDown();
    }

    public function test_the_behaviour_for_tax_comes_from_where_the_group_sits(): void
    {
        $this->assertSame('optional', AccountTaxes::effectiveBehaviour(8), 'Indirect Expenses');
        foreach (['Direct Expenses' => 'expense', 'Fixed Assets' => 'asset', 'Indirect Incomes' => 'income'] as $name => $nature) {
            $g = $name === 'Indirect Incomes' ? \App\Models\Books\LedgerGroup::where('name', $name)->first() : \App\Models\Books\LedgerGroup::create(['name' => $name, 'nature' => $nature, 'is_primary' => true, 'sort_order' => 70, 'behaviour' => 'standard']);
            $this->assertSame('optional', AccountTaxes::effectiveBehaviour((int) $g->id), $name);
        }
        $fixed = \App\Models\Books\LedgerGroup::where('name', 'Fixed Assets')->first();
        $acc = \App\Models\Books\LedgerGroup::create(['name' => 'Accumulated Depreciation', 'parent_id' => $fixed->id, 'nature' => 'asset', 'sort_order' => 71, 'behaviour' => 'standard']);
        $this->assertSame('standard', AccountTaxes::effectiveBehaviour((int) $acc->id), 'accumulated depreciation is not taxed when posted');
        $this->assertSame('sales', AccountTaxes::effectiveBehaviour(6));
        $this->assertSame('standard', AccountTaxes::effectiveBehaviour(1), 'Capital Account');
    }

    public function test_an_expense_account_may_be_exempt_or_have_no_tax_and_a_capital_account_may_not_carry_one(): void
    {
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Water', 'group_id' => 8])->assertCreated();   // no tax: fine
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Insurance cost', 'group_id' => 8, 'tax_nature' => 'exempt'])->assertCreated();
        $this->assertSame('exempt', Ledger::where('name', 'Insurance cost')->value('tax_nature'));
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Reserve', 'group_id' => 1, 'tax_nature' => 'exempt'])->assertStatus(422)->assertJsonValidationErrors('tax_nature');
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Taxable rent', 'group_id' => 8, 'tax_nature' => 'taxable'])->assertStatus(422)->assertJsonValidationErrors('tax_rate_ledger_id');
    }

    public function test_a_customer_or_supplier_account_may_be_exempt_zero_rated_or_out_of_scope_but_never_taxable(): void
    {
        $this->assertSame('party', AccountTaxes::effectiveBehaviour(5), 'Sundry Debtors');
        $this->assertSame('party', AccountTaxes::effectiveBehaviour(10), 'Sundry Creditors');
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Charity Ltd', 'group_id' => 5, 'tax_nature' => 'exempt'])->assertCreated();
        $this->assertSame('exempt', Ledger::where('name', 'Charity Ltd')->value('tax_nature'));
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Export Co', 'group_id' => 5, 'tax_nature' => 'zero_rated'])->assertCreated();
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Plain Co', 'group_id' => 5])->assertCreated();
        $this->assertNull(Ledger::where('name', 'Plain Co')->value('tax_nature'), 'empty means follow the sales account');
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Taxable Co', 'group_id' => 5, 'tax_nature' => 'taxable'])->assertStatus(422)->assertJsonValidationErrors('tax_nature');
        $id = Ledger::where('name', 'Charity Ltd')->value('id');
        $this->putJson("/api/admin/books/ledgers/{$id}", ['tax_nature' => null])->assertOk();
        $this->assertNull(Ledger::find($id)->tax_nature);
    }

    public function test_the_party_overrides_the_lines_tax(): void
    {
        $svc = app(\App\Services\Books\TaxLineService::class);
        $rows = [['tax_rate_id' => 1, 'label' => 'VAT 16%', 'base_amount' => 1000.0, 'tax_amount' => 160.0]];
        $none = new Ledger(['tax_nature' => null]);
        $this->assertSame($rows, $svc->forParty($rows, $none), 'no treatment on the party: the sales account decides');
        $this->assertSame($rows, $svc->forParty($rows, null));
        $this->assertSame([], $svc->forParty($rows, new Ledger(['tax_nature' => 'exempt'])), 'an exempt customer is not charged VAT on vatable goods');
        $this->assertSame([], $svc->forParty($rows, new Ledger(['tax_nature' => 'out_of_scope'])));
        $zero = $svc->forParty($rows, new Ledger(['tax_nature' => 'zero_rated']));
        $this->assertSame(0.0, $zero[0]['tax_amount']);
        $this->assertSame(1000.0, $zero[0]['base_amount']);
    }

    public function test_the_ledger_list_says_what_each_ledger_may_do_about_tax_and_a_plain_ledger_has_no_suggested_amount(): void
    {
        $rows = collect($this->getJson('/api/admin/books/ledgers?all=1')->assertOk()->json())->pluck('tax_behaviour', 'name');
        $this->assertSame('sales', $rows['Sales']);
        $this->assertSame('optional', $rows['Bank charges'], 'under Indirect Expenses');
        $this->assertSame('party', $rows['Customer A']);
        $this->assertSame('standard', $rows['Capital']);
        $this->getJson('/api/admin/books/ledgers/' . Ledger::where('name', 'Rent')->value('id') . '/suggested-amount')->assertOk()->assertJsonPath('amount', null);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\User;
use App\Services\Books\AccountTaxes;
use App\Services\Books\Engine\LedgerBalances;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** An account under Indirect Expenses may carry a tax (as Buyer premium carries VAT) but does not have to; other plain groups still cannot. */
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
        $this->assertSame('expense', AccountTaxes::effectiveBehaviour(8), 'Indirect Expenses');
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
}

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
 * A fixed or per-unit rate on a tax, delivery or charge ledger needs a currency, and "Base currency" is one: choosing it (an empty currency) is kept as the
 * base currency's own id instead of being refused.
 */
class LedgerBaseCurrencyRateTest extends TestCase
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
        DB::table('ledger_groups')->where('id', 2)->update(['behaviour' => 'tax']);   // a tax group
        $u = new User();
        $u->id = 4321;
        $this->grant($u, ['books.view', 'books.post']);
        Sanctum::actingAs($u, ['*']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    public function test_a_fixed_amount_with_the_base_currency_chosen_is_accepted_and_kept_as_the_base_currency(): void
    {
        $r = $this->postJson('/api/admin/books/ledgers', ['name' => 'Levy', 'group_id' => 2, 'rate_type' => 'fixed', 'rate_value' => 200, 'currency_id' => null]);
        $r->assertCreated();
        $this->assertSame(1, (int) DB::table('ledgers')->where('name', 'Levy')->value('currency_id'), 'the base currency (KES, id 1)');
    }

    public function test_leaving_the_currency_out_means_the_same(): void
    {
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Levy 2', 'group_id' => 2, 'rate_type' => 'fixed', 'rate_value' => 50])->assertCreated();
        $this->assertSame(1, (int) DB::table('ledgers')->where('name', 'Levy 2')->value('currency_id'));
    }

    public function test_another_currency_is_kept_and_a_percentage_needs_none(): void
    {
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Dollar levy', 'group_id' => 2, 'rate_type' => 'fixed', 'rate_value' => 5, 'currency_id' => 2])->assertCreated();
        $this->assertSame(2, (int) DB::table('ledgers')->where('name', 'Dollar levy')->value('currency_id'));
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Percent', 'group_id' => 2, 'rate_type' => 'percent', 'rate_value' => 16])->assertCreated();
        $this->assertNull(DB::table('ledgers')->where('name', 'Percent')->value('currency_id'));
    }
}

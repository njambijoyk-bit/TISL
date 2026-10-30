<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** What a ledger is (bank, customer, tax, fixed asset...) is worked out from the chart, listed, and can be filtered on. */
class LedgerKindsTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        $fixed = LedgerGroup::create(['name' => 'Fixed Assets', 'nature' => 'asset', 'is_primary' => true, 'sort_order' => 30, 'behaviour' => 'standard']);
        $acc = LedgerGroup::create(['name' => 'Accumulated Depreciation', 'parent_id' => $fixed->id, 'nature' => 'asset', 'sort_order' => 31, 'behaviour' => 'standard']);
        Ledger::create(['group_id' => $fixed->id, 'name' => 'Computers', 'opening_balance' => 0, 'opening_side' => 'D', 'is_active' => true]);
        Ledger::create(['group_id' => $acc->id, 'name' => 'Accumulated Depreciation – Computers', 'opening_balance' => 0, 'opening_side' => 'C', 'is_active' => true]);
        $u = new User();
        $u->id = 9;
        $this->grant($u, ['books.view']);
        Sanctum::actingAs($u, ['*']);
    }

    protected function tearDown(): void
    {
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function kinds(): array
    {
        return collect($this->getJson('/api/admin/books/ledgers?all=1')->assertOk()->json())->pluck('kind', 'name')->all();
    }

    public function test_each_ledger_has_a_kind_from_where_it_sits(): void
    {
        $k = $this->kinds();
        $this->assertSame('bank', $k['Cash'] ?? null, 'the world keeps Cash under Bank Accounts');
        $this->assertSame('customer', $k['Customer A']);
        $this->assertSame('supplier', $k['Trade Creditor']);
        $this->assertSame('sales', $k['Sales']);
        $this->assertSame('purchase', $k['Purchases']);
        $this->assertSame('fixed_asset', $k['Computers']);
        $this->assertSame('accumulated_depreciation', $k['Accumulated Depreciation – Computers'], 'under Fixed Assets but not a fixed asset itself');
        $this->assertSame('other_expense', $k['Rent']);
        $this->assertSame('capital', $k['Capital']);
    }

    public function test_cash_in_hand_is_cash_even_when_its_group_behaves_like_a_bank(): void
    {
        $g = LedgerGroup::create(['name' => 'Cash-in-Hand', 'parent_id' => 3, 'nature' => 'asset', 'sort_order' => 50, 'behaviour' => 'bank']);
        Ledger::create(['group_id' => $g->id, 'name' => 'Petty Cash', 'opening_balance' => 0, 'opening_side' => 'D', 'is_active' => true]);
        $k = $this->kinds();
        $this->assertSame('cash', $k['Petty Cash']);
        $this->assertSame('bank', $k['Cash'], 'a ledger in Bank Accounts stays a bank');
    }

    public function test_a_moved_ledger_changes_kind_and_the_list_can_be_filtered(): void
    {
        $this->assertSame('other_expense', $this->kinds()['Rent']);
        DB::table('ledgers')->where('name', 'Rent')->update(['group_id' => LedgerGroup::where('name', 'Fixed Assets')->value('id')]);
        $this->assertSame('fixed_asset', $this->kinds()['Rent']);
        $names = collect($this->getJson('/api/admin/books/ledgers?all=1&kind=fixed_asset')->assertOk()->json())->pluck('name')->sort()->values()->all();
        $this->assertSame(['Computers', 'Rent'], $names);
        $this->assertSame([], $this->getJson('/api/admin/books/ledgers?all=1&kind=nonsense')->json());
        $this->getJson('/api/admin/books/ledger-kinds')->assertOk()->assertJsonFragment(['key' => 'bank', 'label' => 'Bank'])->assertJsonFragment(['key' => 'other_expense']);
    }
}

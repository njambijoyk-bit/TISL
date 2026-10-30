<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\User;
use App\Services\Books\ChartStarterService;
use App\Services\Books\Engine\LedgerBalances;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Starter accounts: preview, add, skip what exists, move only what is named, and who may do what. */
class ChartStarterTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        Schema::dropIfExists('chart_change_log');
        Schema::create('chart_change_log', function ($t) { $t->id(); $t->unsignedBigInteger('ledger_id'); $t->unsignedBigInteger('from_group_id')->nullable(); $t->unsignedBigInteger('to_group_id')->nullable(); $t->string('reason')->nullable(); $t->unsignedBigInteger('changed_by')->nullable(); $t->timestamp('created_at')->nullable(); });
        // the groups a real chart has and the world does not: the starter packs hang under them
        LedgerGroup::create(['name' => 'Fixed Assets', 'nature' => 'asset', 'is_primary' => true, 'is_system' => true, 'sort_order' => 30, 'behaviour' => 'standard']);
        LedgerGroup::create(['name' => 'Deposits (Asset)', 'parent_id' => 3, 'nature' => 'asset', 'is_system' => true, 'sort_order' => 31, 'behaviour' => 'standard']);
        LedgerGroup::create(['name' => 'Provisions', 'parent_id' => 2, 'nature' => 'liability', 'is_system' => true, 'sort_order' => 32, 'behaviour' => 'standard']);
        LedgerGroup::create(['name' => 'Loans & Advances (Asset)', 'parent_id' => 3, 'nature' => 'asset', 'is_system' => true, 'sort_order' => 33, 'behaviour' => 'standard']);
        DB::table('ledgers')->where('id', 12)->update(['name' => 'Bank Charges']);
        Ledger::create(['group_id' => 8, 'name' => 'Exchange Loss', 'opening_balance' => 0, 'opening_side' => 'D', 'is_system' => true, 'is_active' => true]);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('chart_change_log');
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function names(string $table, string $where = '1=1'): array
    {
        return DB::table($table)->whereRaw($where)->pluck('name')->all();
    }

    public function test_the_preview_says_what_is_new_what_exists_and_what_moves_and_changes_nothing(): void
    {
        $before = [DB::table('ledgers')->count(), DB::table('ledger_groups')->count()];
        $r = app(ChartStarterService::class)->preview(['finance', 'premises']);
        $this->assertSame($before, [DB::table('ledgers')->count(), DB::table('ledger_groups')->count()], 'a preview writes nothing');
        $this->assertFalse($r['applied']);
        $finance = collect($r['packs'])->firstWhere('key', 'finance');
        $this->assertSame(['group' => 'Finance Costs', 'under' => 'Indirect Expenses'], ['group' => collect($finance['items'])->firstWhere('type', 'group')['name'], 'under' => collect($finance['items'])->firstWhere('type', 'group')['under']]);
        $moves = collect($finance['items'])->where('type', 'move')->keyBy('name');
        $this->assertSame('move', $moves['Bank Charges']['status']);
        $this->assertSame('move', $moves['Exchange Loss']['status']);
        $this->assertStringContainsString('Indirect Expenses', $moves['Bank Charges']['note']);
        $this->assertSame(5, $finance['counts']['new_ledgers']);
        $this->assertSame(2, $finance['counts']['moves']);
        $premises = collect($r['packs'])->firstWhere('key', 'premises');
        $this->assertSame(6, $premises['counts']['new_groups'], 'Establishment Expenses, Rent & Rates, Utilities, Cleaning, Security, Other');
        $this->assertSame(['Electricity Expense'], array_column(array_filter($premises['items'], fn ($i) => $i['name'] === 'Electricity Expense'), 'name'));
    }

    public function test_adding_a_pack_makes_the_groups_and_ledgers_in_the_right_place_and_on_the_right_report_line(): void
    {
        $r = app(ChartStarterService::class)->apply(['premises', 'finance'], null);
        $this->assertTrue($r['applied']);
        $est = LedgerGroup::where('name', 'Establishment Expenses')->first();
        $this->assertSame(8, (int) $est->parent_id, 'under Indirect Expenses');
        $this->assertSame('expense', $est->nature);
        $this->assertFalse((bool) $est->is_primary);
        $this->assertSame(11, (int) $est->statement_id, 'it reports where Indirect Expenses does: Operating expenses');
        $util = LedgerGroup::where('name', 'Utilities')->first();
        $this->assertSame((int) $est->id, (int) $util->parent_id);
        $this->assertSame((int) $util->id, (int) Ledger::where('name', 'Electricity Expense')->value('group_id'));
        $fin = LedgerGroup::where('name', 'Finance Costs')->first();
        $this->assertSame(12, (int) $fin->statement_id, 'Finance Costs reports on the Finance costs line, not Operating expenses');
        $this->assertSame((int) $fin->id, (int) Ledger::where('name', 'Bank Charges')->value('group_id'), 'moved');
        $this->assertSame((int) $fin->id, (int) Ledger::where('name', 'Exchange Loss')->value('group_id'));
        $this->assertTrue((bool) Ledger::where('name', 'Loan Interest')->value('is_active'));
        $this->assertFalse((bool) Ledger::where('name', 'Loan Interest')->value('is_system'), 'made by the business, so it can be renamed or removed');
        $log = DB::table('chart_change_log')->get();
        $this->assertCount(2, $log);
        $this->assertSame(8, (int) $log[0]->from_group_id);
        $this->assertStringContainsString('Finance costs', $log[0]->reason);
        $this->assertSame(1, DB::table('ledger_groups')->where('name', 'Utilities')->count(), 'one Utilities group only');
    }

    public function test_adding_a_pack_again_changes_nothing_and_what_exists_is_never_overwritten(): void
    {
        $svc = app(ChartStarterService::class);
        $svc->apply(['premises'], null);
        DB::table('ledgers')->where('name', 'Office Rent')->update(['name' => 'HQ Rent']);   // the business renamed one
        $groups = DB::table('ledger_groups')->count();
        $ledgers = DB::table('ledgers')->count();
        $again = $svc->apply(['premises'], null);
        $this->assertSame([$groups, $ledgers + 1], [DB::table('ledger_groups')->count(), DB::table('ledgers')->count()], 'only the renamed one is made again: nothing else');
        $this->assertSame(1, $again['totals']['new_ledgers']);
        $this->assertSame(0, $again['totals']['new_groups']);
    }

    public function test_a_ledger_that_already_exists_in_another_group_is_left_where_it_is_and_said_so(): void
    {
        $other = LedgerGroup::create(['name' => 'My Own Group', 'parent_id' => 8, 'nature' => 'expense', 'is_system' => false, 'sort_order' => 90, 'behaviour' => 'standard']);
        Ledger::create(['group_id' => $other->id, 'name' => 'Electricity Expense', 'opening_balance' => 0, 'opening_side' => 'D', 'is_active' => true]);
        $r = app(ChartStarterService::class)->apply(['premises'], null);
        $item = collect(collect($r['packs'])->firstWhere('key', 'premises')['items'])->firstWhere('name', 'Electricity Expense');
        $this->assertSame('elsewhere', $item['status']);
        $this->assertStringContainsString('My Own Group', $item['note']);
        $this->assertSame((int) $other->id, (int) Ledger::where('name', 'Electricity Expense')->value('group_id'));
        $this->assertSame(1, Ledger::where('name', 'Electricity Expense')->count());
    }

    public function test_a_group_that_is_missing_skips_its_section_and_a_move_into_a_protected_group_is_refused(): void
    {
        LedgerGroup::where('name', 'Fixed Assets')->delete();
        $r = app(ChartStarterService::class)->preview(['assets']);
        $items = collect($r['packs'][0]['items']);
        $this->assertSame('missing', $items->firstWhere('name', 'Fixed Assets')['status']);
        $this->assertNotNull($items->firstWhere('name', 'Depreciation'), 'the other section still goes ahead');
        $guard = app(ChartStarterService::class)->preview(['finance']);
        $this->assertSame('move', collect($guard['packs'][0]['items'])->firstWhere('name', 'Bank Charges')['status']);
        DB::table('ledgers')->where('name', 'Bank Charges')->update(['group_id' => 4]);   // Bank Accounts: a bank group
        $r2 = app(ChartStarterService::class)->preview(['finance']);
        $held = collect($r2['packs'][0]['items'])->firstWhere('name', 'Bank Charges');
        $this->assertSame('elsewhere', $held['status'], 'a ledger sitting in a bank group is not pulled out by a pack');
    }

    public function test_the_starter_routes_need_the_right_permissions(): void
    {
        $u = new User();
        $u->id = 5;
        $this->grant($u, ['books.view']);
        Sanctum::actingAs($u, ['*']);
        $this->getJson('/api/admin/books/chart-starters')->assertOk()->assertJsonPath('packs.0.key', 'premises')->assertJsonCount(10, 'packs');
        $this->postJson('/api/admin/books/chart-starters/preview', ['packs' => ['finance']])->assertOk()->assertJsonPath('applied', false);
        $this->postJson('/api/admin/books/chart-starters/apply', ['packs' => ['finance']])->assertForbidden();
        $this->postJson('/api/admin/books/chart-starters/preview', [])->assertStatus(422);
        $this->assertSame(0, Ledger::where('name', 'Loan Interest')->count());
        $this->grant($u, ['books.view', 'books.post']);
        $this->postJson('/api/admin/books/chart-starters/apply', ['packs' => ['finance']])->assertOk()->assertJsonPath('applied', true)->assertJsonPath('totals.moves', 2);
        $this->assertSame(1, Ledger::where('name', 'Loan Interest')->count());
        $this->postJson('/api/admin/books/chart-starters/apply', ['packs' => ['nonsense']])->assertOk()->assertJsonPath('totals.new_groups', 0);
    }

    public function test_every_pack_can_be_added_to_a_chart_that_has_the_standard_groups_without_clashing(): void
    {
        $keys = array_column(app(ChartStarterService::class)->packs(), 'key');
        $this->assertCount(10, $keys);
        $r = app(ChartStarterService::class)->apply($keys, null);
        $this->assertSame(0, $r['totals']['skipped'], 'nothing clashes in a standard chart');
        $this->assertGreaterThanOrEqual(95, $r['totals']['new_ledgers']);
        $names = DB::table('ledgers')->pluck('name');
        $this->assertSame($names->count(), $names->unique()->count(), 'no ledger name twice');
        $groups = DB::table('ledger_groups')->pluck('name');
        $this->assertSame($groups->count(), $groups->unique()->count(), 'no group name twice');
        $this->assertSame(1, Ledger::where('name', 'Insurance Payable')->count(), 'two packs name it, one ledger is made');
        $this->assertSame(1, Ledger::where('name', 'Prepaid Insurance')->count());
        $acc = LedgerGroup::where('name', 'Accumulated Depreciation')->first();
        $this->assertSame('asset', $acc->nature, 'accumulated depreciation sits under Fixed Assets and reduces it');
        $this->assertSame(6, Ledger::where('group_id', $acc->id)->count());
    }
}

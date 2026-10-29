<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The reconciliation hub (docs/BOOKS_REPORTS_PLAN.md, section 6, step 9): import a statement, match it to the books, prove it, sign it off, lock it. */
class ReconTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;
    use Concerns\StandsInForAccess;

    private const URL = '/api/admin/books/recon';
    private const LEDGER = 2;   // M-Pesa, in the Bank Accounts group

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['recon_sessions', 'recon_statement_lines', 'recon_log', 'report_settings', 'report_settings_log', 'payment_methods'] as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('233_reconciliation.sql');
        Schema::create('report_settings', function ($t) { $t->string('setting_key')->primary(); $t->text('value'); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('report_settings_log', function ($t) { $t->id(); $t->string('setting_key'); $t->text('old_value')->nullable(); $t->text('new_value'); $t->unsignedBigInteger('changed_by')->nullable(); $t->string('changed_by_name')->nullable(); $t->timestamp('created_at')->nullable(); });
        Schema::create('payment_methods', function ($t) { $t->id(); $t->string('name'); $t->string('kind')->default('cash'); $t->unsignedBigInteger('ledger_id')->nullable(); $t->boolean('is_active')->default(true); });
        DB::table('report_settings')->insert(['setting_key' => 'reconcilable_groups', 'value' => json_encode([4]), 'created_at' => now(), 'updated_at' => now()]);
        Schema::table('vouchers', fn ($t) => $t->string('party_name')->nullable());
        $this->book('B1', '2026-11-02', [[2, 'D', 5000], [4, 'C', 5000]]);                          // money in
        $this->book('B2', '2026-11-05', [[6, 'D', 1200], [2, 'C', 1200]], 'CHQ-77');                // a cheque paid out
        $this->book('B3', '2026-11-20', [[2, 'D', 800], [4, 'C', 800]]);                            // a deposit in transit
    }

    protected function tearDown(): void
    {
        foreach (['recon_sessions', 'recon_statement_lines', 'recon_log', 'report_settings', 'report_settings_log', 'payment_methods'] as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function book(string $no, string $date, array $entries, ?string $ref = null): void
    {
        $total = array_sum(array_map(fn ($e) => $e[1] === 'D' ? $e[2] : 0, $entries));
        $id = DB::table('vouchers')->insertGetId(['voucher_type_id' => 2, 'voucher_number' => $no, 'reference_no' => $ref, 'date' => $date, 'status' => 'posted', 'currency_id' => 1, 'total_amount' => $total, 'base_total' => $total,
            'location_id' => 1, 'created_at' => now(), 'updated_at' => now()]);
        foreach ($entries as $i => [$ledger, $side, $amt]) {
            DB::table('voucher_entries')->insert(['voucher_id' => $id, 'ledger_id' => $ledger, 'side' => $side, 'amount' => $amt, 'base_amount' => $amt, 'location_id' => 1, 'line_no' => $i + 1]);
        }
    }

    private function as(int $id, array $permissions): void
    {
        $u = new User();
        $u->id = $id;
        $this->grant($u, array_merge(["books.view"], $permissions));   // the Books pages need books.view as well
        Sanctum::actingAs($u, ['*']);
    }

    private const CSV = "Date,Details,Ref,Paid in,Paid out,Balance\n2026-11-02,Deposit,B1,5000.00,,\n2026-11-06,Cheque,CHQ-77,,1200.00,\n2026-11-10,Bank charge,,,35.00,\n";
    private const MAP = ['date' => 'Date', 'description' => 'Details', 'reference' => 'Ref', 'in' => 'Paid in', 'out' => 'Paid out'];

    private function openRecon(float $closing = -3235.00): int
    {
        $id = $this->postJson(self::URL . '/sessions', ['ledger_id' => self::LEDGER, 'statement_from' => '2026-11-01', 'statement_to' => '2026-11-30', 'statement_closing' => $closing])->assertOk()->json('id');
        $this->postJson(self::URL . "/sessions/{$id}/clear-before", ['date' => '2026-11-01'])->assertOk();   // the July payment was cleared by an earlier statement
        $this->postJson(self::URL . "/sessions/{$id}/import", ['csv' => self::CSV, 'map' => self::MAP])->assertOk();

        return $id;
    }

    public function test_only_ledgers_in_a_reconcilable_group_can_be_reconciled(): void
    {
        $this->as(1, ['books.reconcile']);
        $this->getJson(self::URL)->assertOk()->assertJsonPath('ledgers.0.id', 1);
        $this->postJson(self::URL . '/sessions', ['ledger_id' => 4, 'statement_to' => '2026-11-30', 'statement_closing' => 0])->assertStatus(422);
    }

    public function test_the_statement_imports_with_its_columns_and_a_second_import_adds_nothing(): void
    {
        $this->as(1, ['books.reconcile']);
        $id = $this->openRecon();
        $lines = DB::table('recon_statement_lines')->where('session_id', $id)->where('match_how', null)->orderBy('line_date')->get();
        $this->assertSame([5000.0, -1200.0, -35.0], $lines->map(fn ($l) => (float) $l->amount)->all(), 'money in is positive for a bank, money out negative');
        $again = $this->postJson(self::URL . "/sessions/{$id}/import", ['csv' => self::CSV, 'map' => self::MAP])->assertOk()->json();
        $this->assertSame([0, 3], [$again['added'], $again['skipped']]);
        $this->postJson(self::URL . "/sessions/{$id}/import", ['csv' => 'x', 'map' => ['date' => 'Date']])->assertStatus(422);
    }

    public function test_matching_uses_the_numbers_an_entry_carries_then_amount_and_date(): void
    {
        $this->as(1, ['books.reconcile']);
        $id = $this->openRecon();
        $this->postJson(self::URL . "/sessions/{$id}/auto-match")->assertOk()->assertJsonPath('matched', 2);
        $v = $this->getJson(self::URL . "/sessions/{$id}")->assertOk()->json();
        $how = collect($v['lines'])->where('match_how', '!=', 'cleared')->pluck('match_how', 'reference')->all();
        $this->assertSame('reference', $how['CHQ-77'], 'the cheque number');
        $this->assertSame('amount', $how['B1'], 'the amount and the date');
        $this->assertNull($how['']);
    }

    public function test_the_proof_has_the_outstanding_entry_and_the_unbooked_charge_and_reconciles(): void
    {
        $this->as(1, ['books.reconcile']);
        $id = $this->openRecon();
        $this->postJson(self::URL . "/sessions/{$id}/auto-match")->assertOk();
        $p = $this->getJson(self::URL . "/sessions/{$id}")->json('proof');
        $this->assertEquals([-3235, -35, 800, -2400], [$p['statement_closing'], $p['unbooked_lines'], $p['outstanding_entries'], $p['book_balance']]);
        $this->assertEquals(-3200, $p['adjusted_statement']);
        $this->assertEquals(-3200, $p['adjusted_book']);
        $this->assertTrue($p['reconciles']);
    }

    public function test_it_cannot_be_prepared_until_it_reconciles(): void
    {
        $this->as(1, ['books.reconcile']);
        $id = $this->openRecon(-3000.00);   // the statement says 235 more than it should
        $this->postJson(self::URL . "/sessions/{$id}/auto-match")->assertOk();
        $this->postJson(self::URL . "/sessions/{$id}/prepare")->assertStatus(422)->assertJsonFragment(['message' => 'It does not reconcile yet: the difference is 235.00. Match the lines, or post what the statement has that the books do not.']);
    }

    public function test_the_preparer_cannot_approve_and_a_locked_reconciliation_clears_its_entries(): void
    {
        $this->as(1, ['books.reconcile', 'books.reconcile.approve']);
        $id = $this->openRecon();
        $this->postJson(self::URL . "/sessions/{$id}/auto-match")->assertOk();
        $this->postJson(self::URL . "/sessions/{$id}/prepare")->assertOk();
        $this->postJson(self::URL . "/sessions/{$id}/approve")->assertStatus(422);   // a second person is needed
        $this->as(2, ['books.reconcile', 'books.reconcile.approve']);
        $this->postJson(self::URL . "/sessions/{$id}/lock")->assertStatus(422);       // not approved yet
        $this->postJson(self::URL . "/sessions/{$id}/approve")->assertOk();
        $this->postJson(self::URL . "/sessions/{$id}/lock")->assertOk();
        $this->assertSame('locked', DB::table('recon_sessions')->where('id', $id)->value('status'));
        // the next statement does not offer what is cleared; the deposit in transit is still outstanding
        $next = $this->postJson(self::URL . '/sessions', ['ledger_id' => self::LEDGER, 'statement_to' => '2026-12-31', 'statement_closing' => 0])->assertOk()->json('id');
        $open = collect($this->getJson(self::URL . "/sessions/{$next}")->json('entries'))->pluck('number')->all();
        $this->assertSame(['B3'], $open);
    }

    public function test_a_locked_reconciliation_reopens_only_with_a_reason_and_the_permission(): void
    {
        $this->as(1, ['books.reconcile', 'books.reconcile.approve', 'books.period']);
        DB::table('report_settings')->insert(['setting_key' => 'second_approver_reconcile', 'value' => 'false', 'created_at' => now(), 'updated_at' => now()]);
        $id = $this->openRecon();
        $this->postJson(self::URL . "/sessions/{$id}/auto-match")->assertOk();
        foreach (['prepare', 'approve', 'lock'] as $step) {
            $this->postJson(self::URL . "/sessions/{$id}/{$step}")->assertOk();
        }
        $this->postJson(self::URL . "/sessions/{$id}/reopen", [])->assertStatus(422);
        $this->postJson(self::URL . "/sessions/{$id}/reopen", ['reason' => 'A line was matched wrongly'])->assertOk();
        $this->assertSame('reopened', DB::table('recon_sessions')->where('id', $id)->value('status'));
        $this->as(3, ['books.reconcile']);
        $this->postJson(self::URL . "/sessions/{$id}/reopen", ['reason' => 'x'])->assertStatus(403);
    }

    public function test_a_line_can_be_unmatched_and_matched_by_hand(): void
    {
        $this->as(1, ['books.reconcile']);
        $id = $this->openRecon();
        $this->postJson(self::URL . "/sessions/{$id}/auto-match")->assertOk();
        $v = $this->getJson(self::URL . "/sessions/{$id}")->json();
        $line = collect($v['lines'])->firstWhere('reference', 'B1');
        $this->postJson(self::URL . "/sessions/{$id}/unmatch", ['line_id' => $line['id']])->assertOk();
        $entry = collect($this->getJson(self::URL . "/sessions/{$id}")->json('entries'))->firstWhere('number', 'B1');
        $this->postJson(self::URL . "/sessions/{$id}/match", ['line_id' => $line['id'], 'entry_id' => $entry['id']])->assertOk();
        $this->assertSame('manual', DB::table('recon_statement_lines')->where('id', $line['id'])->value('match_how'));
    }
}

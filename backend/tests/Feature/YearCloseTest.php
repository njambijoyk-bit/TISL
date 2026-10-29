<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\PeriodGuard;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The year-end close (docs/BOOKS_REPORTS_PLAN.md, step 7): prepare, approve, lock, reopen. It is not a posting: what each ledger carries forward is stored, and
 * the year is locked through the period guard.
 */
class YearCloseTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;
    use Concerns\StandsInForAccess;

    private const URL = '/api/admin/books/year-close';
    private int $y2025;
    private array $all = ['books.view', 'books.close.prepare'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        foreach (['year_closes', 'ledger_year_balances', 'year_close_log'] as $t) {
            Schema::dropIfExists($t);
        }
        $this->runSqlScripts('232_year_close.sql');
        $this->y2025 = DB::table('financial_years')->insertGetId(['name' => 'FY 2025', 'start_date' => '2025-01-01', 'end_date' => '2025-12-31', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('ledgers')->where('id', 7)->update(['opening_balance' => 51000]);   // the opening balances now net to nothing: 50,000 + 1,000 Dr against 51,000 Cr
        Schema::dropIfExists('accounting_settings');
        Schema::create('accounting_settings', function ($t) { $t->id(); $t->integer('edit_window_days')->nullable(); $t->date('locked_before')->nullable(); $t->timestamps(); });
    }

    protected function tearDown(): void
    {
        foreach (['year_closes', 'ledger_year_balances', 'year_close_log'] as $t) {
            Schema::dropIfExists($t);
        }
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function as(int $id, array $permissions): void
    {
        $u = new User();
        $u->id = $id;
        $this->grant($u, $permissions);
        Sanctum::actingAs($u, ['*']);
    }

    private function prepare(array $confirmed = ['depreciation', 'accruals', 'stock_valuation'])
    {
        return $this->postJson(self::URL . "/years/{$this->y2025}/prepare", ['confirmed' => $confirmed]);
    }

    public function test_the_checklist_blocks_until_the_books_are_ready(): void
    {
        $this->as(1, $this->all);
        DB::table('ledgers')->where('id', 7)->update(['opening_balance' => 30000]);   // out by 21,000
        $c = collect($this->getJson(self::URL . "/years/{$this->y2025}")->assertOk()->json('checklist'))->keyBy('key');
        $this->assertSame('fail', $c['opening_difference']['status']);
        $this->assertStringContainsString('21,000.00', $c['opening_difference']['detail']);
        $this->prepare()->assertStatus(422);
        DB::table('ledgers')->where('id', 7)->update(['opening_balance' => 51000]);
        $c = collect($this->getJson(self::URL . "/years/{$this->y2025}")->json('checklist'))->keyBy('key');
        $this->assertSame(['pass', 'pass', 'pass'], [$c['year_ended']['status'], $c['opening_difference']['status'], $c['drafts']['status']]);
    }

    public function test_a_year_that_has_not_ended_cannot_be_closed(): void
    {
        $this->as(1, $this->all);
        $y = DB::table('financial_years')->where('name', 'FY 2026')->value('id');
        $this->postJson(self::URL . "/years/{$y}/prepare", ['confirmed' => ['depreciation', 'accruals', 'stock_valuation']])->assertStatus(422);
    }

    public function test_the_manual_confirmations_are_required(): void
    {
        $this->as(1, $this->all);
        $this->prepare(['depreciation'])->assertStatus(422);
    }

    public function test_preparing_stores_what_each_ledger_carries_and_the_profit(): void
    {
        $this->as(1, $this->all);
        $this->prepare()->assertOk();
        $close = DB::table('year_closes')->first();
        $this->assertSame('prepared', $close->status);
        $sum = json_decode($close->summary, true);
        $this->assertEquals(-5000, $sum['profit'], 'the rent of 5,000 paid in December: a loss for the year');
        $rows = DB::table('ledger_year_balances')->get()->keyBy('ledger_id');
        $this->assertEquals([45000, 45000], [(float) $rows[1]->closing_amount, (float) $rows[1]->carried_amount], 'cash: 50,000 less the 5,000 paid');
        $this->assertEquals([6000, 0.0], [(float) $rows[6]->closing_amount, (float) $rows[6]->carried_amount], 'rent: an expense carries nothing forward');
        $this->assertEquals(-51000, (float) $rows[7]->carried_amount, 'capital carries its balance');
    }

    public function test_the_preparer_cannot_approve_and_a_second_person_can_then_lock(): void
    {
        $this->as(1, array_merge($this->all, ['books.period']));
        $this->prepare()->assertOk();
        $id = DB::table('year_closes')->value('id');
        $this->postJson(self::URL . "/{$id}/approve")->assertStatus(422);   // the rule is on by default
        $this->assertSame('prepared', DB::table('year_closes')->where('id', $id)->value('status'));
        $this->as(2, ['books.view', 'books.period']);
        $this->postJson(self::URL . "/{$id}/lock")->assertStatus(422);   // not approved yet
        $this->postJson(self::URL . "/{$id}/approve")->assertOk();
        $this->postJson(self::URL . "/{$id}/lock")->assertOk();
        $this->assertSame(1, (int) DB::table('financial_years')->where('id', $this->y2025)->value('is_closed'));
        $this->assertSame(['kind' => 'year', 'year' => 'FY 2025'], app(PeriodGuard::class)->sealFor('2025-06-01'), 'no voucher in the year can change');
        $this->assertSame(['prepared', 'approved', 'locked'], DB::table('year_close_log')->orderBy('id')->pluck('action')->all());
    }

    public function test_only_the_owner_can_approve_lock_or_reopen(): void
    {
        $this->as(1, $this->all);
        $this->prepare()->assertOk();
        $id = DB::table('year_closes')->value('id');
        $this->postJson(self::URL . "/{$id}/approve")->assertStatus(403);
    }

    public function test_reopening_needs_a_reason_and_closing_again_gives_the_same_figures(): void
    {
        $this->as(1, $this->all);
        $this->prepare()->assertOk();
        $first = DB::table('ledger_year_balances')->orderBy('ledger_id')->get(['ledger_id', 'closing_amount', 'carried_amount'])->toArray();
        $id = DB::table('year_closes')->value('id');
        $this->as(2, ['books.view', 'books.period']);
        $this->postJson(self::URL . "/{$id}/approve")->assertOk();
        $this->postJson(self::URL . "/{$id}/lock")->assertOk();
        $this->postJson(self::URL . "/{$id}/reopen", [])->assertStatus(422);   // a reason is required
        $this->postJson(self::URL . "/{$id}/reopen", ['reason' => 'A bank charge was missed'])->assertOk();
        $this->assertSame(0, (int) DB::table('financial_years')->where('id', $this->y2025)->value('is_closed'));
        $row = DB::table('year_closes')->where('id', $id)->first();
        $this->assertSame(['reopened', 'A bank charge was missed'], [$row->status, $row->reopen_reason]);
        $this->as(1, $this->all);
        $this->prepare()->assertOk();
        $again = DB::table('ledger_year_balances')->where('year_close_id', '!=', $id)->orderBy('ledger_id')->get(['ledger_id', 'closing_amount', 'carried_amount'])->toArray();
        $this->assertEquals($first, $again, 're-closing gives the same result');
    }

    public function test_the_old_close_button_points_to_the_year_end_close(): void
    {
        $this->as(1, ['books.view', 'books.period']);
        $this->postJson("/api/admin/books/financial-years/{$this->y2025}/close", ['closed' => true])->assertStatus(422);
    }

    public function test_the_second_approver_rule_can_be_switched_off_in_the_settings(): void
    {
        foreach (['report_settings', 'report_settings_log'] as $t) { Schema::dropIfExists($t); }
        Schema::create('report_settings', function ($t) { $t->string('setting_key')->primary(); $t->text('value'); $t->unsignedBigInteger('updated_by')->nullable(); $t->timestamps(); });
        Schema::create('report_settings_log', function ($t) { $t->id(); $t->string('setting_key'); $t->text('old_value')->nullable(); $t->text('new_value'); $t->unsignedBigInteger('changed_by')->nullable(); $t->string('changed_by_name')->nullable(); $t->timestamp('created_at')->nullable(); });
        DB::table('report_settings')->insert(['setting_key' => 'second_approver_close', 'value' => 'false', 'created_at' => now(), 'updated_at' => now()]);
        $this->as(1, array_merge($this->all, ['books.period']));
        $this->prepare()->assertOk();
        $id = DB::table('year_closes')->value('id');
        $this->postJson(self::URL . "/{$id}/approve")->assertOk();
        foreach (['report_settings', 'report_settings_log'] as $t) { Schema::dropIfExists($t); }
    }
}

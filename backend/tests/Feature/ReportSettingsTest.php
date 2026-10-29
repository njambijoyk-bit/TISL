<?php

namespace Tests\Feature;

use App\Models\Books\Ledger;
use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\ReportSettings;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The Reports settings and the statements tree (docs/BOOKS_REPORTS_PLAN.md, step 3) and the statement line on the chart-of-accounts endpoints (step 4):
 * saved a section at a time, every change logged, every id checked, each section behind its own permission. Tables from scripts 228 as the owner makes them.
 */
class ReportSettingsTest extends TestCase
{
    use Concerns\CreatesBooksLedgerWorld;
    use Concerns\RunsSqlScripts;
    use Concerns\StandsInForAccess;

    protected function setUp(): void
    {
        parent::setUp();
        $this->createBooksLedgerWorld();
        DB::statement('DROP TABLE IF EXISTS report_settings');
        DB::statement('DROP TABLE IF EXISTS report_settings_log');
        $this->runSqlScripts('228_report_settings.sql');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        LedgerBalances::forget();
        parent::tearDown();
    }

    private function person(array $permissions): User
    {
        $u = new User();
        $u->id = 100 + crc32(implode(',', $permissions)) % 100000;
        $u->name = 'Joy Accountant';
        $this->grant($u, $permissions);

        return $u;
    }

    private function svc(): ReportSettings
    {
        return app(ReportSettings::class);
    }

    private function errorsOf(callable $f): array
    {
        try {
            $f();
        } catch (ValidationException $e) {
            return $e->errors();
        }
        $this->fail('nothing was refused');
    }

    // ── the service ────────────────────────────────────────────────────

    public function test_with_nothing_saved_every_setting_is_its_default(): void
    {
        $this->assertTrue(ReportSettings::ready());
        $v = $this->svc()->values();
        $this->assertSame(2, $v['decimals']);
        $this->assertSame([30, 60, 90], $v['ageing_buckets']);
        $this->assertTrue($v['second_approver_close']);
        $this->assertSame([], $v['reconcilable_groups']);
    }

    public function test_saving_writes_only_what_changed_and_logs_it(): void
    {
        $joy = $this->person(['books.reports.format']);
        $changed = $this->svc()->save('display', ['decimals' => '3', 'units' => 'none', 'report_header' => '  Draft  '], $joy);
        $this->assertSame(['decimals', 'report_header'], $changed, 'units was already none');
        $v = $this->svc()->values();
        $this->assertSame(3, $v['decimals']);
        $this->assertSame('Draft', $v['report_header']);
        $this->assertSame(2, DB::table('report_settings')->count());

        $log = DB::table('report_settings_log')->where('setting_key', 'decimals')->first();
        $this->assertEquals(2, json_decode((string) $log->old_value), 'the old value is the default it replaced');
        $this->assertEquals(3, json_decode((string) $log->new_value));
        $this->assertSame('Joy Accountant', $log->changed_by_name);
        $this->assertSame($joy->id, (int) $log->changed_by);

        $this->assertSame([], $this->svc()->save('display', ['decimals' => 3], $joy), 'saving the same value again changes and logs nothing');
        $this->assertSame(2, DB::table('report_settings_log')->count());
        $this->assertSame(['decimals'], $this->svc()->save('display', ['decimals' => 4], $joy));
        $row = $this->svc()->log(10, 'decimals');
        $this->assertSame([4, 3], array_column($row, 'new'), 'newest first');
        $this->assertSame(3, $row[0]['old']);
        $this->assertSame('Decimal places', $row[0]['label']);
    }

    public function test_turning_the_second_approver_rule_off_is_logged(): void
    {
        $owner = $this->person(['books.reports.approval']);
        $this->svc()->save('approvals', ['second_approver_close' => false], $owner);
        $this->assertFalse($this->svc()->get('second_approver_close'));
        $this->assertTrue($this->svc()->get('second_approver_reconcile'));
        $entry = $this->svc()->log()[0];
        $this->assertSame('second_approver_close', $entry['key']);
        $this->assertTrue($entry['old']);
        $this->assertFalse($entry['new']);
    }

    public function test_nothing_is_saved_unless_every_value_is_valid(): void
    {
        $errors = $this->errorsOf(fn () => $this->svc()->save('display', ['decimals' => 3, 'units' => 'billions'], $this->person(['books.reports.format'])));
        $this->assertArrayHasKey('values.units', $errors);
        $this->assertSame(2, $this->svc()->get('decimals'), 'the valid value in the same request was not saved either');
        $this->assertSame(0, DB::table('report_settings')->count());
        $this->assertSame(0, DB::table('report_settings_log')->count());
    }

    public function test_a_setting_that_is_on_another_section_is_refused(): void
    {
        $errors = $this->errorsOf(fn () => $this->svc()->save('display', ['second_approver_close' => false], $this->person(['books.reports.format'])));
        $this->assertArrayHasKey('values.second_approver_close', $errors);
        $this->assertTrue($this->svc()->get('second_approver_close'));
    }

    public function test_the_groups_ledgers_and_lines_a_value_names_must_exist(): void
    {
        $joy = $this->person(['books.reports.reconcile_setup']);
        $this->assertArrayHasKey('values.reconcilable_groups', $this->errorsOf(fn () => $this->svc()->save('reconciliation', ['reconcilable_groups' => [4, 999]], $joy)));
        $this->assertArrayHasKey('values.reconcile_ledger_kinds', $this->errorsOf(fn () => $this->svc()->save('reconciliation', ['reconcile_ledger_kinds' => [999 => 'bank']], $joy)));
        $this->assertArrayHasKey('values.reconcile_disabled_ledgers', $this->errorsOf(fn () => $this->svc()->save('reconciliation', ['reconcile_disabled_ledgers' => [999]], $joy)));
        $ratio = $this->person(['books.reports.format']);
        $this->assertArrayHasKey('values.ratio_inputs', $this->errorsOf(fn () => $this->svc()->save('ratios', ['ratio_inputs' => ['cash' => ['groups' => [4], 'statements' => ['NOPE.X']]]], $ratio)));
        $this->assertArrayHasKey('values.ratio_inputs', $this->errorsOf(fn () => $this->svc()->save('ratios', ['ratio_inputs' => ['cash' => ['groups' => [999], 'statements' => []]]], $ratio)));
        $this->assertSame(['ratio_inputs'], $this->svc()->save('ratios', ['ratio_inputs' => ['cash' => ['groups' => [4], 'statements' => []], 'current_assets' => ['groups' => [], 'statements' => ['BS.A.C']]]], $ratio));
    }

    public function test_the_screen_gets_each_section_with_whether_the_person_may_change_it(): void
    {
        $sections = collect($this->svc()->sectionsFor($this->person(['books.reports.settings', 'books.reports.format'])))->keyBy('id');
        $this->assertSame(['display', 'ageing', 'ratios', 'money', 'reconciliation', 'health', 'forecast', 'approvals'], $sections->keys()->all());
        $this->assertTrue($sections['display']['can_edit']);
        $this->assertTrue($sections['ratios']['can_edit']);
        $this->assertFalse($sections['approvals']['can_edit']);
        $this->assertFalse($sections['reconciliation']['can_edit']);
        $decimals = collect($sections['display']['settings'])->firstWhere('key', 'decimals');
        $this->assertSame(2, $decimals['value']);
        $this->assertSame(2, $decimals['default']);
        $this->assertSame('int', $decimals['type']);
    }

    public function test_the_reconcilable_ledgers_are_those_in_the_chosen_groups_and_the_groups_under_them(): void
    {
        DB::table('ledger_groups')->insert(['id' => 20, 'parent_id' => 4, 'name' => 'Mobile wallets', 'nature' => 'asset', 'created_at' => now(), 'updated_at' => now()]);
        Ledger::create(['group_id' => 20, 'name' => 'Airtel Money', 'mobile_kind' => 'till']);
        DB::table('payment_methods')->insert(['id' => 1, 'name' => 'M-Pesa', 'kind' => 'mobile_money', 'ledger_id' => 2]);
        $this->assertSame([], $this->svc()->reconcilableLedgers(), 'no group chosen, nothing is reconcilable');

        $joy = $this->person(['books.reports.reconcile_setup']);
        $this->svc()->save('reconciliation', ['reconcilable_groups' => [4], 'reconcile_disabled_ledgers' => [1], 'reconcile_ledger_kinds' => [2 => 'mobile_money']], $joy);
        $rows = collect($this->svc()->reconcilableLedgers())->keyBy('name');
        $this->assertEqualsCanonicalizing(['Cash', 'M-Pesa', 'Airtel Money'], $rows->keys()->all(), 'the group under Bank Accounts counts too');
        $this->assertTrue($rows['Cash']['disabled']);
        $this->assertFalse($rows['M-Pesa']['disabled']);
        $this->assertSame('mobile_money', $rows['M-Pesa']['kind'], 'confirmed');
        $this->assertNull($rows['Airtel Money']['kind'], 'not confirmed yet');
        $this->assertSame('mobile_money', $rows['M-Pesa']['suggested_kind'], 'the payment method says so');
        $this->assertSame('mobile_money', $rows['Airtel Money']['suggested_kind'], 'its own mobile kind says so');
        $this->assertSame('bank', $rows['Cash']['suggested_kind'], 'in a bank-behaviour group with nothing else to go on');
    }

    // ── the routes ─────────────────────────────────────────────────────

    public function test_the_settings_screen_needs_books_reports_settings_and_each_section_its_own_permission(): void
    {
        $viewer = $this->person(['books.view', 'books.reports.settings']);
        Sanctum::actingAs($this->person(['books.view']), ['*']);
        $this->getJson('/api/admin/books/report-settings')->assertForbidden();

        Sanctum::actingAs($viewer, ['*']);
        $r = $this->getJson('/api/admin/books/report-settings')->assertOk();
        $this->assertTrue($r->json('ready'));
        $this->assertCount(8, $r->json('sections'));
        $this->assertFalse(collect($r->json('sections'))->firstWhere('id', 'display')['can_edit']);
        $this->assertNotEmpty($r->json('lookups.groups'));
        $this->assertSame(array_keys(\App\Services\Books\ReportSettingDefinitions::RATIO_INPUTS), array_keys($r->json('lookups.ratio_inputs')));

        $this->putJson('/api/admin/books/report-settings/display', ['values' => ['decimals' => 3]])->assertForbidden();   // may open the tab, may not change this section
        $this->assertSame(2, $this->svc()->get('decimals'));

        Sanctum::actingAs($this->person(['books.view', 'books.reports.settings', 'books.reports.format']), ['*']);
        $this->putJson('/api/admin/books/report-settings/display', ['values' => ['decimals' => 3]])->assertOk()->assertJsonPath('changed', ['decimals']);
        $this->assertSame(3, $this->svc()->get('decimals'));
        $this->putJson('/api/admin/books/report-settings/approvals', ['values' => ['second_approver_close' => false]])->assertForbidden();
        $this->putJson('/api/admin/books/report-settings/display', ['values' => ['decimals' => 'many']])->assertStatus(422)->assertJsonValidationErrors(['values.decimals']);
        $this->putJson('/api/admin/books/report-settings/nonsense', ['values' => ['decimals' => 3]])->assertNotFound();   // no such section: not found, before any permission question
        $this->putJson('/api/admin/books/report-settings/display', [])->assertStatus(422);
        $this->getJson('/api/admin/books/report-settings/log')->assertOk()->assertJsonPath('rows.0.key', 'decimals');
        $this->getJson('/api/admin/books/report-settings/log?key=invented')->assertNotFound();
    }

    public function test_the_statements_tree_is_seen_with_reports_settings_and_changed_with_books_statements(): void
    {
        Sanctum::actingAs($this->person(['books.view', 'books.reports.settings']), ['*']);
        $tree = $this->getJson('/api/admin/books/statements')->assertOk()->json('rows');
        $this->assertSame('BS', $tree[0]['code']);
        $this->assertSame(0, $tree[0]['depth']);
        $cash = collect($tree)->firstWhere('code', 'BS.A.C.CASH');
        $this->assertSame(['groups' => 1, 'ledgers' => 2], ['groups' => $cash['groups'], 'ledgers' => $cash['ledgers']]);
        $this->postJson('/api/admin/books/statements', ['parent_id' => 3, 'name' => 'Petty float', 'kind' => 'line', 'nature' => 'asset'])->assertForbidden();

        Sanctum::actingAs($this->person(['books.view', 'books.reports.settings', 'books.statements']), ['*']);
        $new = $this->postJson('/api/admin/books/statements', ['parent_id' => 3, 'name' => 'Petty float', 'kind' => 'line', 'nature' => 'asset'])->assertCreated();
        $row = collect($new->json('rows'))->firstWhere('name', 'Petty float');
        $this->assertSame('BS.A.C.PETTYFLOAT', $row['code']);
        $this->assertFalse($row['is_system']);
        $this->postJson('/api/admin/books/statements', ['parent_id' => 3, 'name' => 'petty FLOAT', 'kind' => 'line', 'nature' => 'asset'])->assertStatus(422);
        $this->postJson('/api/admin/books/statements', ['parent_id' => 4, 'name' => 'Under a line', 'kind' => 'line', 'nature' => 'asset'])->assertStatus(422);       // a line holds no rows
        $this->postJson('/api/admin/books/statements', ['parent_id' => 3, 'name' => 'Wrong side', 'kind' => 'line', 'nature' => 'income'])->assertStatus(422);       // income on the balance sheet
        $this->postJson('/api/admin/books/statements', ['parent_id' => 8, 'name' => 'Other costs', 'kind' => 'line', 'nature' => 'expense'])->assertCreated();

        $this->putJson("/api/admin/books/statements/{$row['id']}", ['name' => 'Petty cash float'])->assertOk();
        $this->assertSame('Petty cash float', DB::table('statements')->where('id', $row['id'])->value('name'));
        $this->putJson('/api/admin/books/statements/4', ['name' => 'Cash at bank'])->assertOk();   // a built-in row may be renamed
        $this->putJson('/api/admin/books/statements/4', ['is_active' => false])->assertStatus(422);   // but not hidden while groups and ledgers are on it
        $this->deleteJson('/api/admin/books/statements/4')->assertStatus(422);                            // nor deleted
        $this->deleteJson("/api/admin/books/statements/{$row['id']}")->assertOk();                         // a row of your own with nothing on it can go
        $this->assertSame(0, DB::table('statements')->where('id', $row['id'])->count());
        $lines = $this->getJson('/api/admin/books/statement-lines')->assertOk();
        $this->assertTrue($lines->json('ready'));
        $this->assertNotContains('BS.A.C', array_column($lines->json('lines'), 'code'), 'a section is not offered as a line');
    }

    public function test_the_chart_of_accounts_gives_a_new_ledger_its_groups_line_and_guards_changes(): void
    {
        Sanctum::actingAs($this->person(['books.view', 'books.post', 'books.statements']), ['*']);
        $follow = $this->postJson('/api/admin/books/ledgers', ['name' => 'Family Bank', 'group_id' => 4])->assertCreated();
        $this->assertSame(4, $follow->json('data.statement_id'), 'it follows its group');
        $own = $this->postJson('/api/admin/books/ledgers', ['name' => 'Float', 'group_id' => 4, 'statement_id' => 6])->assertCreated();
        $this->assertSame(6, $own->json('data.statement_id'), 'with books.statements another line can be chosen');
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Bad', 'group_id' => 4, 'statement_id' => 9])->assertStatus(422)->assertJsonValidationErrors(['statement_id']);   // income line for an asset
        $this->putJson("/api/admin/books/ledgers/{$own->json('data.id')}", ['statement_id' => null])->assertOk()->assertJsonPath('data.statement_id', 4);   // back to the group's

        Sanctum::actingAs($this->person(['books.view', 'books.post']), ['*']);
        $plain = $this->postJson('/api/admin/books/ledgers', ['name' => 'Plain', 'group_id' => 4])->assertCreated();
        $this->assertSame(4, $plain->json('data.statement_id'));
        $this->postJson('/api/admin/books/ledgers', ['name' => 'Sneaky', 'group_id' => 4, 'statement_id' => 6])->assertStatus(422)->assertJsonValidationErrors(['statement_id']);
        $this->putJson("/api/admin/books/ledgers/{$plain->json('data.id')}", ['notes' => 'hello'])->assertOk()->assertJsonPath('data.statement_id', 4);
        DB::table('ledgers')->where('id', $plain->json('data.id'))->update(['statement_id' => 6]);
        $this->putJson("/api/admin/books/ledgers/{$plain->json('data.id')}", ['notes' => 'again'])->assertOk()->assertJsonPath('data.statement_id', 6);   // saving other things leaves its own line alone

        // a group's line can be changed and its ledgers that follow it move with it
        Sanctum::actingAs($this->person(['books.view', 'books.post', 'books.statements']), ['*']);
        $r = $this->putJson('/api/admin/books/groups/5', ['statement_id' => 6, 'apply_to_members' => true])->assertOk();
        $this->assertSame(6, $r->json('statement.statement_id'));
        $this->assertSame(['moved_groups' => 0, 'moved_ledgers' => 1], ['moved_groups' => $r->json('statement.moved_groups'), 'moved_ledgers' => $r->json('statement.moved_ledgers')], 'Customer A followed Sundry Debtors');
        $this->assertSame(6, (int) DB::table('ledgers')->where('id', 3)->value('statement_id'));
        Sanctum::actingAs($this->person(['books.view', 'books.post']), ['*']);
        $this->putJson('/api/admin/books/groups/5', ['statement_id' => 5])->assertStatus(422)->assertJsonValidationErrors(['statement_id']);
        $g = $this->postJson('/api/admin/books/groups', ['name' => 'Wallets', 'parent_id' => 4])->assertCreated();
        $this->assertSame(4, $g->json('data.statement_id'), 'a new subgroup follows its parent');
    }
}

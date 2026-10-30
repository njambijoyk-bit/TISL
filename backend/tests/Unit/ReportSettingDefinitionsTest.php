<?php

namespace Tests\Unit;

use App\Services\Access\Catalog;
use App\Services\Books\ReportSettingDefinitions as D;
use App\Services\Books\ReportSettings;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/**
 * The Reports settings (docs/BOOKS_REPORTS_PLAN.md, step 3): what each setting is, who may change it, and what a valid value looks like.
 * These need no database: the definitions are plain data and the checks are plain functions.
 */
class ReportSettingDefinitionsTest extends TestCase
{
    private function rejects(string $key, mixed $value): string
    {
        try {
            D::normalise($key, $value);
        } catch (InvalidArgumentException $e) {
            return $e->getMessage();
        }
        $this->fail("{$key} accepted " . json_encode($value));
    }

    public function test_every_section_is_guarded_by_a_permission_that_exists_in_the_catalogue(): void
    {
        foreach (D::sections() as $id => $s) {
            $this->assertArrayHasKey($s['permission'], Catalog::PERMISSIONS, "section {$id} names a permission the catalogue does not have");
            $this->assertNotEmpty($s['settings'], "section {$id} has settings");
        }
    }

    public function test_sections_use_the_permissions_the_plan_gives_them(): void
    {
        $by = array_map(fn ($s) => $s['permission'], D::sections());
        $this->assertSame([
            'display' => 'books.reports.format', 'ageing' => 'books.reports.format', 'ratios' => 'books.reports.format',
            'money' => 'books.reports.reconcile_setup', 'reconciliation' => 'books.reports.reconcile_setup', 'health' => 'books.reports.format', 'forecast' => 'books.planning', 'budget_control' => 'books.planning', 'approvals' => 'books.reports.approval',
        ], $by);
    }

    public function test_a_setting_key_belongs_to_one_section_only(): void
    {
        $seen = [];
        foreach (D::sections() as $id => $s) {
            foreach (array_keys($s['settings']) as $key) {
                $this->assertArrayNotHasKey($key, $seen, "{$key} is on two sections");
                $seen[$key] = $id;
            }
        }
        $this->assertSame($seen, array_map(fn ($spec) => $spec['section'], D::settings()));
    }

    public function test_every_default_is_itself_a_valid_value(): void
    {
        foreach (D::settings() as $key => $spec) {
            if ($spec['type'] === 'int_list' && $spec['default'] === []) {
                continue;
            }
            $this->assertEquals($spec['default'], D::normalise($key, $spec['default']), "the default of {$key} must pass its own check");
        }
    }

    public function test_the_second_approver_rule_is_on_by_default(): void
    {
        $this->assertTrue(D::defaultOf('second_approver_reconcile'));
        $this->assertTrue(D::defaultOf('second_approver_close'));
        $this->assertSame('books.reports.approval', D::permissionOf(D::sectionOf('second_approver_close')));
    }

    public function test_whole_numbers_booleans_and_choices_are_checked(): void
    {
        $this->assertSame(3, D::normalise('decimals', '3'));
        $this->assertStringContainsString('0 to 4', $this->rejects('decimals', 5));
        $this->rejects('decimals', 'two');
        $this->rejects('decimals', 2.5);
        $this->assertTrue(D::normalise('show_zero_balances', 'true'));
        $this->assertFalse(D::normalise('show_zero_balances', 0));
        $this->rejects('show_zero_balances', 'maybe');
        $this->assertSame('brackets', D::normalise('negative_format', 'brackets'));
        $this->rejects('negative_format', 'parentheses');
        $this->assertSame(0.5, D::normalise('reconcile_amount_tolerance', '0.499'));
        $this->rejects('reconcile_amount_tolerance', -1);
        $this->rejects('reconcile_date_window_days', 61);
    }

    public function test_text_is_trimmed_and_limited(): void
    {
        $this->assertSame('Audited', D::normalise('report_header', '  Audited  '));
        $this->assertSame('', D::normalise('report_footer', null));
        $this->rejects('report_header', str_repeat('x', 201));
        $this->rejects('report_header', ['a']);
    }

    public function test_ageing_buckets_must_rise_and_are_limited(): void
    {
        $this->assertSame([15, 45, 90], D::normalise('ageing_buckets', ['15', 45, 90]));
        $this->assertStringContainsString('rise', $this->rejects('ageing_buckets', [30, 30, 90]));
        $this->rejects('ageing_buckets', [60, 30]);
        $this->rejects('ageing_buckets', []);
        $this->rejects('ageing_buckets', [0, 30]);
        $this->rejects('ageing_buckets', [1, 2, 3, 4, 5, 6, 7]);
        $this->rejects('ageing_buckets', '30,60');
    }

    public function test_signatories_drop_empty_rows_and_are_limited(): void
    {
        $out = D::normalise('signatories', [['title' => ' Director ', 'name' => 'A B'], ['title' => '', 'name' => ''], ['title' => 'Accountant', 'name' => '']]);
        $this->assertSame([['title' => 'Director', 'name' => 'A B'], ['title' => 'Accountant', 'name' => '']], $out);
        $this->rejects('signatories', [['title' => 'a', 'name' => 'b'], ['title' => 'a', 'name' => 'b'], ['title' => 'a', 'name' => 'b'], ['title' => 'a', 'name' => 'b'], ['title' => 'a', 'name' => 'b']]);
        $this->rejects('signatories', ['not a row']);
    }

    public function test_group_lists_hold_each_id_once(): void
    {
        $this->assertSame([24, 23], D::normalise('reconcilable_groups', [24, '23', 24]));
        $this->assertSame([], D::normalise('money_account_groups', []));
        $this->rejects('reconcilable_groups', [0]);
        $this->rejects('reconcilable_groups', ['Bank Accounts']);
        $this->rejects('reconcilable_groups', 'all');
    }

    public function test_ratio_inputs_name_known_figures_and_codes_not_group_names(): void
    {
        $ok = D::normalise('ratio_inputs', ['cash' => ['groups' => ['24'], 'statements' => []], 'current_assets' => ['groups' => [], 'statements' => ['BS.A.C', 'BS.A.C']]]);
        $this->assertSame(['cash' => ['groups' => [24], 'statements' => []], 'current_assets' => ['groups' => [], 'statements' => ['BS.A.C']]], $ok);
        $this->assertStringContainsString('no ratio figure', $this->rejects('ratio_inputs', ['profit_margin' => ['groups' => [1], 'statements' => []]]));
        $this->assertStringContainsString('code', $this->rejects('ratio_inputs', ['cash' => ['groups' => [], 'statements' => ['bank accounts']]]));
        $this->rejects('ratio_inputs', ['cash' => 24]);
        $this->rejects('ratio_inputs', [['groups' => [1]]]);
    }

    public function test_ledger_kinds_are_keyed_by_ledger_id_and_one_of_the_known_kinds(): void
    {
        $this->assertSame(['2' => 'mobile_money', '3' => 'bank'], D::normalise('reconcile_ledger_kinds', [2 => 'mobile_money', '3' => 'bank']));
        $this->assertSame([], D::normalise('reconcile_ledger_kinds', []));
        $this->rejects('reconcile_ledger_kinds', [2 => 'wallet']);
        $this->rejects('reconcile_ledger_kinds', ['M-Pesa' => 'mobile_money']);
    }

    public function test_an_unknown_setting_is_refused(): void
    {
        $this->assertStringContainsString('no setting', $this->rejects('invented', 1));
        $this->assertFalse(D::has('invented'));
    }

    public function test_the_ratio_figures_seeded_by_script_228_are_the_ones_the_application_knows(): void
    {
        $sql = (string) file_get_contents(__DIR__ . '/../../database/sql/228_report_settings.sql');
        preg_match_all("/^\\s+'([a-z_]+)',\\s+JSON_OBJECT\\('groups'/m", $sql, $m);
        $this->assertSame(array_keys(D::RATIO_INPUTS), $m[1], 'script 228 seeds every ratio figure, in the same order');
    }

    public function test_the_kind_guess_follows_payment_method_then_ledger_fields_then_group(): void
    {
        $l = fn (array $x = []) => (object) ($x + ['behaviour' => null, 'bank_name' => null, 'account_number' => null, 'mobile_kind' => null, 'cash_kind' => null]);
        // M-Pesa as it is in the live chart: a bank name and account number, no mobile kind, but a mobile-money payment method
        $this->assertSame('mobile_money', ReportSettings::suggestKind($l(['behaviour' => 'bank', 'bank_name' => 'tmain', 'account_number' => 'gt5454']), 'mobile_money'));
        $this->assertSame('mobile_money', ReportSettings::suggestKind($l(['mobile_kind' => 'till']), null));
        $this->assertSame('cash', ReportSettings::suggestKind($l(['cash_kind' => 'petty']), null));
        $this->assertSame('bank', ReportSettings::suggestKind($l(['bank_name' => 'I & M Bank']), null));
        $this->assertSame('bank', ReportSettings::suggestKind($l(['behaviour' => 'bank']), null));
        $this->assertSame('bank', ReportSettings::suggestKind($l(), 'card'));
        $this->assertSame('counterparty', ReportSettings::suggestKind($l(['behaviour' => 'party']), null));
        $this->assertSame('other', ReportSettings::suggestKind($l(), null));
        $this->assertSame('cash', ReportSettings::suggestKind($l(['bank_name' => 'x']), 'cash'), 'the payment method wins over the ledger fields');
    }
}

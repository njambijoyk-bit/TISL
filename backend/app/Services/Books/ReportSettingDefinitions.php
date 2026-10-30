<?php

namespace App\Services\Books;

use InvalidArgumentException;

/**
 * Every Reports setting: which section it is on, who may change it, its default, and what a valid value looks like.
 * It knows nothing about the database or the framework, so a setting is added or checked here and nowhere else.
 * (Whether a group, ledger or statement line named in a value really exists is asked of the database by ReportSettings.)
 *
 * A setting with no saved row uses its default from here.
 */
class ReportSettingDefinitions
{
    /** The figures ratio analysis adds up, each chosen as groups and/or statement lines. key => label. */
    public const RATIO_INPUTS = [
        'current_assets' => 'Current assets', 'current_liabilities' => 'Current liabilities', 'cash' => 'Cash in hand', 'bank' => 'Bank accounts',
        'bank_overdraft' => 'Bank overdraft', 'debtors' => 'Debtors', 'creditors' => 'Creditors', 'stock' => 'Stock', 'capital' => 'Capital',
        'loans' => 'Loans', 'sales' => 'Sales', 'purchases' => 'Purchases',
    ];

    /** What kind of account a reconcilable ledger is, which decides how its statement is imported and matched. key => label. */
    public const LEDGER_KINDS = [
        'bank' => 'Bank account', 'mobile_money' => 'Mobile money (M-Pesa)', 'cash' => 'Cash', 'counterparty' => 'Customer, supplier or lender statement', 'other' => 'Other (match by hand)',
    ];

    /**
     * section => [title, hint, permission, settings]. The permission is the one needed to change anything on the section.
     * A setting: type, label, hint, default, and for some types options / min / max / max_length / max_items.
     */
    public static function sections(): array
    {
        return [
            'display' => ['title' => 'Display', 'hint' => 'How every report shows its figures and what is printed on it.', 'permission' => 'books.reports.format', 'settings' => [
                'decimals' => ['type' => 'int', 'label' => 'Decimal places', 'hint' => 'Shown on every amount.', 'default' => 2, 'min' => 0, 'max' => 4],
                'units' => ['type' => 'enum', 'label' => 'Show amounts in', 'hint' => 'Thousands or millions make wide statements easier to read; the exports keep full figures.', 'default' => 'none',
                    'options' => ['none' => 'Whole amounts', 'thousands' => 'Thousands', 'millions' => 'Millions']],
                'negative_format' => ['type' => 'enum', 'label' => 'Negative amounts', 'hint' => null, 'default' => 'minus', 'options' => ['minus' => '-1,000.00', 'brackets' => '(1,000.00)']],
                'show_zero_balances' => ['type' => 'bool', 'label' => 'Show ledgers with a zero balance', 'hint' => 'Off hides a ledger that has no balance and no movement in the period.', 'default' => false],
                'default_comparison' => ['type' => 'enum', 'label' => 'Compare with', 'hint' => 'What a statement is compared with when it opens.', 'default' => 'none',
                    'options' => ['none' => 'Nothing', 'previous_period' => 'The previous period', 'previous_year' => 'The same period last year']],
                'default_group_depth' => ['type' => 'int', 'label' => 'Open statements down to', 'hint' => '1 shows only the main sections; 4 opens down to the statement lines. Ledgers can always be expanded.', 'default' => 2, 'min' => 1, 'max' => 4],
                'report_header' => ['type' => 'text', 'label' => 'Header text', 'hint' => 'Printed under the company name on every report.', 'default' => '', 'max_length' => 200],
                'report_footer' => ['type' => 'text', 'label' => 'Footer text', 'hint' => 'Printed at the bottom of every report.', 'default' => '', 'max_length' => 200],
                'signatories' => ['type' => 'signatories', 'label' => 'Signatories', 'hint' => 'Names and titles printed at the foot of the financial statements.', 'default' => [], 'max_items' => 4],
            ]],
            'ageing' => ['title' => 'Ageing', 'hint' => 'How receivables and payables are bucketed by days overdue.', 'permission' => 'books.reports.format', 'settings' => [
                'ageing_buckets' => ['type' => 'int_list', 'label' => 'Bucket boundaries (days)', 'hint' => 'Each number closes a bucket: 30, 60, 90 gives not yet due, 1-30, 31-60, 61-90 and over 90. Up to 6 numbers, rising.', 'default' => [30, 60, 90], 'min' => 1, 'max' => 3650, 'max_items' => 6],
                'ageing_basis' => ['type' => 'enum', 'label' => 'Count days from', 'hint' => null, 'default' => 'due_date', 'options' => ['due_date' => 'The due date', 'bill_date' => 'The bill date']],
            ]],
            'ratios' => ['title' => 'Ratio analysis inputs', 'hint' => 'For each figure, the ledger groups and statement lines it adds up. Nothing is found by name.', 'permission' => 'books.reports.format', 'settings' => [
                'ratio_inputs' => ['type' => 'ratio_inputs', 'label' => 'Ratio inputs', 'hint' => null, 'default' => []],
            ]],
            'money' => ['title' => 'Cash and bank accounts', 'hint' => 'The ledger groups that count as cash and bank in the money reports and the cash flow statement.', 'permission' => 'books.reports.reconcile_setup', 'settings' => [
                'money_account_groups' => ['type' => 'group_list', 'label' => 'Cash and bank groups', 'hint' => 'Every ledger in these groups, and in the groups under them, counts as a money account.', 'default' => []],
            ]],
            'reconciliation' => ['title' => 'Reconciliation', 'hint' => 'Which accounts can be reconciled, what kind each one is, and how closely a statement line must match.', 'permission' => 'books.reports.reconcile_setup', 'settings' => [
                'reconcilable_groups' => ['type' => 'group_list', 'label' => 'Groups that can be reconciled', 'hint' => 'Every ledger in these groups can be reconciled unless you switch it off below. Any group can be added, for example Sundry Debtors.', 'default' => []],
                'reconcile_disabled_ledgers' => ['type' => 'ledger_list', 'label' => 'Ledgers switched off', 'hint' => null, 'default' => []],
                'reconcile_ledger_kinds' => ['type' => 'ledger_kinds', 'label' => 'What each account is', 'hint' => 'The kind decides how its statement is imported and matched. Confirm each one.', 'default' => []],
                'reconcile_amount_tolerance' => ['type' => 'number', 'label' => 'Amount tolerance', 'hint' => 'A statement line matches a book entry when the amounts differ by no more than this.', 'default' => 0, 'min' => 0, 'max' => 1000],
                'reconcile_date_window_days' => ['type' => 'int', 'label' => 'Date window (days)', 'hint' => 'A statement line matches a book entry dated within this many days of it.', 'default' => 3, 'min' => 0, 'max' => 60],
            ]],
            'health' => ['title' => 'Books health', 'hint' => 'What the Books health checks need to know about your chart of accounts. Nothing is found by name.', 'permission' => 'books.reports.format', 'settings' => [
                'suspense_groups' => ['type' => 'group_list', 'label' => 'Suspense groups', 'hint' => 'The ledger groups that hold suspense accounts (money not yet placed). The health check fails while any of them has a balance.', 'default' => []],
            ]],
            'forecast' => ['title' => 'Cash forecast assumptions', 'hint' => 'How the 90-day cash forecast guesses when money moves. The recurring payments and receipts themselves are listed above, under Budgeting.', 'permission' => 'books.planning', 'settings' => [
                'forecast_collection_delay_days' => ['type' => 'int', 'label' => 'Customers pay this many days after the due date', 'hint' => 'Applied to every open customer bill: a bill due on the 10th is expected on the 10th plus this many days. 0 means on the due date.', 'default' => 0, 'min' => 0, 'max' => 180],
                'forecast_collect_percent' => ['type' => 'number', 'label' => 'Share of customer bills expected to be collected (%)', 'hint' => '100 counts every open bill. Lower it to allow for bills that will be late beyond the forecast or never paid.', 'default' => 100, 'min' => 0, 'max' => 100],
                'forecast_supplier_terms_days' => ['type' => 'int', 'label' => 'Supplier bills with no due date are paid this many days after the bill date', 'hint' => 'A bill that has a due date is paid on it. 0 means on the bill date.', 'default' => 0, 'min' => 0, 'max' => 180],
                'forecast_include_tax' => ['type' => 'bool', 'label' => 'Include the tax now owed, paid on the filing day', 'hint' => 'Counts what the tax return shows as owed, on the next filing due day set in Tax control. It is an estimate.', 'default' => true],
            ]],
            'approvals' => ['title' => 'Approvals', 'hint' => 'Whether a second person must approve before a reconciliation or the year-end close is final. Every change here is logged.', 'permission' => 'books.reports.approval', 'settings' => [
                'second_approver_reconcile' => ['type' => 'bool', 'label' => 'A reconciliation needs a second approver', 'hint' => 'On: the person who prepared it cannot approve it.', 'default' => true],
                'second_approver_close' => ['type' => 'bool', 'label' => 'The year-end close needs a second approver', 'hint' => 'On: the person who prepared the close cannot approve it.', 'default' => true],
            ]],
        ];
    }

    /** @return array<string, array> every setting by key, each with its section added */
    public static function settings(): array
    {
        $out = [];
        foreach (self::sections() as $section => $s) {
            foreach ($s['settings'] as $key => $spec) {
                $out[$key] = $spec + ['section' => $section];
            }
        }

        return $out;
    }

    public static function has(string $key): bool
    {
        return array_key_exists($key, self::settings());
    }

    public static function defaultOf(string $key): mixed
    {
        return self::settings()[$key]['default'];
    }

    public static function sectionOf(string $key): string
    {
        return self::settings()[$key]['section'];
    }

    public static function permissionOf(string $section): string
    {
        return self::sections()[$section]['permission'];
    }

    /**
     * Check a value and return it in the shape it is stored in.
     *
     * @throws InvalidArgumentException with a message fit to show the person
     */
    public static function normalise(string $key, mixed $value): mixed
    {
        $spec = self::settings()[$key] ?? throw new InvalidArgumentException("There is no setting called {$key}.");
        $label = $spec['label'];

        switch ($spec['type']) {
            case 'bool':
                if (is_bool($value)) {
                    return $value;
                }
                if (in_array($value, [1, '1', 'true', 'on'], true)) {
                    return true;
                }
                if (in_array($value, [0, '0', 'false', 'off'], true)) {
                    return false;
                }
                throw new InvalidArgumentException("{$label}: choose on or off.");

            case 'int':
                $n = self::integer($value, $label);
                if ($n < $spec['min'] || $n > $spec['max']) {
                    throw new InvalidArgumentException("{$label}: enter a whole number from {$spec['min']} to {$spec['max']}.");
                }

                return $n;

            case 'number':
                if (! is_numeric($value) || is_bool($value)) {
                    throw new InvalidArgumentException("{$label}: enter a number.");
                }
                $n = round((float) $value, 2);
                if ($n < $spec['min'] || $n > $spec['max']) {
                    throw new InvalidArgumentException("{$label}: enter an amount from {$spec['min']} to {$spec['max']}.");
                }

                return $n;

            case 'enum':
                if (! is_string($value) || ! array_key_exists($value, $spec['options'])) {
                    throw new InvalidArgumentException("{$label}: choose one of the options shown.");
                }

                return $value;

            case 'text':
                if ($value === null) {
                    return '';
                }
                if (! is_string($value)) {
                    throw new InvalidArgumentException("{$label}: enter text.");
                }
                $t = trim($value);
                if (mb_strlen($t) > $spec['max_length']) {
                    throw new InvalidArgumentException("{$label}: keep it to {$spec['max_length']} characters or fewer.");
                }

                return $t;

            case 'int_list':
                $list = self::listOf($value, $label, $spec['max_items']);
                $out = [];
                foreach ($list as $v) {
                    $n = self::integer($v, $label);
                    if ($n < $spec['min'] || $n > $spec['max']) {
                        throw new InvalidArgumentException("{$label}: each number must be from {$spec['min']} to {$spec['max']}.");
                    }
                    if ($out && $n <= end($out)) {
                        throw new InvalidArgumentException("{$label}: the numbers must rise, each larger than the one before.");
                    }
                    $out[] = $n;
                }
                if (! $out) {
                    throw new InvalidArgumentException("{$label}: enter at least one number.");
                }

                return $out;

            case 'group_list':
            case 'ledger_list':
                return self::idList($value, $label);

            case 'signatories':
                $out = [];
                foreach (self::listOf($value, $label, $spec['max_items']) as $row) {
                    if (! is_array($row)) {
                        throw new InvalidArgumentException("{$label}: each signatory needs a title and a name.");
                    }
                    $title = trim((string) ($row['title'] ?? ''));
                    $name = trim((string) ($row['name'] ?? ''));
                    if ($title === '' && $name === '') {
                        continue;   // an empty row is dropped
                    }
                    if (mb_strlen($title) > 60 || mb_strlen($name) > 80) {
                        throw new InvalidArgumentException("{$label}: a title is up to 60 characters and a name up to 80.");
                    }
                    $out[] = ['title' => $title, 'name' => $name];
                }

                return $out;

            case 'ratio_inputs':
                if (! is_array($value) || array_is_list($value) && $value !== []) {
                    throw new InvalidArgumentException("{$label}: send each figure with its groups and statement lines.");
                }
                $out = [];
                foreach ($value as $input => $choice) {
                    if (! array_key_exists($input, self::RATIO_INPUTS)) {
                        throw new InvalidArgumentException("{$label}: there is no ratio figure called {$input}.");
                    }
                    if (! is_array($choice)) {
                        throw new InvalidArgumentException("{$label}: {$input} needs its groups and statement lines.");
                    }
                    $codes = [];
                    foreach (self::listOf($choice['statements'] ?? [], $label, 50) as $c) {
                        if (! is_string($c) || ! preg_match('/^[A-Z0-9.]{1,40}$/', $c)) {
                            throw new InvalidArgumentException("{$label}: a statement line is named by its code, such as BS.A.C.");
                        }
                        $codes[$c] = $c;
                    }
                    $out[$input] = ['groups' => self::idList($choice['groups'] ?? [], $label), 'statements' => array_values($codes)];
                }

                return $out;

            case 'ledger_kinds':
                if (! is_array($value) || array_is_list($value) && $value !== []) {
                    throw new InvalidArgumentException("{$label}: send each ledger with its kind.");
                }
                $out = [];
                foreach ($value as $ledger => $kind) {
                    if (! is_numeric($ledger) || (int) $ledger < 1) {
                        throw new InvalidArgumentException("{$label}: a ledger is named by its id.");
                    }
                    if (! is_string($kind) || ! array_key_exists($kind, self::LEDGER_KINDS)) {
                        throw new InvalidArgumentException("{$label}: choose one of the kinds shown.");
                    }
                    $out[(string) (int) $ledger] = $kind;
                }

                return $out;
        }

        throw new InvalidArgumentException("{$label}: this kind of setting cannot be saved.");
    }

    private static function integer(mixed $v, string $label): int
    {
        if (is_int($v)) {
            return $v;
        }
        if (is_string($v) && preg_match('/^-?\d{1,9}$/', trim($v))) {
            return (int) trim($v);
        }
        if (is_float($v) && floor($v) === $v && abs($v) < 1e9) {
            return (int) $v;
        }
        throw new InvalidArgumentException("{$label}: enter a whole number.");
    }

    /** @return array<int, mixed> */
    private static function listOf(mixed $v, string $label, int $max): array
    {
        if ($v === null || $v === '') {
            return [];
        }
        if (! is_array($v) || ! array_is_list($v)) {
            throw new InvalidArgumentException("{$label}: send a list.");
        }
        if (count($v) > $max) {
            throw new InvalidArgumentException("{$label}: at most {$max} entries.");
        }

        return $v;
    }

    /** @return int[] each id once, in the order given */
    private static function idList(mixed $v, string $label): array
    {
        $out = [];
        foreach (self::listOf($v, $label, 500) as $id) {
            $n = self::integer($id, $label);
            if ($n < 1) {
                throw new InvalidArgumentException("{$label}: an id is a positive whole number.");
            }
            $out[$n] = $n;
        }

        return array_values($out);
    }
}

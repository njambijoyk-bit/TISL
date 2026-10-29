<?php

namespace App\Services\Books;

use InvalidArgumentException;

/**
 * What the Tax control settings are (docs/TAX_CONTROL_PLAN.md, section 4): their sections, who may change each, the choices, the defaults and what a valid
 * value looks like. The screen is drawn from this, so a setting added here appears there.
 */
class TaxControlDefinitions
{
    /** Codes ICU lists as regions that are not countries (groupings, unknown, exceptional reservations). */
    private const NOT_COUNTRIES = ['ZZ', 'EU', 'UN', 'EZ', 'XA', 'XB', 'QO', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA'];

    /**
     * The countries a company can be registered in: code => name, from the standard ICU data PHP carries (nothing is typed in by hand).
     *
     * @return array<string, string>
     */
    public static function countries(): array
    {
        static $list = null;
        if ($list === null) {
            $list = [];
            if (class_exists(\Locale::class)) {
                foreach (array_keys(iterator_to_array(\ResourceBundle::create('en', 'ICUDATA-region')['Countries'])) as $code) {
                    if (preg_match('/^[A-Z]{2}$/', (string) $code) && ! in_array($code, self::NOT_COUNTRIES, true)) {
                        $list[$code] = \Locale::getDisplayRegion('-' . $code, 'en');
                    }
                }
                asort($list);
            }
        }

        return $list;
    }

    /** What kind of tax it is. key => label. */
    public const CATEGORIES = [
        'vat_gst' => 'VAT / GST', 'sales_tax' => 'Sales tax', 'withholding_income' => 'Withholding income tax', 'withholding_vat' => 'Withholding VAT / GST',
        'income_tax' => 'Income tax', 'payroll' => 'Payroll tax', 'excise' => 'Excise duty', 'customs' => 'Customs / import duty', 'property' => 'Property tax',
        'capital_gains' => 'Capital gains tax', 'turnover' => 'Turnover / gross receipts tax', 'stamp_duty' => 'Stamp duty / transfer tax',
        'environmental' => 'Environmental tax / levy', 'transaction_levy' => 'Transaction levy', 'other' => 'Other / custom tax',
    ];

    /** How a tax is applied. key => label. */
    public const METHODS = [
        'added' => 'Added to the transaction amount', 'included' => 'Included in the displayed price', 'withheld' => 'Withheld from a payment',
        'reverse_charge' => 'Reverse charge: the recipient accounts for the tax', 'direct_liability' => 'Direct liability or assessment',
    ];

    /** What a tax does about exemptions (decision T3). key => label. */
    public const EXEMPTIONS = [
        'respect_exemptions' => 'Respect applicable exemptions', 'exclude_exempt_supplies' => 'Exclude exempt supplies',
        'apply_independently' => 'Apply independently of the product\'s tax treatment (only where the law permits)',
    ];

    /** Documents a tax can apply to regardless. key => label. */
    public const DOCUMENTS = ['sales' => 'Sales', 'purchases' => 'Purchases'];

    /** The methods each category allows to begin with: a starting point for the company's tax adviser to confirm (script 229 seeds the same). */
    public const DEFAULT_METHODS = [
        'vat_gst' => ['added', 'included', 'reverse_charge'], 'sales_tax' => ['added', 'included'], 'withholding_income' => ['withheld'], 'withholding_vat' => ['withheld'],
        'income_tax' => ['direct_liability'], 'payroll' => ['withheld', 'direct_liability'], 'excise' => ['added', 'included'], 'customs' => ['added'], 'property' => ['direct_liability'],
        'capital_gains' => ['direct_liability'], 'turnover' => ['added', 'direct_liability'], 'stamp_duty' => ['added', 'direct_liability'], 'environmental' => ['added', 'included'],
        'transaction_levy' => ['added', 'withheld'], 'other' => ['added', 'included', 'withheld', 'reverse_charge', 'direct_liability'],
    ];

    /** The permission that changes the accounting behaviour of tax (owner-only by default), and the one that can be handed to a tax administrator. */
    public const CONTROL = 'books.tax.control';
    public const ADMIN = 'books.tax.admin';

    /**
     * section => [title, hint, permission, settings]. The permission is the one needed to change the section; whoever holds books.tax.control may change every section.
     */
    public static function sections(): array
    {
        return [
            'jurisdiction' => ['title' => 'Jurisdiction', 'hint' => 'The country whose tax rules the books follow, and the tax registrations of the company. One company, one country: the books never mix two countries\' regimes. Saving either copies it to the company details (Books → Configuration → Company), where you choose whether documents print them.', 'permission' => self::ADMIN, 'settings' => [
                'tax_country' => ['type' => 'country', 'label' => 'Country of registration', 'hint' => 'Chosen from the list of countries. Areas within the country (county, state) are kept on the tax types.', 'default' => ''],
                'tax_registrations' => ['type' => 'registrations', 'label' => 'Tax registrations', 'hint' => 'What the company is registered for and its number: VAT, PAYE, excise licence and so on.', 'default' => [], 'max_items' => 12],
            ]],
            'categories' => ['title' => 'Tax categories and how they are applied', 'hint' => 'Which kinds of tax the company uses, and which ways of applying each are allowed. A tax type can only be created with an allowed combination, and a category or method that a tax type already uses cannot be switched off.', 'permission' => self::CONTROL, 'settings' => [
                'enabled_categories' => ['type' => 'category_list', 'label' => 'Categories in use', 'hint' => null, 'default' => array_keys(self::CATEGORIES)],
                'category_methods' => ['type' => 'category_methods', 'label' => 'Allowed ways of applying each category', 'hint' => 'These are starting points: confirm them with your tax adviser.', 'default' => self::DEFAULT_METHODS],
            ]],
            'mapping' => ['title' => 'Where taxes are kept', 'hint' => 'The ledger group that holds taxes, and the ledgers a new tax type of each category starts with.', 'permission' => self::CONTROL, 'settings' => [
                'tax_group_id' => ['type' => 'group_id', 'label' => 'Group that holds the taxes', 'hint' => 'Taxes cannot be created directly under this group from the chart of accounts: they are added on the Tax and compliance page.', 'default' => null],
                'category_ledgers' => ['type' => 'category_ledgers', 'label' => 'Starting ledgers for each category', 'hint' => 'Tax owed, recoverable input tax, and the ledger a tax that cannot be recovered is charged to. Leave empty to have them made when a tax type is created.', 'default' => []],
            ]],
            'calculation' => ['title' => 'Calculation', 'hint' => 'How tax amounts are rounded and how prices are read. Changing these changes how new documents are calculated, never documents already posted.', 'permission' => self::CONTROL, 'settings' => [
                'rounding' => ['type' => 'enum', 'label' => 'Round tax', 'hint' => 'On each line: the tax of every line is rounded to the cent and the rounded amounts are added up. On the whole document: the taxes are added up first and rounded once. Documents round on each line today; this choice is recorded and not read by the posting code yet.', 'default' => 'per_line', 'options' => ['per_line' => 'On each line', 'per_document' => 'On the whole document']],
                'prices_include_tax' => ['type' => 'bool', 'label' => 'Prices are entered with tax included', 'hint' => 'The default for new price lists and documents; each can still say otherwise. Not available yet: prices are entered and stored without tax everywhere today.', 'default' => false, 'unavailable' => true],
                'override_needs_reason' => ['type' => 'bool', 'label' => 'A change of the tax base needs a reason', 'hint' => 'Used on sales and purchase lines. A person holding the override permission can change the amount a line\'s taxes are worked out on. With this on they must give a reason, which is kept with the line\'s tax record.', 'default' => true],
            ]],
            'regardless' => ['title' => 'Taxes that apply regardless', 'hint' => 'A tax that applies to every qualifying document whatever the product or account says (a transaction levy, for example), and what it does about exemptions.', 'permission' => self::CONTROL, 'settings' => [
                'apply_regardless' => ['type' => 'apply_regardless', 'label' => 'Taxes that apply regardless', 'hint' => null, 'default' => [], 'max_items' => 20],
            ]],
            'filing' => ['title' => 'Returns and certificates', 'hint' => 'When returns are made and when a withholding certificate is needed. Recorded for filing reminders; no report reads these yet.', 'permission' => self::ADMIN, 'settings' => [
                'return_period' => ['type' => 'enum', 'label' => 'Return period', 'hint' => null, 'default' => 'monthly', 'options' => ['monthly' => 'Every month', 'quarterly' => 'Every quarter', 'annual' => 'Every year']],
                'filing_due_day' => ['type' => 'int', 'label' => 'Day the return is due', 'hint' => 'The day of the month after the period.', 'default' => 20, 'min' => 1, 'max' => 31],
                'certificate_threshold' => ['type' => 'number', 'label' => 'A withholding certificate is needed above', 'hint' => '0 means for every withholding.', 'default' => 0, 'min' => 0, 'max' => 1000000000],
            ]],
        ];
    }

    /** @return array<string, array> every setting by key */
    public static function settings(): array
    {
        $out = [];
        foreach (self::sections() as $s) {
            $out += $s['settings'];
        }

        return $out;
    }

    public static function has(string $key): bool
    {
        return isset(self::settings()[$key]);
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

            case 'country':
                $c = strtoupper(trim((string) $value));
                $known = self::countries();
                if ($c !== '' && ($known ? ! isset($known[$c]) : ! preg_match('/^[A-Z]{2}$/', $c))) {
                    throw new InvalidArgumentException("{$label}: choose a country from the list.");
                }

                return $c;

            case 'group_id':
                if ($value === null || $value === '') {
                    return null;
                }
                $n = self::integer($value, $label);
                if ($n < 1) {
                    throw new InvalidArgumentException("{$label}: choose a group.");
                }

                return $n;

            case 'registrations':
                $out = [];
                foreach (self::listOf($value, $label, $spec['max_items']) as $row) {
                    if (! is_array($row)) {
                        throw new InvalidArgumentException("{$label}: each registration needs a name and a number.");
                    }
                    $name = trim((string) ($row['name'] ?? ''));
                    $number = trim((string) ($row['number'] ?? ''));
                    if ($name === '' && $number === '') {
                        continue;
                    }
                    if ($name === '' || $number === '') {
                        throw new InvalidArgumentException("{$label}: give each registration both a name and a number.");
                    }
                    if (mb_strlen($name) > 60 || mb_strlen($number) > 40) {
                        throw new InvalidArgumentException("{$label}: a name is up to 60 characters and a number up to 40.");
                    }
                    $out[] = ['name' => $name, 'number' => $number];
                }

                return $out;

            case 'category_list':
                $out = [];
                foreach (self::listOf($value, $label, count(self::CATEGORIES)) as $c) {
                    if (! is_string($c) || ! array_key_exists($c, self::CATEGORIES)) {
                        throw new InvalidArgumentException("{$label}: there is no tax category called " . (is_scalar($c) ? $c : '?') . '.');
                    }
                    $out[$c] = $c;
                }

                return array_values($out);

            case 'category_methods':
                if (! is_array($value) || array_is_list($value) && $value !== []) {
                    throw new InvalidArgumentException("{$label}: send each category with its methods.");
                }
                $out = [];
                foreach ($value as $category => $methods) {
                    if (! array_key_exists($category, self::CATEGORIES)) {
                        throw new InvalidArgumentException("{$label}: there is no tax category called {$category}.");
                    }
                    $list = [];
                    foreach (self::listOf($methods, $label, count(self::METHODS)) as $m) {
                        if (! is_string($m) || ! array_key_exists($m, self::METHODS)) {
                            throw new InvalidArgumentException("{$label}: " . self::CATEGORIES[$category] . ' has a way of applying that does not exist.');
                        }
                        $list[$m] = $m;
                    }
                    $out[$category] = array_values($list);
                }

                return $out;

            case 'category_ledgers':
                if (! is_array($value) || array_is_list($value) && $value !== []) {
                    throw new InvalidArgumentException("{$label}: send each category with its ledgers.");
                }
                $out = [];
                foreach ($value as $category => $ledgers) {
                    if (! array_key_exists($category, self::CATEGORIES) || ! is_array($ledgers)) {
                        throw new InvalidArgumentException("{$label}: there is no tax category called {$category}.");
                    }
                    $row = [];
                    foreach (['payable_ledger_id', 'input_ledger_id', 'cost_ledger_id'] as $k) {
                        $v = $ledgers[$k] ?? null;
                        $row[$k] = $v === null || $v === '' ? null : self::integer($v, $label);
                    }
                    if (array_filter($row)) {
                        $out[$category] = $row;
                    }
                }

                return $out;

            case 'apply_regardless':
                $out = [];
                $seen = [];
                foreach (self::listOf($value, $label, $spec['max_items']) as $row) {
                    if (! is_array($row)) {
                        throw new InvalidArgumentException("{$label}: each tax needs its exemption behaviour and the documents it applies to.");
                    }
                    $tax = self::integer($row['tax_type_id'] ?? null, $label);
                    if (isset($seen[$tax])) {
                        throw new InvalidArgumentException("{$label}: a tax is listed once.");
                    }
                    $seen[$tax] = true;
                    $behaviour = $row['exemption_behaviour'] ?? 'respect_exemptions';
                    if (! is_string($behaviour) || ! array_key_exists($behaviour, self::EXEMPTIONS)) {
                        throw new InvalidArgumentException("{$label}: choose what the tax does about exemptions.");
                    }
                    $docs = [];
                    foreach (self::listOf($row['documents'] ?? [], $label, count(self::DOCUMENTS)) as $d) {
                        if (! is_string($d) || ! array_key_exists($d, self::DOCUMENTS)) {
                            throw new InvalidArgumentException("{$label}: a tax applies to sales, purchases or both.");
                        }
                        $docs[$d] = $d;
                    }
                    if (! $docs) {
                        throw new InvalidArgumentException("{$label}: choose the documents each tax applies to.");
                    }
                    $out[] = ['tax_type_id' => $tax, 'exemption_behaviour' => $behaviour, 'documents' => array_values($docs)];
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
}

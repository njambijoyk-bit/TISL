<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Starter accounts: ready-made groups and ledgers a business ticks, previews and adds to its chart of accounts (Books -> Chart of accounts -> Add starter accounts).
 * A pack never touches what exists: a group or ledger already in the chart (found by name, which is unique) is skipped, and a ledger that exists in some other group is left where it is and
 * said so. The only thing a pack may MOVE is a ledger it names (Bank Charges and Exchange Loss go under Finance Costs), and only into a group of the same kind that is not a tax, bank or
 * party group; the move is logged and the ledger keeps all its postings. The same walk makes the preview and the change, so what is shown is what is done.
 */
class ChartStarterService
{
    /**
     * A pack is sections; a section is an existing group by name (`root`), ledgers to put straight in it, and new groups under it. A group node is a name, its ledgers, and its own groups.
     * `line` puts a new group on a named statement line (otherwise it reports where its parent does).
     */
    public const PACKS = [
        'premises' => ['title' => 'Premises and utilities', 'blurb' => 'Rent and rates, electricity, water, cleaning and sweeping, security.', 'sections' => [
            ['root' => 'Indirect Expenses', 'groups' => [['name' => 'Establishment Expenses', 'groups' => [
                ['name' => 'Rent & Rates', 'ledgers' => ['Office Rent', 'Warehouse Rent', 'Shop Rent', 'Land Rates', 'Building Rates']],
                ['name' => 'Utilities', 'ledgers' => ['Electricity Expense', 'Water Expense', 'Gas Expense']],
                ['name' => 'Cleaning & Maintenance', 'ledgers' => ['Sweeping & Cleaning', 'Garbage Collection', 'Pest Control', 'Building Repairs', 'General Maintenance']],
                ['name' => 'Security Expenses', 'ledgers' => ['Security Services', 'Alarm Monitoring']],
                ['name' => 'Other Establishment Expenses', 'ledgers' => ['Other Establishment Costs']],
            ]]]],
        ]],
        'admin' => ['title' => 'Administrative expenses', 'blurb' => 'Office costs, audit and accountancy, legal and professional fees, internet, software, other operating expenses.', 'sections' => [
            ['root' => 'Indirect Expenses', 'groups' => [
                ['name' => 'Administrative Expenses', 'groups' => [
                    ['name' => 'Office Expenses', 'ledgers' => ['Stationery & Printing', 'Intern Allowances', 'Audit & Accountancy Fees', 'Legal & Professional Fees', 'Telephone & Internet', 'Postage & Courier', 'Software & Subscriptions']],
                    ['name' => 'Other Administrative Expenses', 'ledgers' => ['Miscellaneous Administrative Expenses']],
                ]],
                ['name' => 'Other Operating Expenses', 'ledgers' => ['Donations', 'Penalties & Fines', 'Loss on Disposal of Assets', 'Miscellaneous Operating Expenses']],
            ]],
        ]],
        'marketing' => ['title' => 'Advertising, promotion and marketing', 'blurb' => 'Advertising, radio, television, digital, promotional materials, tender expenses, sponsorships.', 'sections' => [
            ['root' => 'Indirect Expenses', 'groups' => [['name' => 'Administrative Expenses', 'groups' => [
                ['name' => 'Advertising, Promotion & Marketing', 'ledgers' => ['Advertising Expense', 'Radio Broadcast', 'Television Advertising', 'Digital Marketing', 'Promotional Materials', 'Tender & Proposal Expenses', 'Sponsorships']],
            ]]]],
        ]],
        'welfare' => ['title' => 'Staff welfare', 'blurb' => 'Staff meals, entertainment, staff functions, training.', 'sections' => [
            ['root' => 'Indirect Expenses', 'groups' => [['name' => 'Administrative Expenses', 'groups' => [
                ['name' => 'Staff Welfare', 'ledgers' => ['Staff Meals', 'Entertainment', 'Staff Functions', 'Staff Training']],
            ]]]],
        ]],
        'insurance' => ['title' => 'Insurance', 'blurb' => 'The three stages of an insurance premium: the cost, what is paid ahead, and what is owed.', 'sections' => [
            ['root' => 'Indirect Expenses', 'groups' => [['name' => 'Administrative Expenses', 'groups' => [
                ['name' => 'Insurance Expenses', 'ledgers' => ['General Insurance', 'Motor Vehicle Insurance', 'Property Insurance', 'Employee Insurance']],
            ]]]],
            ['root' => 'Current Assets', 'groups' => [['name' => 'Prepayments', 'ledgers' => ['Prepaid Insurance']]]],
            ['root' => 'Current Liabilities', 'groups' => [['name' => 'Accrued Expenses', 'ledgers' => ['Insurance Payable']]]],
        ]],
        'finance' => ['title' => 'Finance costs', 'blurb' => 'Loan and overdraft interest, loan fees, lease interest, payment gateway charges. Bank Charges and Exchange Loss move here.', 'sections' => [
            ['root' => 'Indirect Expenses', 'groups' => [['name' => 'Finance Costs', 'line' => 'IS.FINCOST', 'ledgers' => ['Loan Interest', 'Overdraft Interest', 'Loan Processing Fees', 'Lease Interest', 'Payment Gateway Charges']]]],
        ], 'moves' => [['ledger' => 'Bank Charges', 'to' => 'Finance Costs'], ['ledger' => 'Exchange Loss', 'to' => 'Finance Costs']]],
        'selling' => ['title' => 'Selling and distribution', 'blurb' => 'Delivery and transport, sales commission, sales promotion, packaging. Delivery Expenses stays under Direct Expenses.', 'sections' => [
            ['root' => 'Indirect Expenses', 'groups' => [['name' => 'Selling & Distribution Expenses', 'ledgers' => ['Delivery & Transport', 'Sales Commission', 'Sales Promotion', 'Packaging', 'Distribution Expenses']]]],
        ]],
        'assets' => ['title' => 'Fixed assets and depreciation', 'blurb' => 'Asset classes, accumulated depreciation as its own accounts that reduce them, work in progress, and the depreciation expense. Each asset class also becomes an asset type in Assets (under Fixed Assets).', 'sections' => [
            ['root' => 'Fixed Assets', 'groups' => [
                ['name' => 'Property, Plant & Equipment', 'ledgers' => ['Land', 'Buildings', 'Furniture & Fittings', 'Computers & IT Equipment', 'Motor Vehicles', 'Machinery & Equipment', 'Office Equipment', 'Leasehold Improvements']],
                ['name' => 'Accumulated Depreciation', 'ledgers' => ['Accumulated Depreciation – Buildings', 'Accumulated Depreciation – Furniture & Fittings', 'Accumulated Depreciation – Computers & IT Equipment',
                    'Accumulated Depreciation – Motor Vehicles', 'Accumulated Depreciation – Machinery & Equipment', 'Accumulated Depreciation – Office Equipment']],
                ['name' => 'Capital Work in Progress', 'ledgers' => ['Building Work in Progress', 'Equipment Under Installation']],
            ]],
            ['root' => 'Indirect Expenses', 'groups' => [['name' => 'Depreciation', 'ledgers' => ['Depreciation – Buildings', 'Depreciation – Furniture & Fittings', 'Depreciation – Computers & IT Equipment', 'Depreciation – Motor Vehicles',
                'Depreciation – Machinery & Equipment', 'Depreciation – Office Equipment']]]],
            ['root' => 'Indirect Incomes', 'ledgers' => ['Gain on disposal of assets']],   // where a sold asset's gain goes (the asset register and the Disposal template look for this name; the loss is in the administrative pack)
        ]],
        'deposits' => ['title' => 'Deposits, prepayments and advances', 'blurb' => 'Refundable deposits are assets, not expenses. Prepayments are expenses paid ahead.', 'sections' => [
            ['root' => 'Deposits (Asset)', 'ledgers' => ['Electricity Deposit', 'Water Deposit', 'Rent Deposit', 'Security Deposit', 'Utility Connection Deposit', 'Tender Deposits', 'Other Refundable Deposits']],
            ['root' => 'Current Assets', 'groups' => [['name' => 'Prepayments', 'ledgers' => ['Prepaid Rent', 'Prepaid Insurance', 'Prepaid Licences', 'Other Prepaid Expenses']]]],
            ['root' => 'Loans & Advances (Asset)', 'ledgers' => ['Employee Advances', 'Staff Travel Advances', 'Supplier Advances', 'Staff Loans', 'Imprest Advances', 'Withholding Tax Recoverable']],
        ]],
        'provisions' => ['title' => 'Provisions and payables', 'blurb' => 'Provisions are uncertain obligations; accrued expenses are bills not yet paid whose amount is known.', 'sections' => [
            ['root' => 'Provisions', 'ledgers' => ['Provision for Audit Fees', 'Provision for Utilities', 'Provision for Legal Expenses', 'Provision for Employee Benefits', 'Other Current Provisions']],
            ['root' => 'Current Liabilities', 'groups' => [['name' => 'Accrued Expenses', 'ledgers' => ['Rent Payable', 'Electricity Payable', 'Water Payable', 'Insurance Payable', 'Audit Fees Payable', 'Other Accrued Expenses']]]],
        ]],
    ];

    /** Groups a ledger may not be moved into or out of by a pack: they have rules of their own. */
    private const PROTECTED_BEHAVIOURS = ['tax', 'bank', 'party', 'charge', 'delivery', 'purchase', 'sales'];

    /** @return array<int, array{key: string, title: string, blurb: string}> */
    public function packs(): array
    {
        return array_map(fn ($k, $p) => ['key' => $k, 'title' => $p['title'], 'blurb' => $p['blurb']], array_keys(self::PACKS), self::PACKS);
    }

    public static function logReady(): bool
    {
        return Schema::hasTable('chart_change_log');
    }

    /** What ticking these packs would do, without doing it. */
    public function preview(array $keys): array
    {
        return $this->run($keys, false, null);
    }

    /** Do it: add what is new and make the moves. Everything or nothing. */
    public function apply(array $keys, ?User $by): array
    {
        return DB::transaction(function () use ($keys, $by) {
            $before = (int) (Ledger::max('id') ?? 0);
            $out = $this->run($keys, true, $by);
            // each new ledger under Fixed Assets is also an asset type in Assets; done after the walk so the packs' own depreciation ledgers are found, not made twice
            $types = app(\App\Services\Inventory\FixedAssetLedgers::class);
            $out['asset_types'] = Ledger::where('id', '>', $before)->orderBy('id')->get()->map(fn ($l) => $types->forNewLedger($l, $by?->id, false)?->name)->filter()->values()->all();

            return $out;
        });
    }

    private function run(array $keys, bool $apply, ?User $by): array
    {
        $keys = array_values(array_unique(array_filter($keys, fn ($k) => isset(self::PACKS[$k]))));
        $groups = [];   // lower-case name => ['id', 'nature', 'behaviour', 'parent', 'name']
        foreach (LedgerGroup::query()->get(['id', 'parent_id', 'name', 'nature', 'behaviour']) as $g) {
            $groups[mb_strtolower($g->name)] = ['id' => (int) $g->id, 'nature' => $g->nature, 'behaviour' => $g->behaviour, 'parent' => $g->parent_id ? (int) $g->parent_id : null, 'name' => $g->name];
        }
        $byId = collect($groups)->keyBy('id');
        $ledgers = [];   // lower-case name => ['id', 'group_id']
        foreach (DB::table('ledgers')->get(['id', 'name', 'group_id']) as $l) {
            $ledgers[mb_strtolower($l->name)] = ['id' => (int) $l->id, 'group_id' => (int) $l->group_id, 'name' => $l->name];
        }
        $lines = Schema::hasTable('statements') ? DB::table('statements')->pluck('id', 'code')->all() : [];
        $order = (int) (DB::table('ledger_groups')->max('sort_order') ?? 0);
        $out = [];
        $total = ['new_groups' => 0, 'new_ledgers' => 0, 'moves' => 0, 'skipped' => 0];

        foreach ($keys as $key) {
            $pack = self::PACKS[$key];
            $items = [];
            $count = ['new_groups' => 0, 'new_ledgers' => 0, 'moves' => 0, 'skipped' => 0];
            $add = function (string $type, string $name, string $under, string $status, ?string $note = null) use (&$items, &$count) {
                $items[] = ['type' => $type, 'name' => $name, 'under' => $under, 'status' => $status, 'note' => $note];
                if ($status === 'new') {
                    $count[$type === 'group' ? 'new_groups' : 'new_ledgers']++;
                } elseif ($status === 'move') {
                    $count['moves']++;
                } elseif (in_array($status, ['elsewhere', 'missing'], true)) {
                    $count['skipped']++;
                }
            };
            $putLedgers = function (array $names, array $group) use (&$ledgers, &$groups, $apply, $add) {
                foreach ($names as $name) {
                    $have = $ledgers[mb_strtolower($name)] ?? null;
                    if ($have) {
                        $where = collect($groups)->firstWhere('id', $have['group_id'])['name'] ?? '?';
                        $have['group_id'] === $group['id'] && $group['id'] !== null
                            ? $add('ledger', $name, $group['name'], 'exists')
                            : $add('ledger', $name, $group['name'], 'elsewhere', "Already in your chart under {$where}: left where it is.");
                        continue;
                    }
                    if ($apply) {
                        $made = Ledger::create(['group_id' => $group['id'], 'name' => $name, 'opening_balance' => 0, 'opening_side' => $group['nature'] === 'liability' || $group['nature'] === 'income' ? 'C' : 'D', 'is_system' => false, 'is_active' => true]);
                        $ledgers[mb_strtolower($name)] = ['id' => (int) $made->id, 'group_id' => $group['id'], 'name' => $name];
                    } else {
                        $ledgers[mb_strtolower($name)] = ['id' => 0, 'group_id' => $group['id'] ?? -1, 'name' => $name];   // planned: later packs see it as there
                    }
                    $add('ledger', $name, $group['name'], 'new');
                }
            };
            $walk = function (array $node, array $parent) use (&$walk, &$groups, &$order, $apply, $add, $lines, $putLedgers) {
                $have = $groups[mb_strtolower($node['name'])] ?? null;
                if ($have) {
                    $add('group', $node['name'], $parent['name'], 'exists');
                    $group = ['id' => $have['id'], 'nature' => $have['nature'], 'name' => $have['name']];
                } else {
                    $id = null;
                    if ($apply) {
                        $attrs = ['name' => $node['name'], 'parent_id' => $parent['id'], 'nature' => $parent['nature'], 'is_primary' => false, 'is_system' => false, 'sort_order' => ++$order,
                            'behaviour' => $parent['behaviour'] ?? 'standard', 'settings' => null];
                        if (\App\Services\Books\Engine\LedgerBalances::hasColumn('ledger_groups', 'is_active')) {
                            $attrs['is_active'] = true;
                        }
                        if (! empty($node['line']) && isset($lines[$node['line']])) {
                            $attrs['statement_id'] = $lines[$node['line']];
                        }
                        $id = (int) LedgerGroup::create($attrs)->id;
                    }
                    $groups[mb_strtolower($node['name'])] = ['id' => $id ?? -count($groups) - 1, 'nature' => $parent['nature'], 'behaviour' => $parent['behaviour'] ?? 'standard', 'parent' => $parent['id'], 'name' => $node['name']];
                    $add('group', $node['name'], $parent['name'], 'new');
                    $group = ['id' => $groups[mb_strtolower($node['name'])]['id'], 'nature' => $parent['nature'], 'name' => $node['name']];
                }
                $group['behaviour'] = $groups[mb_strtolower($node['name'])]['behaviour'] ?? 'standard';
                $putLedgers($node['ledgers'] ?? [], $group);
                foreach ($node['groups'] ?? [] as $child) {
                    $walk($child, $group);
                }
            };
            foreach ($pack['sections'] as $section) {
                $root = $groups[mb_strtolower($section['root'])] ?? null;
                if (! $root) {
                    $add('group', $section['root'], '', 'missing', 'This group is not in your chart, so what belongs under it is skipped.');
                    continue;
                }
                $rootNode = ['id' => $root['id'], 'nature' => $root['nature'], 'name' => $root['name'], 'behaviour' => $root['behaviour'] ?? 'standard'];
                $putLedgers($section['ledgers'] ?? [], $rootNode);
                foreach ($section['groups'] ?? [] as $node) {
                    $walk($node, $rootNode);
                }
            }
            foreach ($pack['moves'] ?? [] as $mv) {
                $l = $ledgers[mb_strtolower($mv['ledger'])] ?? null;
                $to = $groups[mb_strtolower($mv['to'])] ?? null;
                if (! $l || ! $to) {
                    $add('move', $mv['ledger'], $mv['to'], 'missing', $l ? 'The group it moves to is not there.' : 'Not in your chart: nothing to move.');
                    continue;
                }
                if ($l['group_id'] === $to['id']) {
                    $add('move', $mv['ledger'], $mv['to'], 'exists', 'Already there.');
                    continue;
                }
                $from = $byId[$l['group_id']] ?? null;
                if (! $from || $from['nature'] !== $to['nature'] || in_array($from['behaviour'], self::PROTECTED_BEHAVIOURS, true) || in_array($to['behaviour'], self::PROTECTED_BEHAVIOURS, true)) {
                    $add('move', $mv['ledger'], $mv['to'], 'elsewhere', 'Left where it is: it is in a group with rules of its own.');
                    continue;
                }
                if ($apply && $l['id'] > 0) {
                    DB::table('ledgers')->where('id', $l['id'])->update(['group_id' => $to['id'], 'updated_at' => now()]);
                    if (self::logReady()) {
                        DB::table('chart_change_log')->insert(['ledger_id' => $l['id'], 'from_group_id' => $l['group_id'], 'to_group_id' => $to['id'], 'reason' => 'Starter pack: ' . $pack['title'], 'changed_by' => $by?->id, 'created_at' => now()]);
                    }
                    $ledgers[mb_strtolower($mv['ledger'])]['group_id'] = $to['id'];
                }
                $add('move', $mv['ledger'], $mv['to'], 'move', 'Moves from ' . ($from['name'] ?? '?') . '. It keeps all its postings.');
            }
            $out[$key] = ['key' => $key, 'title' => $pack['title'], 'blurb' => $pack['blurb'], 'items' => $items, 'counts' => $count];
            foreach ($count as $k => $n) {
                $total[$k] += $n;
            }
        }

        return ['packs' => array_values($out), 'totals' => $total, 'applied' => $apply];
    }
}

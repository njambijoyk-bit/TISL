<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use Illuminate\Support\Collection;

/**
 * What a ledger IS, in plain words: bank, cash, customer, supplier, tax, stock, fixed asset, rent, and so on. It is worked out from where the ledger sits in the chart (its group and the groups
 * above it, and the group's behaviour) and from what the ledger carries (a customer or supplier link), so nothing is stored and the kind follows a ledger when it is moved.
 * Forms, pickers and the chart use it to offer the right ledgers, instead of looking for ledgers by name. The first kind that fits wins, so the order below matters.
 */
class LedgerKinds
{
    /** key => [label, the groups (by name, with everything below them) it covers, the group behaviour it covers, or a test on the ledger]. */
    private const KINDS = [
        'customer'     => ['Customer', ['Sundry Debtors'], null, 'customer_id'],
        'supplier'     => ['Supplier', ['Sundry Creditors'], null, 'supplier_id'],
        'bank'         => ['Bank', ['Bank Accounts'], 'bank', null],
        'cash'         => ['Cash', ['Cash-in-hand', 'Cash-in-Hand'], null, null],
        'tax'          => ['Tax', [], 'tax', null],
        'delivery'     => ['Delivery', [], 'delivery', null],
        'charge'       => ['Charge or fee', [], 'charge', null],
        'stock'        => ['Stock', ['Stock-in-Hand'], null, null],
        'accumulated_depreciation' => ['Accumulated depreciation', ['Accumulated Depreciation'], null, null],
        'work_in_progress' => ['Work in progress', ['Capital Work in Progress'], null, null],
        'fixed_asset'  => ['Fixed asset', ['Fixed Assets'], null, null],
        'depreciation' => ['Depreciation expense', ['Depreciation'], null, null],
        'deposit'      => ['Deposit', ['Deposits (Asset)'], null, null],
        'advance'      => ['Loan or advance given', ['Loans & Advances (Asset)'], null, null],
        'prepayment'   => ['Prepayment', ['Prepayments'], null, null],
        'provision'    => ['Provision', ['Provisions'], null, null],
        'capital'      => ['Capital and reserves', ['Capital Account'], null, null],
        'sales'        => ['Sales income', [], 'sales', null],
        'purchase'     => ['Purchases', [], 'purchase', null],
    ];

    /** After these, whatever is left is named by its nature. */
    private const NATURES = ['asset' => 'Other asset', 'liability' => 'Other liability', 'income' => 'Other income', 'expense' => 'Expense'];

    private array $ids = [];     // kind => group ids it covers
    private array $groups = [];  // group id => ['nature', 'behaviour']

    public static function all(): array
    {
        $out = [];
        foreach (self::KINDS as $key => $k) {
            $out[] = ['key' => $key, 'label' => $k[0]];
        }
        foreach (self::NATURES as $nature => $label) {
            $out[] = ['key' => "other_{$nature}", 'label' => $label];
        }

        return $out;
    }

    public function __construct()
    {
        foreach (LedgerGroup::query()->get(['id', 'nature', 'behaviour']) as $g) {
            $this->groups[(int) $g->id] = ['nature' => $g->nature, 'behaviour' => $g->behaviour];
        }
        foreach (self::KINDS as $key => [, $names]) {
            $this->ids[$key] = [];
            foreach ($names as $name) {
                foreach (LedgerGroup::whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->get() as $g) {
                    $this->ids[$key] = array_merge($this->ids[$key], array_map('intval', $g->selfAndDescendantIds()));
                }
            }
        }
    }

    public function kindOf(Ledger $l): string
    {
        $gid = (int) $l->group_id;
        $g = $this->groups[$gid] ?? ['nature' => null, 'behaviour' => null];
        foreach (self::KINDS as $key => [, , $behaviour, $column]) {
            if ($column && $l->getAttribute($column)) {
                return $key;
            }
            if (in_array($gid, $this->ids[$key], true) || ($behaviour && $g['behaviour'] === $behaviour)) {
                return $key;
            }
        }

        return 'other_' . ($g['nature'] ?: 'asset');
    }

    public function label(string $kind): string
    {
        return self::KINDS[$kind][0] ?? self::NATURES[substr($kind, 6)] ?? $kind;
    }

    /** Put the kind and its label on each ledger. */
    public function mark(Collection $ledgers): void
    {
        $ledgers->each(function ($l) {
            $k = $this->kindOf($l);
            $l->setAttribute('kind', $k);
            $l->setAttribute('kind_label', $this->label($k));
        });
    }

    /** The ids of the ledgers of a kind (among the given ones, or all). */
    public function idsOf(string $kind, ?array $among = null): array
    {
        $q = Ledger::query()->select(['id', 'group_id', 'customer_id', 'supplier_id']);
        if ($among !== null) {
            $q->whereIn('id', $among);
        }

        return $q->get()->filter(fn ($l) => $this->kindOf($l) === $kind)->pluck('id')->map(fn ($i) => (int) $i)->all();
    }
}

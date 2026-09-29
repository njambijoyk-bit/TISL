<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Customer;

class LedgerService
{
    /** A customer's own ledger under Sundry Debtors, created the first time they transact. */
    public function customerLedger(Customer $customer): Ledger
    {
        $existing = Ledger::where('customer_id', $customer->id)->first();
        if ($existing) {
            return $existing;
        }

        $group = LedgerGroup::where('name', 'Sundry Debtors')->firstOrFail();
        $base = trim(($customer->first_name ?? '') . ' ' . ($customer->last_name ?? '')) ?: ($customer->email ?? "Customer {$customer->id}");
        $name = Ledger::where('name', $base)->exists() ? "{$base} (#{$customer->id})" : $base;

        return Ledger::create(['group_id' => $group->id, 'name' => $name, 'customer_id' => $customer->id, 'is_active' => true]);
    }

    /** The ledger for guests / walk-in buyers. */
    public function walkinLedger(): Ledger
    {
        $id = AccountingSetting::current()->walkin_ledger_id;
        $ledger = $id ? Ledger::find($id) : Ledger::where('name', 'Walk-in Customer')->first();
        if (! $ledger) {
            throw new BooksException('Set the walk-in customer ledger under Books settings.');
        }

        return $ledger;
    }

    /** Sundry Debtors' ancestry, for "is this a receivable ledger?" checks. */
    public function isUnderGroup(Ledger $ledger, string $groupName): bool
    {
        $group = LedgerGroup::where('name', $groupName)->first();

        return $group ? in_array($ledger->group_id, $group->selfAndDescendantIds(), true) : false;
    }
}

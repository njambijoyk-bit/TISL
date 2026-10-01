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

    /** A vendor's own ledger under Sundry Creditors (ledgers.supplier_id = the vendor), created with the vendor. */
    public function vendorLedger(\App\Models\Vendor $vendor): Ledger
    {
        $existing = Ledger::where('supplier_id', $vendor->id)->first();
        if ($existing) {
            return $existing;
        }

        $group = LedgerGroup::where('name', 'Sundry Creditors')->firstOrFail();
        $base = trim((string) ($vendor->company_name ?: $vendor->contact_name)) ?: "Vendor {$vendor->id}";
        $name = Ledger::where('name', $base)->exists() ? "{$base} ({$vendor->vendor_number})" : $base;

        return Ledger::create(['group_id' => $group->id, 'name' => $name, 'supplier_id' => $vendor->id, 'is_active' => true]);
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

    /** Signed closing balance of a ledger in base currency (debit +, credit −): opening + posted entries. */
    public function balance(int $ledgerId, ?string $asOf = null): float
    {
        $l = Ledger::find($ledgerId);
        if (! $l) {
            return 0.0;
        }
        $q = \Illuminate\Support\Facades\DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id')
            ->where('e.ledger_id', $ledgerId)->where('v.status', 'posted');
        RestatedBase::join($q);
        $b = RestatedBase::entry();
        if ($asOf) {
            $q->where('v.date', '<=', $asOf);
        }
        $row = $q->selectRaw("COALESCE(SUM(CASE WHEN e.side='D' THEN {$b} ELSE 0 END),0) dr, COALESCE(SUM(CASE WHEN e.side='C' THEN {$b} ELSE 0 END),0) cr")->first();
        $open = (float) $l->opening_balance * ($l->opening_side === 'C' ? -1 : 1);

        return round($open + (float) $row->dr - (float) $row->cr, 2);
    }

    /** Find or create a ledger by name inside a group; returns it. */
    public function ensure(string $name, int $groupId, array $extra = []): Ledger
    {
        return Ledger::firstOrCreate(['name' => $name], $extra + ['group_id' => $groupId, 'is_active' => true]);
    }
}

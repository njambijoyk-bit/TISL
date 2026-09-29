<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\ShippingOption;

/** A shipping option gets (and keeps) its own income ledger under Shipping & Delivery. */
class ShippingLedgerService
{
    public function sync(ShippingOption $o): void
    {
        $name = 'Shipping — ' . $o->name;
        if ($o->income_ledger_id && ($ledger = Ledger::find($o->income_ledger_id))) {
            if ($ledger->name !== $name && ! Ledger::where('name', $name)->where('id', '!=', $ledger->id)->exists()) {
                $ledger->update(['name' => $name]);
            }

            return;
        }
        $group = LedgerGroup::where('name', 'Shipping & Delivery')->first() ?? LedgerGroup::where('name', 'Direct Incomes')->first();
        if (! $group) {
            return;
        }
        $ledger = Ledger::firstOrCreate(['name' => $name], ['group_id' => $group->id, 'is_system' => true, 'is_active' => true]);
        $o->forceFill(['income_ledger_id' => $ledger->id])->saveQuietly();
    }
}

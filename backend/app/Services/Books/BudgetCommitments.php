<?php

namespace App\Services\Books;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What open purchase orders still have to arrive, as spend already promised against the expense budgets (Budget controls, "Count open purchase orders as spent").
 * Each order line counts for the part not yet invoiced (quantity less invoiced quantity), net of tax, at the order's own exchange rate, on the ledger the line posts to (the line's own, else the
 * default purchase ledger) when that ledger is an expense. An order that is cancelled or fully invoiced counts for nothing; one a purchase is being made from is left out by the caller.
 */
class BudgetCommitments
{
    /**
     * @param  ?int  $exceptVoucherId  the purchase order the voucher being checked is made from
     * @return array<int, array{ledger_id: int, amount: float, cost_centre_id: ?int, location_id: ?int, initiative_id: ?int, date: string, order: string}>
     */
    public function open(string $from, string $to, ?int $exceptVoucherId = null): array
    {
        if (! Schema::hasColumn('voucher_items', 'invoiced_quantity')) {
            return [];
        }
        $ini = Schema::hasColumn('vouchers', 'initiative_id');
        $orders = DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')->where('t.base_type', 'purchase_order')->where('v.status', 'posted')
            ->whereIn('v.fulfilment_status', ['open', 'partial'])->whereBetween('v.date', [$from, $to])->when($exceptVoucherId, fn ($q) => $q->where('v.id', '!=', $exceptVoucherId))
            ->get(array_merge(['v.id', 'v.voucher_number', 'v.date', 'v.exchange_rate', 'v.location_id', 'v.cost_centre_id'], $ini ? ['v.initiative_id'] : []));
        if ($orders->isEmpty()) {
            return [];
        }
        $default = Schema::hasTable('accounting_settings') ? (int) (\App\Models\Books\AccountingSetting::current()->default_purchase_ledger_id ?? 0) : 0;
        $items = DB::table('voucher_items')->whereIn('voucher_id', $orders->pluck('id'))->where('is_header', false)->get(['voucher_id', 'ledger_id', 'quantity', 'invoiced_quantity', 'amount'])->groupBy('voucher_id');
        $ledgerIds = $items->flatten(1)->pluck('ledger_id')->filter()->push($default)->unique()->filter()->values();
        $expense = DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->whereIn('l.id', $ledgerIds)->where('g.nature', 'expense')->pluck('l.id')->flip();

        $out = [];
        foreach ($orders as $o) {
            foreach ($items[$o->id] ?? [] as $i) {
                $qty = (float) $i->quantity;
                $ledger = (int) ($i->ledger_id ?: $default);
                if ($qty <= 0 || ! isset($expense[$ledger])) {
                    continue;
                }
                $left = max(0.0, ($qty - (float) $i->invoiced_quantity) / $qty);
                $amount = round((float) $i->amount * $left * ((float) $o->exchange_rate ?: 1.0), 2);
                if ($amount <= 0) {
                    continue;
                }
                $out[] = ['ledger_id' => $ledger, 'amount' => $amount, 'cost_centre_id' => $o->cost_centre_id ? (int) $o->cost_centre_id : null, 'location_id' => $o->location_id ? (int) $o->location_id : null,
                    'initiative_id' => $ini && ! empty($o->initiative_id) ? (int) $o->initiative_id : null, 'date' => (string) $o->date, 'order' => (string) $o->voucher_number];
            }
        }

        return $out;
    }
}

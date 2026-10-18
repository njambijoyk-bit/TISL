<?php

namespace App\Services\Menus;

use App\Models\Menus\Kiosk;
use App\Models\Menus\MenuOrder;
use App\Models\Menus\Tip;
use App\Models\User;

/**
 * The tips box (script 212). A tip taken with an order is already in the books, as a credit to the tips payable account on the sale; this keeps the other half: one pending row per order
 * that says whose tip it is, so that a person can hand it over later. Without script 212 nothing here runs and the tip is only the line it always was.
 */
class Tips
{
    /** What the books line for the tip says: the order, the customer, the kiosk and who served. */
    public function narration(MenuOrder $o): string
    {
        $who = trim((string) ($o->label ?: ''));
        $kiosk = $o->kiosk_id ? Kiosk::find($o->kiosk_id)?->name : null;
        $server = $o->cashier_id ? User::find($o->cashier_id)?->name : null;
        $parts = array_filter(['Tip', $o->number ?: null, $who !== '' ? $who : null, $kiosk ? 'kiosk '.$kiosk : null, $server ? 'served by '.$server : null]);

        return mb_substr(implode(', ', $parts), 0, 190);
    }

    /** Put the tip of a paid order into the box, once. Returns the row, or null when there is no tip or the script has not been run. */
    public function record(MenuOrder $o, ?User $by = null): ?Tip
    {
        if ((float) $o->tip <= 0 || ! Tip::installed()) {
            return null;
        }

        return Tip::firstOrCreate(['order_id' => $o->id], [
            'voucher_id' => $o->voucher_id, 'location_id' => $o->location_id, 'amount' => round((float) $o->tip, 2), 'currency_id' => $o->currency_id, 'ledger_id' => MenusSettings::tipLedgerId(),
            'payment_method_id' => $o->payment_method_id, 'customer_name' => $o->label ?: null, 'short_no' => $o->short_no, 'kiosk_id' => $o->kiosk_id, 'received_by' => $by?->id ?? $o->cashier_id,
            'served_by' => $o->cashier_id, 'status' => Tip::PENDING,
        ]);
    }
}

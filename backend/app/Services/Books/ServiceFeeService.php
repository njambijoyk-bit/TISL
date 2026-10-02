<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use Illuminate\Support\Collection;

/**
 * Fees on a service are master data, like auction charges: ledgers in a "charge" group that belongs to services (the
 * Service Fees subgroup of Service Income, and the Service Deposits & Pass-through liabilities). Each ledger carries
 * how it is worked out, its tax (taxed with a tax ledger, or not taxed) and when it falls due. A service switches fees
 * on or off and may change the amounts.
 */
class ServiceFeeService
{
    public const KINDS = ['call_out', 'travel', 'urgent', 'after_hours', 'consumables', 'equipment', 'extra_person', 'overtime', 'service_charge', 'deposit', 'booking_fee',
        'cancellation', 'no_show', 'reschedule', 'tip', 'disbursement', 'payment_processing', 'other_service'];

    /** booking: asked when booked · completion: added when the service is done · late_cancel / no_show / reschedule: worked out when that happens */
    public const TIMINGS = ['booking', 'completion', 'late_cancel', 'no_show', 'reschedule'];

    /** Kinds that are not income: money held for the customer or passed on. */
    public const NOT_INCOME = ['deposit', 'tip', 'disbursement'];

    /** Every active fee ledger that belongs to services. */
    public function ledgers(): Collection
    {
        $groupIds = LedgerGroup::where('behaviour', 'charge')->get()->flatMap(fn ($g) => $g->selfAndDescendantIds())->unique()->all();

        return Ledger::with(['taxRateLedger:id,name,rate_value', 'group:id,name,nature'])->whereIn('group_id', $groupIds)->where('is_active', true)->orderBy('name')->get()
            ->filter(fn ($l) => LedgerGroup::appliesTo((int) $l->group_id) === 'service' || (($l->settings ?? [])['applies_to'] ?? null) === 'service')->values();
    }
}

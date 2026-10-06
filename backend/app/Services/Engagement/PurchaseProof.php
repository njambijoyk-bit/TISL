<?php

namespace App\Services\Engagement;

use App\Models\Booking;
use App\Models\Books\Voucher;
use App\Models\Customer;
use App\Models\User;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;

/**
 * "Has this person bought it?", read from the books and the bookings and shaped by the switches on the Engagement settings page.
 * A product or hamper counts when the customer has a posted sales invoice or cash sale of it that credit notes have not taken all back. Over their whole history,
 * not invoice by invoice: if the paid switch is on, at least one such invoice must be paid; if the delivered switch is on, the item must have been delivered at least once. A service counts through its bookings (completed, late cancellation with a fee, no-show with a fee,
 * cancelled in time: each a switch), or through a sales invoice for it that did not come from a booking.
 */
class PurchaseProof
{
    public function __construct(private VoucherService $vouchers, private EngagementRules $rules) {}

    /** @return array{ok:bool, reason:?string, voucher_id:?int} */
    public function check(?User $user, string $type, int $id): array
    {
        $no = fn (string $why) => ['ok' => false, 'reason' => $why, 'voucher_id' => null];
        if (! $user) {
            return $no('Sign in to show that you bought it.');
        }
        $customer = Customer::where('user_id', $user->id)->first();
        if (! $customer) {
            return $no('We could not find a customer account for you.');
        }
        $s = $this->rules->settings();

        if ($type === 'service') {
            $b = $this->booking($customer->id, $id, $s);
            if ($b) {
                return ['ok' => true, 'reason' => null, 'voucher_id' => $b['voucher_id']];
            }
            $v = $this->invoice($customer->id, 'service', $id, $s, true);

            return $v ? ['ok' => true, 'reason' => null, 'voucher_id' => $v] : $no('Only people who have booked this service can review it.');
        }
        if (in_array($type, ['product', 'hamper'], true)) {
            $v = $this->invoice($customer->id, $type, $id, $s, false);

            return $v ? ['ok' => true, 'reason' => null, 'voucher_id' => $v] : $no('Only people who have bought this can review it.');
        }

        return $no('This cannot be checked.');
    }

    /** The first booking of this service that the switches say counts, with the invoice that shows it when there is one. */
    private function booking(int $customerId, int $serviceId, $s): ?array
    {
        foreach (Booking::where('customer_id', $customerId)->where('bookable_type', 'service')->where('bookable_id', $serviceId)->orderBy('id')->get() as $b) {
            $counts = match ($b->status) {
                'completed' => $s->service_completed_counts,
                'no_show' => $s->service_noshow_counts && $this->feePosted($b),
                'cancelled' => $b->cancelled_late ? ($s->service_late_fee_counts && $this->feePosted($b)) : $s->service_free_cancel_counts,
                default => false,
            };
            if ($counts) {
                return ['voucher_id' => $b->fee_voucher_id ?: $b->invoice_voucher_id ?: $b->order_voucher_id];
            }
        }

        return null;
    }

    private function feePosted(Booking $b): bool
    {
        $v = $b->fee_voucher_id ? Voucher::find($b->fee_voucher_id) : null;

        return $v && $v->status === Voucher::POSTED && (! $this->rules->settings()->paid_required || $this->paid($v));
    }

    private function paid(Voucher $v): bool
    {
        return $this->vouchers->outstanding($v) <= 0.005;   // a cash sale has no bill to owe, so it reads as paid
    }

    /** A posted sale of the item to this customer that is not wholly credited back. `$apart` leaves out invoices that belong to a booking. */
    private function invoice(int $customerId, string $type, int $itemId, $s, bool $apart): ?int
    {
        $col = ['product' => 'i.product_id', 'service' => 'i.service_id', 'hamper' => 'i.hamper_id'][$type];
        $rows = DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('v.customer_id', $customerId)->where($col, $itemId)->where('v.status', Voucher::POSTED)->whereIn('t.base_type', ['sales', 'cash_sale'])
            ->where('i.item_type', '!=', 'charge')->when($type === 'hamper', fn ($w) => $w->where('i.is_header', true), fn ($w) => $w->where('i.is_header', false)->whereNull('i.parent_item_id'))
            ->when($apart, fn ($w) => $w->whereNotIn('v.id', fn ($q) => $q->select('order_voucher_id')->from('bookings')->whereNotNull('order_voucher_id')
                ->union(DB::table('bookings')->select('upfront_voucher_id')->whereNotNull('upfront_voucher_id'))->union(DB::table('bookings')->select('invoice_voucher_id')->whereNotNull('invoice_voucher_id'))->union(DB::table('bookings')->select('fee_voucher_id')->whereNotNull('fee_voucher_id'))))
            ->orderBy('v.id')->get(['i.quantity', 'i.delivered_quantity', 'i.item_type', 'v.id as voucher_id']);
        // Across everything they have bought, not invoice by invoice: they need at least one purchase that is not credited back, at least one of those paid
        // (if that switch is on) and at least once the item delivered (if that switch is on). A pending invoice today does not cancel the paid ones before it.
        $first = null;
        $paid = null;
        $delivered = false;
        foreach ($rows as $r) {
            $credited = (float) DB::table('voucher_items as ci')->join('vouchers as cv', 'cv.id', '=', 'ci.voucher_id')->join('voucher_types as ct', 'ct.id', '=', 'cv.voucher_type_id')
                ->where('cv.source_voucher_id', $r->voucher_id)->where('cv.status', Voucher::POSTED)->where('ct.base_type', 'credit_note')
                ->where(str_replace('i.', 'ci.', $col), $itemId)->sum('ci.quantity');
            if ($credited + 0.0001 >= (float) $r->quantity) {
                continue;   // all of it was credited back
            }
            $first ??= (int) $r->voucher_id;
            if ($paid === null && $this->paid(Voucher::find($r->voucher_id))) {
                $paid = (int) $r->voucher_id;
            }
            if ((float) $r->delivered_quantity > 0.0001) {
                $delivered = true;
            }
        }
        if ($first === null || ($s->paid_required && $paid === null) || ($s->delivered_required && $type === 'product' && ! $delivered)) {
            return null;
        }

        return $paid ?? $first;
    }
}

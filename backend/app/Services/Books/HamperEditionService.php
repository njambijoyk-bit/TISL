<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Models\Hamper;
use App\Services\HamperEligibilityService;
use Illuminate\Support\Facades\DB;

/**
 * The rules of a hamper, applied when a voucher carries it: it must be on sale, the customer eligible, within the
 * limit per customer, and within the edition size. A hamper is taken ONCE along a chain: the first Sales Order,
 * Delivery Note, Invoice or Cash Sale that carries it counts; a document made from that one (the delivery of the
 * order, the invoice of the delivery) does not count again. Cancelling the voucher gives it back.
 */
class HamperEditionService
{
    private const TAKING = [VoucherType::SALES_ORDER, VoucherType::DELIVERY_NOTE, VoucherType::SALES, VoucherType::CASH_SALE];

    public function __construct(private HamperEligibilityService $eligibility) {}

    /** How many of a hamper live vouchers have taken (optionally one customer's), leaving one voucher out (the one being edited). */
    public function taken(int $hamperId, ?int $customerId = null, ?int $exceptVoucherId = null): float
    {
        return (float) DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('i.is_header', true)->where('i.hamper_id', $hamperId)->where('v.status', Voucher::POSTED)->whereIn('t.base_type', self::TAKING)
            ->when($customerId, fn ($q) => $q->where('v.customer_id', $customerId))
            ->when($exceptVoucherId, fn ($q) => $q->where('v.id', '!=', $exceptVoucherId))
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('voucher_items as pi')->whereColumn('pi.voucher_id', 'v.source_voucher_id')->where('pi.is_header', true)->where('pi.hamper_id', $hamperId))
            ->sum('i.quantity');
    }

    /** Refuse a voucher that breaks a hamper's rules. $lines are the planned (resolved) lines. */
    public function assertCanTake(array $lines, VoucherType $type, ?Customer $customer, ?int $sourceId, ?Voucher $existing): void
    {
        if (! in_array($type->base_type, self::TAKING, true)) {
            return;
        }
        $want = [];
        foreach ($lines as $l) {
            if (! empty($l['is_header']) && ! empty($l['hamper_id'])) {
                $want[(int) $l['hamper_id']] = ($want[(int) $l['hamper_id']] ?? 0) + (float) ($l['quantity'] ?? 1);
            }
        }
        foreach ($want as $hamperId => $qty) {
            // made from a document that already carries it: it was checked and counted there
            if ($sourceId && DB::table('voucher_items')->where('voucher_id', $sourceId)->where('is_header', true)->where('hamper_id', $hamperId)->exists()) {
                continue;
            }
            $h = Hamper::find($hamperId);
            if (! $h) {
                continue;
            }
            $this->assertOne($h, $qty, $customer, $existing?->id);
        }
    }

    private function assertOne(Hamper $h, float $qty, ?Customer $customer, ?int $exceptId): void
    {
        if ($h->status !== 'active') {
            throw new BooksException("{$h->name} is not on sale.");
        }
        if (($h->valid_from && $h->valid_from->isFuture()) || ($h->valid_until && $h->valid_until->isPast())) {
            throw new BooksException("{$h->name} is not available at this time.");
        }
        if ($customer) {
            if (! $this->eligibility->isEligible($customer, $h)) {
                throw new BooksException("{$customer->first_name} {$customer->last_name} is not eligible for {$h->name}.");
            }
        } elseif ($h->eligibility_type !== 'all') {
            throw new BooksException("{$h->name} is for selected customers only — choose the customer.");
        }
        if ($customer && $h->max_purchases_per_customer) {
            $had = $this->taken($h->id, $customer->id, $exceptId);
            if ($had + $qty > (float) $h->max_purchases_per_customer + 0.00001) {
                throw new BooksException("{$h->name}: at most {$h->max_purchases_per_customer} per customer" . ($had > 0 ? " — this customer already has " . (float) $had : '') . '.');
            }
        }
        if ($h->total_stock !== null) {
            $left = max(0.0, (float) $h->total_stock - $this->taken($h->id, null, $exceptId));
            if ($qty > $left + 0.00001) {
                throw new BooksException($left > 0 ? "{$h->name}: only " . (float) $left . ' left in the edition.' : "{$h->name} is sold out.");
            }
        }
    }

    /** Hamper ids a voucher carries. */
    public function idsOn(Voucher $v): array
    {
        return DB::table('voucher_items')->where('voucher_id', $v->id)->where('is_header', true)->whereNotNull('hamper_id')->pluck('hamper_id')->map(fn ($x) => (int) $x)->unique()->values()->all();
    }

    /** Bring the edition counters of these hampers in line with the vouchers. */
    public function sync(array $hamperIds): void
    {
        foreach (array_unique($hamperIds) as $id) {
            $h = Hamper::find($id);
            if (! $h || $h->total_stock === null) {
                continue;
            }
            $left = max(0, (int) round((float) $h->total_stock - $this->taken((int) $id)));
            $h->forceFill(['stock_remaining' => $left, 'is_sold_out' => $left <= 0])->save();
        }
    }
}

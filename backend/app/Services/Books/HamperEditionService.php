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

    /**
     * What the hampers in a sale that do NOT take a thing add up to (price + tax): $flag is one of
     * allow_store_credit (gift vouchers), earn_loyalty_points. Hampers are never discounted, so promo codes never reach them.
     */
    public function restrictedFromLines(array $lines, string $flag): float
    {
        $sum = 0.0;
        $ok = [];
        foreach ($lines as $l) {
            if (empty($l['is_header']) || empty($l['hamper_id'])) {
                continue;
            }
            $id = (int) $l['hamper_id'];
            $ok[$id] ??= (bool) (Hamper::whereKey($id)->value($flag) ?? true);
            if (! $ok[$id]) {
                $sum += (float) ($l['amount'] ?? 0) + (float) ($l['tax_amount'] ?? 0);
            }
        }

        return round($sum, 2);
    }

    /** Does this hamper take promo codes? (Its price is then a base for them; no other discount reaches it.) */
    public function takesPromo(int $hamperId): bool
    {
        return (bool) (Hamper::whereKey($hamperId)->value('allow_promo_codes') ?? false);
    }

    /** The same for a saved voucher. */
    public function restrictedOn(Voucher $v, string $flag): float
    {
        $rows = DB::table('voucher_items')->where('voucher_id', $v->id)->where('is_header', true)->whereNotNull('hamper_id')->get(['hamper_id', 'amount', 'tax_amount']);

        return $this->restrictedFromLines($rows->map(fn ($r) => ['is_header' => true, 'hamper_id' => $r->hamper_id, 'amount' => $r->amount, 'tax_amount' => $r->tax_amount])->all(), $flag);
    }

    /**
     * Small status badges for the voucher form's hamper list, for the customer on the voucher (if any):
     * eligibility, what is left of the edition, and the customer's own limit. tone: ok | warn | bad | info.
     *
     * @return array<int, array{label: string, tone: string}>
     */
    public function badges(Hamper $h, ?Customer $customer): array
    {
        $out = [];
        if ($customer) {
            $status = $this->eligibility->getStatus($customer, $h);
            $out[] = $status === 'eligible' ? ['label' => 'Eligible', 'tone' => 'ok']
                : ['label' => match ($status) { 'blacklisted' => 'Blacklisted', 'suspended' => 'Suspended', default => 'Not eligible' }, 'tone' => 'bad'];
        } else {
            $out[] = $h->eligibility_type === 'all' ? ['label' => 'Open to all', 'tone' => 'info'] : ['label' => 'Choose a customer', 'tone' => 'warn'];
        }
        if ($h->total_stock !== null) {
            $left = max(0, (int) round((float) $h->total_stock - $this->taken($h->id)));
            $out[] = $left > 0 ? ['label' => "{$left} of {$h->total_stock} left", 'tone' => $left <= max(1, (int) floor($h->total_stock * 0.2)) ? 'warn' : 'ok'] : ['label' => 'Sold out', 'tone' => 'bad'];
        }
        if ($customer && $h->max_purchases_per_customer) {
            $had = (int) round($this->taken($h->id, $customer->id));
            $out[] = $had >= $h->max_purchases_per_customer ? ['label' => "Max reached ({$had}/{$h->max_purchases_per_customer})", 'tone' => 'bad']
                : ['label' => "Customer {$had}/{$h->max_purchases_per_customer}", 'tone' => 'info'];
        }
        if (($h->valid_from && $h->valid_from->isFuture()) || ($h->valid_until && $h->valid_until->isPast())) {
            $out[] = ['label' => 'Outside its dates', 'tone' => 'bad'];
        }
        $rules = [];
        if (! $h->allow_store_credit) {
            $rules[] = 'no gift vouchers';
        }
        if (! $h->earn_loyalty_points) {
            $rules[] = 'no points';
        }
        foreach ($rules as $r) {
            $out[] = ['label' => ucfirst($r), 'tone' => 'info'];
        }

        return $out;
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

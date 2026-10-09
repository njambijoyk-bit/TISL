<?php

namespace App\Services\Preorders;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\PreorderOffer;
use App\Models\PreorderOfferSupply;
use App\Models\User;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Where the stock for a preorder offer is coming from (docs/PREORDER_PLAN.md, "Linking an offer to a purchase order").
 * An offer can point at one or more live purchase orders that have a line for its option. From them we read, never store:
 *   incoming  what is still to arrive (ordered less received, base units), and
 *   date      when: the latest due date of the linked purchase orders that still have something to arrive.
 * That date is what customers are told and what "late" is measured against, so a supplier delay moves the promise in one place.
 */
class PreorderSupply
{
    public const MAX_LINKS = 6;

    public static function ready(): bool
    {
        return Schema::hasTable('preorder_offer_supply');
    }

    /** Live purchase orders with something still to arrive of this option: the ones an offer could be linked to. @return array<int, array<string,mixed>> */
    public function candidates(int $variantId): array
    {
        $q = DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('t.base_type', VoucherType::PURCHASE_ORDER)->where('v.status', Voucher::POSTED)->where('i.variant_id', $variantId)->where('i.is_header', 0)
            ->whereRaw('(i.quantity - i.delivered_quantity) > 0');
        $supplier = Schema::hasTable('ledgers') ? 'l.name' : 'NULL';
        if (Schema::hasTable('ledgers')) {
            $q->leftJoin('ledgers as l', 'l.id', '=', 'v.party_ledger_id');
        }

        return $q->groupBy('v.id', 'v.voucher_number', 'v.date', 'v.due_date', 'v.party_name', 'v.location_id', DB::raw($supplier))->orderBy('v.due_date')->orderBy('v.id')
            ->selectRaw("v.id AS voucher_id, v.voucher_number AS number, v.date, v.due_date, v.location_id, COALESCE({$supplier}, v.party_name) AS supplier, SUM(i.quantity * i.unit_factor) AS ordered, SUM((i.quantity - i.delivered_quantity) * i.unit_factor) AS incoming")
            ->get()->map(fn ($r) => ['voucher_id' => (int) $r->voucher_id, 'number' => $r->number, 'date' => $r->date ? substr((string) $r->date, 0, 10) : null, 'due_date' => $r->due_date ? substr((string) $r->due_date, 0, 10) : null,
                'location_id' => $r->location_id ? (int) $r->location_id : null, 'supplier' => $r->supplier, 'ordered' => round((float) $r->ordered, 4), 'incoming' => round((float) $r->incoming, 4)])->all();
    }

    /**
     * What is linked to each offer: its purchase orders with ordered / still to arrive / due, and the totals. Cancelled purchase orders count as nothing.
     *
     * @param  int[]  $offerIds
     * @return array<int, array{incoming: float, date: ?string, orders: array<int, array<string,mixed>>}> by offer id (every id asked for is present)
     */
    public function forOffers(array $offerIds): array
    {
        $out = array_fill_keys($offerIds, ['incoming' => 0.0, 'date' => null, 'orders' => []]);
        if (! $offerIds || ! self::ready()) {
            return $out;
        }
        $rows = DB::table('preorder_offer_supply as s')->join('preorder_offers as o', 'o.id', '=', 's.offer_id')->join('vouchers as v', 'v.id', '=', 's.voucher_id')
            ->leftJoin('voucher_items as i', function ($j) {
                $j->on('i.voucher_id', '=', 'v.id')->on('i.variant_id', '=', 'o.variant_id')->where('i.is_header', 0);
            })
            ->whereIn('s.offer_id', $offerIds)->where('v.status', Voucher::POSTED)
            ->groupBy('s.offer_id', 'v.id', 'v.voucher_number', 'v.due_date')
            ->selectRaw('s.offer_id, v.id AS voucher_id, v.voucher_number AS number, v.due_date, COALESCE(SUM(i.quantity * i.unit_factor), 0) AS ordered, COALESCE(SUM((i.quantity - i.delivered_quantity) * i.unit_factor), 0) AS incoming')
            ->orderBy('v.due_date')->orderBy('v.id')->get();
        foreach ($rows as $r) {
            $row = ['voucher_id' => (int) $r->voucher_id, 'number' => $r->number, 'due_date' => $r->due_date ? substr((string) $r->due_date, 0, 10) : null, 'ordered' => round((float) $r->ordered, 4), 'incoming' => round(max(0.0, (float) $r->incoming), 4)];
            $e = &$out[(int) $r->offer_id];
            $e['orders'][] = $row;
            $e['incoming'] = round($e['incoming'] + $row['incoming'], 4);
            if ($row['incoming'] > 0.00005 && $row['due_date']) {
                $e['date'] = max($e['date'] ?? '', $row['due_date']);   // the last shipment still to come decides the date
            }
            unset($e);
        }

        return $out;
    }

    public function forOffer(PreorderOffer $o): array
    {
        return $this->forOffers([$o->id])[$o->id];
    }

    /** Link a purchase order to an offer. The purchase order must be live and carry a line for the offer's option. */
    public function link(PreorderOffer $offer, int $voucherId, ?User $by): void
    {
        if (! self::ready()) {
            throw new BooksException('Run database script 111_preorder_offer_supply.sql first.');
        }
        $po = collect($this->candidates((int) $offer->variant_id))->firstWhere('voucher_id', $voucherId);
        if (! $po) {
            throw new BooksException('That purchase order is not open, or has no line for this item with something still to arrive.');
        }
        if (PreorderOfferSupply::where('offer_id', $offer->id)->where('voucher_id', $voucherId)->exists()) {
            throw new BooksException('That purchase order is already linked to this offer.');
        }
        if (PreorderOfferSupply::where('offer_id', $offer->id)->count() >= self::MAX_LINKS) {
            throw new BooksException('An offer can be linked to at most ' . self::MAX_LINKS . ' purchase orders.');
        }
        PreorderOfferSupply::create(['offer_id' => $offer->id, 'voucher_id' => $voucherId, 'created_by' => $by?->id, 'created_at' => now()]);
    }

    public function unlink(PreorderOffer $offer, int $voucherId): void
    {
        PreorderOfferSupply::where('offer_id', $offer->id)->where('voucher_id', $voucherId)->delete();
    }

    /** The date customers should be given for this offer: the purchase orders' (when linked and still arriving), else the offer's own typed date. */
    public function effectiveDate(PreorderOffer $o): ?string
    {
        return $this->forOffer($o)['date'] ?? ($o->expected_until ?? $o->expected_from)?->toDateString();
    }
}

<?php

namespace App\Services\Preorders;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherSeries;
use App\Models\Books\VoucherType;
use App\Models\Campaign;
use App\Models\CampaignItem;
use App\Models\Hamper;
use App\Models\Location;
use App\Models\PreorderLine;
use App\Models\PreorderOffer;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Models\VariantLocationStock;
use App\Services\Books\BooksException;
use App\Services\Campaigns\CampaignAudience;
use App\Services\Campaigns\CampaignStatus;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\DB;

/**
 * Preorders (docs/PREORDER_PLAN.md). A preorder is an ordinary Sales Order (series PRE-) that becomes a Cash Sale or Invoice without taking stock;
 * delivery notes made from the sale move the stock later. This service holds what is specific to them:
 *   offers (a campaign sells one variant before it is here) and the per-branch switch,
 *   what is committed (promised and not yet delivered) so normal selling never touches it,
 *   whether a visitor sees Add to Cart, Preorder, Coming soon or Out of stock,
 *   placing one (limit checked with the offer locked), and the "waiting for stock" list.
 * Nothing is stored for committed, taken or paid-not-delivered: all are worked out from the orders and sales.
 */
class PreorderService
{
    public const SERIES = 'Preorder';

    public static function ready(): bool
    {
        return PreorderOffer::ready();
    }

    // ------------------------------------------------------------ the branch switch

    public function enabledAt(int $variantId, int $locationId): bool
    {
        return self::ready() && VariantLocationStock::where('product_variant_id', $variantId)->where('location_id', $locationId)->where('preorder_enabled', true)->exists();
    }

    /** Switch preorders on or off for a variant at a branch (a branch with no row for it gets one at quantity 0). Only branches that sell to customers. */
    public function setBranchFlag(int $variantId, int $locationId, bool $on): VariantLocationStock
    {
        if (! self::ready()) {
            throw new BooksException('Run database script 103_preorders.sql first.');
        }
        if (! Location::query()->sellsToCustomers()->whereKey($locationId)->exists()) {
            throw new BooksException('Only a branch that sells to customers can take preorders.');
        }
        ProductVariant::findOrFail($variantId);
        $row = VariantLocationStock::firstOrCreate(['product_variant_id' => $variantId, 'location_id' => $locationId], ['quantity' => 0]);
        $row->forceFill(['preorder_enabled' => $on])->save();

        return $row;
    }

    // ------------------------------------------------------------ offers

    public function saveOffer(Campaign $campaign, array $d, ?User $by, ?PreorderOffer $offer = null): PreorderOffer
    {
        if (! self::ready()) {
            throw new BooksException('Run database script 103_preorders.sql first.');
        }
        $variant = ProductVariant::findOrFail((int) ($d['variant_id'] ?? $offer?->variant_id));
        $exists = PreorderOffer::where('campaign_id', $campaign->id)->where('variant_id', $variant->id)->when($offer, fn ($q) => $q->whereKeyNot($offer->id))->exists();
        if ($exists) {
            throw new BooksException('This campaign already has an offer on that item.');
        }
        if (! $offer && ! $this->featured($campaign, $variant)) {
            throw new BooksException('Feature this option on the campaign page first (Page, Products), then offer it as a preorder. A product featured whole covers all of its options.');
        }
        $fields = [
            'campaign_id' => $campaign->id, 'product_id' => $variant->product_id, 'variant_id' => $variant->id,
            'limit_total' => isset($d['limit_total']) && $d['limit_total'] !== '' ? max(1, (int) $d['limit_total']) : null,
            'closes_at' => $d['closes_at'] ?? null, 'expected_from' => $d['expected_from'] ?? null, 'expected_until' => $d['expected_until'] ?? null,
            'terms' => isset($d['terms']) ? (trim((string) $d['terms']) ?: null) : null,
            'is_active' => array_key_exists('is_active', $d) ? (bool) $d['is_active'] : true,
        ];
        if ($fields['expected_from'] && $fields['expected_until'] && $fields['expected_until'] < $fields['expected_from']) {
            throw new BooksException('The expected end date is before the start date.');
        }
        if ($fields['limit_total'] !== null && $offer && $fields['limit_total'] < $this->taken($offer->id)) {
            throw new BooksException('Places already taken (' . rtrim(rtrim(number_format($this->taken($offer->id), 4, '.', ''), '0'), '.') . ') are more than that limit.');
        }

        if ($offer) {
            $offer->update($fields);

            return $offer->fresh();
        }

        return PreorderOffer::create($fields + ['created_by' => $by?->id]);
    }

    /** Is this option on the campaign's page: featured on its own, inside a product featured whole, or a component of a featured hamper? Offers made before options could be featured keep working. */
    public function featured(Campaign $campaign, ProductVariant $variant): bool
    {
        $q = CampaignItem::where('campaign_id', $campaign->id)->where('item_type', 'product')->where('item_id', $variant->product_id);
        if (CampaignItem::hasVariants()) {
            $q->whereIn('variant_id', [0, $variant->id]);
        }
        if ($q->exists()) {
            return true;
        }

        // or a component of a hamper the campaign features (a hamper is preordered through its components' offers)
        $hampers = CampaignItem::where('campaign_id', $campaign->id)->where('item_type', 'hamper')->pluck('item_id');

        return $hampers->isNotEmpty() && collect($hampers)->contains(fn ($id) => isset($this->hamperNeeds((int) $id)[$variant->id]));
    }

    public function deleteOffer(PreorderOffer $offer): void
    {
        if (PreorderLine::where('offer_id', $offer->id)->exists()) {
            throw new BooksException('Preorders were taken under this offer, so it can not be deleted. Switch it off to stop new ones.');
        }
        $offer->delete();
    }

    // ------------------------------------------------------------ who may see / use an offer

    /** The campaign's status for this visitor: before the start, early access lets chosen people in as if it were live. @return array{0: string, 1: bool} */
    public function campaignStatus(Campaign $c, ?User $user): array
    {
        $status = CampaignStatus::of($c);
        $early = false;
        if (in_array($status, ['scheduled', 'teaser'], true) && $c->early_access_at && now()->gte($c->early_access_at) && $c->early_access_audience && CampaignAudience::allows($user, $c->early_access_audience)) {
            $status = 'live';
            $early = true;
        }

        return [$status, $early];
    }

    private function licensed(): bool
    {
        try {
            return app(LicenseManager::class)->isActive('campaigns');
        } catch (\Throwable) {
            return false;
        }
    }

    /** Is the offer open to this person for new preorders? (campaign live for them and open to them, offer on and not closed, places left) */
    public function isOpen(PreorderOffer $o, ?User $user): bool
    {
        if (! $o->is_active || ($o->closes_at && now()->gte($o->closes_at))) {
            return false;
        }
        $c = $o->campaign;
        if (! $c || ! CampaignAudience::allows($user, $c->audience_rule)) {
            return false;
        }
        [$status] = $this->campaignStatus($c, $user);
        if ($status !== 'live') {
            return false;
        }
        $left = $this->remaining($o);

        return $left === null || $left > 0.00005;
    }

    // ------------------------------------------------------------ taken and committed (always worked out)

    /** Quantity taken under each offer: what its orders hold (base units), less what was credited back. @param int[] $offerIds @return array<int, float> */
    public function takenByOffer(array $offerIds): array
    {
        $out = array_fill_keys($offerIds, 0.0);
        if (! $offerIds || ! self::ready()) {
            return $out;
        }
        $orders = DB::table('preorder_lines as p')->join('vouchers as so', 'so.id', '=', 'p.voucher_id')
            ->join('voucher_items as i', function ($j) {
                $j->on('i.voucher_id', '=', 'so.id')->on('i.variant_id', '=', 'p.variant_id');
            })
            ->where('so.status', Voucher::POSTED)->where('i.is_header', 0)->whereIn('p.offer_id', $offerIds)
            ->selectRaw('p.offer_id, SUM(i.quantity * i.unit_factor) AS qty')->groupBy('p.offer_id')->get();
        foreach ($orders as $r) {
            $out[(int) $r->offer_id] += (float) $r->qty;
        }
        $returned = DB::table('voucher_items as r')->join('vouchers as cn', 'cn.id', '=', 'r.voucher_id')->join('voucher_types as ct', 'ct.id', '=', 'cn.voucher_type_id')
            ->join('voucher_items as inv', 'inv.id', '=', 'r.source_item_id')->join('vouchers as c', 'c.id', '=', 'inv.voucher_id')
            ->join('preorder_lines as p', function ($j) {
                $j->on('p.voucher_id', '=', 'c.source_voucher_id')->on('p.variant_id', '=', 'inv.variant_id');
            })
            ->where('ct.base_type', VoucherType::CREDIT_NOTE)->where('cn.status', Voucher::POSTED)->where('c.status', Voucher::POSTED)->whereIn('p.offer_id', $offerIds)
            ->selectRaw('p.offer_id, SUM(r.quantity * r.unit_factor) AS qty')->groupBy('p.offer_id')->get();
        foreach ($returned as $r) {
            $out[(int) $r->offer_id] -= (float) $r->qty;
        }

        return array_map(fn ($v) => max(0.0, round($v, 4)), $out);
    }

    public function taken(int $offerId): float
    {
        return $this->takenByOffer([$offerId])[$offerId] ?? 0.0;
    }

    /** Places left under the offer's limit, or null when it has no limit. */
    public function remaining(PreorderOffer $o): ?float
    {
        return $o->limit_total === null ? null : max(0.0, round((float) $o->limit_total - $this->taken($o->id), 4));
    }

    /**
     * Everything promised and not yet delivered, one entry per preorder line still owed:
     * [variant_id, location_id, order_id (the PRE- Sales Order), item_id (its line), qty (base units still owed)].
     * Delivery notes are made from the Sales Order and tick off its lines (`delivered_quantity`); the sale only takes the money. So what is
     * owed on a line is what it holds minus what was delivered, minus what was credited back (a credit note is the customer being refunded for
     * it, so it is no longer owed). Never below zero. Cancelled orders owe nothing.
     */
    private function owed(?int $variantId = null, ?int $locationId = null): array
    {
        if (! self::ready()) {
            return [];
        }
        $orders = DB::table('preorder_lines as p')->join('vouchers as so', 'so.id', '=', 'p.voucher_id')
            ->join('voucher_items as i', function ($j) {
                $j->on('i.voucher_id', '=', 'so.id')->on('i.variant_id', '=', 'p.variant_id');
            })
            ->where('so.status', Voucher::POSTED)->where('i.is_header', 0)
            ->when($variantId, fn ($q) => $q->where('p.variant_id', $variantId))->when($locationId, fn ($q) => $q->where('p.location_id', $locationId))
            ->get(['p.variant_id', 'p.location_id', 'so.id as order_id', 'i.id as item_id', 'i.quantity', 'i.unit_factor', 'i.delivered_quantity']);
        if ($orders->isEmpty()) {
            return [];
        }
        // credited back, by the order line the credited sale line came from
        $back = DB::table('voucher_items as r')->join('vouchers as cn', 'cn.id', '=', 'r.voucher_id')->join('voucher_types as ct', 'ct.id', '=', 'cn.voucher_type_id')
            ->join('voucher_items as inv', 'inv.id', '=', 'r.source_item_id')->join('vouchers as c', 'c.id', '=', 'inv.voucher_id')
            ->where('ct.base_type', VoucherType::CREDIT_NOTE)->where('cn.status', Voucher::POSTED)->where('c.status', Voucher::POSTED)
            ->whereIn('inv.source_item_id', $orders->pluck('item_id')->all())
            ->selectRaw('inv.source_item_id AS order_item, SUM(r.quantity) AS qty')->groupBy('inv.source_item_id')->pluck('qty', 'order_item');
        $rows = [];
        foreach ($orders as $r) {
            $left = max(0.0, (float) $r->quantity - (float) $r->delivered_quantity - (float) ($back[$r->item_id] ?? 0));
            if ($left > 0.00005) {
                $rows[] = ['variant_id' => (int) $r->variant_id, 'location_id' => (int) $r->location_id, 'order_id' => (int) $r->order_id, 'item_id' => (int) $r->item_id, 'qty' => round($left * (float) $r->unit_factor, 4)];
            }
        }

        return $rows;
    }

    /** How each order has been paid: its Cash Sale (paid), its Invoice (on account) or nothing yet. @return array<int, array{id: int, number: ?string, kind: string}> by order id */
    private function salesOf(array $orderIds): array
    {
        $out = [];
        $rows = DB::table('vouchers as c')->join('voucher_types as t', 't.id', '=', 'c.voucher_type_id')->whereIn('c.source_voucher_id', $orderIds)
            ->whereIn('t.base_type', [VoucherType::SALES, VoucherType::CASH_SALE])->where('c.status', Voucher::POSTED)->orderBy('c.id')->get(['c.id', 'c.voucher_number', 'c.source_voucher_id', 't.base_type']);
        foreach ($rows as $r) {
            $out[(int) $r->source_voucher_id] ??= ['id' => (int) $r->id, 'number' => $r->voucher_number, 'kind' => $r->base_type === VoucherType::CASH_SALE ? 'paid' : 'invoiced'];
        }

        return $out;
    }

    /** What is promised and not delivered of a variant, per branch (base units). @return array<int, float> */
    public function committedByLocation(int $variantId): array
    {
        $out = [];
        foreach ($this->owed($variantId) as $r) {
            $out[$r['location_id']] = round(($out[$r['location_id']] ?? 0) + $r['qty'], 4);
        }

        return $out;
    }

    public function committed(int $variantId, int $locationId): float
    {
        return $this->committedByLocation($variantId)[$locationId] ?? 0.0;
    }

    /** Value (before tax) of preorders paid for at the till but not yet delivered: the revenue booked before the cost of the goods (worked out, not stored). */
    public function paidNotDelivered(?int $locationId = null): array
    {
        $owed = $this->owed(null, $locationId);
        if (! $owed) {
            return ['lines' => 0, 'value' => 0.0];
        }
        $sales = $this->salesOf(array_unique(array_column($owed, 'order_id')));
        $items = DB::table('voucher_items')->whereIn('id', array_column($owed, 'item_id'))->get(['id', 'quantity', 'unit_factor', 'amount'])->keyBy('id');
        $lines = 0;
        $value = 0.0;
        foreach ($owed as $r) {
            $i = $items[$r['item_id']] ?? null;
            if (! $i || (float) $i->quantity <= 0 || ($sales[$r['order_id']]['kind'] ?? null) !== 'paid') {
                continue;
            }
            $share = min(1.0, $r['qty'] / max(0.0001, (float) $i->quantity * (float) $i->unit_factor));
            $value += (float) $i->amount * $share;
            $lines++;
        }

        return ['lines' => $lines, 'value' => round($value, 2)];
    }

    // ------------------------------------------------------------ what a visitor sees

    public function physicalAt(int $variantId, int $locationId): float
    {
        return (float) VariantLocationStock::where('product_variant_id', $variantId)->where('location_id', $locationId)->value('quantity');
    }

    /** Stock they could buy now at the branch: what is there minus what is promised, never below zero. */
    public function buyable(int $variantId, int $locationId): float
    {
        return max(0.0, round($this->physicalAt($variantId, $locationId) - $this->committed($variantId, $locationId), 4));
    }

    /**
     * What a variant looks like at a branch to this visitor: buy (stock to sell), preorder (nothing to sell, an offer is open),
     * coming_soon (an offer exists but is not open to them yet) or out.
     *
     * @return array{state: string, buyable: float, offer: ?array}
     */
    public function stateFor(int $variantId, int $locationId, ?User $user): array
    {
        $buyable = $this->buyable($variantId, $locationId);
        if (! self::ready()) {
            return ['state' => $buyable > 0 ? 'buy' : 'out', 'buyable' => $buyable, 'offer' => null];
        }
        $offers = PreorderOffer::with('campaign')->where('variant_id', $variantId)->where('is_active', true)->get();
        $branchOn = $this->enabledAt($variantId, $locationId);
        $open = $branchOn && $this->licensed() ? $offers->first(fn ($o) => $this->isOpen($o, $user)) : null;

        if ($buyable > 0) {
            return ['state' => 'buy', 'buyable' => $buyable, 'offer' => $open ? $this->describe($open) : null];
        }
        if ($open) {
            return ['state' => 'preorder', 'buyable' => 0.0, 'offer' => $this->describe($open)];
        }
        if ($branchOn) {
            foreach ($offers as $o) {
                $c = $o->campaign;
                if (! $c || ! CampaignAudience::allows($user, $c->audience_rule)) {
                    continue;
                }
                [$status] = $this->campaignStatus($c, $user);
                if (in_array($status, ['scheduled', 'teaser'], true) && (! $o->closes_at || now()->lt($o->closes_at))) {
                    return ['state' => 'coming_soon', 'buyable' => 0.0, 'offer' => $this->describe($o) + ['opens_at' => ($c->starts_at ?? null)?->toIso8601String()]];
                }
            }
        }

        return ['state' => 'out', 'buyable' => 0.0, 'offer' => null];
    }

    /** Offers a person could take a preorder under right now at a branch (the counter form's list). */
    public function openAt(int $locationId, ?User $user): array
    {
        if (! self::ready() || ! $this->licensed()) {
            return [];
        }
        $out = [];
        foreach (PreorderOffer::with(['campaign', 'variant.product:id,name'])->where('is_active', true)->get() as $o) {
            if (! $this->enabledAt($o->variant_id, $locationId) || ! $this->isOpen($o, $user)) {
                continue;
            }
            $v = $o->variant;
            $out[] = ['offer_id' => $o->id, 'variant_id' => $o->variant_id, 'item' => $v?->product?->name, 'option' => $v && $v->name && $v->name !== $v->product?->name ? $v->name : null,
                'sku' => $v?->sku, 'buyable' => $this->buyable($o->variant_id, $locationId)] + $this->describe($o);
        }

        return $out;
    }

    public function describe(PreorderOffer $o): array
    {
        $left = $this->remaining($o);

        return ['id' => $o->id, 'campaign_id' => $o->campaign_id, 'campaign' => $o->campaign?->title, 'limit_total' => $o->limit_total, 'places_left' => $left === null ? null : (int) floor($left),
            'closes_at' => $o->closes_at?->toIso8601String(), 'expected_from' => $o->expected_from?->toDateString(), 'expected_until' => $o->expected_until?->toDateString(), 'terms' => $o->terms];
    }

    // ------------------------------------------------------------ hampers

    /** What one hamper holds, as variant id => quantity (a component with no option named is its product's default option). @return array<int, float> */
    public function hamperNeeds(int $hamperId): array
    {
        $out = [];
        foreach (\App\Models\HamperItem::where('hamper_id', $hamperId)->get(['product_id', 'variant_id', 'quantity']) as $it) {
            $vid = $it->variant_id ?: app(\App\Services\Location\VariantStockService::class)->defaultVariantId((int) $it->product_id);
            if ($vid) {
                $out[(int) $vid] = ($out[(int) $vid] ?? 0.0) + (float) $it->quantity;
            }
        }

        return $out;
    }

    /** The lines to check when `$quantity` of a hamper is preordered: its components, from the hamper's own branch. @return array<int, array> */
    public function hamperLines(Hamper $h, float $quantity): array
    {
        $out = [];
        foreach ($this->hamperNeeds((int) $h->id) as $vid => $per) {
            $out[] = ['variant_id' => $vid, 'quantity' => round($per * $quantity, 4), 'location_id' => (int) $h->location_id, 'lenient' => true, 'hamper_ids' => [(int) $h->id]];
        }

        return $out;
    }

    /**
     * What a hamper looks like to this visitor, from the stock of its components at the hamper's branch:
     * buy (every component is in stock), preorder (what is short has an open offer in a live campaign that features the hamper), coming_soon, or out.
     * `blocked` names the components that stop a preorder (no offer, switched off at the branch, closed or full).
     *
     * @return array{state: string, offer: ?array, blocked: string[]}
     */
    public function hamperState(Hamper $h, ?User $user): array
    {
        $loc = (int) $h->location_id;
        $needs = $this->hamperNeeds((int) $h->id);
        $short = [];
        foreach ($needs as $vid => $q) {
            if ($loc && $this->buyable($vid, $loc) + 0.00005 < $q) {
                $short[$vid] = $q;
            }
        }
        if (! $short) {
            return ['state' => 'buy', 'offer' => null, 'blocked' => []];
        }
        if (! self::ready() || ! $this->licensed()) {
            return ['state' => 'out', 'offer' => null, 'blocked' => $this->componentNames(array_keys($short))];
        }
        $campaigns = CampaignItem::where('item_type', 'hamper')->where('item_id', $h->id)->pluck('campaign_id')->all();
        $offers = PreorderOffer::with('campaign')->whereIn('campaign_id', $campaigns)->whereIn('variant_id', array_keys($short))->where('is_active', true)->get()->groupBy('variant_id');

        $open = [];
        $soon = false;
        $blocked = [];
        foreach ($short as $vid => $q) {
            $mine = $offers->get($vid, collect());
            $on = $this->enabledAt($vid, $loc);
            if ($on && ($o = $mine->first(fn ($o) => $this->isOpen($o, $user)))) {
                $open[] = [$o, $q];
            } elseif ($on && $mine->first(fn ($o) => $this->comingSoon($o, $user))) {
                $soon = true;
            } else {
                $blocked[] = $vid;
            }
        }
        if ($blocked) {
            return ['state' => 'out', 'offer' => null, 'blocked' => $this->componentNames($blocked)];
        }
        if ($soon) {
            return ['state' => 'coming_soon', 'offer' => null, 'blocked' => []];
        }

        return ['state' => 'preorder', 'offer' => $this->hamperOffer($open), 'blocked' => []];
    }

    /** The offers behind a hamper preorder, as one: the fewest places left, the latest expected date, the earliest closing. @param array<int, array{0: PreorderOffer, 1: float}> $open */
    private function hamperOffer(array $open): array
    {
        $places = null;
        $from = null;
        $until = null;
        $closes = null;
        $terms = [];
        foreach ($open as [$o, $per]) {
            $left = $this->remaining($o);
            if ($left !== null) {
                $n = (int) floor($left / max(0.0001, $per));
                $places = $places === null ? $n : min($places, $n);
            }
            $from = max($from ?? '', (string) $o->expected_from?->toDateString()) ?: null;
            $until = max($until ?? '', (string) $o->expected_until?->toDateString()) ?: null;
            $closes = $o->closes_at && (! $closes || $o->closes_at->lt($closes)) ? $o->closes_at : $closes;
            if ($o->terms) {
                $terms[$o->terms] = true;
            }
        }
        $first = $open[0][0];

        return ['id' => $first->id, 'campaign_id' => $first->campaign_id, 'campaign' => $first->campaign?->title, 'limit_total' => null, 'places_left' => $places,
            'closes_at' => $closes?->toIso8601String(), 'expected_from' => $from, 'expected_until' => $until, 'terms' => $terms ? implode(' ', array_keys($terms)) : null];
    }

    /** Is the offer's campaign still to open for this person (so the item is "coming soon" rather than out)? */
    private function comingSoon(PreorderOffer $o, ?User $user): bool
    {
        $c = $o->campaign;
        if (! $o->is_active || ! $c || ! CampaignAudience::allows($user, $c->audience_rule) || ($o->closes_at && now()->gte($o->closes_at))) {
            return false;
        }

        return in_array($this->campaignStatus($c, $user)[0], ['scheduled', 'teaser'], true);
    }

    private function componentNames(array $variantIds): array
    {
        return ProductVariant::with('product:id,name')->whereIn('id', $variantIds)->get()->map(fn ($v) => $v->product?->name . ($v->name && $v->name !== $v->product?->name ? " ({$v->name})" : ''))->values()->all();
    }

    /**
     * For the campaign editor: every component of a hamper the campaign features, with what is in stock at the hamper's branch and what covers a shortfall.
     * @return array{components: array<int, array>, state: string}
     */
    public function hamperReadiness(Campaign $c, Hamper $h): array
    {
        $loc = (int) $h->location_id;
        $needs = $this->hamperNeeds((int) $h->id);
        $variants = ProductVariant::with('product:id,name')->whereIn('id', array_keys($needs))->get()->keyBy('id');
        $offers = self::ready() ? PreorderOffer::where('campaign_id', $c->id)->whereIn('variant_id', array_keys($needs))->get()->keyBy('variant_id') : collect();
        $rows = [];
        foreach ($needs as $vid => $q) {
            $v = $variants[$vid] ?? null;
            $buyable = $loc ? $this->buyable($vid, $loc) : 0.0;
            $o = $offers[$vid] ?? null;
            $rows[] = ['variant_id' => $vid, 'item' => $v?->product?->name, 'option' => $v && $v->name && $v->name !== $v->product?->name ? $v->name : null, 'per_hamper' => $q, 'buyable' => $buyable,
                'covered' => $buyable + 0.00005 >= $q ? 'stock' : ($o && $o->is_active && $this->enabledAt($vid, $loc) ? 'offer' : 'none'), 'offer_id' => $o?->id];
        }

        return ['components' => $rows, 'state' => in_array('none', array_column($rows, 'covered'), true) ? 'out' : (in_array('offer', array_column($rows, 'covered'), true) ? 'preorder' : 'buy')];
    }

    // ------------------------------------------------------------ placing

    /** The one active variant of a product when the cart did not say which. */
    private function variantOf(array $line): ProductVariant
    {
        if (! empty($line['variant_id'])) {
            return ProductVariant::findOrFail((int) $line['variant_id']);
        }
        $all = ProductVariant::where('product_id', (int) ($line['product_id'] ?? 0))->where('status', ProductVariant::STATUS_ACTIVE)->get();
        if ($all->count() !== 1) {
            throw new BooksException('Choose an option before you check out.');
        }

        return $all->first();
    }

    /**
     * Check a cart of preorder lines can be taken: the Campaigns module is on, every item has an offer open to this person at this branch,
     * it is not in stock now, and the places are there. With $lock (inside a transaction) the offers are locked first so two customers can not take the last place.
     *
     * A line may carry its own `location_id` (a hamper's components come from the hamper's branch) and, for a hamper's component, `lenient` + `hamper_ids`:
     * what is already in stock is then set aside without an offer, and an offer is only needed (and only counts) when a live campaign features that hamper.
     *
     * @param  array<int, array{product_id?: int, variant_id?: int, quantity: float, variant_unit_id?: mixed, location_id?: int, lenient?: bool, hamper_ids?: int[]}>  $lines
     * @return array<string, array{variant_id: int, location_id: int, quantity: float, offer: ?PreorderOffer, lenient: bool, hamper_ids: int[]}> by "variant@branch"
     */
    public function assertPlaceable(array $lines, int $locationId, ?User $user, bool $lock = false): array
    {
        if (! self::ready()) {
            throw new BooksException('Preorders are not set up yet.');
        }
        if (! $this->licensed()) {
            throw new BooksException('Preorders are not available right now.');
        }
        if (! $lines) {
            throw new BooksException('Your cart is empty.');
        }
        $want = [];
        foreach ($lines as $l) {
            if (! empty($l['variant_unit_id'])) {
                throw new BooksException('Preorders are taken in the item\'s main unit.');
            }
            $v = $this->variantOf($l);
            $loc = (int) ($l['location_id'] ?? $locationId);
            $k = $v->id . '@' . $loc;
            $w = $want[$k] ?? ['variant_id' => (int) $v->id, 'location_id' => $loc, 'quantity' => 0.0, 'offer' => null, 'lenient' => true, 'hamper_ids' => []];
            $w['quantity'] += (float) ($l['quantity'] ?? 1);
            $w['lenient'] = $w['lenient'] && ! empty($l['lenient']);
            $w['hamper_ids'] = array_values(array_unique(array_merge($w['hamper_ids'], array_map('intval', $l['hamper_ids'] ?? []))));
            $want[$k] = $w;
        }
        $name = fn (int $variantId) => Product::whereKey(ProductVariant::whereKey($variantId)->value('product_id'))->value('name') ?? 'That item';
        $why = fn (array $w, string $what) => $w['hamper_ids']
            ? (Hamper::whereIn('id', $w['hamper_ids'])->value('name') ?? 'That hamper') . " can't be preordered right now: {$name($w['variant_id'])} {$what}"
            : "{$name($w['variant_id'])} can't be preordered here right now.";

        foreach ($want as $k => $w) {
            // a line that is all hamper components and already in stock needs no offer: it is only set aside
            if ($w['lenient'] && $this->buyable($w['variant_id'], $w['location_id']) + 0.00005 >= $w['quantity']) {
                continue;
            }
            $offers = PreorderOffer::with('campaign')->where('variant_id', $w['variant_id'])->get();
            if ($w['lenient']) {
                $featuring = CampaignItem::whereIn('item_id', $w['hamper_ids'])->where('item_type', 'hamper')->pluck('campaign_id')->all();
                $offers = $offers->filter(fn ($o) => in_array($o->campaign_id, $featuring, true));
            }
            $offer = $this->enabledAt($w['variant_id'], $w['location_id']) ? $offers->first(fn ($o) => $this->isOpen($o, $user)) : null;
            if (! $offer) {
                throw new BooksException($why($w, 'has no open preorder offer in a campaign that features it.'));
            }
            $want[$k]['offer'] = $offer;
        }
        if ($lock) {
            PreorderOffer::whereIn('id', collect($want)->pluck('offer.id')->filter())->lockForUpdate()->get();
        }
        foreach ($want as $w) {
            $offer = $w['offer'];
            if (! $offer) {
                continue;
            }
            if (! $w['lenient'] && $this->buyable($w['variant_id'], $w['location_id']) + 0.00005 >= $w['quantity']) {
                throw new BooksException("{$name($w['variant_id'])} is in stock now. Order it in the normal cart.");
            }
            $left = $this->remaining($offer);
            if ($left !== null && $w['quantity'] - $left > 0.00005) {
                $n = (int) floor($left);
                throw new BooksException($left > 0 ? "Only {$n} place" . ($n === 1 ? '' : 's') . " left for {$name($w['variant_id'])}." : "No places are left for {$name($w['variant_id'])}.");
            }
        }

        return $want;
    }

    /** The Sales Order numbering series for preorders (PRE-), or null before script 103. */
    public function seriesId(): ?int
    {
        if (! self::ready()) {
            return null;
        }
        $type = VoucherType::byBase(VoucherType::SALES_ORDER);

        return $type ? VoucherSeries::where('voucher_type_id', $type->id)->where('name', self::SERIES)->where('is_active', true)->value('id') : null;
    }

    /** What the Sales Order is told so it is a preorder: its series and the flag its sale inherits. */
    public function orderMeta(array $placeable): array
    {
        $campaigns = collect($placeable)->map(fn ($p) => $p['offer']?->campaign_id)->filter()->unique()->values()->all();

        return ['preorder' => ['campaign_ids' => $campaigns]];
    }

    /** The variants an order's placeable lines touch (their buyable figures move). */
    public static function variantsOf(array $placeable): array
    {
        return array_values(array_unique(array_map(fn ($p) => (int) $p['variant_id'], $placeable)));
    }

    /** After the order is made: remember which offer and promised date each variant was taken under (offer 0: stock set aside inside a hamper, no offer), and refresh the figures the shop reads. */
    public function record(Voucher $order, array $placeable, int $locationId): void
    {
        foreach ($placeable as $p) {
            $o = $p['offer'];
            PreorderLine::create(['voucher_id' => $order->id, 'offer_id' => $o?->id ?? 0, 'variant_id' => $p['variant_id'], 'location_id' => $p['location_id'] ?? $locationId,
                'promised_date' => $o ? ($o->expected_until ?? $o->expected_from) : null, 'created_at' => now()]);
        }
        $this->refresh(self::variantsOf($placeable));
    }

    /** A voucher in a preorder's family was made, changed or cancelled: the buyable figures of its items move. */
    public function touched(Voucher $voucher): void
    {
        if (empty($voucher->meta['preorder']) || ! self::ready()) {
            return;
        }
        $ids = DB::table('voucher_items')->where('voucher_id', $voucher->id)->whereNotNull('variant_id')->pluck('variant_id')->unique()->map(fn ($x) => (int) $x)->all();
        $this->refresh($ids);
    }

    public function refresh(array $variantIds): void
    {
        $stock = app(\App\Services\Location\VariantStockService::class);
        foreach (ProductVariant::whereIn('id', $variantIds)->get()->pluck('product_id')->unique() as $productId) {
            if ($p = Product::find($productId)) {
                $stock->recomputeCaches($p);
            }
        }
    }

    // ------------------------------------------------------------ fulfilment

    /**
     * The "Preorders waiting" list: every preorder line still owed, oldest first, paid or not, with what could fill it.
     * Per variant and branch: stock there now, stock on its way there, stock at other branches, and what open purchase orders will bring.
     */
    public function waiting(?int $locationId = null): array
    {
        $owed = $this->owed(null, $locationId);
        if (! $owed) {
            return ['lines' => [], 'supply' => [], 'paid_not_delivered' => ['lines' => 0, 'value' => 0.0]];
        }
        $orders = Voucher::with('customer:id,first_name,last_name,email')->whereIn('id', array_unique(array_column($owed, 'order_id')))->get()->keyBy('id');
        $sales = $this->salesOf(array_unique(array_column($owed, 'order_id')));
        $variants = ProductVariant::with('product:id,name')->whereIn('id', array_unique(array_column($owed, 'variant_id')))->get()->keyBy('id');
        $promised = PreorderLine::whereIn('voucher_id', array_keys($orders->all()))->get()->groupBy('voucher_id');
        $branch = Location::pluck('name', 'id');
        $items = DB::table('voucher_items')->whereIn('id', array_column($owed, 'item_id'))->get(['id', 'quantity', 'unit_factor'])->keyBy('id');

        $lines = [];
        foreach ($owed as $r) {
            $o = $orders[$r['order_id']] ?? null;
            $v = $variants[$r['variant_id']] ?? null;
            $line = $promised[$r['order_id']]?->firstWhere('variant_id', $r['variant_id']);
            $c = $o?->customer;
            $lines[] = [
                'order_id' => $r['order_id'], 'order_number' => $o?->voucher_number, 'sale_id' => $sales[$r['order_id']]['id'] ?? null, 'sale_number' => $sales[$r['order_id']]['number'] ?? null,
                'payment' => $sales[$r['order_id']]['kind'] ?? 'unpaid', 'date' => $o?->date?->toDateString(), 'customer' => $c ? trim($c->first_name . ' ' . $c->last_name) : ($o?->party_name ?: null),
                'variant_id' => $r['variant_id'], 'item' => $v?->product?->name, 'option' => $v && $v->name && $v->name !== $v->product?->name ? $v->name : null, 'sku' => $v?->sku,
                'location_id' => $r['location_id'], 'branch' => $branch[$r['location_id']] ?? null, 'ordered' => round((float) ($items[$r['item_id']]->quantity ?? 0) * (float) ($items[$r['item_id']]->unit_factor ?? 1), 4),
                'owed' => $r['qty'], 'promised' => $line?->promised_date?->toDateString(), 'item_id' => $r['item_id'],
            ];
        }
        usort($lines, fn ($a, $b) => [$a['date'], $a['order_id']] <=> [$b['date'], $b['order_id']]);

        $supply = [];
        foreach (array_unique(array_map(fn ($r) => $r['variant_id'] . ':' . $r['location_id'], $owed)) as $key) {
            [$vid, $loc] = array_map('intval', explode(':', $key));
            $supply[$key] = $this->supplyFor($vid, $loc);
        }

        return ['lines' => $lines, 'supply' => $supply, 'paid_not_delivered' => $this->paidNotDelivered($locationId)];
    }

    /** What could fill a branch's preorders for a variant. */
    public function supplyFor(int $variantId, int $locationId): array
    {
        $names = Location::pluck('name', 'id');
        $here = $this->physicalAt($variantId, $locationId);
        $elsewhere = VariantLocationStock::where('product_variant_id', $variantId)->where('location_id', '!=', $locationId)->where('quantity', '>', 0)->get(['location_id', 'quantity'])
            ->map(fn ($r) => ['location_id' => (int) $r->location_id, 'branch' => $names[$r->location_id] ?? null, 'quantity' => (float) $r->quantity])->values()->all();
        $inTransit = \Illuminate\Support\Facades\Schema::hasTable('stock_transfer_lines')
            ? (float) DB::table('stock_transfer_lines as l')->join('stock_transfers as t', 't.id', '=', 'l.transfer_id')->where('t.status', 'in_transit')->where('t.to_location_id', $locationId)->where('l.variant_id', $variantId)->sum('l.quantity')
            : 0.0;
        $planned = (float) DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('t.base_type', VoucherType::PURCHASE_ORDER)->where('v.status', Voucher::POSTED)->where('i.variant_id', $variantId)->where('v.location_id', $locationId)
            ->selectRaw('COALESCE(SUM((i.quantity - i.delivered_quantity) * i.unit_factor), 0) AS q')->value('q');

        return ['stock_here' => round($here, 4), 'committed' => $this->committed($variantId, $locationId), 'in_transit_here' => round($inTransit, 4), 'elsewhere' => $elsewhere, 'planned' => round(max(0.0, $planned), 4)];
    }

    /**
     * Make delivery notes for what stock allows: per variant at a branch, the stock there is shared out over the paid (or invoiced) preorders
     * that owe it, oldest first, whole lines first and the last one in part. One delivery note per order. Unpaid orders are never delivered.
     *
     * @return array{made: array<int, array{order: ?string, delivery: ?string, quantity: float}>, failed: array<int, array{order: ?string, message: string}>}
     */
    public function deliverReady(?int $locationId, ?int $variantId, ?User $user): array
    {
        $owed = $this->owed($variantId, $locationId);
        $sales = $this->salesOf(array_unique(array_column($owed, 'order_id')));
        $owed = array_values(array_filter($owed, fn ($r) => isset($sales[$r['order_id']])));
        $dates = Voucher::whereIn('id', array_unique(array_column($owed, 'order_id')))->pluck('date', 'id');
        usort($owed, fn ($a, $b) => [(string) ($dates[$a['order_id']] ?? ''), $a['order_id']] <=> [(string) ($dates[$b['order_id']] ?? ''), $b['order_id']]);

        $room = [];   // variant:branch => stock still to share out
        $take = [];   // order => [item_id => selling-unit quantity]
        $items = DB::table('voucher_items')->whereIn('id', array_column($owed, 'item_id'))->get(['id', 'unit_factor'])->keyBy('id');
        foreach ($owed as $r) {
            $k = $r['variant_id'] . ':' . $r['location_id'];
            $room[$k] ??= $this->physicalAt($r['variant_id'], $r['location_id']);
            $give = min($room[$k], $r['qty']);
            if ($give <= 0.00005) {
                continue;
            }
            $room[$k] = round($room[$k] - $give, 4);
            $take[$r['order_id']][$r['item_id']] = round($give / max(0.0001, (float) $items[$r['item_id']]->unit_factor), 4);
        }

        $made = [];
        $failed = [];
        $vouchers = app(\App\Services\Books\VoucherService::class);
        foreach ($take as $orderId => $lines) {
            $order = Voucher::find($orderId);
            try {
                $dn = $vouchers->convert($order, VoucherType::DELIVERY_NOTE, ['lines' => $lines], $user);
                $made[] = ['order' => $order->voucher_number, 'delivery' => $dn->voucher_number, 'quantity' => round(array_sum($lines), 4)];
            } catch (\Throwable $e) {
                $failed[] = ['order' => $order->voucher_number, 'message' => $e->getMessage()];
            }
        }
        $this->refresh(array_unique(array_column($owed, 'variant_id')));

        return ['made' => $made, 'failed' => $failed];
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use App\Models\Customer;
use App\Models\Location;
use App\Models\PreorderOffer;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\VariantLocationStock;
use App\Services\Books\BooksException;
use App\Services\Campaigns\CampaignAccess;
use App\Services\Preorders\PreorderService;
use App\Services\Stock\StockTransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Preorders, staff side: a campaign's offers, the per-branch switch, the "Preorders waiting" list and its actions, and preorders taken at the counter. */
class PreorderController extends Controller
{
    public function __construct(private PreorderService $preorders) {}

    private function guard(callable $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function offerRow(PreorderOffer $o, array $taken): array
    {
        $v = $o->variant;
        $left = $o->limit_total === null ? null : max(0, (int) floor($o->limit_total - ($taken[$o->id] ?? 0)));

        return ['id' => $o->id, 'campaign_id' => $o->campaign_id, 'product_id' => $o->product_id, 'variant_id' => $o->variant_id, 'item' => $v?->product?->name ?? Product::whereKey($o->product_id)->value('name'),
            'option' => $v && $v->name && $v->name !== $v->product?->name ? $v->name : null, 'sku' => $v?->sku, 'limit_total' => $o->limit_total, 'taken' => round($taken[$o->id] ?? 0, 4), 'places_left' => $left,
            'closes_at' => $o->closes_at?->format('Y-m-d\TH:i'), 'expected_from' => $o->expected_from?->toDateString(), 'expected_until' => $o->expected_until?->toDateString(), 'terms' => $o->terms, 'is_active' => $o->is_active,
            'branches' => VariantLocationStock::where('product_variant_id', $o->variant_id)->where('preorder_enabled', true)->pluck('location_id')];
    }

    // -------------------------------------------------------------- offers (a campaign's)

    /** GET /admin/campaigns/{id}/preorder-offers */
    public function offers(Request $request, int $id): JsonResponse
    {
        abort_unless(CampaignAccess::canBuild($request->user()), 403, 'You cannot work on campaigns.');
        Campaign::findOrFail($id);
        if (! PreorderService::ready()) {
            return response()->json(['ready' => false, 'data' => []]);
        }
        $offers = PreorderOffer::with('variant.product:id,name')->where('campaign_id', $id)->orderBy('id')->get();
        $taken = $this->preorders->takenByOffer($offers->pluck('id')->all());

        return response()->json(['ready' => true, 'data' => $offers->map(fn ($o) => $this->offerRow($o, $taken))->values(),
            'branches' => Location::query()->sellsToCustomers()->orderBy('name')->get(['id', 'name'])]);
    }

    private function offerRules(): array
    {
        return ['variant_id' => 'required|integer|exists:product_variants,id', 'limit_total' => 'nullable|integer|min:1', 'closes_at' => 'nullable|date', 'expected_from' => 'nullable|date',
            'expected_until' => 'nullable|date', 'terms' => 'nullable|string|max:500', 'is_active' => 'nullable|boolean'];
    }

    /** GET /admin/campaigns/preorder-variants?product_id= : the variants of a product an offer can be made on. */
    public function variants(Request $request): JsonResponse
    {
        abort_unless(CampaignAccess::canBuild($request->user()), 403, 'You cannot work on campaigns.');
        $d = $request->validate(['product_id' => 'required|integer|exists:products,id']);

        return response()->json(['data' => ProductVariant::where('product_id', $d['product_id'])->where('status', ProductVariant::STATUS_ACTIVE)->orderByDesc('is_default')->orderBy('id')->get(['id', 'name', 'sku', 'is_default'])]);
    }

    /** POST /admin/campaigns/{id}/preorder-offers */
    public function saveOffer(Request $request, int $id): JsonResponse
    {
        $c = Campaign::findOrFail($id);
        abort_unless(CampaignAccess::canEdit($request->user(), $c), 403, 'You cannot change this campaign.');
        $d = $request->validate($this->offerRules());

        return $this->guard(function () use ($c, $d, $request) {
            $o = $this->preorders->saveOffer($c, $d, $request->user());

            return response()->json(['message' => 'Offer saved.', 'data' => $this->offerRow($o->load('variant.product:id,name'), $this->preorders->takenByOffer([$o->id]))], 201);
        });
    }

    /** PUT /admin/campaigns/{id}/preorder-offers/{offerId} */
    public function updateOffer(Request $request, int $id, int $offerId): JsonResponse
    {
        $c = Campaign::findOrFail($id);
        abort_unless(CampaignAccess::canEdit($request->user(), $c), 403, 'You cannot change this campaign.');
        $offer = PreorderOffer::where('campaign_id', $id)->findOrFail($offerId);
        $d = $request->validate(['variant_id' => 'nullable|integer'] + array_diff_key($this->offerRules(), ['variant_id' => 1]));

        return $this->guard(function () use ($c, $d, $request, $offer) {
            $o = $this->preorders->saveOffer($c, $d + ['variant_id' => $offer->variant_id], $request->user(), $offer);

            return response()->json(['message' => 'Offer saved.', 'data' => $this->offerRow($o->load('variant.product:id,name'), $this->preorders->takenByOffer([$o->id]))]);
        });
    }

    /** DELETE /admin/campaigns/{id}/preorder-offers/{offerId} */
    public function deleteOffer(Request $request, int $id, int $offerId): JsonResponse
    {
        $c = Campaign::findOrFail($id);
        abort_unless(CampaignAccess::canEdit($request->user(), $c), 403, 'You cannot change this campaign.');
        $offer = PreorderOffer::where('campaign_id', $id)->findOrFail($offerId);

        return $this->guard(function () use ($offer) {
            $this->preorders->deleteOffer($offer);

            return response()->json(['message' => 'Offer removed.']);
        });
    }

    // -------------------------------------------------------------- the branch switch

    /** GET /admin/preorders/branches?variant_id= : each branch that sells to customers, whether it takes preorders for this variant, and its stock. */
    public function branches(Request $request): JsonResponse
    {
        $d = $request->validate(['variant_id' => 'required|integer|exists:product_variants,id']);
        $rows = VariantLocationStock::where('product_variant_id', $d['variant_id'])->get()->keyBy('location_id');

        return response()->json(['ready' => PreorderService::ready(), 'data' => Location::query()->sellsToCustomers()->orderBy('name')->get(['id', 'name'])->map(fn ($l) => [
            'location_id' => $l->id, 'branch' => $l->name, 'quantity' => (float) ($rows[$l->id]->quantity ?? 0), 'preorder_enabled' => (bool) ($rows[$l->id]->preorder_enabled ?? false)])->values()]);
    }

    /** PUT /admin/preorders/branch-flag {variant_id, location_id, enabled} */
    public function setBranchFlag(Request $request): JsonResponse
    {
        $d = $request->validate(['variant_id' => 'required|integer|exists:product_variants,id', 'location_id' => 'required|integer|exists:locations,id', 'enabled' => 'required|boolean']);

        return $this->guard(function () use ($d) {
            $this->preorders->setBranchFlag((int) $d['variant_id'], (int) $d['location_id'], (bool) $d['enabled']);

            return response()->json(['message' => $d['enabled'] ? 'This branch now takes preorders for it.' : 'This branch no longer takes new preorders for it.']);
        });
    }

    // -------------------------------------------------------------- waiting

    /** GET /admin/preorders/waiting?location_id= */
    public function waiting(Request $request): JsonResponse
    {
        if (! PreorderService::ready()) {
            return response()->json(['ready' => false, 'lines' => [], 'supply' => (object) [], 'paid_not_delivered' => ['lines' => 0, 'value' => 0]]);
        }
        $loc = $request->filled('location_id') ? (int) $request->location_id : null;
        $w = $this->preorders->waiting($loc);

        return response()->json(['ready' => true, 'lines' => $w['lines'], 'supply' => (object) $w['supply'], 'paid_not_delivered' => $w['paid_not_delivered'],
            'branches' => Location::query()->sellsToCustomers()->orderBy('name')->get(['id', 'name'])]);
    }

    /** POST /admin/preorders/deliver {location_id?, variant_id?}: delivery notes for what stock allows. */
    public function deliver(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'nullable|integer|exists:locations,id', 'variant_id' => 'nullable|integer|exists:product_variants,id']);

        return $this->guard(function () use ($d, $request) {
            $r = $this->preorders->deliverReady($d['location_id'] ?? null, $d['variant_id'] ?? null, $request->user());
            $n = count($r['made']);

            return response()->json(['message' => $n ? "{$n} delivery note" . ($n === 1 ? '' : 's') . ' made.' : 'Nothing could be delivered yet.'] + $r);
        });
    }

    /** POST /admin/preorders/send {from_location_id, to_location_id, variant_id, quantity}: an ordinary stock transfer filled in for the preorders waiting. */
    public function send(Request $request): JsonResponse
    {
        $d = $request->validate(['from_location_id' => 'required|integer|exists:locations,id', 'to_location_id' => 'required|integer|exists:locations,id|different:from_location_id',
            'variant_id' => 'required|integer|exists:product_variants,id', 'quantity' => 'required|numeric|min:0.0001']);

        return $this->guard(function () use ($d, $request) {
            $t = app(StockTransferService::class)->send((int) $d['from_location_id'], (int) $d['to_location_id'], [['variant_id' => (int) $d['variant_id'], 'quantity' => (float) $d['quantity']]], 'For preorders waiting', $request->user());

            return response()->json(['message' => "Transfer {$t->number} is on its way.", 'data' => ['id' => $t->id, 'number' => $t->number]], 201);
        });
    }

    // -------------------------------------------------------------- the shop window (public)

    /**
     * GET /preorders/states?variant_ids[]=&location_id= : for each variant at the branch, what this visitor sees: buy, preorder, coming_soon or out,
     * with the open offer (places left, expected dates, terms) when there is one.
     */
    public function states(Request $request): JsonResponse
    {
        $d = $request->validate(['variant_ids' => 'nullable|array|max:60', 'variant_ids.*' => 'integer', 'product_ids' => 'nullable|array|max:60', 'product_ids.*' => 'integer', 'location_id' => 'nullable|integer']);
        $loc = ! empty($d['location_id']) ? (int) $d['location_id'] : (Location::defaultSelling()?->id ?? Location::default()?->id);
        $user = $request->user('sanctum');
        $out = [];
        foreach (array_unique($d['variant_ids'] ?? []) as $vid) {
            $out[$vid] = $loc ? $this->preorders->stateFor((int) $vid, (int) $loc, $user) : ['state' => 'out', 'buyable' => 0, 'offer' => null];
        }
        $byProduct = [];
        if ($loc && ! empty($d['product_ids'])) {
            // a product card: the best its options can offer (preorder, then coming soon), for products with no stock to sell
            $rank = ['preorder' => 3, 'buy' => 4, 'coming_soon' => 2, 'out' => 1];
            foreach (ProductVariant::whereIn('product_id', array_unique($d['product_ids']))->where('status', ProductVariant::STATUS_ACTIVE)->get(['id', 'product_id']) as $v) {
                $st = $this->preorders->stateFor((int) $v->id, (int) $loc, $user) + ['variant_id' => (int) $v->id];
                if (! isset($byProduct[$v->product_id]) || $rank[$st['state']] > $rank[$byProduct[$v->product_id]['state']]) {
                    $byProduct[$v->product_id] = $st;
                }
            }
        }

        return response()->json(['location_id' => $loc, 'data' => (object) $out, 'products' => (object) $byProduct]);
    }

    // -------------------------------------------------------------- the counter

    /**
     * POST /admin/preorders/counter {location_id, customer_id?, party_name?, party_phone?, items:[{variant_id, quantity}], pay: sale|invoice|none, payment_method_id?}
     * Staff take a preorder for someone in the shop: the same PRE- order, then (pay=sale) a Cash Sale taken in full, or (pay=invoice) an Invoice on account for a customer on credit terms.
     */
    public function counter(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'required|integer|exists:locations,id', 'customer_id' => 'nullable|integer|exists:customers,id', 'party_name' => 'nullable|string|max:160', 'party_phone' => 'nullable|string|max:40',
            'items' => 'required|array|min:1', 'items.*.variant_id' => 'required|integer|exists:product_variants,id', 'items.*.quantity' => 'required|numeric|min:0.01',
            'pay' => 'required|in:sale,invoice,none', 'payment_method_id' => 'required_if:pay,sale|nullable|integer|exists:payment_methods,id', 'narration' => 'nullable|string|max:500']);

        return $this->guard(function () use ($d, $request) {
            $v = app(\App\Services\Preorders\CounterPreorder::class)->take($d, $request->user());

            return response()->json(['message' => 'Preorder ' . $v['order']->voucher_number . ' taken.', 'data' => ['order_id' => $v['order']->id, 'order_number' => $v['order']->voucher_number, 'sale_id' => $v['sale']?->id, 'sale_number' => $v['sale']?->voucher_number]], 201);
        });
    }

    /** GET /admin/preorders/open?location_id= : what could be preordered at the counter right now. */
    public function open(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'required|integer|exists:locations,id']);

        return response()->json(['ready' => PreorderService::ready(), 'data' => $this->preorders->openAt((int) $d['location_id'], $request->user())]);
    }

    /** GET /admin/preorders/customers?search= : a few customers for the counter form. */
    public function customers(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('search', ''));
        $rows = Customer::query()->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('first_name', 'like', "%{$q}%")->orWhere('last_name', 'like', "%{$q}%")->orWhere('email', 'like', "%{$q}%")->orWhere('phone', 'like', "%{$q}%")))
            ->orderBy('first_name')->limit(15)->get(['id', 'first_name', 'last_name', 'email', 'phone', 'has_credit_account']);

        return response()->json(['data' => $rows->map(fn ($c) => ['id' => $c->id, 'name' => trim($c->first_name . ' ' . $c->last_name), 'email' => $c->email, 'phone' => $c->phone, 'on_account' => (bool) $c->has_credit_account])]);
    }
}

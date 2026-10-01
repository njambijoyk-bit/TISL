<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Auction;
use App\Models\AuctionBid;
use App\Models\AuctionOrderActivityLog;
use App\Services\AuctionActivityService;
use App\Services\Location\VariantStockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class AuctionController extends Controller
{
    public function __construct(
        private AuctionActivityService $orderService
    ) {}

    // =========================================================================
    // ADMIN — AUCTION CRUD (existing, unchanged)
    // =========================================================================

    public function adminIndex(Request $request)
    {
        $query = Auction::with(['product.brand', 'product.category', 'variant:id,name,sku', 'location:id,name,code', 'seller', 'winner', 'currency:id,code,symbol'])
            ->withCount('bids')
            ->when($request->status, fn($q, $status) => $q->where('status', $status))
            ->when($request->product_id, fn($q, $id) => $q->where('product_id', $id))
            ->when($request->search, function ($q, $search) {
                $q->whereHas('product', fn($qp) =>
                    $qp->where('name', 'like', "%{$search}%")
                        ->orWhere('sku', 'like', "%{$search}%")
                );
            })
            ->orderBy($request->sort_by ?? 'end_time', $request->sort_dir ?? 'asc');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    public function adminShow($id)
    {
        $auction = Auction::with([
            'product.brand', 'product.category', 'variant:id,name,sku', 'location:id,name,code', 'seller', 'winner', 'currency:id,code,symbol',
            'bids' => fn($q) => $q->orderByDesc('amount')->with('bidder:id,name,email'),
        ])->findOrFail($id);

        return response()->json([
            'auction' => $auction,
            'charges' => $auction->charges()->with('ledger:id,name,settings,tax_nature')->get(),
            'product' => $auction->product,
            'bids'    => $auction->bids,
            'stats'   => [
                'total_bids'     => $auction->bids->count(),
                'unique_bidders' => $auction->bids->pluck('bidder_id')->unique()->count(),
                'highest_bid'    => $auction->bids->max('amount'),
                'lowest_bid'     => $auction->bids->min('amount'),
            ],
        ]);
    }

    /** The charge accounts an auction can pick from, with how each is worked out. */
    public function chargeOptions(Request $request)
    {
        $target = $request->filled('currency_id') ? \App\Models\Currency::find($request->currency_id) : null;
        $svc = app(\App\Services\Books\AuctionChargeService::class);

        return response()->json($svc->ledgers()->map(fn ($l) => ['ledger' => $l->only(['id', 'name', 'tax_nature']), 'tax_rate' => $l->taxRateLedger?->only(['id', 'name', 'rate_value']), 'kinds' => $svc::KINDS] + $svc->rowFromLedger($l, $target ?? \App\Models\Currency::find($l->currency_id) ?? app(\App\Services\CurrencyConversionService::class)->getBaseCurrency()) + ['charge_kind' => ($l->settings ?? [])['charge_kind'] ?? 'other', 'default_on' => (bool) (($l->settings ?? [])['default_on'] ?? false), 'tax_follows' => ($l->settings ?? [])['tax_follows'] ?? 'own'])->values());
    }

    /** What a winner would owe at a given winning bid — public, so bidders see the full cost before they bid. */
    public function publicQuote(Request $request, $id)
    {
        $auction = Auction::findOrFail($id);
        $bid = max((float) $request->query('bid', $auction->current_price), (float) $auction->start_price);
        try {
            return response()->json(app(\App\Services\Books\AuctionChargeService::class)->quote($auction, $bid, 0, $request->user()?->customer));
        } catch (\App\Services\Books\BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /** A bidder's registration state and what registering costs. */
    public function registration(Request $request, Auction $auction)
    {
        $svc = app(\App\Services\Books\AuctionRegistrationService::class);
        $customer = $request->user()?->customer;
        $reg = $customer ? $svc->forCustomer($auction, $customer) : null;

        return response()->json([
            'required' => $svc->required($auction),
            'upfront' => app(\App\Services\Books\AuctionChargeService::class)->quote($auction, (float) $auction->start_price, 0, $customer)['upfront'],
            'registration' => $reg ? ['status' => $reg->status, 'order_id' => $reg->order_voucher_id, 'entry_amount' => $reg->entry_amount, 'deposit_amount' => $reg->deposit_amount, 'deposit_status' => $reg->deposit_status] : null,
            'can_bid' => $svc->blockReason($auction, $customer) === null,
            'terms' => app(\App\Services\AuctionTermsService::class)->status($customer),
        ]);
    }

    public function register(Request $request, Auction $auction)
    {
        $customer = $request->user()?->customer;
        if (! $customer) {
            return response()->json(['message' => 'Only customers can register to bid.'], 403);
        }
        try {
            app(\App\Services\AuctionTermsService::class)->enforce($customer, $request->all(), $auction);
            $reg = app(\App\Services\Books\AuctionRegistrationService::class)->register($auction, $customer, $request->user());
        } catch (\App\Services\Books\BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => 'Registered — pay the registration in My orders to start bidding.', 'registration' => $reg], 201);
    }

    /** Admin: who registered, what they paid, and where their deposit is. */
    public function registrations(Auction $auction)
    {
        $svc = app(\App\Services\Books\AuctionRegistrationService::class);

        return response()->json($auction->registrations()->with('customer:id,first_name,last_name,email')->get()->map(fn ($r) => $svc->refresh($r)));
    }

    public function releaseDeposits(Request $request, Auction $auction)
    {
        try {
            $n = app(\App\Services\Books\AuctionRegistrationService::class)->releaseDeposits($auction, $request->user());
        } catch (\App\Services\Books\BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['message' => $n ? "{$n} deposit(s) released to the bidders' accounts" : 'No paid deposits were waiting to be released.', 'released' => $n]);
    }

    /** What a winner would owe at a given winning bid (admin preview). */
    public function chargeQuote(Request $request, Auction $auction)
    {
        $bid = (float) $request->query('bid', $auction->current_price);
        try {
            return response()->json(app(\App\Services\Books\AuctionChargeService::class)->quote($auction, $bid, (int) $request->query('days', 0)));
        } catch (\App\Services\Books\BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function store(Request $request)
    {
        if ($r = \App\Services\Books\TradingAccounts::check($request)) {
            return $r;
        }
        $validator = Validator::make($request->all(), [
            'product_id'    => 'required|exists:products,id',
            'variant_id'    => 'nullable|exists:product_variants,id',
            'location_id'   => 'required|integer|exists:locations,id,is_active,1',
            'currency_id'   => 'nullable|exists:currencies,id,is_active,1',
            'start_price'   => 'required|numeric|min:0',
            'reserve_price' => 'nullable|numeric|min:0',
            // any positive step: "10" means little in USD and a lot in JPY
            'bid_increment' => 'required|numeric|gt:0',
            'start_time'    => 'nullable|date',
            'end_time'      => 'required|date|after:start_time',
            'max_winners'   => 'nullable|integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $hasActive = Auction::where('product_id', $request->product_id)
            ->whereIn('status', ['active', 'scheduled'])
            ->exists();

        if ($hasActive) {
            return response()->json(['message' => 'Product already has an active or scheduled auction.'], 422);
        }

        // The auctioned item is a variant, and it must be stocked at the auction's branch.
        $stock = app(VariantStockService::class);
        $variantId = $request->variant_id ?: $stock->defaultVariantId((int) $request->product_id);
        if (! $variantId) {
            return response()->json(['message' => 'That product has no variant yet — give it stock first.'], 422);
        }
        if ($stockError = $this->variantStockError($variantId, (int) $request->product_id, (int) $request->location_id)) {
            return response()->json($stockError, 422);
        }

        $startTime = $request->start_time ?? now();
        $status    = strtotime($startTime) <= time() ? 'active' : 'scheduled';

        // Default to the product's own currency, then the base
        $currencyId = $request->currency_id
            ?: \App\Models\Product::whereKey($request->product_id)->value('currency_id')
            ?: app(\App\Services\CurrencyConversionService::class)->getBaseCurrency()->id;

        $auction = Auction::create([
            'sales_ledger_id' => $request->sales_ledger_id,
            'product_id'    => $request->product_id,
            'variant_id'    => $variantId,
            'location_id'   => $request->location_id,
            'seller_id'     => auth()->id(),
            'currency_id'   => $currencyId,
            'start_price'   => $request->start_price,
            'current_price' => $request->start_price,
            'reserve_price' => $request->reserve_price,
            'bid_increment' => $request->bid_increment,
            'start_time'    => $startTime,
            'end_time'      => $request->end_time,
            'status'        => $status,
            'max_winners'   => $request->max_winners ?? 1,
        ]);

        try {
            $charges = app(\App\Services\Books\AuctionChargeService::class);
            $request->has('charges') ? $charges->sync($auction, (array) $request->input('charges')) : $charges->attachDefaults($auction);
        } catch (\App\Services\Books\BooksException $e) {
            $auction->forceDelete();

            return response()->json(['message' => $e->getMessage(), 'errors' => ['charges' => [$e->getMessage()]]], 422);
        }

        return response()->json(['message' => 'Auction created successfully', 'auction' => $auction->load('currency:id,code,symbol', 'location:id,name,code', 'variant:id,name,sku')], 201);
    }

    public function update(Request $request, Auction $auction)
    {
        if ($r = \App\Services\Books\TradingAccounts::check($request, $auction)) {
            return $r;
        }
        $validator = Validator::make($request->all(), [
            'variant_id'    => 'nullable|exists:product_variants,id',
            'location_id'   => 'nullable|integer|exists:locations,id,is_active,1',
            'currency_id'   => 'nullable|exists:currencies,id,is_active,1',
            'start_price'   => 'nullable|numeric|min:0',
            'reserve_price' => 'nullable|numeric|min:0',
            'bid_increment' => 'nullable|numeric|gt:0',
            'start_time'    => 'nullable|date',
            'end_time'      => 'nullable|date|after_or_equal:start_time',
            'status'        => 'nullable|in:active,scheduled,ended,cancelled',
            'max_winners'   => 'nullable|integer|min:1',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Bids are amounts in the auction's currency — it can't change once anyone has bid.
        if ($request->filled('currency_id')
            && (int) $request->currency_id !== (int) $auction->currency_id
            && $auction->bids()->exists()) {
            return response()->json([
                'message' => 'The currency can\'t change once bids have been placed.',
            ], 422);
        }

        // Branch / variant can change until someone bids; the new pair must be in stock.
        $newVariant  = $request->filled('variant_id')  ? (int) $request->variant_id  : (int) $auction->variant_id;
        $newLocation = $request->filled('location_id') ? (int) $request->location_id : (int) $auction->location_id;
        if ($newVariant !== (int) $auction->variant_id || $newLocation !== (int) $auction->location_id) {
            if ($auction->bids()->exists()) {
                return response()->json(['message' => 'The branch and item can\'t change once bids have been placed.'], 422);
            }
            if ($stockError = $this->variantStockError($newVariant, (int) $auction->product_id, $newLocation)) {
                return response()->json($stockError, 422);
            }
        }

        if ($request->filled('status') && $request->status !== $auction->status) {   // the edit form sends the status as it is: only a real change needs checking
            $allowedTransitions = [
                'scheduled' => ['active', 'cancelled'],
                'active'    => ['ended', 'cancelled'],
                'ended'     => [],
                'cancelled' => [],
            ];
            $current = $auction->status;
            $new     = $request->status;
            if (!in_array($new, $allowedTransitions[$current] ?? [])) {
                return response()->json([
                    'message' => "Cannot change status from '{$current}' to '{$new}'",
                ], 422);
            }
        }

        $auction->update($request->only([
            'variant_id', 'location_id', 'currency_id', 'start_price', 'reserve_price', 'bid_increment',
            'start_time', 'end_time', 'status', 'max_winners', 'sales_ledger_id',
        ]));

        if ($request->has('charges')) {
            // bidders have bid knowing the charges, so they are fixed once bidding starts
            if ($auction->bids()->exists()) {
                return response()->json(['message' => 'The charges can\'t change once bids have been placed.', 'errors' => ['charges' => ['Charges are fixed once bidding has started.']]], 422);
            }
            try {
                app(\App\Services\Books\AuctionChargeService::class)->sync($auction, (array) $request->input('charges'));
            } catch (\App\Services\Books\BooksException $e) {
                return response()->json(['message' => $e->getMessage(), 'errors' => ['charges' => [$e->getMessage()]]], 422);
            }
        }

        if ($auction->status === 'active' && now()->gt($auction->end_time)) {
            $auction->update(['status' => 'ended']);
        }

        return response()->json([
            'message' => 'Auction updated successfully',
            'auction' => $auction->fresh('currency:id,code,symbol', 'location:id,name,code', 'variant:id,name,sku'),
        ]);
    }

    /**
     * Null when the variant belongs to the product and is stocked at the branch;
     * otherwise a 422 payload naming the problem (plus branches that do have it).
     */
    private function variantStockError(int $variantId, int $productId, int $locationId): ?array
    {
        $variant = \App\Models\ProductVariant::find($variantId);
        if (! $variant || (int) $variant->product_id !== $productId) {
            return ['message' => 'That variant does not belong to the auctioned product.'];
        }
        $a = app(VariantStockService::class)->availability($variantId, $locationId, 1);
        if ($a['ok']) {
            return null;
        }

        return [
            'message'      => ($a['location'] ?? 'That branch') . ' is out of stock for this item.',
            'available_at' => $a['elsewhere'],
        ];
    }

    public function destroy(Auction $auction)
    {
        if ($auction->bids()->exists()) {
            return response()->json([
                'message' => 'Cannot delete auction with existing bids. Use "cancel" status instead.',
            ], 422);
        }

        $auction->delete();

        return response()->json(['message' => 'Auction deleted successfully']);
    }

    public function trashed(Request $request)
    {
        $query = Auction::onlyTrashed()
            ->with(['product.brand', 'product.category', 'seller'])
            ->withCount('bids')
            ->when($request->search, function ($q, $search) {
                $q->whereHas('product', fn($qp) =>
                    $qp->where('name', 'like', "%{$search}%")
                        ->orWhere('sku', 'like', "%{$search}%")
                );
            })
            ->orderByDesc('deleted_at');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    public function restore($id)
    {
        $auction = Auction::onlyTrashed()->findOrFail($id);
        $auction->restore();

        return response()->json(['message' => 'Auction restored successfully']);
    }

    public function forceDestroy($id)
    {
        $auction = Auction::onlyTrashed()->findOrFail($id);
        $auction->bids()->forceDelete();
        $auction->forceDelete();

        return response()->json(['message' => 'Auction permanently deleted']);
    }

    // =========================================================================
    // PUBLIC — AUCTIONS
    // =========================================================================

    public function index(Request $request)
    {
        $query = Auction::with(['product.brand', 'product.category', 'variant:id,name,sku', 'location:id,name,code', 'currency:id,code,symbol'])
            ->where('status', $request->status ?? 'active')
            ->where('end_time', '>', now())
            ->orderBy('end_time', 'asc');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    public function show($id)
    {
        $auction = Auction::with(['product.brand', 'product.category', 'variant:id,name,sku', 'location:id,name,code', 'winner', 'currency:id,code,symbol'])->findOrFail($id);
        $topBids = $auction->bids()->with('bidder:id,name')->limit(10)->get();
 
        return response()->json([
            'auction'        => $auction,
            'product'        => $auction->product,
            'top_bids'       => $topBids,
            'bid_count'      => $auction->bids()->count(),
            'min_next_bid'   => $auction->current_price + $auction->bid_increment,
        ]);
    }

    // =========================================================================
    // PROTECTED — PLACE BID
    // =========================================================================

    public function placeBid(Request $request, Auction $auction)
    {
        if ($auction->status !== 'active' || now()->gt($auction->end_time)) {
            return response()->json(['message' => 'Auction is closed.'], 422);
        }

        try {
            app(\App\Services\AuctionTermsService::class)->enforce($request->user()?->customer, $request->all(), $auction);
        } catch (\App\Services\Books\BooksException $e) {
            return response()->json(['message' => $e->getMessage(), 'requires_terms' => true], 422);
        }
        if ($why = app(\App\Services\Books\AuctionRegistrationService::class)->blockReason($auction, $request->user()?->customer)) {
            return response()->json(['message' => $why, 'requires_registration' => true], 422);
        }

        $maxBid  = (float) $request->input('max_bid');
        $nextMin = $auction->current_price + $auction->bid_increment;

        if ($maxBid < $nextMin) {
            return response()->json([
                'message' => 'Minimum bid is ' . ($auction->currency?->code ?? 'KES') . ' ' . number_format($nextMin, 2),
                'min_bid' => $nextMin,
            ], 422);
        }

        $bid = null;

        DB::transaction(function () use ($auction, $maxBid, &$bid) {
            $auction = Auction::where('id', $auction->id)->lockForUpdate()->first();
            $highest = $auction->bids()->orderByDesc('amount')->first();

            $actual = $highest
                ? min($maxBid, $highest->amount + $auction->bid_increment)
                : max($auction->start_price, $maxBid);

            $auction->current_price = $actual;

            if (now()->diffInMinutes($auction->end_time, false) < 2) {
                $auction->end_time = now()->addMinutes(2);
            }
            $auction->save();

            $bid = $auction->bids()->create([
                'bidder_id' => auth()->id(),
                'amount'    => $actual,
                'max_bid'   => $maxBid,
            ]);
        });

        // Log the bid placement in the auction activity log
        if ($bid) {
            $auction->refresh();
            $this->orderService->logBidPlaced($bid, $auction);
        }

        return response()->json([
            'message'       => 'Bid placed successfully',
            'current_price' => $auction->current_price,
        ]);
    }

    // =========================================================================
    // PUBLIC — SSE LIVE STREAM
    // =========================================================================

    public function stream(Request $request, Auction $auction)
    {
        set_time_limit(0);
        @ini_set('output_buffering', 'off');
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');

        while (true) {
            if (connection_aborted()) break;

            $auction->refresh();
            $data = [
                'current_price' => $auction->current_price,
                'bid_count'     => $auction->bids()->count(),
                'time_left'     => max(0, now()->diffInSeconds($auction->end_time)),
                'status'        => $auction->status,
                'min_next'      => $auction->current_price + $auction->bid_increment,
            ];

            echo 'data: ' . json_encode($data) . "\n\n";
            ob_flush();
            flush();
            sleep(2);
        }
    }

    // =========================================================================
    // ADMIN — ACTIVITY LOG FOR AN AUCTION
    // =========================================================================

    /**
     * GET /admin/auctions/{auction}/activity
     * Returns all activity logs scoped to an auction (bids).
     */
    public function auctionActivityLog(Request $request, Auction $auction)
    {
        $logs = AuctionOrderActivityLog::where('auction_id', $auction->id)
            ->orderByDesc('created_at')
            ->paginate($request->per_page ?? 30);

        return response()->json($logs);
    }

    /**
     * GET /admin/auction-orders/activity
     * Returns all auction order activity logs across all auctions, paginated.
     * Filters: search (action/description), action, severity, per_page
     */
    public function globalActivityLog(Request $request)
    {
        $query = AuctionOrderActivityLog::with([
            'auction.product:id,name',
        ])->orderByDesc('created_at');

        if ($request->filled('search')) {
            $s = $request->search;
            $query->where(function ($q) use ($s) {
                $q->where('action', 'like', "%{$s}%")
                ->orWhere('description', 'like', "%{$s}%");
            });
        }

        if ($request->filled('action')) {
            $query->where('action', $request->action);
        }

        if ($request->filled('severity')) {
            $query->where('severity', $request->severity);
        }

        if ($request->filled('auction_id')) {
            $query->where('auction_id', $request->auction_id);
        }

        return response()->json(
            $query->paginate($request->per_page ?? 30)
        );
    }

    /** End an active auction now: the highest bid wins if there is one and it meets the reserve (the same as when its time runs out). */
    public function closeNow(Request $request, $id)
    {
        $a = Auction::findOrFail($id);
        if ($a->status !== 'active') {
            return response()->json(['message' => 'Only an active auction can be ended.'], 422);
        }
        $highest = $a->bids()->orderByDesc('amount')->first();
        if ($highest && (! $a->reserve_price || (float) $highest->amount >= (float) $a->reserve_price)) {
            $a->update(['status' => 'ended', 'winner_id' => $highest->bidder_id, 'end_time' => min($a->end_time, now())]);

            return response()->json(['message' => 'Auction ended — the highest bidder won. You can now create their invoice.']);
        }
        $a->update(['status' => $highest ? 'failed' : 'ended', 'end_time' => min($a->end_time, now())]);

        return response()->json(['message' => $highest ? 'Auction ended — the reserve price was not met, so there is no winner.' : 'Auction ended with no bids.']);
    }

    /**
     * Turn a won auction into the winner's order and invoice: the winning bid and each charge due on winning, each on its own
     * account with its own tax, charged to the winner's account. Deposits are then released to their owners; the winner's
     * own deposit is set against the invoice.
     */
    public function createOrder(Request $request, $id)
    {
        try {
            $a = Auction::with('winner.customer')->findOrFail($id);
            $orders = app(\App\Services\Books\AuctionOrderService::class);
            $vouchers = app(\App\Services\Books\VoucherService::class);
            $order = $orders->fromAuction($a, $request->user());
            $invoice = $vouchers->convert($order, \App\Models\Books\VoucherType::SALES, ['due_date' => today()->toDateString()], $request->user());
            app(\App\Services\Books\AuctionRegistrationService::class)->releaseDeposits($a, $request->user());   // the auction is settled: deposits go back to the bidders' accounts

            // the winner's own released deposit pays towards the invoice
            $deposits = \App\Models\AuctionRegistration::where('auction_id', $a->id)->where('customer_id', $a->winner?->customer?->id)->whereNotNull('release_voucher_id')->pluck('release_voucher_id')->all();
            $applied = null;
            if ($deposits) {
                try {
                    $applied = app(\App\Services\Books\CreditService::class)->applyIfAny($invoice->fresh(), array_map('intval', $deposits), $request->user());
                } catch (\Throwable $e) {
                    report($e);   // the invoice stands; the deposit can be applied from the invoice
                }
            }

            return response()->json([
                'message' => "Invoice {$invoice->voucher_number} created for the winner (order {$order->voucher_number})" . ($applied ? ' — their deposit was set against it' : ''),
                'voucher_id' => $invoice->id,
            ], 201);
        } catch (\App\Services\Books\BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}

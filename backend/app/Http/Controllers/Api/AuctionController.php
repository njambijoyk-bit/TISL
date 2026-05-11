<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\Auction;
use App\Models\AuctionBid;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class AuctionController extends Controller
{
    // Admin: List all auctions with filters
    public function adminIndex(Request $request)
    {
        $query = Auction::with(['product.brand', 'product.category', 'seller', 'winner'])
            ->withCount('bids') 
            ->when($request->status, fn($q, $status) => $q->where('status', $status))
            ->when($request->product_id, fn($q, $id) => $q->where('product_id', $id))
            ->when($request->search, function($q, $search) {
                $q->whereHas('product', fn($qp) => 
                    $qp->where('name', 'like', "%{$search}%")
                    ->orWhere('sku', 'like', "%{$search}%")
                );
            })
            ->orderBy($request->sort_by ?? 'end_time', $request->sort_dir ?? 'asc');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    // Admin: Show single auction with full relations
    public function adminShow($id)
    {
        $auction = Auction::with([
            'product.brand', 'product.category', 'seller', 'winner',
            'bids' => fn($q) => $q->orderByDesc('amount')->with('bidder:id,name,email'),
        ])->findOrFail($id);

        return response()->json([
            'auction' => $auction,
            'product' => $auction->product,
            'bids'    => $auction->bids,
            'stats'   => [
                'total_bids'     => $auction->bids->count(),
                'unique_bidders' => $auction->bids->pluck('bidder_id')->unique()->count(),
                'highest_bid'    => $auction->bids->max('amount'),
                'lowest_bid'     => $auction->bids->min('amount'),
            ]
        ]);
    }

    // Admin: Update auction
    public function update(Request $request, Auction $auction)
    {
        $validator = Validator::make($request->all(), [
            'start_price'     => 'nullable|numeric|min:0',
            'reserve_price'   => 'nullable|numeric|min:0',
            'bid_increment'   => 'nullable|numeric|min:10',
            'start_time'      => 'nullable|date',
            'end_time'        => 'nullable|date|after_or_equal:start_time',
            'status'          => 'nullable|in:active,scheduled,ended,cancelled',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Prevent status changes that break business logic
        if ($request->filled('status')) {
            $allowedTransitions = [
                'scheduled' => ['active', 'cancelled'],
                'active'    => ['ended', 'cancelled'],
                'ended'     => [],
                'cancelled' => [],
            ];
            $current = $auction->status;
            $new = $request->status;
            if (!in_array($new, $allowedTransitions[$current] ?? [])) {
                return response()->json([
                    'message' => "Cannot change status from '{$current}' to '{$new}'"
                ], 422);
            }
        }

        $auction->update($request->only([
            'start_price', 'reserve_price', 'bid_increment',
            'start_time', 'end_time', 'status'
        ]));

        // If end_time passed and status is active, auto-close
        if ($auction->status === 'active' && now()->gt($auction->end_time)) {
            $auction->update(['status' => 'ended']);
        }

        return response()->json([
            'message' => 'Auction updated successfully',
            'auction' => $auction->fresh()
        ]);
    }

    // Admin: Soft delete auction
    public function destroy(Auction $auction)
    {
        // Only allow delete if no bids placed
        if ($auction->bids()->exists()) {
            return response()->json([
                'message' => 'Cannot delete auction with existing bids. Use "cancel" status instead.'
            ], 422);
        }

        $auction->delete(); // Soft delete

        return response()->json(['message' => 'Auction deleted successfully']);
    }

    // Admin: List soft-deleted auctions
    public function trashed(Request $request)
    {
        $query = Auction::onlyTrashed()
            ->with(['product.brand', 'product.category', 'seller'])
            ->withCount('bids')
            ->when($request->search, function($q, $search) {
                $q->whereHas('product', fn($qp) =>
                    $qp->where('name', 'like', "%{$search}%")
                    ->orWhere('sku', 'like', "%{$search}%")
                );
            })
            ->orderByDesc('deleted_at');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    // Admin: Restore soft-deleted auction
    public function restore($id)
    {
        $auction = Auction::onlyTrashed()->findOrFail($id);
        $auction->restore();
        return response()->json(['message' => 'Auction restored successfully']);
    }

    // Admin: Permanently delete auction
    public function forceDestroy($id)
    {
        $auction = Auction::onlyTrashed()->findOrFail($id);
        $auction->bids()->forceDelete(); // clean up bids too
        $auction->forceDelete();
        return response()->json(['message' => 'Auction permanently deleted']);
    }

    // Public: List auctions (default: active)
    public function index(Request $request)
    {
        $query = Auction::with(['product.brand', 'product.category'])
            ->where('status', $request->status ?? 'active')
            ->where('end_time', '>', now())
            ->orderBy('end_time', 'asc');

        return response()->json($query->paginate($request->per_page ?? 20));
    }

    // Public: Auction details + top bids
    public function show($id)
    {
        $auction = Auction::with(['product.brand', 'product.category', 'winner'])->findOrFail($id);
        $topBids = $auction->bids()->with('bidder:id,name')->limit(10)->get();

        return response()->json([
            'auction' => $auction,
            'product' => $auction->product,
            'top_bids' => $topBids,
            'bid_count' => $auction->bids()->count(),
            'min_next_bid' => $auction->current_price + $auction->bid_increment,
        ]);
    }

    // Protected: Place Proxy Bid
    public function placeBid(Request $request, Auction $auction)
    {
        
        if ($auction->status !== 'active' || now()->gt($auction->end_time)) {
            return response()->json(['message' => 'Auction is closed.'], 422);
        }

        $maxBid = (float) $request->input('max_bid');
        $nextMin = $auction->current_price + $auction->bid_increment;

        if ($maxBid < $nextMin) {
            return response()->json([
                'message' => "Minimum bid is KSh " . number_format($nextMin, 2),
                'min_bid' => $nextMin
            ], 422);
        }

        DB::transaction(function () use ($auction, $maxBid) {
            $auction = Auction::where('id', $auction->id)->lockForUpdate()->first();
            $highest = $auction->bids()->orderByDesc('amount')->first();

            // Proxy logic: bid just enough to beat current, up to user's max
            $actual = $highest
                ? min($maxBid, $highest->amount + $auction->bid_increment)
                : max($auction->start_price, $maxBid);

            $auction->current_price = $actual;

            // Auto-extend 2 mins if bid placed in final 2 mins
            if (now()->diffInMinutes($auction->end_time, false) < 2) {
                $auction->end_time = now()->addMinutes(2);
            }
            $auction->save();

            $auction->bids()->create([
                'bidder_id' => auth()->id(),
                'amount'    => $actual,
                'max_bid'   => $maxBid,
            ]);
        });

        return response()->json([
            'message' => 'Bid placed successfully',
            'current_price' => $auction->current_price
        ]);
    }

    // Public: SSE Live Stream
    public function stream(Request $request, Auction $auction)
    {
        set_time_limit(0);
        @ini_set('output_buffering', 'off');
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no'); // Nginx fix

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

            echo "data: " . json_encode($data) . "\n\n";
            ob_flush();
            flush();
            sleep(2);
        }
    }

    // Admin: Create Auction
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'product_id'      => 'required|exists:products,id',
            'start_price'     => 'required|numeric|min:0',
            'reserve_price'   => 'nullable|numeric|min:0',
            'bid_increment'   => 'required|numeric|min:10',
            'start_time'      => 'nullable|date',
            'end_time'        => 'required|date|after:start_time',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Prevent duplicate active auctions for same product
        $hasActive = Auction::where('product_id', $request->product_id)
            ->whereIn('status', ['active', 'scheduled'])
            ->exists();
        if ($hasActive) {
            return response()->json(['message' => 'Product already has an active or scheduled auction.'], 422);
        }

        $startTime = $request->start_time ?? now();
        $status = strtotime($startTime) <= time() ? 'active' : 'scheduled';

        $auction = Auction::create([
            'product_id'    => $request->product_id,
            'seller_id'     => auth()->id(),
            'start_price'   => $request->start_price,
            'current_price' => $request->start_price,
            'reserve_price' => $request->reserve_price,
            'bid_increment' => $request->bid_increment,
            'start_time'    => $startTime,
            'end_time'      => $request->end_time,
            'status'        => $status,
        ]);

        return response()->json(['message' => 'Auction created successfully', 'auction' => $auction], 201);
    }
}
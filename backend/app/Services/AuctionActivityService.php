<?php

namespace App\Services;

use App\Models\Auction;
use App\Models\AuctionBid;
use App\Models\AuctionOrderActivityLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

/**
 * Activity log for auctions (bids etc.). Auctions no longer have their own
 * order records — winners buy through the normal checkout — so this only
 * records what happens on the auction itself.
 */
class AuctionActivityService
{
    public function log(
        string  $action,
        string  $description,
        string  $severity   = 'info',
        ?int    $auctionId  = null,
        array   $metadata   = [],
        ?string $performedBy = null,
    ): void {
        try {
            AuctionOrderActivityLog::create([
                'auction_id'   => $auctionId,
                'action'       => $action,
                'description'  => $description,
                'severity'     => $severity,
                'performed_by' => $performedBy ?? $this->resolveActor(),
                'metadata'     => $metadata ?: null,
            ]);
        } catch (\Exception $e) {
            Log::warning("Auction activity log failed: {$e->getMessage()}");
        }
    }

    public function logBidPlaced(AuctionBid $bid, Auction $auction): void
    {
        $this->log(
            action:      'bid_placed',
            description: 'Bid of ' . ($auction->currency?->code ?? 'KES') . ' ' . number_format($bid->amount, 2) . " placed on auction #{$auction->id} ({$auction->product?->name}).",
            auctionId:   $auction->id,
            metadata:    [
                'bid_id'        => $bid->id,
                'bidder_id'     => $bid->bidder_id,
                'amount'        => $bid->amount,
                'max_bid'       => $bid->max_bid,
                'current_price' => $auction->current_price,
            ],
        );
    }

    private function resolveActor(): string
    {
        $user = Auth::user();
        if (! $user) {
            return 'system';
        }

        return $user->name ?? $user->email ?? "user#{$user->id}";
    }
}

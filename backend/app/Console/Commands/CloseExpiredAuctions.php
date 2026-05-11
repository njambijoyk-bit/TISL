<?php
namespace App\Console\Commands;
use Illuminate\Console\Command;
use App\Models\Auction;
// use App\Models\Order; // Uncomment when wiring to your Order system

class CloseExpiredAuctions extends Command
{
    protected $signature = 'auctions:close';
    protected $description = 'Close expired auctions & create draft orders for winners';

    public function handle()
    {
        $expired = Auction::where('status', 'active')->where('end_time', '<=', now())->get();

        foreach ($expired as $auction) {
            $highest = $auction->bids()->orderByDesc('amount')->first();
            $meetsReserve = !$auction->reserve_price || ($highest && $highest->amount >= $auction->reserve_price);

            if ($meetsReserve && $highest) {
                $auction->update(['status' => 'ended', 'winner_id' => $highest->bidder_id]);

                // 🔌 TODO: Wire to your existing Order flow
                // Order::create([
                //     'customer_id' => $highest->bidder_id,
                //     'status' => 'pending_payment',
                //     'total' => $highest->amount,
                //     'source' => 'auction',
                //     'auction_id' => $auction->id,
                //     // ... map required fields from your Order model
                // ]);

                $this->info("✅ Auction #{$auction->id} ended. Winner: {$highest->bidder_id}");
            } else {
                $auction->update(['status' => 'failed']);
                $this->info("❌ Auction #{$auction->id} failed reserve price.");
            }
        }
        return 0;
    }
}
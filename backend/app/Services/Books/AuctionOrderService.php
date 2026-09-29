<?php

namespace App\Services\Books;

use App\Models\Auction;
use App\Models\Books\Voucher;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** A won auction becomes a Sales Order at the winning bid, in the auction's own currency; the winner pays it from My orders. */
class AuctionOrderService
{
    public function __construct(private VoucherService $vouchers) {}

    public function existing(Auction $a): ?Voucher
    {
        return Voucher::where('status', Voucher::POSTED)->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(meta, '$.auction_id')) = ?", [(string) $a->id])->first();
    }

    public function fromAuction(Auction $a, ?User $by = null): Voucher
    {
        if (! $a->winner_id) {
            throw new BooksException('This auction has no winner yet.');
        }
        if ($this->existing($a)) {
            throw new BooksException('An order was already created for this auction.');
        }
        $customer = $a->winner?->customer ?? throw new BooksException('The winner has no customer account.');

        return DB::transaction(fn () => $this->vouchers->placeOrder([
            'date' => today()->toDateString(), 'customer_id' => $customer->id, 'currency_id' => $a->currency_id, 'location_id' => $a->location_id,
            'narration' => "Auction #{$a->id} — winning bid", 'meta' => ['auction_id' => $a->id],
            'lines' => [['type' => 'product', 'product_id' => $a->product_id, 'variant_id' => $a->variant_id, 'quantity' => 1, 'rate' => (float) $a->current_price, 'location_id' => $a->location_id, 'ledger_id' => TradingAccounts::forAuction($a)]],
        ], $by));
    }
}

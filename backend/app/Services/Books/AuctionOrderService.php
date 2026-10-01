<?php

namespace App\Services\Books;

use App\Models\Auction;
use App\Models\Books\Voucher;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** A won auction becomes a Sales Order at the winning bid (plus its charges due on winning), in the auction's own currency; it is then charged to the winner's account as an invoice. */
class AuctionOrderService
{
    public function __construct(private VoucherService $vouchers, private AuctionChargeService $charges) {}

    public function existing(Auction $a): ?Voucher
    {
        // the winner's order — not the registration orders, which also carry the auction id
        return Voucher::where('status', Voucher::POSTED)->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(meta, '$.auction_id')) = ?", [(string) $a->id])
            ->whereRaw("JSON_EXTRACT(meta, '$.auction_registration') IS NULL AND JSON_EXTRACT(meta, '$.auction_registration_id') IS NULL")->first();
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

        // the winning bid, then each charge due on winning (buyer premium, handling…) on its own account with its own tax
        $lines = [['type' => 'product', 'product_id' => $a->product_id, 'variant_id' => $a->variant_id, 'quantity' => 1, 'rate' => (float) $a->current_price, 'location_id' => $a->location_id, 'ledger_id' => TradingAccounts::forAuction($a)]];
        foreach ($this->charges->quote($a, (float) $a->current_price, 0, $customer)['lines'] as $c) {
            $lines[] = ['type' => 'custom', 'description' => $c['name'], 'quantity' => 1, 'rate' => $c['net'], 'ledger_id' => $c['ledger_id'], 'tax_account_id' => $c['tax_account_id']];
        }

        return DB::transaction(fn () => $this->vouchers->placeOrder([
            'date' => today()->toDateString(), 'customer_id' => $customer->id, 'currency_id' => $a->currency_id, 'location_id' => $a->location_id,
            'narration' => "Auction #{$a->id} — winning bid", 'meta' => ['auction_id' => $a->id],
            'lines' => $lines,
        ], $by));
    }
}

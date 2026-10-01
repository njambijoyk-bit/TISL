<?php

namespace App\Services\Books;

use App\Models\Auction;
use App\Models\AuctionCharge;
use App\Models\AuctionRegistration;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Entry fees and deposits. An auction that takes either makes bidders register first: registering raises a Sales
 * Order for those amounts; when it is paid (it becomes a Cash Sale) the bidder may bid. The entry fee is income; the
 * deposit is held as a liability and, when the auction closes, released to the customer's account — from where it is
 * refunded or set against what they owe.
 */
class AuctionRegistrationService
{
    public function __construct(private VoucherService $vouchers, private AuctionChargeService $charges, private LedgerService $ledgers) {}

    /** The enabled charges taken before bidding. */
    public function upfrontCharges(Auction $a)
    {
        return $a->charges()->with('ledger')->where('is_enabled', true)->whereIn('timing', ['entry', 'deposit'])->get()
            ->filter(fn (AuctionCharge $c) => $c->ledger && $this->amount($a, $c) > 0)->values();
    }

    public function required(Auction $a): bool
    {
        return $this->upfrontCharges($a)->isNotEmpty();
    }

    /** Percentages are worked out on the starting price, as there is no winning bid yet. */
    private function amount(Auction $a, AuctionCharge $c): float
    {
        return $this->charges->amountFor($c, (float) $a->start_price, 0);
    }

    public function forCustomer(Auction $a, Customer $customer): ?AuctionRegistration
    {
        $reg = AuctionRegistration::where('auction_id', $a->id)->where('customer_id', $customer->id)->where('status', '!=', AuctionRegistration::CANCELLED)->latest('id')->first();

        $reg = $reg ? $this->refresh($reg) : null;

        return $reg && $reg->status !== AuctionRegistration::CANCELLED ? $reg : null;   // a cancelled registration is as good as none: the customer can register again
    }

    /** Paid means the order was settled: a posted Cash Sale exists that came from it. */
    public function refresh(AuctionRegistration $reg): AuctionRegistration
    {
        if ($reg->status === AuctionRegistration::AWAITING && $reg->order_voucher_id) {
            // the customer cancelled the registration order before paying it: the registration goes with it
            if (Voucher::whereKey($reg->order_voucher_id)->where('status', Voucher::CANCELLED)->exists()) {
                $reg->update(['status' => AuctionRegistration::CANCELLED]);

                return $reg;
            }
            $paid = Voucher::where('source_voucher_id', $reg->order_voucher_id)->where('status', Voucher::POSTED)
                ->whereHas('type', fn ($q) => $q->where('base_type', VoucherType::CASH_SALE))->exists();
            if ($paid) {
                $reg->update(['status' => AuctionRegistration::REGISTERED]);
            }
        }

        return $reg;
    }

    /** null when the customer may bid, otherwise why not. */
    public function blockReason(Auction $a, ?Customer $customer): ?string
    {
        if (! $this->required($a)) {
            return null;
        }
        $reg = $customer ? $this->forCustomer($a, $customer) : null;
        if (! $reg) {
            return 'Register for this auction first — it has an entry fee or deposit.';
        }

        return $reg->status === AuctionRegistration::REGISTERED ? null : 'Pay your registration to start bidding — it is waiting in My orders.';
    }

    public function register(Auction $a, Customer $customer, ?User $by = null): AuctionRegistration
    {
        if (! $this->required($a)) {
            throw new BooksException('This auction has no entry fee or deposit.');
        }
        if ($existing = $this->forCustomer($a, $customer)) {
            return $existing;
        }
        $lines = [];
        $entry = $deposit = 0.0;
        $depositLedger = null;
        foreach ($this->upfrontCharges($a) as $c) {
            $net = $this->amount($a, $c);
            $line = ['type' => 'custom', 'description' => $c->ledger->name, 'quantity' => 1, 'rate' => $net, 'ledger_id' => $c->ledger_id];
            $taxAccount = $this->charges->taxAccountFor($a, $c);
            if ($taxAccount && $taxAccount->id !== $c->ledger_id) {
                $line['tax_account_id'] = $taxAccount->id;
            }
            $lines[] = $line;
            if ($c->timing === 'deposit') {
                $deposit += $net;
                $depositLedger = $c->ledger_id;
            } else {
                $entry += $net;
            }
        }

        return DB::transaction(function () use ($a, $customer, $by, $lines, $entry, $deposit, $depositLedger) {
            $order = $this->vouchers->placeOrder([
                'date' => today()->toDateString(), 'customer_id' => $customer->id, 'currency_id' => $a->currency_id, 'location_id' => $a->location_id,
                'narration' => "Auction #{$a->id} — registration", 'meta' => ['auction_id' => $a->id, 'auction_registration' => true], 'lines' => $lines,
            ], $by);

            return AuctionRegistration::create([
                'auction_id' => $a->id, 'customer_id' => $customer->id, 'user_id' => $by?->id, 'order_voucher_id' => $order->id,
                'status' => AuctionRegistration::AWAITING, 'entry_amount' => round($entry, 2), 'deposit_amount' => round($deposit, 2),
                'deposit_ledger_id' => $depositLedger, 'deposit_status' => $deposit > 0 ? 'held' : 'none',
            ]);
        });
    }

    /**
     * When an auction closes: every paid deposit moves from the deposit liability to the customer's own account
     * (Dr Auction Deposits, Cr the customer). The customer can then be refunded, or have it set against their order.
     */
    public function releaseDeposits(Auction $a, ?User $by = null): int
    {
        $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
        $n = 0;
        foreach (AuctionRegistration::with('customer')->where('auction_id', $a->id)->where('deposit_status', 'held')->get() as $reg) {
            $reg = $this->refresh($reg);
            if ($reg->status !== AuctionRegistration::REGISTERED || ! $reg->deposit_ledger_id || ! $reg->customer) {
                continue;   // an unpaid deposit was never held
            }
            DB::transaction(function () use ($reg, $a, $journal, $by, &$n) {
                $v = $this->vouchers->create([
                    'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'currency_id' => $a->currency_id,
                    'narration' => "Auction #{$a->id} deposit released" . ($a->winner_id && (int) $reg->user_id === (int) $a->winner_id ? ' (winner)' : ''),
                    'meta' => ['auction_id' => $a->id, 'auction_registration_id' => $reg->id],
                    'entries' => [
                        ['ledger_id' => $reg->deposit_ledger_id, 'side' => 'D', 'amount' => (float) $reg->deposit_amount],
                        ['ledger_id' => $this->ledgers->customerLedger($reg->customer)->id, 'side' => 'C', 'amount' => (float) $reg->deposit_amount],
                    ],
                ], $by);
                $reg->update(['deposit_status' => 'released', 'release_voucher_id' => $v->id, 'released_at' => now()]);
                $n++;
            });
        }

        return $n;
    }
}

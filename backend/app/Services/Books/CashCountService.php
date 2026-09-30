<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\CashCount;
use App\Models\Books\Ledger;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Cash, counted. A count puts what is physically in a cash ledger (a till, petty cash, the drivers' cash) against what the
 * books say should be there on that day; a difference needs a reason and is posted to the Cash Over / Short ledger as a
 * journal (short: Dr Over/Short, Cr the cash ledger; over: the other way), which can be cancelled to undo it. Cash a
 * driver collected on delivery sits in a Driver cash ledger until it is handed in — a Contra to the till.
 */
class CashCountService
{
    public function __construct(private VoucherService $vouchers, private LedgerService $ledgers) {}

    /** Every cash ledger with what the books say it holds, its last count, and the cash-on-delivery orders still to collect. */
    public function overview(): array
    {
        $rows = [];
        foreach ($this->cashLedgers() as $l) {
            $last = CashCount::where('ledger_id', $l->id)->orderByDesc('count_date')->orderByDesc('id')->first();
            $rows[] = [
                'ledger_id' => (int) $l->id, 'name' => $l->name, 'cash_kind' => $l->cash_kind, 'balance' => $this->ledgers->balance($l->id),
                'last_count' => $last ? ['date' => $last->count_date->toDateString(), 'counted' => (float) $last->counted, 'difference' => (float) $last->difference, 'adjusted' => (bool) $last->adjust_voucher_id] : null,
                'days_since' => $last ? (int) $last->count_date->diffInDays(today()) : null,
            ];
        }

        return ['ledgers' => $rows, 'cod_orders' => $this->codOrders()];
    }

    public function history(?int $ledgerId = null, int $limit = 50): array
    {
        return CashCount::with('ledger:id,name')->when($ledgerId, fn ($q) => $q->where('ledger_id', $ledgerId))->orderByDesc('count_date')->orderByDesc('id')->limit($limit)->get()
            ->map(function ($c) {
                $adj = $c->adjust_voucher_id ? Voucher::find($c->adjust_voucher_id) : null;

                return ['id' => $c->id, 'ledger' => $c->ledger?->name, 'ledger_id' => (int) $c->ledger_id, 'date' => $c->count_date->toDateString(), 'counted' => (float) $c->counted, 'book_balance' => (float) $c->book_balance,
                    'difference' => (float) $c->difference, 'reason' => $c->reason, 'adjust_voucher_id' => $c->adjust_voucher_id, 'adjust_voucher_number' => $adj?->voucher_number];
            })->all();
    }

    /**
     * @param  bool  $post  put a difference on Cash Over / Short (needs the ledger chosen in Settings); false = only note it
     */
    public function record(int $ledgerId, ?string $date, float $counted, ?string $reason, bool $post, ?User $user): CashCount
    {
        $ledger = Ledger::findOrFail($ledgerId);
        if (! $this->isCash($ledger)) {
            throw new BooksException('Only a cash ledger can be counted.');
        }
        if ($counted < 0) {
            throw new BooksException('The amount counted can not be negative.');
        }
        $date = $date ?: today()->toDateString();
        if ($date > today()->toDateString()) {
            throw new BooksException('A count can not be dated in the future.');
        }
        $book = $this->ledgers->balance($ledgerId, $date);
        $diff = round($counted - $book, 2);
        $reason = trim((string) $reason);
        if (abs($diff) >= 0.005 && $reason === '') {
            throw new BooksException('There is a difference of ' . number_format(abs($diff), 2) . ($diff < 0 ? ' short' : ' over') . ' — give a reason.');
        }

        return DB::transaction(function () use ($ledger, $date, $counted, $book, $diff, $reason, $post, $user) {
            $voucherId = null;
            if (abs($diff) >= 0.005 && $post) {
                $os = AccountingSetting::current()->cash_over_short_ledger_id ?: throw new BooksException('Choose the Cash over / short ledger in Books settings first.');
                $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
                $amt = round(abs($diff), 2);
                $short = $diff < 0;
                $j = $this->vouchers->create([
                    'voucher_type_id' => $type->id, 'date' => $date,
                    'narration' => "Cash count of {$ledger->name}: " . ($short ? 'short' : 'over') . ' ' . number_format($amt, 2) . " — {$reason}",
                    'entries' => $short
                        ? [['ledger_id' => $os, 'side' => 'D', 'amount' => $amt, 'narration' => $reason], ['ledger_id' => $ledger->id, 'side' => 'C', 'amount' => $amt]]
                        : [['ledger_id' => $ledger->id, 'side' => 'D', 'amount' => $amt], ['ledger_id' => $os, 'side' => 'C', 'amount' => $amt, 'narration' => $reason]],
                    'meta' => ['cash_count' => ['ledger_id' => $ledger->id, 'counted' => $counted, 'book' => $book, 'difference' => $diff, 'reason' => $reason]],
                ], $user);
                $voucherId = $j->id;
            }

            return CashCount::create(['ledger_id' => $ledger->id, 'count_date' => $date, 'counted' => $counted, 'book_balance' => $book, 'difference' => $diff,
                'reason' => $reason ?: null, 'adjust_voucher_id' => $voucherId, 'counted_by' => $user?->id]);
        });
    }

    /** The adjustment journal was cancelled: the count stays on record, the difference is open again. */
    public function onAdjustmentCancelled(Voucher $journal): void
    {
        CashCount::where('adjust_voucher_id', $journal->id)->update(['adjust_voucher_id' => null]);
    }

    /** Cash a driver collected is handed in: a Contra from the driver-cash ledger to the till. */
    public function handIn(int $fromLedgerId, int $toLedgerId, float $amount, ?string $by, ?string $date, ?User $user): Voucher
    {
        $from = Ledger::findOrFail($fromLedgerId);
        $to = Ledger::findOrFail($toLedgerId);
        if (! $this->isCash($from) || ! $this->isCash($to)) {
            throw new BooksException('Cash is handed in between cash ledgers.');
        }
        if ($from->id === $to->id) {
            throw new BooksException('Choose a different ledger to hand it in to.');
        }
        if ($amount <= 0) {
            throw new BooksException('Enter the amount handed in.');
        }
        $held = $this->ledgers->balance($from->id);
        if ($amount - $held > 0.005) {
            throw new BooksException("{$from->name} holds only " . number_format($held, 2) . '.');
        }
        $type = VoucherType::byBase(VoucherType::CONTRA) ?? throw new BooksException('The Contra voucher type is switched off.');
        $by = trim((string) $by);

        return $this->vouchers->create([
            'voucher_type_id' => $type->id, 'date' => $date ?: today()->toDateString(),
            'narration' => "Cash handed in from {$from->name} to {$to->name}" . ($by !== '' ? " by {$by}" : ''),
            'entries' => [['ledger_id' => $to->id, 'side' => 'D', 'amount' => round($amount, 2)], ['ledger_id' => $from->id, 'side' => 'C', 'amount' => round($amount, 2)]],
            'meta' => ['cash_hand_in' => ['from' => $from->id, 'to' => $to->id, 'by' => $by ?: null]],
        ], $user);
    }

    /** Sales orders the customer chose to pay on delivery that have not been converted yet. */
    public function codOrders(): array
    {
        return Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::SALES_ORDER))->where('status', Voucher::POSTED)
            ->where('meta', 'like', '%"kind":"cod"%')->whereDoesntHave('children', fn ($c) => $c->where('status', Voucher::POSTED))
            ->with('partyLedger:id,name')->orderBy('date')->limit(50)->get()
            ->map(fn ($v) => ['id' => $v->id, 'voucher_number' => $v->voucher_number, 'date' => $v->date?->toDateString(), 'customer' => $v->partyLedger?->name ?? $v->party_name, 'total' => (float) $v->total_amount])->all();
    }

    private function cashLedgers()
    {
        $group = \App\Models\Books\LedgerGroup::where('name', 'Cash-in-hand')->first();
        if (! $group) {
            return collect();
        }

        return Ledger::whereIn('group_id', $group->selfAndDescendantIds())->where('is_active', true)->orderBy('name')->get();
    }

    private function isCash(Ledger $l): bool
    {
        return $this->ledgers->isUnderGroup($l, 'Cash-in-hand');
    }
}

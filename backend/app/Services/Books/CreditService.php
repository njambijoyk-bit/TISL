<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherAuditLog;
use App\Models\Books\VoucherBillRef;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Credit on account: an amount a party paid (or was credited) that was not matched to a bill is an *advance* on the
 * receipt / credit note / payment / debit note. Applying it to a bill moves that amount from the advance to a settlement
 * of the bill — "the receipt settles the invoice" — so every report that already reads bill settlements agrees, nothing
 * is posted to the ledgers (the party ledger already holds the credit), and cancelling the receipt opens the bill again.
 * A settlement made this way is marked `credit-applied` so it can be told from one typed on the receipt: cancelling or
 * editing the bill gives the credit back by itself.
 */
class CreditService
{
    public const MARK = 'credit-applied';

    public function __construct(private OpenBillsService $open, private PeriodGuard $guard) {}

    /**
     * Settle $bill (a posted Sales or Purchase invoice) from the party's credit, oldest credit first.
     *
     * @param  ?float  $amount      how much to apply; null = as much as the bill still needs and the credit allows
     * @param  ?array  $creditIds   only these receipts / notes / payments; null = any
     * @return array{applied: float, from: array}
     */
    public function apply(Voucher $bill, ?float $amount, ?array $creditIds, ?User $user): array
    {
        return DB::transaction(function () use ($bill, $amount, $creditIds, $user) {
            $bill = Voucher::with('type')->whereKey($bill->id)->lockForUpdate()->firstOrFail();
            $base = $bill->type->base_type;
            if ($bill->status !== Voucher::POSTED || ! in_array($base, ['sales', 'purchase'], true)) {
                throw new BooksException('Credit can only be applied to a posted sales or purchase invoice.');
            }
            if ((float) $bill->exchange_rate !== 1.0) {
                throw new BooksException('Credit can not be applied to a foreign-currency bill yet — settle it with a receipt or payment.');
            }
            $left = round((float) app(VoucherService::class)->outstanding($bill), 2);
            if ($left <= 0.005) {
                throw new BooksException("{$bill->voucher_number} has nothing outstanding.");
            }
            if ($amount !== null && $amount <= 0) {
                throw new BooksException('Enter how much credit to apply.');
            }
            $want = $amount === null ? $left : min(round($amount, 2), $left);
            if ($amount !== null && $amount - $left > 0.005) {
                throw new BooksException("{$bill->voucher_number} has only " . number_format($left, 2) . ' outstanding.');
            }

            $kind = $base === 'sales' ? 'credit' : 'prepaid';
            $credits = array_values(array_filter($this->open->forLedger((int) $bill->party_ledger_id)['credits'],
                fn ($c) => $c['kind'] === $kind && ($creditIds === null || in_array($c['voucher_id'], $creditIds, true))));
            $available = round(array_sum(array_column($credits, 'amount')), 2);
            if ($available <= 0.005) {
                throw new BooksException('This party has no credit on account.');
            }
            if ($amount !== null && $want - $available > 0.005) {
                throw new BooksException('Only ' . number_format($available, 2) . ' of credit is on account.');
            }

            $applied = 0.0;
            $from = [];
            foreach ($credits as $c) {
                $take = round(min($want - $applied, $c['amount']), 2);
                if ($take <= 0.004) {
                    break;
                }
                $src = Voucher::findOrFail($c['voucher_id']);
                $this->guard->assert('edit', max($src->date, $bill->date), $user, $src->voucher_type_id);   // the books must be open for both
                $this->move($src, $bill, $take);
                $applied = round($applied + $take, 2);
                $from[] = ['voucher_id' => $src->id, 'voucher_number' => $src->voucher_number, 'amount' => $take];
                $this->log($src, 'credit_applied', $user, ['bill' => $bill->voucher_number, 'amount' => $take]);
            }
            $this->log($bill, 'credit_applied', $user, ['from' => array_column($from, 'voucher_number'), 'amount' => $applied]);

            return ['applied' => $applied, 'from' => $from];
        });
    }

    /** Give one credit (or all of them) back: the bill is outstanding again and the amount returns to the advance. */
    public function release(Voucher $bill, ?int $creditVoucherId, ?User $user): float
    {
        return DB::transaction(function () use ($bill, $creditVoucherId, $user) {
            $rows = VoucherBillRef::where('against_voucher_id', $bill->id)->where('ref_type', 'against')->where('ref_name', self::MARK)
                ->when($creditVoucherId, fn ($q) => $q->where('voucher_id', $creditVoucherId))->get();
            $total = 0.0;
            foreach ($rows as $r) {
                $src = Voucher::find($r->voucher_id);
                if ($src && $src->status === Voucher::POSTED) {
                    $this->guard->assert('edit', max($src->date, $bill->date), $user, $src->voucher_type_id);
                    $this->log($src, 'credit_released', $user, ['bill' => $bill->voucher_number, 'amount' => (float) $r->amount]);
                }
                $this->restore($r);
                $total = round($total + (float) $r->amount, 2);
            }
            if ($total > 0) {
                $this->log($bill, 'credit_released', $user, ['amount' => $total]);
            }

            return $total;
        });
    }

    /** Credit applied to a bill that is being cancelled or edited goes back to where it came from (no guard: the bill's own guard ran). */
    public function releaseForBill(Voucher $bill): void
    {
        VoucherBillRef::where('against_voucher_id', $bill->id)->where('ref_type', 'against')->where('ref_name', self::MARK)->get()->each(fn ($r) => $this->restore($r));
    }

    /** What has been applied to a bill, for showing on it. */
    public function appliedTo(Voucher $bill): array
    {
        return DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
            ->where('b.against_voucher_id', $bill->id)->where('b.ref_type', 'against')->where('b.ref_name', self::MARK)->where('v.status', Voucher::POSTED)
            ->get(['b.voucher_id', 'v.voucher_number', 'b.amount'])
            ->map(fn ($r) => ['voucher_id' => (int) $r->voucher_id, 'voucher_number' => $r->voucher_number, 'amount' => round((float) $r->amount, 2)])->all();
    }

    // ── the two bill-reference moves ─────────────────────────────────────

    private function move(Voucher $src, Voucher $bill, float $take): void
    {
        $adv = VoucherBillRef::where('voucher_id', $src->id)->where('ref_type', 'advance')->lockForUpdate()->first();
        if (! $adv || (float) $adv->amount + 0.005 < $take) {
            throw new BooksException("{$src->voucher_number} no longer has that much credit.");
        }
        $rest = round((float) $adv->amount - $take, 2);
        $rest <= 0.004 ? $adv->delete() : $adv->update(['amount' => $rest]);

        $row = VoucherBillRef::where('voucher_id', $src->id)->where('ref_type', 'against')->where('against_voucher_id', $bill->id)->where('ref_name', self::MARK)->first();
        $row
            ? $row->update(['amount' => round((float) $row->amount + $take, 2)])
            : VoucherBillRef::create(['voucher_id' => $src->id, 'ledger_id' => $bill->party_ledger_id, 'ref_type' => 'against', 'ref_name' => self::MARK,
                'against_voucher_id' => $bill->id, 'amount' => $take, 'created_at' => now()]);
    }

    private function restore(VoucherBillRef $against): void
    {
        $adv = VoucherBillRef::where('voucher_id', $against->voucher_id)->where('ref_type', 'advance')->first();
        $adv
            ? $adv->update(['amount' => round((float) $adv->amount + (float) $against->amount, 2)])
            : VoucherBillRef::create(['voucher_id' => $against->voucher_id, 'ledger_id' => $against->ledger_id, 'ref_type' => 'advance', 'amount' => $against->amount, 'created_at' => now()]);
        $against->delete();
    }

    private function log(Voucher $v, string $action, ?User $user, array $detail): void
    {
        VoucherAuditLog::create(['voucher_id' => $v->id, 'action' => $action, 'user_id' => $user?->id, 'detail' => $detail, 'created_at' => now()]);
    }
}

<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherAuditLog;
use App\Models\Books\VoucherBillRef;
use App\Models\Books\VoucherInstrument;
use App\Models\Books\VoucherType;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The cheque register. Cheques we receive go received -> deposited -> cleared, or bounce; cheques we write go issued ->
 * cleared. Moving a cheque along posts nothing (a received cheque was posted to the bank on the receipt date, flagged
 * uncleared). A **bounce** is one linked Journal: Dr the customer / Cr the bank for the cheque, the receipt's settlements
 * taken back so the original invoices are open again, the bank's fee (Dr Bank Charges / Cr Bank) and — if we bill it on —
 * the fee charged to the customer as its own bill. Cancelling that journal puts the cheque back as it was.
 */
class ChequeService
{
    public const BOUNCE_ROLES = ['finance', 'super_admin'];

    public function __construct(private VoucherService $vouchers, private OpenBillsService $open) {}

    // ── the register ─────────────────────────────────────────────────────

    /** @param array{status?: string, search?: string} $f  status: in_hand | post_dated | deposited | issued | cleared | bounced | all */
    public function register(array $f = []): array
    {
        $today = today();
        $q = DB::table('voucher_instruments as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->leftJoin('ledgers as p', 'p.id', '=', 'v.party_ledger_id')
            ->join('ledgers as b', 'b.id', '=', 'i.ledger_id')->where('i.type', 'cheque')->where('i.status', '!=', 'cancelled')
            ->select('i.*', 'v.voucher_number', 'v.date as voucher_date', 'p.name as party', 'b.name as our_bank');

        $all = $q->get();
        $summary = ['in_hand' => ['n' => 0, 'amount' => 0.0], 'post_dated' => ['n' => 0, 'amount' => 0.0], 'deposited' => ['n' => 0, 'amount' => 0.0], 'issued' => ['n' => 0, 'amount' => 0.0], 'bounced' => ['n' => 0, 'amount' => 0.0], 'cleared' => ['n' => 0, 'amount' => 0.0]];
        foreach ($all as $r) {
            $g = $this->group($r, $today);
            foreach (array_unique([$g, $r->status === 'received' ? 'in_hand' : null]) as $k) {
                if ($k && isset($summary[$k])) {
                    $summary[$k]['n']++;
                    $summary[$k]['amount'] = round($summary[$k]['amount'] + (float) $r->amount, 2);
                }
            }
        }

        $status = $f['status'] ?? 'in_hand';
        $search = trim((string) ($f['search'] ?? ''));
        $rows = $all->filter(function ($r) use ($status, $today, $search) {
            $g = $this->group($r, $today);
            $ok = match ($status) {
                'all' => true,
                'in_hand' => $r->status === 'received',
                default => $g === $status,
            };
            if ($ok && $search !== '') {
                $hay = strtolower(implode(' ', [$r->number, $r->party, $r->voucher_number, $r->bank_name, $r->our_bank]));
                $ok = str_contains($hay, strtolower($search));
            }

            return $ok;
        })->sortBy([['instrument_date', 'asc'], ['id', 'asc']])->map(function ($r) use ($today) {
            $date = Carbon::parse($r->instrument_date ?? $r->voucher_date);

            return [
                'id' => (int) $r->id, 'voucher_id' => (int) $r->voucher_id, 'voucher_number' => $r->voucher_number, 'direction' => $r->direction, 'number' => $r->number,
                'party' => $r->party, 'bank_name' => $r->bank_name, 'our_bank' => $r->our_bank, 'amount' => round((float) $r->amount, 2), 'status' => $r->status,
                'voucher_date' => (string) $r->voucher_date, 'cheque_date' => $date->toDateString(), 'days_to_date' => (int) $today->diffInDays($date, false),
                'post_dated' => $date->gt($today) && in_array($r->status, ['received', 'issued'], true), 'deposited_on' => $r->deposited_on, 'cleared_on' => $r->cleared_on,
                'bounce_voucher_id' => $r->bounce_voucher_id ? (int) $r->bounce_voucher_id : null, 'bounce_reason' => $r->bounce_reason,
                'actions' => $this->actions($r, $date, $today),
            ];
        })->values()->all();

        return ['rows' => $rows, 'summary' => $summary];
    }

    // ── moving a cheque along (posts nothing) ────────────────────────────

    public function move(int $instrumentId, string $action, ?string $date, ?User $user): VoucherInstrument
    {
        return DB::transaction(function () use ($instrumentId, $action, $date, $user) {
            $i = VoucherInstrument::where('type', 'cheque')->lockForUpdate()->findOrFail($instrumentId);
            $v = Voucher::findOrFail($i->voucher_id);
            if ($v->status !== Voucher::POSTED) {
                throw new BooksException('That voucher is cancelled.');
            }
            $on = $date ? Carbon::parse($date)->toDateString() : today()->toDateString();
            $chequeDate = Carbon::parse($i->instrument_date ?? $v->date);
            $in = $i->direction === 'in';

            switch ($action) {
                case 'deposit':
                    $this->need($in && $i->status === 'received', 'Only a cheque we are holding can be deposited.');
                    if ($chequeDate->gt(Carbon::parse($on))) {
                        throw new BooksException("This cheque is dated {$chequeDate->toDateString()}; it can be banked from then.");
                    }
                    $i->update(['status' => 'deposited', 'deposited_on' => $on, 'status_at' => now()]);
                    break;
                case 'clear':
                    $this->need(($in && $i->status === 'deposited') || (! $in && $i->status === 'issued'), $in ? 'Deposit the cheque before it can clear.' : 'Only an issued cheque can clear.');
                    $i->update(['status' => 'cleared', 'cleared_on' => $on, 'status_at' => now()]);
                    break;
                case 'undo':
                    if ($i->status === 'deposited') {
                        $i->update(['status' => 'received', 'deposited_on' => null, 'status_at' => now()]);
                    } elseif ($i->status === 'cleared') {
                        $i->update(['status' => $in ? 'deposited' : 'issued', 'cleared_on' => null, 'status_at' => now()]);
                    } elseif ($i->status === 'bounced') {
                        throw new BooksException('A bounce is undone by cancelling its journal' . ($i->bounce_voucher_id ? ' (' . Voucher::whereKey($i->bounce_voucher_id)->value('voucher_number') . ')' : '') . '.');
                    } else {
                        throw new BooksException('There is nothing to undo on this cheque.');
                    }
                    break;
                default:
                    throw new BooksException('Unknown action.');
            }
            VoucherAuditLog::create(['voucher_id' => $v->id, 'action' => 'cheque_' . $action, 'user_id' => $user?->id, 'detail' => ['cheque' => $i->number, 'on' => $on], 'created_at' => now()]);

            return $i->fresh();
        });
    }

    // ── the bounce ───────────────────────────────────────────────────────

    /**
     * @param  array{reason: string, bank_fee?: float, bill_fee?: ?float, date?: ?string}  $o  bill_fee null = the same as the bank fee; 0 = waived
     */
    public function bounce(int $instrumentId, array $o, ?User $user): Voucher
    {
        if (! $user || ! in_array($user->role, self::BOUNCE_ROLES, true)) {
            throw new BooksException('Only finance or a super admin can record a bounced cheque.');
        }
        $reason = trim((string) ($o['reason'] ?? ''));
        if ($reason === '') {
            throw new BooksException('Say why the cheque bounced.');
        }

        return DB::transaction(function () use ($instrumentId, $o, $reason, $user) {
            $i = VoucherInstrument::where('type', 'cheque')->lockForUpdate()->findOrFail($instrumentId);
            if ($i->direction !== 'in' || ! in_array($i->status, ['received', 'deposited'], true)) {
                throw new BooksException('Only a cheque we received, not yet cleared, can bounce.');
            }
            $r = Voucher::with('type')->findOrFail($i->voucher_id);
            if ($r->status !== Voucher::POSTED || $r->type->base_type !== VoucherType::RECEIPT) {
                throw new BooksException('That cheque is not on a posted receipt.');
            }
            if (! empty($r->meta['withholding'])) {
                throw new BooksException("{$r->voucher_number} withheld tax, so it can not be bounced automatically. Cancel it and enter the receipt again.");
            }
            $amount = round((float) $i->amount, 2);
            $refunded = (float) DB::table('voucher_bill_refs as b')->join('vouchers as v', 'v.id', '=', 'b.voucher_id')
                ->where('b.against_voucher_id', $r->id)->where('b.ref_type', 'against')->where('v.status', Voucher::POSTED)->sum('b.amount');
            if ($refunded > 0.005) {
                throw new BooksException("Part of {$r->voucher_number} was refunded to the customer. Cancel the refund first.");
            }

            // what the receipt settled (typed or from credit applied) is opened again; what was left of it on account is used up
            $reopen = VoucherBillRef::where('voucher_id', $r->id)->where('ref_type', 'against')->whereNotNull('against_voucher_id')
                ->selectRaw('against_voucher_id, SUM(amount) as amt')->groupBy('against_voucher_id')->get()
                ->map(fn ($x) => ['against_voucher_id' => (int) $x->against_voucher_id, 'amount' => round((float) $x->amt, 2)])->filter(fn ($x) => $x['amount'] > 0.004)->values()->all();
            $credit = $this->open->creditLeft($r->id);
            $sum = round(array_sum(array_column($reopen, 'amount')) + max(0, $credit), 2);
            if (abs($sum - $amount) > 0.01) {
                throw new BooksException("{$r->voucher_number} settled " . number_format($sum, 2) . ' but the cheque is ' . number_format($amount, 2) . ', so it can not be bounced automatically.');
            }

            $bankFee = round(max(0, (float) ($o['bank_fee'] ?? 0)), 2);
            $billFee = array_key_exists('bill_fee', $o) && $o['bill_fee'] !== null ? round(max(0, (float) $o['bill_fee']), 2) : $bankFee;
            $settings = AccountingSetting::current();
            if (($bankFee > 0 || $billFee > 0) && ! $settings->bank_charges_ledger_id) {
                throw new BooksException('Choose the Bank charges ledger in Books settings first.');
            }
            if ($billFee > $bankFee + 0.004 && ! $settings->bounce_fee_ledger_id) {
                throw new BooksException('Choose the Bounced cheque charges ledger in Books settings first.');
            }
            $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

            $party = (int) $r->party_ledger_id;
            $bank = (int) $i->ledger_id;
            $entries = [['ledger_id' => $party, 'side' => 'D', 'amount' => $amount, 'is_party' => true, 'narration' => "Cheque {$i->number} returned"], ['ledger_id' => $bank, 'side' => 'C', 'amount' => $amount]];
            if ($bankFee > 0) {
                $entries[] = ['ledger_id' => $settings->bank_charges_ledger_id, 'side' => 'D', 'amount' => $bankFee, 'narration' => 'Bank charge for the returned cheque'];
                $entries[] = ['ledger_id' => $bank, 'side' => 'C', 'amount' => $bankFee];
            }
            if ($billFee > 0) {
                $entries[] = ['ledger_id' => $party, 'side' => 'D', 'amount' => $billFee, 'is_party' => true, 'narration' => 'Bounced cheque fee billed'];
                $fromCharges = min($billFee, $bankFee);
                if ($fromCharges > 0) {
                    $entries[] = ['ledger_id' => $settings->bank_charges_ledger_id, 'side' => 'C', 'amount' => $fromCharges, 'narration' => 'Recovered from the customer'];
                }
                if ($billFee - $fromCharges > 0.004) {
                    $entries[] = ['ledger_id' => $settings->bounce_fee_ledger_id, 'side' => 'C', 'amount' => round($billFee - $fromCharges, 2)];
                }
            }

            $journal = $this->vouchers->create([
                'voucher_type_id' => $type->id, 'date' => $o['date'] ?? today()->toDateString(), 'party_ledger_id' => $party, 'customer_id' => $r->customer_id,
                'reference_no' => $i->number,
                'narration' => "Bounced cheque {$i->number}" . ($i->bank_name ? " ({$i->bank_name})" : '') . " on {$r->voucher_number} — {$reason}",
                'entries' => $entries, 'reopen' => $reopen, 'credit_off' => $credit > 0.004 ? ['voucher_id' => $r->id, 'amount' => $credit] : null, 'fee_bill' => $billFee, 'bounce_instrument_id' => $i->id,
                'meta' => ['bounce' => ['instrument_id' => $i->id, 'cheque' => $i->number, 'receipt' => $r->voucher_number, 'receipt_id' => $r->id, 'reason' => $reason, 'amount' => $amount, 'bank_fee' => $bankFee, 'billed_fee' => $billFee, 'was' => $i->status]],
            ], $user);

            $i->update(['status' => 'bounced', 'status_at' => now(), 'bounce_voucher_id' => $journal->id, 'bounce_reason' => $reason]);
            try {
                app(RewardService::class)->onCancel($r);   // points and spend earned on this money come off
            } catch (\Throwable $e) {
                report($e);
            }
            VoucherAuditLog::create(['voucher_id' => $r->id, 'action' => 'cheque_bounced', 'user_id' => $user->id, 'detail' => ['cheque' => $i->number, 'journal' => $journal->voucher_number, 'reason' => $reason], 'created_at' => now()]);

            return $journal;
        });
    }

    /** The bounce journal was cancelled: the cheque is back as it was and the receipt earns what it earned. */
    public function onBounceCancelled(Voucher $journal): void
    {
        $b = $journal->meta['bounce'] ?? null;
        if (! $b) {
            return;
        }
        VoucherInstrument::whereKey($b['instrument_id'])->update(['status' => $b['was'] ?? 'received', 'bounce_voucher_id' => null, 'bounce_reason' => null, 'status_at' => now()]);
        $r = Voucher::find($b['receipt_id'] ?? null);
        if ($r && $r->status === Voucher::POSTED) {
            try {
                app(RewardService::class)->onMoneyReceived($r);
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private function need(bool $ok, string $msg): void
    {
        if (! $ok) {
            throw new BooksException($msg);
        }
    }

    private function group(object $r, Carbon $today): string
    {
        return match (true) {
            $r->status === 'bounced' => 'bounced',
            $r->status === 'cleared' => 'cleared',
            $r->status === 'deposited' => 'deposited',
            $r->status === 'issued' => 'issued',
            Carbon::parse($r->instrument_date ?? $r->voucher_date)->gt($today) => 'post_dated',
            default => 'in_hand',
        };
    }

    /** @return string[] what can be done with this cheque now */
    private function actions(object $r, Carbon $date, Carbon $today): array
    {
        return match ($r->status) {
            'received' => array_values(array_filter([$date->lte($today) ? 'deposit' : null, 'bounce'])),
            'deposited' => ['clear', 'bounce', 'undo'],
            'issued' => ['clear'],
            'cleared' => ['undo'],
            default => [],
        };
    }
}

<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherInstrument;
use App\Models\Books\VoucherType;
use Illuminate\Support\Facades\DB;

/**
 * The instrument behind money that goes through a bank: for a Receipt or Payment on a bank ledger — how (electronic fund
 * transfer, other transfer, cheque, mobile money, card), its number and date (a cheque may be post-dated) and the other
 * party's bank; for a Contra between cash and bank — the deposit slip (number, date, who deposited) or the withdrawal slip.
 * A cheque we receive is posted to the bank ledger on the receipt date and stays *received* (uncleared) until the cheque
 * register clears it; everything else is cleared at once.
 */
class InstrumentService
{
    public const TYPES = ['eft' => 'Electronic fund transfer', 'transfer' => 'Other transfer', 'cheque' => 'Cheque', 'mobile' => 'Mobile money', 'card' => 'Card'];
    /** once a cheque has moved on, its voucher is not edited or cancelled until that is undone */
    public const LOCKED = ['deposited', 'cleared', 'bounced'];

    public function __construct(private LedgerService $ledgers) {}

    /** Record (or replace) the voucher's instrument from what the form sent. Nothing sent = none, and any earlier one goes. */
    public function sync(Voucher $v, array $data): void
    {
        $v->loadMissing('type', 'entries');
        $base = $v->type->base_type;
        VoucherInstrument::where('voucher_id', $v->id)->delete();

        if (in_array($base, [VoucherType::RECEIPT, VoucherType::PAYMENT], true)) {
            $in = $data['instrument'] ?? null;
            if (! $in || empty($in['type'])) {
                return;
            }
            $bank = $this->moneyLedger($v, 'bank');
            if (! $bank) {
                throw new BooksException('A cheque or transfer reference goes with a bank account — this voucher does not use one.');
            }
            $type = (string) $in['type'];
            if (! isset(self::TYPES[$type])) {
                throw new BooksException('Choose how it was ' . ($base === VoucherType::RECEIPT ? 'received' : 'paid') . '.');
            }
            $accepts = array_filter(explode(',', (string) $bank->accepts));
            if ($accepts && ! in_array($type, $accepts, true)) {
                throw new BooksException("{$bank->name} does not take " . strtolower(self::TYPES[$type]) . '.');
            }
            $number = trim((string) ($in['number'] ?? ''));
            if ($type === 'cheque' && $number === '') {
                throw new BooksException('Enter the cheque number.');
            }
            $receipt = $base === VoucherType::RECEIPT;
            $bankName = trim((string) ($in['bank_name'] ?? '')) ?: null;
            if ($type === 'cheque' && $number !== '') {
                // a received cheque is told apart by its number and the bank it is drawn on; our own by the number on our account
                $dup = VoucherInstrument::where('type', 'cheque')->where('number', $number)->where('status', '!=', 'cancelled')->where('voucher_id', '!=', $v->id)
                    ->where('direction', $receipt ? 'in' : 'out')
                    ->when($receipt, fn ($q) => $q->where('bank_name', $bankName), fn ($q) => $q->where('ledger_id', $bank->id))->first();
                if ($dup) {
                    $no = Voucher::whereKey($dup->voucher_id)->value('voucher_number');
                    throw new BooksException("Cheque {$number} is already recorded on {$no}.");
                }
            }
            $cheque = $type === 'cheque';
            VoucherInstrument::create([
                'voucher_id' => $v->id, 'ledger_id' => $bank->id, 'direction' => $receipt ? 'in' : 'out', 'type' => $type, 'number' => $number ?: null,
                'instrument_date' => ! empty($in['date']) ? $in['date'] : $v->date, 'bank_name' => $bankName, 'reference' => trim((string) ($in['reference'] ?? '')) ?: null,
                'amount' => $v->total_amount, 'status' => $cheque ? ($receipt ? 'received' : 'issued') : 'cleared', 'status_at' => now(),
            ]);

            return;
        }

        if ($base === VoucherType::CONTRA) {
            $slip = $data['slip'] ?? null;
            $dr = $v->entries->firstWhere('side', 'D');
            $cr = $v->entries->firstWhere('side', 'C');
            if (! $dr || ! $cr) {
                return;
            }
            $drBank = $this->ledgers->isUnderGroup(Ledger::findOrFail($dr->ledger_id), 'Bank Accounts');
            $crBank = $this->ledgers->isUnderGroup(Ledger::findOrFail($cr->ledger_id), 'Bank Accounts');
            if ($drBank === $crBank) {
                return;   // bank to bank or cash to cash: no slip
            }
            $deposit = $drBank;   // money into the bank from cash
            $number = trim((string) ($slip['number'] ?? ''));
            if ($deposit && $number === '') {
                throw new BooksException('Enter the deposit slip number.');
            }
            if ($number === '' && empty($slip['date']) && empty($slip['by'])) {
                return;   // a withdrawal with no slip details
            }
            VoucherInstrument::create([
                'voucher_id' => $v->id, 'ledger_id' => $deposit ? $dr->ledger_id : $cr->ledger_id, 'direction' => $deposit ? 'in' : 'out', 'type' => $deposit ? 'deposit_slip' : 'withdrawal',
                'number' => $number ?: null, 'instrument_date' => ! empty($slip['date']) ? $slip['date'] : $v->date, 'deposited_by' => trim((string) ($slip['by'] ?? '')) ?: null,
                'amount' => $v->total_amount, 'status' => 'cleared', 'status_at' => now(),
            ]);
        }
    }

    /** A voucher is cancelled: its instrument goes with it. */
    public function void(Voucher $v): void
    {
        VoucherInstrument::where('voucher_id', $v->id)->update(['status' => 'cancelled', 'status_at' => now()]);
    }

    /** A cheque that has been deposited, cleared or bounced ties its voucher down. */
    public function assertEditable(Voucher $v, string $action): void
    {
        $i = VoucherInstrument::where('voucher_id', $v->id)->first();
        if ($i && in_array($i->status, self::LOCKED, true)) {
            throw new BooksException("Cheque {$i->number} on {$v->voucher_number} is already {$i->status}, so it can not be " . ($action === 'edit' ? 'edited' : 'cancelled') . ' here. Undo that in the cheque register first.');
        }
    }

    public function forVoucher(int $voucherId): ?array
    {
        $i = VoucherInstrument::with('ledger:id,name')->where('voucher_id', $voucherId)->first();

        return $i ? [
            'type' => $i->type, 'label' => self::TYPES[$i->type] ?? ($i->type === 'deposit_slip' ? 'Deposit slip' : 'Withdrawal slip'), 'number' => $i->number,
            'date' => $i->instrument_date?->toDateString(), 'bank_name' => $i->bank_name, 'deposited_by' => $i->deposited_by, 'reference' => $i->reference,
            'status' => $i->status, 'direction' => $i->direction, 'ledger' => $i->ledger?->name,
        ] : null;
    }

    /** The bank ledger a voucher's money went through. */
    private function moneyLedger(Voucher $v, string $only = 'bank'): ?Ledger
    {
        foreach ($v->entries as $e) {
            if ($e->is_party || $e->is_tax) {
                continue;
            }
            $l = Ledger::find($e->ledger_id);
            if ($l && $this->ledgers->isUnderGroup($l, 'Bank Accounts')) {
                return $l;
            }
        }

        return null;
    }
}

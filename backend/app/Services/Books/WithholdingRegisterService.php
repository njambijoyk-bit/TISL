<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\TaxRate;
use App\Models\User;
use App\Models\WithholdingCertificate;
use App\Models\WithholdingCredit;
use App\Models\WithholdingCreditClearance;
use Illuminate\Support\Facades\DB;

/**
 * Withholding lives in the vouchers. A Receipt (a customer held tax back from us) or a Payment (we held
 * it back from a supplier) that carries withholding posts the tax to the type's receivable / payable
 * ledger; this register keeps the paper trail on top of that:
 *   - a certificate per such voucher (number, status, scanned document),
 *   - for receipts, the credit we can still claim, cleared or written off by Journal vouchers.
 */
class WithholdingRegisterService
{
    public function __construct(private VoucherService $vouchers, private LedgerService $ledgers) {}

    /** Create / refresh the certificate for a posted Receipt or Payment (and drop it if the withholding was removed). */
    public function sync(Voucher $voucher): void
    {
        $voucher->loadMissing('type');
        if (! in_array($voucher->type->base_type, [VoucherType::RECEIPT, VoucherType::PAYMENT], true)) {
            return;
        }
        $w = $voucher->meta['withholding'] ?? null;
        $existing = WithholdingCertificate::where('voucher_id', $voucher->id)->first();
        $withheld = round((float) ($w['amount'] ?? 0), 2);

        if ($withheld <= 0) {
            if ($existing) {
                $this->assertUntouched($existing);
                $existing->update(['status' => WithholdingCertificate::STATUS_VOID, 'credit_status' => null]);
            }

            return;
        }
        $receipt = $voucher->type->base_type === VoucherType::RECEIPT;
        // a customer's receipt carries only what was paid; the gross it settles is that plus what they withheld
        $gross = round((float) $voucher->total_amount + ($receipt ? $withheld : 0.0), 2);
        $row = [
            'customer_id'     => $voucher->customer_id,
            'voucher_id'      => $voucher->id,
            'direction'       => $receipt ? 'receivable' : 'payable',
            'party_ledger_id' => $voucher->party_ledger_id,
            'tax_rate_id'     => $w['tax_rate_id'] ?? null,
            'currency_id'     => $voucher->currency_id,
            'exchange_rate'   => $voucher->exchange_rate ?: 1,
            'gross_amount'    => $gross,
            'withheld_amount' => $withheld,
            'net_amount'      => round($gross - $withheld, 2),
        ];
        if ($existing) {
            if (abs((float) $existing->withheld_amount - $withheld) > 0.005) {
                $this->assertUntouched($existing);
            }
            $existing->update($row + ['status' => $existing->status === WithholdingCertificate::STATUS_VOID ? WithholdingCertificate::STATUS_PENDING : $existing->status,
                'credit_status' => $receipt ? $existing->credit_status : null]);

            return;
        }
        WithholdingCertificate::create($row + [
            'certificate_number' => ($w['certificate_no'] ?? null) ?: $this->number(),
            'status'             => WithholdingCertificate::STATUS_PENDING,
            'credit_status'      => null,   // a receipt's credit begins when the customer's certificate is recorded — see settle()
            'cleared_amount'     => 0,
        ]);
    }

    /**
     * The customer's certificate has arrived: what they withheld stops being owed by them and becomes a tax credit we hold.
     * Books a Receipt whose "bank" is the tax receivable — Dr Tax receivable, Cr the customer — against the same invoices the
     * original receipt settled, then starts the credit (held) so it can be set against our own tax.
     */
    public function settle(WithholdingCertificate $cert, ?string $number, ?string $on, ?User $user): Voucher
    {
        return DB::transaction(function () use ($cert, $number, $on, $user) {
            $cert = WithholdingCertificate::whereKey($cert->id)->lockForUpdate()->firstOrFail();
            if ($cert->direction !== 'receivable') {
                throw new BooksException('Only tax a customer withheld from us waits for a certificate this way.');
            }
            if ($cert->status === WithholdingCertificate::STATUS_VOID || ! $cert->voucher_id) {
                throw new BooksException('This certificate was voided with its receipt.');
            }
            if ($cert->credit_status !== null) {
                throw new BooksException('This certificate was already recorded — the tax is booked as a credit.');
            }
            $receipt = Voucher::findOrFail($cert->voucher_id);
            if ($receipt->status !== Voucher::POSTED) {
                throw new BooksException('The receipt this certificate belongs to is not live.');
            }
            $withheld = round((float) $cert->withheld_amount, 2);
            $type = VoucherType::byBase(VoucherType::RECEIPT) ?? throw new BooksException('The Receipt voucher type is switched off.');
            $receivable = $this->receivableLedger($cert);

            // the same bills the receipt settled, cut down to what was withheld (the last takes the rounding)
            $refs = DB::table('voucher_bill_refs')->where('voucher_id', $receipt->id)->where('ref_type', 'against')->orderBy('id')->get(['against_voucher_id', 'amount']);
            $paid = round((float) $refs->sum('amount'), 2);
            $allocs = [];
            $left = $withheld;
            foreach ($refs as $i => $r) {
                $amt = $i === $refs->count() - 1 ? $left : round((float) $r->amount / max($paid, 0.01) * $withheld, 2);
                $amt = max(0.0, min($amt, $left));
                if ($amt > 0) {
                    $allocs[] = ['against_voucher_id' => (int) $r->against_voucher_id, 'amount' => $amt];
                }
                $left = round($left - $amt, 2);
            }

            $voucher = $this->vouchers->create([
                'voucher_type_id' => $type->id, 'date' => $on ?? now()->toDateString(), 'location_id' => $receipt->location_id,
                'customer_id' => $receipt->customer_id, 'party_ledger_id' => $receipt->party_ledger_id,
                'currency_id' => $cert->currency_id, 'exchange_rate' => $cert->exchange_rate ?: null,
                'ledger_id' => $receivable, 'amount' => $withheld, 'allocations' => $allocs, 'source_voucher_id' => $receipt->id,
                'narration' => "Withholding certificate {$cert->certificate_number} received for {$receipt->voucher_number}",
                'meta' => ['withholding_settlement' => $cert->id],
            ], $user);

            $row = ['credit_status' => WithholdingCredit::STATUS_HELD, 'status' => WithholdingCertificate::STATUS_RECEIVED];
            if ($number && $number !== $cert->certificate_number && ! WithholdingCertificate::where('certificate_number', $number)->exists()) {
                $row['certificate_number'] = $number;
            }
            $cert->update($row);

            return $voucher;
        });
    }

    /** The voucher is being cancelled: its certificate is void — unless part of its credit was already cleared. */
    public function void(Voucher $voucher): void
    {
        // the entry made when a certificate arrived is being cancelled: the tax is owed by the customer again
        if (! empty($voucher->meta['withholding_settlement'])) {
            $cert = WithholdingCertificate::find($voucher->meta['withholding_settlement']);
            if ($cert) {
                $this->assertUntouched($cert);
                $cert->update(['credit_status' => null, 'status' => WithholdingCertificate::STATUS_PENDING]);
            }

            return;
        }
        $cert = WithholdingCertificate::where('voucher_id', $voucher->id)->first();
        if ($cert) {
            $this->assertUntouched($cert);
            $cert->update(['status' => WithholdingCertificate::STATUS_VOID, 'credit_status' => null]);
        }
        // a clearance / write-off journal being cancelled re-opens the credit
        foreach (WithholdingCreditClearance::where('voucher_id', $voucher->id)->whereNull('voided_at')->get() as $cl) {
            $cl->update(['voided_at' => now()]);
            $this->refreshCredit((int) $cl->certificate_id);
        }
    }

    private function assertUntouched(WithholdingCertificate $cert): void
    {
        if (WithholdingCreditClearance::where('certificate_id', $cert->id)->whereNull('voided_at')->exists()) {
            throw new BooksException("Certificate {$cert->certificate_number} has clearances against it. Cancel those journal vouchers first.");
        }
    }

    /**
     * Set (part of) a credit against our own tax liability or a refund: Dr <against ledger>, Cr the tax receivable.
     *
     * @param  int  $againstLedgerId  the tax payable we offset it against, or the bank ledger a refund landed in
     */
    public function clear(WithholdingCredit $credit, float $amount, int $againstLedgerId, ?string $on, ?string $reference, ?string $notes, ?User $user): WithholdingCreditClearance
    {
        return DB::transaction(function () use ($credit, $amount, $againstLedgerId, $on, $reference, $notes, $user) {
            $credit = WithholdingCredit::whereKey($credit->id)->lockForUpdate()->firstOrFail();
            $amount = round($amount, 2);
            if ($amount <= 0) {
                throw new BooksException('Clearance amount must be positive.');
            }
            if (! in_array($credit->status, [WithholdingCredit::STATUS_HELD, WithholdingCredit::STATUS_PARTIALLY_CLEARED], true)) {
                throw new BooksException('This credit is already ' . str_replace('_', ' ', (string) $credit->status) . '.');
            }
            if ($amount > $credit->remainingAmount() + 0.005) {
                throw new BooksException('Clearance amount exceeds the ' . number_format($credit->remainingAmount(), 2) . ' left on this credit.');
            }
            $receivable = $this->receivableLedger($credit);
            $against = Ledger::findOrFail($againstLedgerId);
            $voucher = $this->journal($credit, $on, "Withholding credit {$credit->certificate_number} cleared" . ($reference ? " ({$reference})" : ''), [
                ['ledger_id' => $against->id, 'side' => 'D', 'amount' => $amount, 'narration' => $notes],
                ['ledger_id' => $receivable, 'side' => 'C', 'amount' => $amount],
            ], $user);

            $clearance = WithholdingCreditClearance::create([
                'certificate_id' => $credit->id, 'voucher_id' => $voucher->id, 'kind' => 'clearance', 'amount' => $amount,
                'cleared_on' => $on ?? now()->toDateString(), 'reference' => $reference, 'notes' => $notes, 'cleared_by' => $user?->id,
            ]);
            $this->refreshCredit($credit->id);

            return $clearance;
        });
    }

    /** The rest of the credit will not be recovered: Dr Withholding Tax Written Off, Cr the tax receivable. */
    public function writeOff(WithholdingCredit $credit, ?string $reason, ?User $user): void
    {
        DB::transaction(function () use ($credit, $reason, $user) {
            $credit = WithholdingCredit::whereKey($credit->id)->lockForUpdate()->firstOrFail();
            $left = $credit->remainingAmount();
            if ($left <= 0.005 || ! in_array($credit->status, [WithholdingCredit::STATUS_HELD, WithholdingCredit::STATUS_PARTIALLY_CLEARED], true)) {
                throw new BooksException('There is nothing left on this credit to write off.');
            }
            $expenses = LedgerGroup::where('name', 'Indirect Expenses')->firstOrFail();
            $expense = $this->ledgers->ensure('Withholding Tax Written Off', $expenses->id, ['is_system' => true]);
            $voucher = $this->journal($credit, null, "Withholding credit {$credit->certificate_number} written off" . ($reason ? ": {$reason}" : ''), [
                ['ledger_id' => $expense->id, 'side' => 'D', 'amount' => $left],
                ['ledger_id' => $this->receivableLedger($credit), 'side' => 'C', 'amount' => $left],
            ], $user);
            WithholdingCreditClearance::create([
                'certificate_id' => $credit->id, 'voucher_id' => $voucher->id, 'kind' => 'writeoff', 'amount' => $left,
                'cleared_on' => now()->toDateString(), 'notes' => $reason, 'cleared_by' => $user?->id,
            ]);
            $this->refreshCredit($credit->id);
        });
    }

    /** Re-derive cleared amount and credit status from the live (un-voided) clearances. */
    public function refreshCredit(int $certificateId): void
    {
        $cert = WithholdingCertificate::findOrFail($certificateId);
        $rows = WithholdingCreditClearance::where('certificate_id', $certificateId)->whereNull('voided_at');
        $cleared = round((float) (clone $rows)->where('kind', 'clearance')->sum('amount'), 2);
        $wroteOff = (clone $rows)->where('kind', 'writeoff')->exists();
        $status = $wroteOff ? WithholdingCredit::STATUS_WRITTEN_OFF
            : ($cleared <= 0 ? WithholdingCredit::STATUS_HELD : ($cleared + 0.005 >= (float) $cert->withheld_amount ? WithholdingCredit::STATUS_CLEARED : WithholdingCredit::STATUS_PARTIALLY_CLEARED));
        $cert->update(['cleared_amount' => $cleared, 'credit_status' => $status]);
    }

    private function receivableLedger(WithholdingCredit|WithholdingCertificate $credit): int
    {
        $rate = TaxRate::with('taxType')->find($credit->tax_rate_id);

        return (int) ($rate?->taxType?->receivable_ledger_id
            ?? throw new BooksException('This credit has no tax receivable ledger. Check the withholding tax type.'));
    }

    private function journal(WithholdingCredit $credit, ?string $on, string $narration, array $entries, ?User $user): Voucher
    {
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

        return $this->vouchers->create([
            'voucher_type_id' => $type->id, 'date' => $on ?? now()->toDateString(), 'narration' => $narration,
            'currency_id' => $credit->currency_id, 'exchange_rate' => $credit->exchange_rate ?: null, 'entries' => $entries, 'meta' => ['withholding_credit_id' => $credit->id],
        ], $user);
    }

    /** WHT-YYYYMMDD-XXXXXX, retried on the rare collision since certificate_number is unique. */
    private function number(): string
    {
        do {
            $n = 'WHT-' . now()->format('Ymd') . '-' . str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        } while (WithholdingCertificate::where('certificate_number', $n)->exists());

        return $n;
    }
}

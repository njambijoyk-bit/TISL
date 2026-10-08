<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\User;

/**
 * Writing off what a customer will not pay. A Journal — Dr the bad-debts (or small-balance) ledger, Cr the customer — that
 * settles the invoice bill(s), so ageing, statements and the open-bills list all drop them. Finance and super-admin only;
 * a reason is always given; cancelling the journal opens the invoice again. The goods were delivered, so loyalty points and
 * promo use on the original sale stay; tax is not adjusted (bad-debt VAT relief has conditions — the accountant's call).
 */
class WriteOffService
{
    public const KINDS = ['bad_debt' => 'Bad debt', 'small_balance' => 'Small balance (discount allowed)'];

    public function __construct(private VoucherService $vouchers, private OpenBillsService $open) {}

    /**
     * @param  array<int, array{voucher_id: int, amount: ?float}>  $items  the invoices and how much of each (null = all that is open)
     */
    public function writeOff(array $items, string $kind, string $reason, ?User $user, ?string $date = null): Voucher
    {
        if (! $user || ! $user->hasPermission('books.writeoff')) {
            throw new BooksException('You do not have permission to write off a balance.');
        }
        if (! isset(self::KINDS[$kind])) {
            throw new BooksException('Choose what kind of write-off this is.');
        }
        $reason = trim($reason);
        if ($reason === '') {
            throw new BooksException('Give a reason for the write-off.');
        }
        if (! $items) {
            throw new BooksException('Choose the invoice(s) to write off.');
        }

        $settings = AccountingSetting::current();
        $expenseId = $kind === 'bad_debt' ? $settings->bad_debt_ledger_id : $settings->discount_allowed_ledger_id;
        if (! $expenseId) {
            throw new BooksException('Choose the ' . ($kind === 'bad_debt' ? 'Bad debts written off' : 'Discount allowed') . ' ledger in Books settings first.');
        }
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

        $settles = [];
        $total = 0.0;
        $party = null;
        $customerId = null;
        $numbers = [];
        $vat = false;
        foreach ($items as $it) {
            $bill = Voucher::with('type')->find($it['voucher_id'] ?? null);
            if (! $bill || $bill->status !== Voucher::POSTED || $bill->type->base_type !== VoucherType::SALES) {
                throw new BooksException('Only an open sales invoice can be written off.');
            }
            if ($party !== null && $party !== $bill->party_ledger_id) {
                throw new BooksException('Write off one customer at a time.');
            }
            $party = $bill->party_ledger_id;
            $customerId = $bill->customer_id;
            $left = $this->vouchers->outstanding($bill);
            $amount = isset($it['amount']) && $it['amount'] !== null ? round((float) $it['amount'], 2) : $left;
            if ($amount <= 0.004) {
                throw new BooksException("{$bill->voucher_number} has nothing outstanding to write off.");
            }
            if ($amount - $left > 0.005) {
                throw new BooksException("{$bill->voucher_number} has only " . number_format($left, 2) . ' outstanding.');
            }
            $settles[] = ['against_voucher_id' => $bill->id, 'amount' => $amount];
            $numbers[] = $bill->voucher_number;
            $total = round($total + $amount, 2);
            $vat = $vat || (float) $bill->tax_total > 0;
        }

        $label = self::KINDS[$kind];
        $journal = $this->vouchers->create([
            'voucher_type_id' => $type->id, 'date' => $date ?? today()->toDateString(), 'party_ledger_id' => $party, 'customer_id' => $customerId,
            'reference_no' => implode(', ', $numbers),
            'narration' => "{$label}: write-off of " . implode(', ', $numbers) . " — {$reason}",
            'entries' => [
                ['ledger_id' => $expenseId, 'side' => 'D', 'amount' => $total, 'narration' => $reason],
                ['ledger_id' => $party, 'side' => 'C', 'amount' => $total, 'is_party' => true],
            ],
            'settles' => $settles,
            'meta' => ['writeoff' => ['kind' => $kind, 'reason' => $reason, 'bills' => $numbers, 'amount' => $total, 'vat_not_adjusted' => $vat]],
        ], $user);

        return $journal;
    }

    /** Every open invoice of one party (for "write off the whole balance"). @return array<int, array{voucher_id: int, amount: null}> */
    public function openInvoicesOf(int $ledgerId): array
    {
        return array_values(array_map(fn ($b) => ['voucher_id' => $b['voucher_id'], 'amount' => null],
            array_filter($this->open->forLedger($ledgerId)['bills'], fn ($b) => $b['side'] === 'receivable')));
    }
}

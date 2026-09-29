<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\GiftVoucher;
use App\Models\Books\GiftVoucherTransaction;
use App\Models\Books\Ledger;
use App\Models\Books\PaymentMethod;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\CompanyProfile;
use App\Models\User;
use App\Services\CurrencyConversionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Gift vouchers (formerly "store credit"). One liability ledger holds the money;
 * each gift voucher is a sub-ledger row with a code, holder, currency and expiry.
 *
 *   issue    → Journal:  Dr <where the value came from>  Cr Gift Vouchers Liability
 *   redeem   → a payment tender on a sale (Dr Gift Vouchers Liability)
 *   expire   → Journal:  Dr Gift Vouchers Liability      Cr Breakage Income
 */
class GiftVoucherService
{
    public function __construct(private CurrencyConversionService $money, private LedgerService $ledgers) {}

    private function liabilityLedgerId(): int
    {
        $id = AccountingSetting::current()->gift_voucher_ledger_id ?: Ledger::where('name', 'Gift Vouchers Liability')->value('id');

        return $id ?: throw new BooksException('Set the Gift Vouchers Liability ledger under Books settings (default ledgers).');
    }

    public function newCode(): string
    {
        do {
            $code = strtoupper(CompanyProfile::current()->short_code ?: 'GV') . '-GV-' . strtoupper(Str::random(8));
        } while (GiftVoucher::where('code', $code)->exists());

        return $code;
    }

    /**
     * @param  array  $d  amount, currency_id?, customer_id?, expires_at?, note?, source: sale|customer_account|loyalty|referral|promo|manual,
     *                    payment_method_id (sale), party_ledger_id (customer_account), date?, code?
     */
    public function issue(array $d, ?User $user = null): GiftVoucher
    {
        $amount = round((float) ($d['amount'] ?? 0), 2);
        if ($amount <= 0) {
            throw new BooksException('Enter the gift voucher amount.');
        }
        $source = $d['source'] ?? 'manual';
        if (! in_array($source, GiftVoucher::SOURCES, true)) {
            throw new BooksException('Unknown gift voucher source.');
        }
        $settings = AccountingSetting::current();
        $liability = $this->liabilityLedgerId();

        // the debit side depends on where the value comes from
        $debit = match ($source) {
            'sale'             => PaymentMethod::findOrFail($d['payment_method_id'] ?? 0)->ledger_id,
            'customer_account' => $d['party_ledger_id'] ?? throw new BooksException('Choose the customer account the value comes from.'),
            'loyalty'          => $settings->loyalty_liability_ledger_id ?: Ledger::where('name', 'Loyalty Points Liability')->value('id'),
            default            => $settings->rewards_expense_ledger_id ?: Ledger::where('name', 'Rewards & Referral Expense')->value('id'),
        };
        if (! $debit) {
            throw new BooksException('The ledger this gift voucher is funded from is not set — check Books settings (default ledgers).');
        }
        $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

        return DB::transaction(function () use ($d, $amount, $source, $debit, $liability, $journal, $user) {
            $gv = GiftVoucher::create([
                'code' => $d['code'] ?? $this->newCode(), 'customer_id' => $d['customer_id'] ?? null,
                'currency_id' => $d['currency_id'] ?? $this->money->getBaseCurrency()->id, 'initial_amount' => $amount, 'balance' => $amount,
                'expires_at' => $d['expires_at'] ?? null, 'status' => GiftVoucher::ACTIVE, 'source' => $source, 'note' => $d['note'] ?? null, 'created_by' => $user?->id,
            ]);
            $v = app(VoucherService::class)->create([
                'voucher_type_id' => $journal->id, 'date' => $d['date'] ?? today()->toDateString(), 'currency_id' => $gv->currency_id,
                'narration' => "Gift voucher {$gv->code} issued ({$source})", 'meta' => ['gift_voucher_id' => $gv->id],
                'entries' => [
                    ['ledger_id' => $debit, 'side' => 'D', 'amount' => $amount],
                    ['ledger_id' => $liability, 'side' => 'C', 'amount' => $amount],
                ],
            ], $user);
            $gv->update(['issued_voucher_id' => $v->id]);
            $this->log($gv, 'issue', $amount, $v->id, $d['note'] ?? null, $user);

            return $gv->fresh();
        });
    }

    /** Take value off a gift voucher for a sale. Returns the amount taken in the gift voucher's own currency. */
    public function redeem(GiftVoucher $gv, float $amountInGvCurrency, Voucher $sale, ?User $user = null): void
    {
        $gv = GiftVoucher::whereKey($gv->id)->lockForUpdate()->firstOrFail();
        if (! $gv->isSpendable()) {
            throw new BooksException("Gift voucher {$gv->code} can't be used (" . ($gv->status !== 'active' ? $gv->status : ((float) $gv->balance <= 0 ? 'no balance' : 'expired')) . ').');
        }
        if ($amountInGvCurrency - (float) $gv->balance > 0.005) {
            throw new BooksException("Gift voucher {$gv->code} has only " . number_format((float) $gv->balance, 2) . ' left.');
        }
        $new = round((float) $gv->balance - $amountInGvCurrency, 2);
        $gv->update(['balance' => $new, 'status' => $new <= 0 ? GiftVoucher::USED : GiftVoucher::ACTIVE]);
        $this->log($gv, 'redeem', -$amountInGvCurrency, $sale->id, null, $user);
    }

    /** Give back whatever a cancelled / altered sale had taken. */
    public function restoreFor(Voucher $sale, ?User $user = null): void
    {
        $txs = GiftVoucherTransaction::where('voucher_id', $sale->id)->where('type', 'redeem')->get();
        foreach ($txs as $t) {
            $gv = GiftVoucher::whereKey($t->gift_voucher_id)->lockForUpdate()->first();
            if (! $gv) {
                continue;
            }
            $back = abs((float) $t->amount);
            $new = round((float) $gv->balance + $back, 2);
            $gv->update(['balance' => $new, 'status' => $gv->status === GiftVoucher::USED ? GiftVoucher::ACTIVE : $gv->status]);
            $this->log($gv, 'restore', $back, $sale->id, "Restored from {$sale->voucher_number}", $user);
            $t->update(['type' => 'redeem_reversed']);
        }
    }

    /** Expire unspent, past-date vouchers into breakage income. Returns how many. */
    public function expireDue(?User $user = null): int
    {
        $settings = AccountingSetting::current();
        $breakage = $settings->breakage_income_ledger_id ?: Ledger::where('name', 'Gift Voucher Breakage Income')->value('id');
        if (! $breakage) {
            throw new BooksException('Set the breakage income ledger under Books settings.');
        }
        $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
        $n = 0;
        foreach (GiftVoucher::where('status', GiftVoucher::ACTIVE)->where('balance', '>', 0)->whereDate('expires_at', '<', today())->get() as $gv) {
            DB::transaction(function () use ($gv, $breakage, $journal, $user, &$n) {
                $amt = (float) $gv->balance;
                app(VoucherService::class)->create([
                    'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'currency_id' => $gv->currency_id,
                    'narration' => "Gift voucher {$gv->code} expired", 'meta' => ['gift_voucher_id' => $gv->id],
                    'entries' => [
                        ['ledger_id' => $this->liabilityLedgerId(), 'side' => 'D', 'amount' => $amt],
                        ['ledger_id' => $breakage, 'side' => 'C', 'amount' => $amt],
                    ],
                ], $user);
                $gv->update(['balance' => 0, 'status' => GiftVoucher::EXPIRED]);
                $this->log($gv, 'expire', -$amt, null, null, $user);
                $n++;
            });
        }

        return $n;
    }

    /** Does the sub-ledger agree with the liability ledger? */
    public function reconcile(): array
    {
        $sub = 0.0;
        foreach (GiftVoucher::where('status', GiftVoucher::ACTIVE)->get() as $gv) {
            $sub += (float) $gv->balance * $this->money->rateOn($gv->currency_id);
        }
        $ledger = -$this->ledgers->balance($this->liabilityLedgerId());

        return ['sub_ledger' => round($sub, 2), 'ledger' => round($ledger, 2), 'difference' => round($ledger - $sub, 2), 'balanced' => abs($ledger - $sub) < 1.0];
    }

    private function log(GiftVoucher $gv, string $type, float $amount, ?int $voucherId, ?string $note, ?User $user): void
    {
        GiftVoucherTransaction::create([
            'gift_voucher_id' => $gv->id, 'type' => $type, 'amount' => $amount, 'balance_after' => $gv->fresh()->balance ?? $gv->balance,
            'voucher_id' => $voucherId, 'note' => $note, 'created_by' => $user?->id, 'created_at' => now(),
        ]);
    }
}

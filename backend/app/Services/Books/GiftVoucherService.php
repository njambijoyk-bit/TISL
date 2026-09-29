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
            'customer_account', 'refund' => $d['party_ledger_id'] ?? throw new BooksException('Choose the customer account the value comes from.'),
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
                'narration' => "Gift voucher {$gv->code} issued ({$source})", 'meta' => ['gift_voucher_id' => $gv->id] + (empty($d['credit_note_id']) ? [] : ['credit_note_id' => $d['credit_note_id']]),
                'entries' => [
                    ['ledger_id' => $debit, 'side' => 'D', 'amount' => $amount],
                    ['ledger_id' => $liability, 'side' => 'C', 'amount' => $amount],
                ],
            ], $user);
            $gv->update(['issued_voucher_id' => $v->id]);
            $this->log($gv, 'issue', $amount, $v->id, $d['note'] ?? null, $user, (float) $v->base_total);

            return $gv->fresh();
        });
    }

    /**
     * Refund a Credit Note as a gift voucher instead of cash: Dr the customer's account (which the credit
     * note left in credit), Cr Gift Vouchers Liability. So the return costs Sales Returns, not Rewards expense.
     */
    public function issueFromCreditNote(Voucher $note, ?float $amount = null, ?string $expiresAt = null, ?User $user = null): GiftVoucher
    {
        $note->loadMissing('type');
        if ($note->type->base_type !== VoucherType::CREDIT_NOTE || $note->status !== Voucher::POSTED || ! $note->party_ledger_id) {
            throw new BooksException('Only a live Credit Note with a customer can be refunded as a gift voucher.');
        }
        $refunded = (float) ($note->meta['gift_refunded'] ?? 0);
        $available = round((float) $note->total_amount - $refunded, 2);
        $amount = round($amount ?? $available, 2);
        if ($amount <= 0 || $amount - $available > 0.005) {
            throw new BooksException('That is more than the ' . number_format($available, 2) . ' left to refund on ' . $note->voucher_number . '.');
        }
        // the customer's account must actually hold that much in credit (an unpaid invoice is settled by the note itself)
        $credit = -$this->ledgers->balance((int) $note->party_ledger_id);
        $inNoteCurrency = $credit / max((float) $note->exchange_rate, 0.00000001);
        if ($amount - $inNoteCurrency > 0.005) {
            throw new BooksException('The customer\'s account has only ' . number_format(max(0, $inNoteCurrency), 2) . ' in credit — the rest of this note is still settling an unpaid invoice.');
        }

        return DB::transaction(function () use ($note, $amount, $expiresAt, $user) {
            $gv = $this->issue([
                'amount' => $amount, 'currency_id' => $note->currency_id, 'customer_id' => $note->customer_id ?: Ledger::whereKey($note->party_ledger_id)->value('customer_id'),
                'source' => 'refund', 'party_ledger_id' => $note->party_ledger_id, 'credit_note_id' => $note->id,
                'note' => "Refund of {$note->voucher_number}", 'expires_at' => $expiresAt,
            ], $user);
            $meta = $note->meta ?? [];
            $meta['gift_refunded'] = round((float) ($meta['gift_refunded'] ?? 0) + $amount, 2);
            $meta['gift_vouchers'] = array_merge($meta['gift_vouchers'] ?? [], [$gv->code]);
            $note->update(['meta' => $meta]);

            return $gv;
        });
    }

    /** Default life of a new voucher, from the loyalty settings (months); none = never. */
    public function defaultExpiry(): ?string
    {
        $months = \App\Models\LoyaltySetting::get('gift_voucher_expiry_months', null);

        return $months ? now()->addMonths((int) $months)->toDateString() : null;
    }

    /**
     * A paid Cash Sale that carries gift voucher lines makes the vouchers: the sale's own posting (Dr cash,
     * Cr Gift Vouchers Liability) is the issue, so no separate Journal is booked.
     */
    public function activateFromSale(Voucher $sale, ?User $user = null): void
    {
        $sale->loadMissing('type');
        if ($sale->type->base_type !== VoucherType::CASH_SALE || $sale->status !== Voucher::POSTED) {
            return;
        }
        foreach ($sale->items()->whereNotNull('gift_meta')->whereNull('gift_voucher_id')->get() as $it) {
            $amount = round((float) $it->amount, 2);
            $meta = $it->gift_meta ?? [];
            $gv = GiftVoucher::create([
                'code' => $this->newCode(), 'customer_id' => $sale->customer_id, 'currency_id' => $sale->currency_id, 'initial_amount' => $amount, 'balance' => $amount,
                'expires_at' => $this->defaultExpiry(), 'status' => GiftVoucher::ACTIVE, 'source' => 'sale', 'issued_voucher_id' => $sale->id,
                'note' => trim('Sold on ' . $sale->voucher_number . (! empty($meta['recipient_name']) ? ' for ' . $meta['recipient_name'] : '') . (! empty($meta['message']) ? ' — ' . $meta['message'] : '')),
                'created_by' => $user?->id,
            ]);
            $this->log($gv, 'issue', $amount, $sale->id, "Sold on {$sale->voucher_number}", $user, round($amount * (float) $sale->exchange_rate, 2));
            $it->update(['gift_voucher_id' => $gv->id]);
        }
    }

    /** The sale that issued vouchers is being cancelled or altered: they are voided — refused if any has been spent. */
    public function voidForSale(Voucher $sale, ?User $user = null): void
    {
        foreach ($sale->items()->whereNotNull('gift_voucher_id')->get() as $it) {
            $gv = GiftVoucher::whereKey($it->gift_voucher_id)->lockForUpdate()->first();
            if (! $gv) {
                continue;
            }
            if ($gv->status !== GiftVoucher::ACTIVE || abs((float) $gv->balance - (float) $gv->initial_amount) > 0.005) {
                throw new BooksException("Gift voucher {$gv->code} sold on {$sale->voucher_number} has already been used, so the sale can't be changed or cancelled.");
            }
            $gv->update(['status' => GiftVoucher::CANCELLED, 'balance' => 0]);
            $this->log($gv, 'cancel', -(float) $gv->initial_amount, $sale->id, "{$sale->voucher_number} cancelled", $user, -round((float) $gv->initial_amount * (float) $sale->exchange_rate, 2));
            $this->settleResidual($gv->fresh(), $user);
            $it->update(['gift_voucher_id' => null]);
        }
    }

    /** Void an active voucher: what is unspent goes back to where the value came from. */
    public function cancel(GiftVoucher $gv, ?User $user = null): GiftVoucher
    {
        return DB::transaction(function () use ($gv, $user) {
            $gv = GiftVoucher::whereKey($gv->id)->lockForUpdate()->firstOrFail();
            if ($gv->status !== GiftVoucher::ACTIVE) {
                throw new BooksException('Only an active gift voucher can be cancelled.');
            }
            $issued = $gv->issued_voucher_id ? Voucher::with('type')->find($gv->issued_voucher_id) : null;
            if ($issued && $issued->type->base_type !== VoucherType::JOURNAL) {
                throw new BooksException("This gift voucher was sold on {$issued->voucher_number}. Cancel that sale to void it.");
            }
            $back = (float) $gv->balance;
            $backBase = 0.0;
            if ($issued && $back > 0) {
                // reverse the unspent part of the issue journal
                $source = $issued->entries()->where('side', 'D')->first();
                $liab = $issued->entries()->where('side', 'C')->first();
                if ($source && $liab) {
                    $rv = app(VoucherService::class)->create([
                        'voucher_type_id' => $issued->voucher_type_id, 'date' => today()->toDateString(), 'currency_id' => $gv->currency_id,
                        'narration' => "Gift voucher {$gv->code} cancelled", 'meta' => ['gift_voucher_id' => $gv->id],
                        'entries' => [['ledger_id' => $liab->ledger_id, 'side' => 'D', 'amount' => $back], ['ledger_id' => $source->ledger_id, 'side' => 'C', 'amount' => $back]],
                    ], $user);
                    $backBase = (float) $rv->base_total;
                }
            }
            $gv->update(['status' => GiftVoucher::CANCELLED, 'balance' => 0]);
            $this->log($gv, 'cancel', -$back, null, null, $user, -$backBase);
            if ($issued && ! empty($issued->meta['credit_note_id']) && ($note = Voucher::find($issued->meta['credit_note_id']))) {
                $meta = $note->meta ?? [];
                $meta['gift_refunded'] = max(0, round((float) ($meta['gift_refunded'] ?? 0) - $back, 2));
                $meta['gift_vouchers'] = array_values(array_diff($meta['gift_vouchers'] ?? [], [$gv->code]));
                $note->update(['meta' => $meta]);
            }
            $this->settleResidual($gv->fresh(), $user);

            return $gv->fresh();
        });
    }

    /** Take value off a gift voucher for a sale. Returns the amount taken in the gift voucher's own currency. */
    public function redeem(GiftVoucher $gv, float $amountInGvCurrency, Voucher $sale, ?User $user = null, ?float $baseAmount = null): void
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
        // the base value that left the liability ledger with this sale's tender
        $base = $baseAmount ?? round($amountInGvCurrency * $this->money->rateOn($gv->currency_id, $sale->date), 2);
        $this->log($gv, 'redeem', -$amountInGvCurrency, $sale->id, null, $user, -$base);
        $this->settleResidual($gv->fresh(), $user);
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
            $this->log($gv, 'restore', $back, $sale->id, "Restored from {$sale->voucher_number}", $user, abs((float) ($t->base_amount ?? $back * $this->money->rateOn($gv->currency_id))));
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
                $ev = app(VoucherService::class)->create([
                    'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'currency_id' => $gv->currency_id,
                    'narration' => "Gift voucher {$gv->code} expired", 'meta' => ['gift_voucher_id' => $gv->id],
                    'entries' => [
                        ['ledger_id' => $this->liabilityLedgerId(), 'side' => 'D', 'amount' => $amt],
                        ['ledger_id' => $breakage, 'side' => 'C', 'amount' => $amt],
                    ],
                ], $user);
                $gv->update(['balance' => 0, 'status' => GiftVoucher::EXPIRED]);
                $this->log($gv, 'expire', -$amt, $ev->id, null, $user, -(float) $ev->base_total);
                $this->settleResidual($gv->fresh(), $user);
                $n++;
            });
        }

        return $n;
    }

    /** A customer's spendable gift voucher balance, in base currency. */
    public function customerBalanceBase(int $customerId): float
    {
        $sum = 0.0;
        foreach (GiftVoucher::where('customer_id', $customerId)->where('status', GiftVoucher::ACTIVE)->where('balance', '>', 0)->get() as $gv) {
            if ($gv->isSpendable()) {
                $sum += (float) $gv->balance * $this->money->rateOn($gv->currency_id);
            }
        }

        return round($sum, 2);
    }

    /**
     * Take value back from a customer's gift vouchers (an admin correction): oldest expiry first.
     * Journal Dr Gift Vouchers Liability, Cr Rewards & Referral Expense. $amount is in base currency.
     */
    public function deductFromCustomer(int $customerId, float $amountBase, ?string $note, ?User $user = null): float
    {
        $settings = AccountingSetting::current();
        $rewards = $settings->rewards_expense_ledger_id ?: Ledger::where('name', 'Rewards & Referral Expense')->value('id');
        $journal = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');
        $left = round($amountBase, 2);
        if ($this->customerBalanceBase($customerId) + 0.005 < $left) {
            throw new BooksException('The customer only has ' . number_format($this->customerBalanceBase($customerId), 2) . ' in gift vouchers.');
        }

        return DB::transaction(function () use ($customerId, $left, $note, $user, $rewards, $journal) {
            $taken = 0.0;
            $vouchers = GiftVoucher::where('customer_id', $customerId)->where('status', GiftVoucher::ACTIVE)->where('balance', '>', 0)
                ->orderByRaw('expires_at IS NULL, expires_at ASC')->orderBy('id')->lockForUpdate()->get();
            foreach ($vouchers as $gv) {
                if ($left <= 0.004) {
                    break;
                }
                $rate = $this->money->rateOn($gv->currency_id);
                $takeBase = min($left, (float) $gv->balance * $rate);
                $take = round($takeBase / max($rate, 0.00000001), 2);
                $new = round((float) $gv->balance - $take, 2);
                $gv->update(['balance' => max(0, $new), 'status' => $new <= 0.004 ? GiftVoucher::USED : GiftVoucher::ACTIVE]);
                $av = app(VoucherService::class)->create([
                    'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'currency_id' => $gv->currency_id,
                    'narration' => "Gift voucher {$gv->code} reduced" . ($note ? " — {$note}" : ''), 'meta' => ['gift_voucher_id' => $gv->id],
                    'entries' => [
                        ['ledger_id' => $this->liabilityLedgerId(), 'side' => 'D', 'amount' => $take],
                        ['ledger_id' => $rewards, 'side' => 'C', 'amount' => $take],
                    ],
                ], $user);
                $this->log($gv, 'adjust', -$take, $av->id, $note, $user, -(float) $av->base_total);
                $this->settleResidual($gv->fresh(), $user);
                $left = round($left - $takeBase, 2);
                $taken += $takeBase;
            }

            return round($taken, 2);
        });
    }

    /**
     * A voucher that is used up, expired or cancelled but still carries base value was issued and spent at
     * different exchange rates. That difference is a realised exchange gain / loss: Journal it against the
     * liability so the closed voucher carries nothing.
     */
    public function settleResidual(GiftVoucher $gv, ?User $user = null): void
    {
        if ((float) $gv->balance > 0.004) {
            return;
        }
        $residual = round((float) $gv->base_balance, 2);
        if (abs($residual) < 0.01) {
            return;
        }
        $s = AccountingSetting::current();
        $fx = $residual > 0 ? $s->fx_gain_ledger_id : $s->fx_loss_ledger_id;   // liability left over = we gained
        $journal = VoucherType::byBase(VoucherType::JOURNAL);
        if (! $fx || ! $journal) {
            return;   // shows in Reconciliation until the exchange gain / loss ledgers are set
        }
        $amt = abs($residual);
        $v = app(VoucherService::class)->create([
            'voucher_type_id' => $journal->id, 'date' => today()->toDateString(), 'currency_id' => $this->money->getBaseCurrency()->id,
            'narration' => "Gift voucher {$gv->code} — exchange difference", 'meta' => ['gift_voucher_id' => $gv->id],
            'entries' => [
                ['ledger_id' => $residual > 0 ? $this->liabilityLedgerId() : $fx, 'side' => 'D', 'amount' => $amt],
                ['ledger_id' => $residual > 0 ? $fx : $this->liabilityLedgerId(), 'side' => 'C', 'amount' => $amt],
            ],
        ], $user);
        $this->log($gv, 'fx', 0, $v->id, 'Exchange difference on closing', $user, -$residual);
    }

    /** Give older vouchers (recorded before base values were kept) their base value at today's rates. Idempotent. */
    public function ensureBase(): void
    {
        foreach (GiftVoucher::whereNull('base_balance')->get() as $gv) {
            $gv->update(['base_balance' => round((float) $gv->balance * $this->money->rateOn($gv->currency_id), 2)]);
        }
        GiftVoucherTransaction::whereNull('base_amount')->with('giftVoucher:id,currency_id')->get()->each(function ($t) {
            $t->update(['base_amount' => round((float) $t->amount * $this->money->rateOn($t->giftVoucher?->currency_id), 2)]);
        });
    }

    /** What the vouchers are worth, in base currency, from the values actually booked. */
    public function registerValue(): float
    {
        $this->ensureBase();

        return round((float) GiftVoucher::sum('base_balance'), 2);
    }

    /** Does the sub-ledger agree with the liability ledger? */
    public function reconcile(): array
    {
        $sub = $this->registerValue();
        $ledger = -$this->ledgers->balance($this->liabilityLedgerId());

        return ['sub_ledger' => $sub, 'ledger' => round($ledger, 2), 'difference' => round($ledger - $sub, 2), 'balanced' => abs($ledger - $sub) < 0.01];
    }

    private function log(GiftVoucher $gv, string $type, float $amount, ?int $voucherId, ?string $note, ?User $user, ?float $base = null): void
    {
        $base ??= round($amount * $this->money->rateOn($gv->currency_id), 2);
        GiftVoucherTransaction::create([
            'gift_voucher_id' => $gv->id, 'type' => $type, 'amount' => $amount, 'base_amount' => round($base, 2), 'balance_after' => $gv->fresh()->balance ?? $gv->balance,
            'voucher_id' => $voucherId, 'note' => $note, 'created_by' => $user?->id, 'created_at' => now(),
        ]);
        GiftVoucher::whereKey($gv->id)->update(['base_balance' => DB::raw('COALESCE(base_balance, 0) + ' . round($base, 2))]);
    }
}

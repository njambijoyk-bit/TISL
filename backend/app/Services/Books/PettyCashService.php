<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\PettyCashFloat;
use App\Models\PettyCashSpend;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Petty cash is a cash ledger (marked "petty"), not a voucher type. Topping it up is a Contra from a bank or cash ledger; spending it is a Journal
 * (Dr the expense, Cr petty cash) written from a petty cash voucher — payee, purpose, expense account, receipt. The box has a float (what it should
 * hold) and a custodian; "top up to float" works out the amount from the balance. Nothing can be spent that the box does not hold.
 */
class PettyCashService
{
    public function __construct(private VoucherService $vouchers, private LedgerService $ledgers) {}

    public static function ready(): bool
    {
        return Schema::hasTable('petty_cash_floats') && Schema::hasTable('petty_cash_spends');
    }

    public static function isManager(?User $u): bool
    {
        return $u && $u->hasPermission('books.pettycash');
    }

    /** Every petty cash ledger, with what it holds, its float and custodian, and what it takes to top it up. */
    public function overview(): array
    {
        $out = [];
        foreach (Ledger::where('cash_kind', 'petty')->where('is_active', true)->orderBy('name')->get() as $l) {
            $f = self::ready() ? PettyCashFloat::where('ledger_id', $l->id)->first() : null;
            $bal = $this->ledgers->balance($l->id);
            $float = $f ? (float) $f->float_amount : 0.0;
            $out[] = ['ledger_id' => (int) $l->id, 'name' => $l->name, 'balance' => $bal, 'float' => $float, 'to_top_up' => max(0.0, round($float - $bal, 2)),
                'custodian_user_id' => $f?->custodian_user_id, 'custodian' => $f?->custodian_user_id ? User::find($f->custodian_user_id)?->name : null];
        }

        return $out;
    }

    private function petty(int $ledgerId): Ledger
    {
        $l = Ledger::find($ledgerId);
        if (! $l || $l->cash_kind !== 'petty') {
            throw new BooksException('That is not a petty cash ledger. Mark a cash ledger as petty cash under Books → Chart of accounts.');
        }

        return $l;
    }

    /** May this person spend from this box: finance and admins, or its custodian. */
    public function canSpend(?User $u, int $ledgerId): bool
    {
        if (self::isManager($u)) {
            return true;
        }

        return $u && self::ready() && PettyCashFloat::where('ledger_id', $ledgerId)->where('custodian_user_id', $u->id)->exists();
    }

    public function setFloat(int $ledgerId, float $amount, ?int $custodianId, ?User $by): PettyCashFloat
    {
        $this->needTables();
        $this->petty($ledgerId);
        if ($amount < 0) {
            throw new BooksException('The float cannot be negative.');
        }

        return PettyCashFloat::updateOrCreate(['ledger_id' => $ledgerId], ['float_amount' => round($amount, 2), 'custodian_user_id' => $custodianId, 'updated_by' => $by?->id]);
    }

    private function needTables(): void
    {
        if (! self::ready()) {
            throw new BooksException('Run script 62_petty_cash.sql before using petty cash.');
        }
    }

    /** Top the box up from a bank or cash ledger. Amount empty = up to the float. A Contra. */
    public function topUp(int $ledgerId, int $fromLedgerId, ?float $amount, ?string $date, ?User $by): Voucher
    {
        $box = $this->petty($ledgerId);
        $from = Ledger::findOrFail($fromLedgerId);
        if ($from->id === $box->id) {
            throw new BooksException('Choose the bank or cash account the money comes from.');
        }
        if (! $this->ledgers->isUnderGroup($from, 'Bank Accounts') && ! $this->ledgers->isUnderGroup($from, 'Cash-in-hand')) {
            throw new BooksException('Petty cash is topped up from a bank or cash account.');
        }
        if ($amount === null) {
            $f = self::ready() ? PettyCashFloat::where('ledger_id', $ledgerId)->first() : null;
            if (! $f || (float) $f->float_amount <= 0) {
                throw new BooksException('Set the float first, or enter the amount.');
            }
            $amount = round((float) $f->float_amount - $this->ledgers->balance($ledgerId), 2);
        }
        if ($amount <= 0.004) {
            throw new BooksException('The box already holds its float — nothing to top up.');
        }
        $held = $this->ledgers->balance($from->id);
        if ($amount - $held > 0.005) {
            throw new BooksException("{$from->name} holds only " . number_format($held, 2) . '.');
        }
        $type = VoucherType::byBase(VoucherType::CONTRA) ?? throw new BooksException('The Contra voucher type is switched off.');

        return $this->vouchers->create(['voucher_type_id' => $type->id, 'date' => $date ?: today()->toDateString(), 'narration' => "Petty cash top-up: {$from->name} to {$box->name}",
            'entries' => [['ledger_id' => $box->id, 'side' => 'D', 'amount' => round($amount, 2)], ['ledger_id' => $from->id, 'side' => 'C', 'amount' => round($amount, 2)]],
            'meta' => ['petty_cash' => ['top_up' => true, 'ledger_id' => $box->id]]], $by);
    }

    /** Spend: a petty cash voucher and the journal it books. */
    public function spend(array $in, ?User $by): PettyCashSpend
    {
        $this->needTables();
        $box = $this->petty((int) ($in['ledger_id'] ?? 0));
        if (! $this->canSpend($by, $box->id)) {
            throw new BooksException('Only the custodian of this petty cash, or finance, can record spending from it.');
        }
        $amount = round((float) ($in['amount'] ?? 0), 2);
        if ($amount <= 0) {
            throw new BooksException('Enter the amount paid.');
        }
        $payee = trim((string) ($in['payee'] ?? ''));
        $purpose = trim((string) ($in['purpose'] ?? ''));
        if ($payee === '' || $purpose === '') {
            throw new BooksException('Say who was paid and what for.');
        }
        $date = $in['spent_on'] ?? today()->toDateString();
        if ($date > today()->toDateString()) {
            throw new BooksException('Spending cannot be dated in the future.');
        }
        $exp = Ledger::with('group:id,nature')->find($in['expense_ledger_id'] ?? null);
        if (! $exp || ! $exp->is_active || $exp->group?->nature !== 'expense') {
            throw new BooksException('Choose an expense account for what was bought.');
        }
        $held = $this->ledgers->balance($box->id);
        if ($amount - $held > 0.005) {
            throw new BooksException("{$box->name} holds only " . number_format($held, 2) . ' — top it up first.');
        }
        $type = VoucherType::byBase(VoucherType::JOURNAL) ?? throw new BooksException('The Journal voucher type is switched off.');

        return DB::transaction(function () use ($in, $box, $exp, $amount, $payee, $purpose, $date, $type, $by) {
            $s = PettyCashSpend::create(['ledger_id' => $box->id, 'expense_ledger_id' => $exp->id, 'spent_on' => $date, 'payee' => $payee, 'purpose' => $purpose, 'amount' => $amount,
                'receipt_path' => $in['receipt_path'] ?? null, 'spent_by' => $by?->id]);
            $s->update(['number' => 'PCV-' . str_pad((string) $s->id, 6, '0', STR_PAD_LEFT)]);
            $v = $this->vouchers->create(['voucher_type_id' => $type->id, 'date' => $date, 'reference_no' => $s->number, 'narration' => "Petty cash {$s->number}: {$purpose} — {$payee}",
                'entries' => [['ledger_id' => $exp->id, 'side' => 'D', 'amount' => $amount, 'narration' => $purpose], ['ledger_id' => $box->id, 'side' => 'C', 'amount' => $amount]],
                'meta' => ['petty_cash' => ['spend_id' => $s->id, 'payee' => $payee, 'ledger_id' => $box->id]]], $by);
            $s->update(['voucher_id' => $v->id]);

            return $s->fresh();
        });
    }

    /** A wrong entry: its journal is cancelled and the spend struck off (the money is back in the box). */
    public function cancelSpend(int $id, ?User $by): PettyCashSpend
    {
        $s = PettyCashSpend::findOrFail($id);
        if ($s->cancelled_at) {
            throw new BooksException('That spend is already cancelled.');
        }
        if (! $this->canSpend($by, (int) $s->ledger_id)) {
            throw new BooksException('Only the custodian of this petty cash, or finance, can cancel spending.');
        }

        return DB::transaction(function () use ($s, $by) {
            $v = $s->voucher_id ? Voucher::find($s->voucher_id) : null;
            if ($v && $v->status === Voucher::POSTED) {
                $this->vouchers->cancel($v, "Petty cash {$s->number} cancelled", $by);
            }
            $s->update(['cancelled_at' => now()]);

            return $s->fresh();
        });
    }

    public function history(?int $ledgerId = null, int $limit = 60): array
    {
        if (! self::ready()) {
            return [];
        }

        return PettyCashSpend::query()->when($ledgerId, fn ($q) => $q->where('ledger_id', $ledgerId))->orderByDesc('spent_on')->orderByDesc('id')->limit($limit)->get()->map(function ($s) {
            return ['id' => $s->id, 'number' => $s->number, 'ledger_id' => (int) $s->ledger_id, 'date' => $s->spent_on->toDateString(), 'payee' => $s->payee, 'purpose' => $s->purpose, 'amount' => (float) $s->amount,
                'expense' => Ledger::whereKey($s->expense_ledger_id)->value('name'), 'spent_by' => $s->spent_by ? User::whereKey($s->spent_by)->value('name') : null,
                'receipt_url' => $s->receipt_path ? \Illuminate\Support\Facades\Storage::disk('public')->url($s->receipt_path) : null, 'voucher_id' => $s->voucher_id, 'cancelled' => (bool) $s->cancelled_at];
        })->all();
    }
}

<?php

namespace App\Services\Books;

use App\Models\Books\Ledger;
use App\Models\Books\PaymentMethod;

/**
 * How a customer can say they will pay. The ledgers themselves are the source: a cash / bank / mobile-money ledger with
 * "offer at checkout" ticked becomes a choice, with the details the customer needs (bank account, till number, "cash on
 * delivery"). Choosing one is only a record on the order — nothing posts — and the record carries a thin payment-method
 * row for the ledger, so converting the order to a Cash Sale already points at the right money ledger.
 */
class PaymentModeService
{
    public function __construct(private LedgerService $ledgers) {}

    /** The ledgers on offer, ready for the checkout page. */
    public function offered(): array
    {
        $out = [];
        foreach (Ledger::where('offer_at_checkout', true)->where('is_active', true)->orderBy('checkout_sort')->orderBy('name')->get() as $l) {
            $bank = $this->ledgers->isUnderGroup($l, 'Bank Accounts');
            if (! $bank && ! $this->ledgers->isUnderGroup($l, 'Cash-in-hand')) {
                continue;   // ticked once, then moved out of the money groups
            }
            // a ledger already behind an automatic online method (M-Pesa prompt, card) is offered through that method
            if (PaymentMethod::where('ledger_id', $l->id)->where('is_active', true)->where('is_online', true)->whereNotNull('gateway')->exists()) {
                continue;
            }
            $out[] = $this->describe($l, $bank);
        }

        return $out;
    }

    /**
     * How customers pay with a ledger: `details` (we show our bank account / till number / cash on delivery and record the
     * payment ourselves) or `mpesa_stk` (the customer gets a prompt on their phone and pays on the spot). The automatic
     * kind is carried by the ledger's payment-method row, so nothing else has to be set up by hand.
     */
    public function setMode(int $ledgerId, string $mode): void
    {
        if ($mode === 'mpesa_stk') {
            $m = $this->methodFor($ledgerId);
            $m->update(['gateway' => 'mpesa_stk', 'is_online' => true, 'is_active' => true, 'kind' => 'mobile_money']);

            return;
        }
        PaymentMethod::where('ledger_id', $ledgerId)->whereNotNull('gateway')->update(['gateway' => null, 'is_online' => false]);   // kept for history, no longer charged automatically
    }

    /** ledger id => 'mpesa_stk' | 'details', for showing the choice on the ledger form. */
    public function modesFor(array $ledgerIds): array
    {
        $auto = PaymentMethod::whereIn('ledger_id', $ledgerIds)->where('is_active', true)->where('is_online', true)->whereNotNull('gateway')->pluck('gateway', 'ledger_id')->all();

        return array_map(fn ($id) => isset($auto[$id]) ? 'mpesa_stk' : 'details', array_combine($ledgerIds, $ledgerIds));
    }

    /** One offered ledger as a mode, or an error when it is not on offer (so a customer cannot name any ledger). */
    public function intentFor(int $ledgerId): array
    {
        foreach ($this->offered() as $m) {
            if ($m['ledger_id'] === $ledgerId) {
                return $m;
            }
        }
        throw new BooksException('That way of paying is not available.');
    }

    /** The payment-method row that stands for a ledger (made once, kept in step). */
    public function methodFor(int $ledgerId): PaymentMethod
    {
        $l = Ledger::findOrFail($ledgerId);
        $mode = $this->describe($l, $this->ledgers->isUnderGroup($l, 'Bank Accounts'));
        $fields = [
            'name' => $mode['label'], 'kind' => $mode['kind'] === 'bank' ? 'bank' : ($mode['kind'] === 'mobile' ? 'mobile_money' : 'cash'),
            'instructions' => $mode['instructions'], 'is_active' => true,
        ];
        $m = PaymentMethod::where('ledger_id', $ledgerId)->orderBy('id')->first();
        if ($m) {
            return $m;   // an existing method for this ledger (maybe with a gateway) is left exactly as the admin set it
        }

        return PaymentMethod::create($fields + ['code' => 'ledger-' . $ledgerId, 'ledger_id' => $ledgerId, 'is_online' => false, 'requires_reference' => $mode['kind'] !== 'cash' && $mode['kind'] !== 'cod', 'sort_order' => (int) $l->checkout_sort]);
    }

    private function describe(Ledger $l, bool $bank): array
    {
        $cod = ! $bank && $l->cash_kind === 'driver';
        $mobile = ! $bank && ! $cod && filled($l->mobile_number);
        $kind = $bank ? 'bank' : ($cod ? 'cod' : ($mobile ? 'mobile' : 'cash'));
        $label = filled($l->checkout_label) ? $l->checkout_label : ($cod ? 'Cash on delivery' : $l->name);

        $details = array_filter([
            'bank_name' => $l->bank_name, 'account_name' => $l->account_name, 'account_number' => $l->account_number, 'swift_code' => $l->swift_code,
            'branch' => $l->branch, 'branch_code' => $l->branch_code, 'mobile_kind' => $l->mobile_kind, 'mobile_number' => $l->mobile_number,
        ], fn ($v) => filled($v));

        $instructions = filled($l->checkout_instructions) ? $l->checkout_instructions : match (true) {
            $bank => trim(implode(' · ', array_filter([$l->bank_name, $l->account_name, $l->account_number ? "Acc {$l->account_number}" : null, $l->branch, $l->swift_code ? "SWIFT {$l->swift_code}" : null]))),
            $cod => 'Pay in cash when your order is delivered.',
            $mobile => ucfirst((string) ($l->mobile_kind ?: 'number')) . " {$l->mobile_number}" . ($l->mobile_kind === 'paybill' ? ', account = your order number' : ''),
            default => 'Pay in cash.',
        };

        return ['ledger_id' => (int) $l->id, 'label' => $label, 'kind' => $kind, 'instructions' => $instructions, 'details' => $details, 'accepts' => array_values(array_filter(explode(',', (string) $l->accepts)))];
    }
}

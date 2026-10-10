<?php

namespace App\Services\Payments;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\PaymentMethod;
use Illuminate\Support\Facades\Schema;

/**
 * The accounts card money can be booked into (bank and cash accounts), and the payment-method row that makes a provider appear at checkout. The shop finds an automatic
 * method through its ledger being "offered at checkout"; because a ledger that sits behind an automatic method is not ALSO offered as a bank-transfer choice, each provider
 * should have an account of its own (for example "Stripe clearing"): it is also how the provider's payouts are matched later.
 */
class MoneyLedgers
{
    /** @return array<int, array{id: int, name: string}> */
    public static function options(): array
    {
        if (! Schema::hasTable('ledgers') || ! Schema::hasTable('ledger_groups')) {
            return [];
        }
        $groupIds = LedgerGroup::whereIn('name', ['Cash-in-hand', 'Bank Accounts'])->get()->flatMap(fn ($g) => $g->selfAndDescendantIds())->unique()->all();

        return Ledger::whereIn('group_id', $groupIds)->where('is_active', true)->orderBy('name')->get(['id', 'name'])->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->all();
    }

    /**
     * Make the provider's payment method match what is saved: on and offered when it is switched on, configured and has an account; off otherwise. Never deletes (past payments
     * point at it). Returns the method, or null when there is none and none is needed.
     */
    public function sync(string $part, array $cfg): ?PaymentMethod
    {
        $g = Gateways::get($part);
        $active = ! empty($cfg['enabled']) && $g->configured($cfg) && ! empty($cfg['ledger_id']);
        $method = PaymentMethod::where('gateway', $part)->first();
        if (! $method && ! $active) {
            return null;
        }
        $fields = ['name' => ($cfg['label'] ?? '') !== '' ? $cfg['label'] : 'Card (' . $g->label() . ')', 'code' => 'card_' . $part, 'kind' => 'card', 'is_online' => true, 'gateway' => $part,
            'requires_reference' => false, 'instructions' => 'You will be taken to a secure page to pay by card.', 'is_active' => $active, 'sort_order' => 50]
            + (! empty($cfg['ledger_id']) ? ['ledger_id' => (int) $cfg['ledger_id']] : []);
        if ($active) {
            Ledger::whereKey((int) $cfg['ledger_id'])->where('offer_at_checkout', false)->update(['offer_at_checkout' => true]);   // how the shop finds a method that has a ledger
        }

        return $method ? tap($method)->update($fields) : PaymentMethod::create($fields);
    }

    /** The account M-Pesa money is booked into right now: the one behind the automatic M-Pesa method (set here, or earlier on the ledger's own form). */
    public static function mpesaLedgerId(): ?int
    {
        if (! Schema::hasTable('payment_methods')) {
            return null;
        }
        $id = PaymentMethod::where('gateway', 'mpesa_stk')->where('is_active', true)->value('ledger_id');

        return $id ? (int) $id : null;
    }

    /**
     * Point the M-Pesa prompt at the chosen account: it becomes the account behind the automatic M-Pesa method (and is offered at checkout through it); the account that
     * held that job before goes back to being an ordinary "pay to this till" choice. Nothing chosen = nothing changed.
     */
    public function syncMpesa(array $cfg): void
    {
        $id = (int) ($cfg['ledger_id'] ?? 0);
        if (! $id || $id === self::mpesaLedgerId()) {
            return;
        }
        $modes = app(\App\Services\Books\PaymentModeService::class);
        foreach (PaymentMethod::where('gateway', 'mpesa_stk')->whereNotNull('ledger_id')->where('ledger_id', '!=', $id)->pluck('ledger_id') as $old) {
            $modes->setMode((int) $old, 'details');
        }
        Ledger::whereKey($id)->where('offer_at_checkout', false)->update(['offer_at_checkout' => true]);
        $modes->setMode($id, 'mpesa_stk');
    }
}

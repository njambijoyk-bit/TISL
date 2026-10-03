<?php

namespace App\Services\Delivery;

use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\DeliveryCost;
use App\Models\DeliveryItem;
use App\Models\DeliveryItemVoucher;
use App\Models\DeliveryManifest;
use App\Models\User;
use App\Services\Books\BooksException;
use App\Services\Books\LedgerService;
use App\Services\Books\VoucherService;
use Illuminate\Support\Facades\DB;

/**
 * Money on a manifest.
 *  - Cash collected at the door becomes a Receipt for the customer: it settles their open invoice(s) made from the stop's
 *    Delivery Notes, oldest first, and anything over stays as their credit (an advance).
 *  - A cost of the trip (fuel, courier, driver pay, other) becomes a Payment voucher: Dr Delivery Expenses, Cr the cash /
 *    bank / petty cash it was paid from.
 * Needs script 69.
 */
class DeliveryMoneyService
{
    public function __construct(private VoucherService $vouchers, private LedgerService $ledgers) {}

    public static function ready(): bool
    {
        return \Illuminate\Support\Facades\Schema::hasTable('delivery_costs') && \Illuminate\Support\Facades\Schema::hasColumn('delivery_items', 'cod_voucher_id');
    }

    private function needTables(): void
    {
        if (! self::ready()) {
            throw new BooksException('Run script 69_delivery_money.sql before recording delivery money.');
        }
    }

    // ── Cash collected on delivery ───────────────────────────────────────────

    /** The open invoices made from a stop's Delivery Notes, oldest first, with what is still owed on each. */
    public function openInvoices(DeliveryItem $stop): array
    {
        $noteIds = DeliveryItemVoucher::where('delivery_item_id', $stop->id)->pluck('voucher_id')->all();
        $out = [];
        foreach (Voucher::with('type')->whereIn('source_voucher_id', $noteIds)->where('status', Voucher::POSTED)->orderBy('date')->orderBy('id')->get() as $inv) {
            if ($inv->type?->base_type !== VoucherType::SALES) {
                continue;
            }
            $owed = $this->vouchers->outstanding($inv);
            if ($owed > 0.004) {
                $out[] = ['voucher' => $inv, 'owed' => round($owed, 2)];
            }
        }

        return $out;
    }

    /** Record cash (or M-Pesa, card …) taken at the door for a stop. in: amount, payment_method_id, reference_no?, date? */
    public function collect(DeliveryItem $stop, array $in, ?User $by): DeliveryItem
    {
        $this->needTables();
        if (! in_array($stop->status, ['out_for_delivery', 'delivered'], true)) {
            throw new BooksException('Money is collected on a stop that is out for delivery or delivered.');
        }
        if ($stop->cod_voucher_id) {
            throw new BooksException('Money was already collected on this stop — cancel that receipt first to change it.');
        }
        $amount = round((float) ($in['amount'] ?? 0), 2);
        if ($amount <= 0) {
            throw new BooksException('Enter the amount collected.');
        }
        if (empty($in['payment_method_id'])) {
            throw new BooksException('Choose how it was paid (cash, M-Pesa …).');
        }
        $notes = Voucher::whereIn('id', DeliveryItemVoucher::where('delivery_item_id', $stop->id)->pluck('voucher_id'))->get();
        $party = $notes->pluck('party_ledger_id')->filter()->unique();
        if ($party->count() !== 1) {
            throw new BooksException($party->isEmpty() ? 'These Delivery Notes have no customer account to receive into.' : 'These Delivery Notes belong to different customer accounts — record the money from each customer\'s own page.');
        }
        $first = $notes->first();

        $left = $amount;
        $alloc = [];
        foreach ($this->openInvoices($stop) as $row) {
            if ($left <= 0.004) {
                break;
            }
            $take = round(min($left, $row['owed']), 2);
            $alloc[] = ['against_voucher_id' => $row['voucher']->id, 'amount' => $take];
            $left = round($left - $take, 2);
        }
        $type = VoucherType::byBase(VoucherType::RECEIPT) ?? throw new BooksException('The Receipt voucher type is switched off.');
        $manifest = DeliveryManifest::find($stop->manifest_id);
        $nums = $notes->pluck('voucher_number')->join(', ');

        return DB::transaction(function () use ($stop, $in, $by, $amount, $alloc, $left, $first, $party, $type, $manifest, $nums) {
            $v = $this->vouchers->create([
                'voucher_type_id' => $type->id, 'date' => $in['date'] ?? today()->toDateString(), 'location_id' => $first->location_id,
                'customer_id' => $first->customer_id, 'party_ledger_id' => $party->first(), 'currency_id' => $first->currency_id,
                'payment_method_id' => $in['payment_method_id'], 'reference_no' => $in['reference_no'] ?? ($manifest?->manifest_number),
                'narration' => "Collected on delivery ({$manifest?->manifest_number}): {$nums}" . ($left > 0.004 ? ' — ' . number_format($left, 2) . ' kept as customer credit' : ''),
                'amount' => $amount, 'allocations' => $alloc, 'channel' => 'admin',
                'meta' => ['delivery' => ['delivery_item_id' => $stop->id, 'manifest_id' => $stop->manifest_id]],
            ], $by);
            $stop->update(['cod_amount' => $amount, 'cod_voucher_id' => $v->id, 'cod_at' => now()]);

            return $stop->fresh();
        });
    }

    /** A wrong entry: the receipt is cancelled and the stop is open for collecting again. */
    public function cancelCollection(DeliveryItem $stop, ?User $by): DeliveryItem
    {
        $this->needTables();
        $v = $stop->cod_voucher_id ? Voucher::find($stop->cod_voucher_id) : null;
        if (! $v) {
            throw new BooksException('Nothing was collected on this stop.');
        }

        return DB::transaction(function () use ($stop, $v, $by) {
            if ($v->status === Voucher::POSTED) {
                $this->vouchers->cancel($v, 'Delivery collection cancelled', $by);
            }
            $stop->update(['cod_amount' => null, 'cod_voucher_id' => null, 'cod_at' => null]);

            return $stop->fresh();
        });
    }

    // ── What the trip cost ───────────────────────────────────────────────────

    /** The ledger delivery costs go to unless another expense account is chosen: Delivery Expenses, under Direct Expenses (made on first use). */
    public function defaultExpenseLedger(): Ledger
    {
        $existing = Ledger::where('name', 'Delivery Expenses')->first();
        if ($existing) {
            return $existing;
        }
        $group = LedgerGroup::where('name', 'Direct Expenses')->first() ?? throw new BooksException('There is no Direct Expenses group to put Delivery Expenses under.');

        return $this->ledgers->ensure('Delivery Expenses', $group->id);
    }

    /** in: category, amount, paid_ledger_id (cash / bank / petty cash), expense_ledger_id?, payee?, notes?, paid_on? */
    public function recordCost(DeliveryManifest $manifest, array $in, ?User $by): DeliveryCost
    {
        $this->needTables();
        if ($manifest->status === 'cancelled') {
            throw new BooksException('This manifest is cancelled.');
        }
        $cat = $in['category'] ?? 'other';
        if (! isset(DeliveryCost::CATEGORIES[$cat])) {
            throw new BooksException('Choose what the cost was (fuel, courier fee, driver pay or other).');
        }
        $amount = round((float) ($in['amount'] ?? 0), 2);
        if ($amount <= 0) {
            throw new BooksException('Enter the amount paid.');
        }
        $date = $in['paid_on'] ?? today()->toDateString();
        if ($date > today()->toDateString()) {
            throw new BooksException('A cost cannot be dated in the future.');
        }
        $paid = Ledger::find($in['paid_ledger_id'] ?? null);
        $isCash = $paid && $this->ledgers->isUnderGroup($paid, 'Cash-in-hand');
        if (! $paid || ! $paid->is_active || (! $isCash && ! $this->ledgers->isUnderGroup($paid, 'Bank Accounts'))) {
            throw new BooksException('Choose the cash, bank or petty cash account it was paid from.');
        }
        if ($isCash && $amount - $this->ledgers->balance($paid->id) > 0.005) {
            throw new BooksException("{$paid->name} holds only " . number_format($this->ledgers->balance($paid->id), 2) . '.');
        }
        if (! empty($in['expense_ledger_id'])) {
            $exp = Ledger::with('group:id,nature')->find($in['expense_ledger_id']);
            if (! $exp || ! $exp->is_active || $exp->group?->nature !== 'expense') {
                throw new BooksException('Choose an expense account for the cost.');
            }
        } else {
            $exp = $this->defaultExpenseLedger();
        }
        $type = VoucherType::byBase(VoucherType::PAYMENT) ?? throw new BooksException('The Payment voucher type is switched off.');
        $payee = trim((string) ($in['payee'] ?? '')) ?: null;
        $label = DeliveryCost::CATEGORIES[$cat];

        return DB::transaction(function () use ($manifest, $in, $by, $cat, $amount, $date, $paid, $exp, $type, $payee, $label) {
            $c = DeliveryCost::create(['manifest_id' => $manifest->id, 'category' => $cat, 'amount' => $amount, 'expense_ledger_id' => $exp->id, 'paid_ledger_id' => $paid->id,
                'payee' => $payee, 'notes' => $in['notes'] ?? null, 'paid_on' => $date, 'created_by' => $by?->id]);
            $v = $this->vouchers->create([
                'voucher_type_id' => $type->id, 'date' => $date, 'ledger_id' => $paid->id, 'counter_ledger_id' => $exp->id, 'amount' => $amount,
                'reference_no' => $manifest->manifest_number,
                'narration' => "{$label} for {$manifest->manifest_number}" . ($payee ? " — {$payee}" : '') . (! empty($in['notes']) ? ": {$in['notes']}" : ''),
                'meta' => ['delivery_cost' => ['cost_id' => $c->id, 'manifest_id' => $manifest->id, 'category' => $cat]],
            ], $by);
            $c->update(['voucher_id' => $v->id]);

            return $c->fresh();
        });
    }

    public function cancelCost(DeliveryCost $c, ?User $by): DeliveryCost
    {
        $this->needTables();
        if ($c->cancelled_at) {
            throw new BooksException('That cost is already cancelled.');
        }

        return DB::transaction(function () use ($c, $by) {
            $v = $c->voucher_id ? Voucher::find($c->voucher_id) : null;
            if ($v && $v->status === Voucher::POSTED) {
                $this->vouchers->cancel($v, 'Delivery cost cancelled', $by);
            }
            $c->update(['cancelled_at' => now()]);

            return $c->fresh();
        });
    }

    /** A manifest's money in one place: what it cost, and what was collected at the door. */
    public function summary(DeliveryManifest $manifest): array
    {
        if (! self::ready()) {
            return ['ready' => false, 'costs' => [], 'cost_total' => 0.0, 'collected_total' => 0.0];
        }
        $costs = DeliveryCost::where('manifest_id', $manifest->id)->orderBy('paid_on')->orderBy('id')->get();
        $names = Ledger::whereIn('id', $costs->pluck('paid_ledger_id')->merge($costs->pluck('expense_ledger_id'))->unique())->pluck('name', 'id');
        $rows = $costs->map(fn ($c) => [
            'id' => $c->id, 'category' => $c->category, 'label' => DeliveryCost::CATEGORIES[$c->category] ?? $c->category, 'amount' => (float) $c->amount,
            'paid_on' => $c->paid_on?->toDateString(), 'payee' => $c->payee, 'notes' => $c->notes, 'paid_from' => $names[$c->paid_ledger_id] ?? null,
            'expense' => $names[$c->expense_ledger_id] ?? null, 'voucher_id' => $c->voucher_id, 'cancelled' => (bool) $c->cancelled_at,
        ])->all();

        return [
            'ready' => true, 'costs' => $rows,
            'cost_total' => round($costs->whereNull('cancelled_at')->sum('amount'), 2),
            'collected_total' => round((float) DeliveryItem::where('manifest_id', $manifest->id)->whereNotNull('cod_voucher_id')->sum('cod_amount'), 2),
        ];
    }
}

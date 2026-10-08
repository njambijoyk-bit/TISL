<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Customer;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Notification;
use App\Models\Service;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Quotations. A customer's request becomes a Quotation voucher (nothing posted, nothing moved):
 * requested → the admin prices it → quoted (sent, valid for N days) → accepted (becomes a Sales
 * Order) / declined / revision requested / expired.
 */
class QuotationService
{
    public function __construct(private VoucherService $vouchers) {}

    public function validDays(): int
    {
        return (int) (AccountingSetting::current()->quotation_valid_days ?: 14);
    }

    /**
     * A customer asks for prices: item, variant and quantity per line, nothing priced. It becomes a Quotation voucher
     * in "requested" — the admin prices it and sends it.
     *
     * @param  array  $items  [{product_id?, variant_id?, variant_unit_id?, service_id?, service_variant_id?, quantity, notes?}]
     */
    public function request(Customer $customer, array $items, ?string $note = null, ?User $user = null): Voucher
    {
        $type = VoucherType::byBase(VoucherType::QUOTATION) ?? throw new BooksException('Quotations are switched off.');
        $lines = [];
        foreach ($items as $it) {
            $qty = max(0.0001, (float) ($it['quantity'] ?? 1));
            $notes = filled($it['notes'] ?? null) ? trim((string) $it['notes']) : null;
            if (! empty($it['service_variant_id']) || ! empty($it['service_id'])) {
                $pkg = $it['service_variant_id'] ?? Service::find($it['service_id'])?->variants()->orderByDesc('is_default')->value('id');
                if (! $pkg) {
                    throw new BooksException('Pick a service package for each service.');
                }
                $lines[] = ['type' => 'service', 'service_id' => $it['service_id'] ?? null, 'service_variant_id' => $pkg, 'quantity' => $qty, 'notes' => $notes];   // no rate: the package's own price is filled in for the admin to confirm or change
                // the fees ticked for the service come with it, each as a line of its own (priced for the admin to confirm, like the rest)
                $variant = \App\Models\ServiceVariant::find($pkg);
                $service = $variant ? \App\Models\Service::find($variant->service_id) : null;
                if ($service) {
                    foreach (app(\App\Services\Booking\BookingService::class)->chargeLinesFor($service, $variant, $customer->currency_id) as $f) {
                        $lines[] = ['type' => 'custom', 'description' => $f['name'], 'quantity' => 1, 'rate' => $f['amount'], 'ledger_id' => $f['ledger_id']];
                    }
                }
            } else {
                $lines[] = ['type' => 'product', 'product_id' => $it['product_id'] ?? null, 'variant_id' => $it['variant_id'] ?? null, 'variant_unit_id' => $it['variant_unit_id'] ?? null, 'quantity' => $qty, 'rate' => 0, 'notes' => $notes];
            }
        }
        if (! $lines) {
            throw new BooksException('Add at least one item to ask for a quotation.');
        }
        $v = $this->vouchers->create([
            'voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'customer_id' => $customer->id, 'currency_id' => $customer->currency_id,
            'lines' => $lines, 'doc_status' => 'requested', 'channel' => 'storefront', 'as_request' => true, 'narration' => $note ?: null,
        ], $user);
        $this->notifyAdmins($v, $customer);

        return $v;
    }

    private function notifyAdmins(Voucher $q, Customer $customer): void
    {
        try {
            $name = trim(($customer->first_name ?? '') . ' ' . ($customer->last_name ?? '')) ?: 'A customer';
            foreach (User::holding(['super_admin', 'admin'])->get() as $admin) {
                Notification::createFor($admin, 'quotation_requested', 'New quotation request', "{$name} asked for prices — {$q->voucher_number}.", '/admin/quotes/' . $q->id, 'Price it', ['voucher_id' => $q->id], ['database'], 'normal');
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** The admin has priced it: it goes to the customer and stays valid for N days. */
    public function send(Voucher $q, ?User $user = null): Voucher
    {
        $this->assertQuotation($q);
        if (! in_array($q->doc_status, ['requested', 'revision_requested', 'quoted'], true)) {
            throw new BooksException('This quotation is already ' . $q->doc_status . '.');
        }
        $unpriced = $q->items()->where('is_header', false)->where('pending_price', true)->count();
        if ($unpriced > 0) {
            throw new BooksException("{$unpriced} line(s) still have no price — price every line before sending.");
        }
        $q->update(['doc_status' => 'quoted', 'sent_at' => now(), 'valid_until' => today()->addDays($this->validDays())->toDateString()]);
        $this->notify($q, 'quotation_sent', 'Your quotation is ready', "Quotation {$q->voucher_number} is ready — valid until {$q->valid_until->toDateString()}.");

        return $q->fresh();
    }

    /** The customer says yes: it becomes a Sales Order. */
    public function accept(Voucher $q, ?User $user = null): Voucher
    {
        $this->assertQuotation($q);
        $this->assertOpen($q);

        return $this->vouchers->convert($q, VoucherType::SALES_ORDER, ['narration' => $q->narration, 'reference_no' => $q->voucher_number], $user);
    }

    public function decline(Voucher $q, ?string $note = null): Voucher
    {
        $this->assertQuotation($q);
        $this->assertOpen($q);
        $q->update(['doc_status' => 'declined', 'responded_at' => now(), 'response_note' => $note]);

        return $q->fresh();
    }

    public function requestRevision(Voucher $q, ?string $note = null): Voucher
    {
        $this->assertQuotation($q);
        $this->assertOpen($q);
        $q->update(['doc_status' => 'revision_requested', 'responded_at' => now(), 'response_note' => $note]);

        return $q->fresh();
    }

    public function expireDue(): int
    {
        return Voucher::whereHas('type', fn ($t) => $t->where('base_type', VoucherType::QUOTATION))
            ->where('status', Voucher::POSTED)->where('doc_status', 'quoted')->whereDate('valid_until', '<', today())
            ->update(['doc_status' => 'expired']);
    }

    private function assertQuotation(Voucher $q): void
    {
        $q->loadMissing('type');
        if ($q->type->base_type !== VoucherType::QUOTATION) {
            throw new BooksException('That is not a quotation.');
        }
        if ($q->status !== Voucher::POSTED) {
            throw new BooksException('That quotation was cancelled.');
        }
    }

    private function assertOpen(Voucher $q): void
    {
        if ($q->doc_status !== 'quoted') {
            throw new BooksException('This quotation is ' . str_replace('_', ' ', (string) $q->doc_status) . ' — it can\'t be answered now.');
        }
        if ($q->valid_until && $q->valid_until->endOfDay()->isPast()) {
            $q->update(['doc_status' => 'expired']);
            throw new BooksException('This quotation expired on ' . $q->valid_until->toDateString() . '. Ask for a new one.');
        }
    }

    private function notify(Voucher $q, string $type, string $title, string $message): void
    {
        try {
            $customer = $q->customer;
            if ($customer) {
                Notification::createFor($customer->user ?? $customer, $type, $title, $message, '/account/quotations/' . $q->id, 'View quotation', ['voucher_id' => $q->id], ['database'], 'high');
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }
}

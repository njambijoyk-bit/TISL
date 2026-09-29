<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\Customer;
use App\Models\Notification;
use App\Models\QuoteRequest;
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

    /** Build an unpriced (or catalogue-priced) quotation from a customer's request. */
    public function fromRequest(QuoteRequest $qr, ?User $user = null): Voucher
    {
        if ($qr->quotation_voucher_id && Voucher::where('id', $qr->quotation_voucher_id)->where('status', Voucher::POSTED)->exists()) {
            throw new BooksException('This request already has a quotation.');
        }
        $type = VoucherType::byBase(VoucherType::QUOTATION) ?? throw new BooksException('The Quotation voucher type is switched off (or script 20 has not been run).');
        $customer = Customer::findOrFail($qr->customer_id);
        $defaultSales = AccountingSetting::current()->default_sales_ledger_id;

        $lines = [];
        foreach ((array) $qr->requested_items as $it) {
            $kind = $it['item_type'] ?? 'custom_product';
            $qty = max(0.01, (float) ($it['quantity'] ?? 1));
            $note = trim(implode(' · ', array_filter([$it['specifications'] ?? null, $it['notes'] ?? null,
                isset($it['budget_per_unit']) ? 'Budget ' . $it['budget_per_unit'] . ' per unit' : null, $it['lead_time'] ?? null])));
            if ($kind === 'product' && ! empty($it['product_id'])) {
                $lines[] = ['type' => 'product', 'product_id' => $it['product_id'], 'variant_id' => $it['variant_id'] ?? null, 'quantity' => $qty, 'notes' => $note ?: null];
            } elseif ($kind === 'service' && ! empty($it['service_id'])) {
                $pkg = $it['service_variant_id'] ?? Service::find($it['service_id'])?->variants()->orderByDesc('is_default')->value('id');
                if ($pkg) {
                    $lines[] = ['type' => 'service', 'service_id' => $it['service_id'], 'service_variant_id' => $pkg, 'quantity' => $qty, 'notes' => $note ?: null];
                    continue;
                }
                $lines[] = $this->custom($it, $qty, $note, $defaultSales);
            } else {
                $lines[] = $this->custom($it, $qty, $note, $defaultSales);
            }
        }
        if (! $lines) {
            $lines[] = $this->custom(['description' => $qr->request_title], 1, $qr->request_description, $defaultSales);
        }

        return DB::transaction(function () use ($qr, $type, $customer, $lines, $user) {
            $v = $this->vouchers->create([
                'voucher_type_id' => $type->id, 'date' => today()->toDateString(), 'customer_id' => $customer->id,
                'currency_id' => $customer->currency_id, 'lines' => $lines, 'doc_status' => 'requested', 'quote_request_id' => $qr->id,
                'reference_no' => $qr->request_number, 'narration' => trim($qr->request_title . "\n" . $qr->request_description),
                'channel' => 'storefront',
                'meta' => ['request' => $qr->only(['request_number', 'request_title', 'timeline_needed', 'delivery_location', 'budget_range', 'customer_notes'])],
            ], $user);
            $qr->forceFill(['quotation_voucher_id' => $v->id])->save();

            return $v;
        });
    }

    private function custom(array $it, float $qty, ?string $note, ?int $ledger): array
    {
        return ['type' => 'custom', 'description' => $it['description'] ?? 'Requested item', 'quantity' => $qty, 'rate' => 0, 'ledger_id' => $ledger,
            'pending_price' => true, 'notes' => $note ?: null];
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
        if ($q->quote_request_id) {
            QuoteRequest::whereKey($q->quote_request_id)->update(['status' => 'quoted', 'quoted_at' => now()]);
        }
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
        if ($q->quote_request_id) {
            QuoteRequest::whereKey($q->quote_request_id)->update(['status' => 'reviewing']);
        }

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

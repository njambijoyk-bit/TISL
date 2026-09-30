<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
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

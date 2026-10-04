<?php

namespace App\Services\Books;

use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Models\CompanyProfile;
use Illuminate\Support\Facades\Mail;

/**
 * Sending a document to the customer: an e-mail from the company's default address (replies come back to it), or a
 * WhatsApp message that quotes the default phone. The company's contacts live in Books → Settings → Company.
 */
class VoucherShareService
{
    public function __construct(private ExportService $export) {}

    private function assertShareable(Voucher $v): void
    {
        $v->loadMissing('type');
        if ($v->status !== Voucher::POSTED || ! ($this->isCustomerDoc($v) || $v->type?->has_items)) {
            throw new BooksException('Only a live document can be sent.');
        }
    }

    /** Invoices, cash sales, receipts, orders, delivery notes and quotations go out in the customer layout. */
    public function isCustomerDoc(Voucher $v): bool
    {
        $v->loadMissing('type');

        return in_array($v->type?->base_type, ExportService::CUSTOMER_DOCS, true);
    }

    /** Remember a send, quietly: the document has gone even if the log table is not there yet. */
    public function log(Voucher $v, string $channel, ?string $to, string $status, ?int $by, ?string $subject = null, ?string $note = null, ?string $error = null): void
    {
        try {
            \App\Models\Books\DocumentShare::create(['voucher_id' => $v->id, 'channel' => $channel, 'to_address' => $to, 'subject' => $subject, 'note' => $note ?: null,
                'status' => $status, 'error' => $error ? mb_substr($error, 0, 500) : null, 'sent_by' => $by]);
        } catch (\Throwable) {
            // script 75 not run yet
        }
    }

    /** Where it would go and what it would say — the screen shows this before anything is sent. */
    public function info(Voucher $v): array
    {
        $this->assertShareable($v);
        $v->loadMissing(['customer', 'partyLedger', 'currency']);
        $company = CompanyProfile::current();
        $email = $v->customer?->email ?: null;
        $phone = $v->party_phone ?: $v->customer?->phone;
        $name = trim(($v->customer?->first_name ?? '') . ' ' . ($v->customer?->last_name ?? '')) ?: ($v->partyLedger?->name ?? $v->party_name ?? '');
        $msg = $this->message($v, $name);
        $digits = CompanyProfile::waDigits($phone);

        return [
            'to_email' => $email, 'to_phone' => $phone, 'from_email' => CompanyProfile::defaultEmail(), 'company_phone' => CompanyProfile::defaultPhone(),
            'company' => $company->name, 'message' => $msg,
            'whatsapp_url' => 'https://wa.me/' . ($digits ?? '') . '?text=' . rawurlencode($msg),
            'whatsapp_to_number' => $digits !== null, 'whatsapp_digits' => $digits,
        ];
    }

    public function message(Voucher $v, string $name = ''): string
    {
        $cur = $v->currency?->code ?? '';
        $phone = CompanyProfile::defaultPhone();
        $mail = CompanyProfile::defaultEmail();
        $contact = array_filter([$phone ? "call us on {$phone}" : null, $mail ? "email {$mail}" : null]);

        return trim(($name !== '' ? "Hello {$name}, " : 'Hello, ') . "here is your {$v->type->name} {$v->voucher_number} from " . CompanyProfile::name()
            . " dated {$v->date?->toDateString()} — total {$cur} " . number_format((float) $v->total_amount, 2) . '.'
            . ($contact ? ' For any question ' . implode(' or ', $contact) . '.' : '') . ' Thank you.');
    }

    /**
     * E-mail the document. A customer document goes as a short message with the customer copy attached as a PDF; anything else keeps
     * the internal layout as the body. Every attempt is logged for the Mail tab.
     */
    public function email(Voucher $v, ?string $to = null, ?string $note = null, ?int $by = null): string
    {
        $this->assertShareable($v);
        $v->loadMissing(['customer', 'type', 'currency', 'partyLedger']);
        $to = trim((string) ($to ?: $v->customer?->email));
        if ($to === '' || ! filter_var($to, FILTER_VALIDATE_EMAIL)) {
            throw new BooksException('There is no valid e-mail address for this customer — type one in.');
        }
        $from = CompanyProfile::defaultEmail();
        if (! $from) {
            throw new BooksException('Add the company e-mail address first (Books → Settings → Company).');
        }
        $company = CompanyProfile::name();
        $custom = $this->isCustomerDoc($v);
        $subject = "{$v->type->name} {$v->voucher_number} from {$company}";
        try {
            if ($custom) {
                $name = trim(($v->customer?->first_name ?? '') . ' ' . ($v->customer?->last_name ?? '')) ?: ($v->partyLedger?->name ?? $v->party_name ?? '');
                $html = '<p>' . ($note ? nl2br(e($note)) . '</p><p>' : '') . e($this->message($v, $name)) . '</p><p>The document is attached.</p>';
                $pdf = $this->export->documentPdfBytes($v);
                $file = $this->export->documentFileName($v) . '.pdf';
            } else {
                $html = $this->export->voucherHtml($v);
                if ($note) {
                    $html = str_replace('<body>', '<body><p>' . nl2br(e($note)) . '</p>', $html);
                }
                $pdf = $this->export->voucherPdfBytes($v);
                $file = preg_replace('/[^A-Za-z0-9_-]+/', '_', $v->voucher_number) . '.pdf';
            }
            Mail::html($html, function ($m) use ($to, $from, $company, $subject, $pdf, $file) {
                $m->from($from, $company)->replyTo($from, $company)->to($to)->subject($subject);
                if ($pdf !== null) {
                    $m->attachData($pdf, $file, ['mime' => 'application/pdf']);
                }
            });
        } catch (\Throwable $e) {
            $this->log($v, 'email', $to, 'failed', $by, $subject, $note, $e->getMessage());
            throw $e;
        }
        $this->log($v, 'email', $to, 'sent', $by, $subject, $note);

        return $to;
    }
}

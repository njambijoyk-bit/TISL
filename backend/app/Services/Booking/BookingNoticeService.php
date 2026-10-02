<?php

namespace App\Services\Booking;

use App\Models\Booking;
use App\Models\CompanyProfile;
use App\Services\Books\BooksException;
use Illuminate\Support\Facades\Mail;

/** Telling the customer about a booking: an e-mail from the company address, or a WhatsApp message (a wa.me link that quotes the company phone). */
class BookingNoticeService
{
    /** @param string $event booked | cancelled | no_show | moved | done */
    public function message(Booking $b, string $event = 'booked'): string
    {
        $b->loadMissing(['customer', 'service', 'resource']);
        $name = trim(($b->customer?->first_name ?? '') . ' ' . ($b->customer?->last_name ?? ''));
        $when = $b->starts_at->format('l d M Y \a\t H:i');
        $what = $b->service?->name ?? 'your booking';
        $with = $b->resource && $b->resource->type === 'staff' ? " with {$b->resource->name}" : '';
        $phone = CompanyProfile::defaultPhone();
        $mail = CompanyProfile::defaultEmail();
        $contact = array_filter([$phone ? "call {$phone}" : null, $mail ? "email {$mail}" : null]);
        $body = match ($event) {
            'cancelled' => "your booking {$b->number} for {$what} on {$when} has been cancelled.",
            'no_show' => "we missed you: booking {$b->number} for {$what} on {$when} was marked as not attended.",
            'moved' => "your booking {$b->number} for {$what}{$with} has moved to {$when}.",
            'done' => "thank you for visiting us — your booking {$b->number} for {$what} is complete.",
            default => "your booking {$b->number} for {$what}{$with} is confirmed for {$when}."
                . ((float) $b->deposit_amount > 0 ? ' A deposit of ' . number_format((float) $b->deposit_amount, 2) . ' is due to hold it.' : ''),
        };

        return trim(($name !== '' ? "Hello {$name}, " : 'Hello, ') . $body . ($contact ? ' To change anything, ' . implode(' or ', $contact) . '.' : '') . ' — ' . CompanyProfile::name());
    }

    /** Where it would go and what it would say; the screen shows this before anything is sent. */
    public function info(Booking $b, string $event = 'booked'): array
    {
        $b->loadMissing('customer');
        $text = $this->message($b, $event);
        $digits = CompanyProfile::waDigits($b->customer?->phone);

        return ['to_email' => $b->customer?->email ?: null, 'to_phone' => $b->customer?->phone, 'from_email' => CompanyProfile::defaultEmail(), 'company_phone' => CompanyProfile::defaultPhone(),
            'message' => $text, 'whatsapp_url' => 'https://wa.me/' . ($digits ?? '') . '?text=' . rawurlencode($text), 'whatsapp_to_number' => $digits !== null];
    }

    public function email(Booking $b, string $event = 'booked', ?string $to = null): string
    {
        $b->loadMissing('customer');
        $to = trim((string) ($to ?: $b->customer?->email));
        if ($to === '' || ! filter_var($to, FILTER_VALIDATE_EMAIL)) {
            throw new BooksException('There is no valid e-mail address for this customer.');
        }
        $from = CompanyProfile::defaultEmail() ?: throw new BooksException('Add the company e-mail address first (Books → Settings → Company).');
        $company = CompanyProfile::name();
        $text = $this->message($b, $event);
        Mail::raw($text, fn ($m) => $m->from($from, $company)->replyTo($from, $company)->to($to)->subject("Booking {$b->number} — {$company}"));

        return $to;
    }

    /** Send the e-mail when the customer has an address; never lets a mail problem undo the booking. */
    public function tryEmail(Booking $b, string $event): bool
    {
        try {
            $this->email($b, $event);

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }
}

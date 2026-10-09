<?php

namespace App\Services\Notify;

use App\Models\CompanyProfile;
use App\Models\User;
use App\Services\Notify\WhatsApp\WhatsAppProviders;
use Illuminate\Support\Facades\Mail;

/**
 * Tries a set of settings before they go live. Email: sends a real test message to the person who is saving, through the settings being tried (not the live ones).
 * Returns {ok, message}; never throws for an ordinary failure, so the screen can show the server's own words.
 */
class ConnectionTester
{
    public function __construct(private MailConfigurator $mail, private WhatsAppProviders $providers) {}

    /** @return array{ok: bool, message: string} */
    public function email(array $candidate, ?User $to, ?string $toAddress = null): array
    {
        $address = trim((string) ($toAddress ?: $to?->email));
        if ($address === '' || ! filter_var($address, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'message' => 'There is no email address to send the test to. Add one to your profile or type one.'];
        }
        if (($candidate['host'] ?? '') === '') {
            return ['ok' => false, 'message' => 'Enter the mail server (host) first.'];
        }
        $from = ($candidate['from_address'] ?? '') ?: CompanyProfile::defaultEmail() ?: ($candidate['username'] ?? '');
        if (! filter_var($from, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'message' => 'There is no sender address: fill in "From address", or the company email in Books → Settings → Company.'];
        }
        $name = ($candidate['from_name'] ?? '') ?: CompanyProfile::name();
        try {
            $mailer = Mail::build($this->mail->smtpConfig($candidate));
            $mailer->raw("This is a test message from {$name}. If you can read it, the mail settings work.", fn ($m) => $m->from($from, $name)->to($address)->subject("Test email from {$name}"));

            return ['ok' => true, 'message' => "A test email was sent to {$address}. Check that it arrived."];
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => $this->plain($e)];
        }
    }

    /** Do the WhatsApp keys (in these candidate settings) work? Asks the provider; sends nothing. @return array{ok: bool, message: string} */
    public function whatsapp(array $candidate): array
    {
        $p = $this->providers->make($candidate);

        return $p ? $p->check() : ['ok' => false, 'message' => 'Choose a WhatsApp provider first.'];
    }

    /** Send one real template message through the SAVED settings, to a number the person typed. @return array{ok: bool, message: string} */
    public function whatsappMessage(string $number, string $template, array $vars = []): array
    {
        $digits = CompanyProfile::waDigits($number);
        if (! $digits) {
            return ['ok' => false, 'message' => 'Enter the number with its country code, for example +254 712 345 678.'];
        }
        $p = $this->providers->make();
        if (! $p || ! $p->configured()) {
            return ['ok' => false, 'message' => 'Save the WhatsApp keys first.'];
        }
        if (trim($template) === '') {
            return ['ok' => false, 'message' => 'Enter the name of an approved template to send' . ($p->key() === 'twilio' ? ' (its Content SID, starting HX)' : ' (Meta gives every account one called hello_world)') . '.'];
        }
        $r = $p->send($digits, trim($template), app(NotifySettings::class)->get('whatsapp')['language'] ?: 'en', $vars);

        return $r['ok'] ? ['ok' => true, 'message' => "Sent to +{$digits}. It should arrive in a moment."] : ['ok' => false, 'message' => (string) $r['error']];
    }

    /** The server's reason in one readable line, without the stack. */
    private function plain(\Throwable $e): string
    {
        $m = trim(preg_replace('/\s+/', ' ', strip_tags($e->getMessage())));

        return mb_substr($m !== '' ? $m : get_class($e), 0, 300);
    }
}

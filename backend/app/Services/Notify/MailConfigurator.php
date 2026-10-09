<?php

namespace App\Services\Notify;

use Illuminate\Support\Facades\Mail;

/**
 * Puts the email settings saved on the screen into the running mailer. What is saved wins over .env; with nothing saved the server's own settings keep working.
 * Called at boot, before each queued job (so a worker picks up a change without a restart) and before each send.
 */
class MailConfigurator
{
    public function __construct(private NotifySettings $settings) {}

    /** Laravel's smtp mailer config for these saved settings. */
    public function smtpConfig(array $c): array
    {
        $enc = $c['encryption'] ?? 'tls';

        return array_filter([
            'transport' => 'smtp', 'scheme' => $enc === 'ssl' ? 'smtps' : 'smtp', 'host' => $c['host'], 'port' => (int) ($c['port'] ?: 587),
            'username' => ($c['username'] ?? '') !== '' ? $c['username'] : null, 'password' => ($c['password'] ?? '') !== '' ? $c['password'] : null,
            'timeout' => 15, 'auto_tls' => $enc === 'none' ? false : null,
        ], fn ($v) => $v !== null);
    }

    /** Apply the saved email settings. False when nothing usable is saved (the .env settings stay in force). */
    public function apply(): bool
    {
        try {
            if (! NotifySettings::ready() || ! $this->settings->isSaved('email')) {
                return false;
            }
            $c = $this->settings->get('email');
            if (($c['host'] ?? '') === '') {
                return false;
            }
            config(['mail.default' => 'smtp', 'mail.mailers.smtp' => $this->smtpConfig($c)]);
            if (($c['from_address'] ?? '') !== '') {
                config(['mail.from.address' => $c['from_address']]);
            }
            if (($c['from_name'] ?? '') !== '') {
                config(['mail.from.name' => $c['from_name']]);
            }
            config(['mail.reply_to_address' => $c['reply_to'] ?: null, 'mail.copy_to_address' => $c['copy_to'] ?: null]);
            Mail::purge('smtp');

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }
}

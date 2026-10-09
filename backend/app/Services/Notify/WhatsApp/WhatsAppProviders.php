<?php

namespace App\Services\Notify\WhatsApp;

use App\Services\Notify\NotifySettings;

/** The WhatsApp sending service the company chose, built from the saved (or a candidate) settings. */
class WhatsAppProviders
{
    public const ALL = ['meta' => 'Meta WhatsApp Cloud API', 'twilio' => 'Twilio'];

    public function __construct(private NotifySettings $settings) {}

    /** @param  array|null  $cfg  the whatsapp part; null = the saved one */
    public function make(?array $cfg = null, ?string $statusCallback = null): ?WhatsAppProvider
    {
        $cfg ??= $this->settings->get('whatsapp');

        return match ($cfg['provider'] ?? null) {
            'meta' => new MetaCloud($cfg),
            'twilio' => new Twilio($cfg, $statusCallback ?: self::callbackUrl('twilio')),
            default => null,
        };
    }

    public static function callbackUrl(string $provider): string
    {
        return rtrim((string) config('app.url'), '/') . '/api/webhooks/whatsapp/' . $provider;
    }

    /** Can messages go out automatically right now (switched on, a provider chosen, its keys filled in)? */
    public function automatic(): bool
    {
        $g = $this->settings->get('general');
        $c = $this->settings->get('whatsapp');

        return ($g['whatsapp_enabled'] ?? false) && ($c['auto'] ?? false) && (bool) $this->make($c)?->configured();
    }
}

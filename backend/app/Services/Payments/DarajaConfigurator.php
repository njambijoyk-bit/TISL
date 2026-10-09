<?php

namespace App\Services\Payments;

use App\Services\DarajaService;

/**
 * Puts the M-Pesa keys saved on the Payment keys screen into the running app. What is saved wins over .env; a field left blank in what is saved, or nothing saved at all,
 * leaves the .env value in force. Called at boot and before each queued job (so a worker picks up a change without a restart); the M-Pesa client, which reads its settings
 * once when it is made, is dropped so the next use makes a fresh one.
 */
class DarajaConfigurator
{
    public function __construct(private PaymentSettings $settings)
    {
    }

    /** The address Safaricom calls back: the one typed in, or this site's own. */
    public static function callbackUrl(array $c): string
    {
        return ($c['callback_url'] ?? '') !== '' ? $c['callback_url'] : url('/api/payments/callback');
    }

    /** The callback address as it is given to Safaricom: with the token that makes the call believable. */
    public static function callbackUrlWithToken(string $base, string $token): string
    {
        return $token === '' ? $base : $base . (str_contains($base, '?') ? '&' : '?') . 'token=' . $token;
    }

    /** Apply what is saved. False when nothing usable is saved (the .env keys stay in force). */
    public function apply(): bool
    {
        try {
            if (! app()->bound('daraja.server_values')) {
                app()->instance('daraja.server_values', config('daraja'));   // what .env says, remembered before anything saved here is laid over it (the screen shows what is behind a blank field)
            }
            if (! PaymentSettings::ready() || ! $this->settings->isSaved('mpesa')) {
                return false;
            }
            $c = $this->settings->get('mpesa');
            $set = array_filter([
                'daraja.env' => $c['env'] ?: null, 'daraja.consumer_key' => $c['consumer_key'] ?: null, 'daraja.consumer_secret' => $c['consumer_secret'] ?: null,
                'daraja.shortcode' => $c['shortcode'] ?: null, 'daraja.passkey' => $c['passkey'] ?: null, 'daraja.account_reference' => $c['account_reference'] ?: null,
                'daraja.transaction_desc' => $c['transaction_desc'] ?: null, 'daraja.callback_token' => $c['callback_token'] ?: null,
            ], fn ($v) => $v !== null);
            config($set + ['daraja.callback_url' => self::callbackUrlWithToken(self::callbackUrl($c), (string) $c['callback_token'])]);
            $rotated = $c['callback_token_rotated_at'] ? \Illuminate\Support\Carbon::parse($c['callback_token_rotated_at']) : null;
            config(['daraja.callback_token_previous' => ($c['callback_token_previous'] ?? '') !== '' && $rotated && $rotated->gt(now()->subMinutes(PaymentSettings::GRACE_MINUTES)) ? $c['callback_token_previous'] : '']);
            app()->forgetInstance(DarajaService::class);

            return true;
        } catch (\Throwable $e) {
            report($e);

            return false;
        }
    }
}

<?php

namespace App\Services\Notify\WhatsApp;

use Illuminate\Support\Facades\Http;

/** Twilio WhatsApp. A template there is a "Content SID" (HX...), filled with numbered variables. */
class Twilio implements WhatsAppProvider
{
    private const BASE = 'https://api.twilio.com/2010-04-01/Accounts/';

    public function __construct(private array $cfg, private ?string $statusCallback = null) {}

    public function key(): string
    {
        return 'twilio';
    }

    private function get(string $k): string
    {
        return trim((string) ($this->cfg['twilio'][$k] ?? ''));
    }

    public function configured(): bool
    {
        return $this->get('account_sid') !== '' && $this->get('auth_token') !== '' && ($this->get('from') !== '' || $this->get('messaging_service_sid') !== '');
    }

    public function check(): array
    {
        if (! $this->configured()) {
            return ['ok' => false, 'message' => 'Fill in the account SID, the auth token, and the WhatsApp sender (or a messaging service).'];
        }
        try {
            $r = Http::withBasicAuth($this->get('account_sid'), $this->get('auth_token'))->timeout(15)->get(self::BASE . $this->get('account_sid') . '.json');
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => 'Could not reach Twilio: ' . mb_substr($e->getMessage(), 0, 160)];
        }
        if (! $r->successful()) {
            return ['ok' => false, 'message' => 'Twilio refused the keys: ' . ($r->json('message') ?: 'HTTP ' . $r->status())];
        }

        return ['ok' => true, 'message' => 'Connected to Twilio account ' . ($r->json('friendly_name') ?: $this->get('account_sid')) . '.'];
    }

    private function whatsapp(string $n): string
    {
        return 'whatsapp:+' . ltrim(preg_replace('/\D+/', '', $n), '+');
    }

    public function send(string $toDigits, string $template, string $language, array $vars): array
    {
        $form = ['To' => $this->whatsapp($toDigits), 'ContentSid' => $template];
        if ($vars) {
            $form['ContentVariables'] = json_encode((object) array_combine(array_map('strval', range(1, count($vars))), array_values($vars)), JSON_UNESCAPED_UNICODE);
        }
        $this->get('messaging_service_sid') !== '' ? $form['MessagingServiceSid'] = $this->get('messaging_service_sid') : $form['From'] = $this->whatsapp($this->get('from'));
        if ($this->statusCallback) {
            $form['StatusCallback'] = $this->statusCallback;
        }
        try {
            $r = Http::withBasicAuth($this->get('account_sid'), $this->get('auth_token'))->asForm()->timeout(20)->post(self::BASE . $this->get('account_sid') . '/Messages.json', $form);
        } catch (\Throwable $e) {
            return ['ok' => false, 'id' => null, 'error' => 'Could not reach Twilio: ' . mb_substr($e->getMessage(), 0, 160)];
        }
        if (! $r->successful()) {
            return ['ok' => false, 'id' => null, 'error' => (string) ($r->json('message') ?: 'HTTP ' . $r->status())];
        }

        return ['ok' => true, 'id' => $r->json('sid'), 'error' => null];
    }

    /** Twilio signs the full callback URL plus every posted field (sorted by name, name then value) with the auth token (HMAC-SHA1, base64). */
    public function verifies(string $url, string $rawBody, array $headers, array $form): bool
    {
        $token = $this->get('auth_token');
        $sig = $headers['x-twilio-signature'][0] ?? $headers['X-Twilio-Signature'][0] ?? '';
        if ($token === '' || $sig === '') {
            return false;
        }
        ksort($form);
        $data = $url;
        foreach ($form as $k => $v) {
            $data .= $k . (is_array($v) ? implode('', $v) : $v);
        }

        return hash_equals(base64_encode(hash_hmac('sha1', $data, $token, true)), $sig);
    }

    public function statuses(array $payload): array
    {
        $sid = $payload['MessageSid'] ?? $payload['SmsSid'] ?? null;
        $map = ['sent' => 'sent', 'delivered' => 'delivered', 'read' => 'read', 'failed' => 'failed', 'undelivered' => 'failed'];
        $st = $map[strtolower((string) ($payload['MessageStatus'] ?? $payload['SmsStatus'] ?? ''))] ?? null;
        if (! $sid || ! $st) {
            return [];
        }

        return [['id' => (string) $sid, 'status' => $st, 'error' => $st === 'failed' ? (string) ($payload['ErrorMessage'] ?? ('error ' . ($payload['ErrorCode'] ?? 'unknown'))) : null]];
    }
}

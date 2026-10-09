<?php

namespace App\Services\Notify\WhatsApp;

use Illuminate\Support\Facades\Http;

/** WhatsApp Business Cloud API from Meta. Template messages only (the only way a business may start a conversation). */
class MetaCloud implements WhatsAppProvider
{
    private const BASE = 'https://graph.facebook.com/v20.0';

    public function __construct(private array $cfg) {}

    public function key(): string
    {
        return 'meta';
    }

    private function get(string $k): string
    {
        return trim((string) ($this->cfg['meta'][$k] ?? ''));
    }

    public function configured(): bool
    {
        return $this->get('phone_number_id') !== '' && $this->get('access_token') !== '';
    }

    public function check(): array
    {
        if (! $this->configured()) {
            return ['ok' => false, 'message' => 'Fill in the phone number ID and the access token.'];
        }
        try {
            $r = Http::withToken($this->get('access_token'))->timeout(15)->get(self::BASE . '/' . $this->get('phone_number_id'), ['fields' => 'display_phone_number,verified_name']);
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => 'Could not reach Meta: ' . mb_substr($e->getMessage(), 0, 160)];
        }
        if (! $r->successful()) {
            return ['ok' => false, 'message' => 'Meta refused the keys: ' . ($r->json('error.message') ?: 'HTTP ' . $r->status())];
        }

        return ['ok' => true, 'message' => 'Connected to ' . ($r->json('verified_name') ?: 'your WhatsApp account') . ($r->json('display_phone_number') ? ' (' . $r->json('display_phone_number') . ')' : '') . '.'];
    }

    public function send(string $toDigits, string $template, string $language, array $vars): array
    {
        $body = ['messaging_product' => 'whatsapp', 'to' => $toDigits, 'type' => 'template', 'template' => ['name' => $template, 'language' => ['code' => $language]]];
        if ($vars) {
            $body['template']['components'] = [['type' => 'body', 'parameters' => array_map(fn ($v) => ['type' => 'text', 'text' => $v], array_values($vars))]];
        }
        try {
            $r = Http::withToken($this->get('access_token'))->timeout(20)->post(self::BASE . '/' . $this->get('phone_number_id') . '/messages', $body);
        } catch (\Throwable $e) {
            return ['ok' => false, 'id' => null, 'error' => 'Could not reach Meta: ' . mb_substr($e->getMessage(), 0, 160)];
        }
        if (! $r->successful()) {
            return ['ok' => false, 'id' => null, 'error' => (string) ($r->json('error.message') ?: 'HTTP ' . $r->status())];
        }

        return ['ok' => true, 'id' => $r->json('messages.0.id'), 'error' => null];
    }

    public function verifies(string $url, string $rawBody, array $headers, array $form): bool
    {
        $secret = $this->get('app_secret');
        $sig = $headers['x-hub-signature-256'][0] ?? $headers['X-Hub-Signature-256'][0] ?? ($headers['x-hub-signature-256'] ?? '');
        $sig = is_array($sig) ? ($sig[0] ?? '') : (string) $sig;

        return $secret !== '' && $sig !== '' && hash_equals('sha256=' . hash_hmac('sha256', $rawBody, $secret), $sig);
    }

    public function statuses(array $payload): array
    {
        $out = [];
        foreach ($payload['entry'] ?? [] as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                foreach ($change['value']['statuses'] ?? [] as $s) {
                    if (empty($s['id']) || ! in_array($s['status'] ?? '', ['sent', 'delivered', 'read', 'failed'], true)) {
                        continue;
                    }
                    $out[] = ['id' => (string) $s['id'], 'status' => $s['status'], 'error' => $s['status'] === 'failed' ? (string) ($s['errors'][0]['message'] ?? $s['errors'][0]['title'] ?? 'failed') : null];
                }
            }
        }

        return $out;
    }
}

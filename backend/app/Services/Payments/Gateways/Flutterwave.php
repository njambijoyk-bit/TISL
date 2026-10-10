<?php

namespace App\Services\Payments\Gateways;

use App\Models\Books\PaymentAttempt;
use Illuminate\Http\Request;

/** Flutterwave Standard (v3): a payment link, then verification by our own reference (tx_ref). The webhook carries the "secret hash" you set in the Flutterwave dashboard. */
class Flutterwave extends AbstractGateway
{
    private const API = 'https://api.flutterwave.com/v3';

    public function key(): string
    {
        return 'flutterwave';
    }

    public function label(): string
    {
        return 'Flutterwave';
    }

    public function fields(): array
    {
        return [
            $this->field('secret_key', 'Secret key', 'secret', 'Starts with FLWSECK_TEST- (practice) or FLWSECK- (real). Settings → API in your Flutterwave dashboard.'),
            $this->field('secret_hash', 'Secret hash (webhook)', 'secret', 'Any long secret text you make up; type the same in Flutterwave\'s webhook settings. Flutterwave sends it with every call so we know it is theirs.'),
        ];
    }

    public function secrets(): array
    {
        return ['secret_key', 'secret_hash'];
    }

    public function rules(): array
    {
        return ['secret_key' => 'sometimes|nullable|string|max:300', 'secret_hash' => 'sometimes|nullable|string|max:300'];
    }

    public function configured(array $cfg): bool
    {
        return str_starts_with((string) ($cfg['secret_key'] ?? ''), 'FLWSECK');
    }

    public function help(): array
    {
        return ['docs' => 'https://app.flutterwave.com/dashboard/settings/apis', 'steps' => [
            'In Flutterwave: Settings → API. Copy the Secret key (test or live).',
            'Make up a long random "secret hash" and type it here. In Settings → Webhooks paste the same secret hash and the webhook address shown here.',
        ]];
    }

    public function test(array $cfg): array
    {
        if (! $this->configured($cfg)) {
            return ['ok' => false, 'message' => 'Enter the secret key (it starts with FLWSECK).'];
        }
        try {
            $r = $this->http()->withToken($cfg['secret_key'])->get(self::API . '/balances');
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => 'Could not reach Flutterwave: ' . $this->plain($e)];
        }

        return $r->successful() && $r->json('status') === 'success'
            ? ['ok' => true, 'message' => 'Flutterwave accepted the key (' . (str_contains($cfg['secret_key'], 'TEST') ? 'test' : 'live') . ' mode).']
            : ['ok' => false, 'message' => 'Flutterwave did not accept the key: ' . ($r->json('message') ?: 'answer ' . $r->status())];
    }

    public function start(array $cfg, array $p): array
    {
        $r = $this->http()->withToken($cfg['secret_key'])->post(self::API . '/payments', [
            'tx_ref' => $p['reference'], 'amount' => round($p['amount'], 2), 'currency' => strtoupper($p['currency']), 'redirect_url' => $p['return_url'],
            'customer' => array_filter(['email' => $p['email'] ?: 'customer@example.com', 'phonenumber' => $p['phone'], 'name' => $p['name']]),
            'customizations' => ['title' => mb_substr($p['description'], 0, 60)], 'meta' => ['attempt_id' => $p['attempt_id']],
        ]);
        if (! $r->successful() || ! $r->json('data.link')) {
            throw new \RuntimeException('Flutterwave did not start the payment: ' . ($r->json('message') ?: 'answer ' . $r->status()));
        }

        return ['redirect_url' => $r->json('data.link'), 'provider_ref' => $p['reference']];
    }

    public function verify(array $cfg, PaymentAttempt $attempt): array
    {
        $ref = $attempt->merchant_request_id ?: $attempt->checkout_request_id;
        if (! $ref) {
            return $this->pending();
        }
        try {
            $r = $this->http()->withToken($cfg['secret_key'])->get(self::API . '/transactions/verify_by_reference', ['tx_ref' => $ref]);
        } catch (\Throwable) {
            return $this->pending();
        }
        if (! $r->successful() || $r->json('status') !== 'success') {
            return $this->pending();   // no such transaction yet: the customer has not got as far as paying
        }
        $status = (string) $r->json('data.status');
        if ($status === 'successful') {
            return $this->paid((float) $r->json('data.amount'), (string) $r->json('data.currency'), (string) ($r->json('data.flw_ref') ?: $r->json('data.id')));
        }

        return $status === 'failed' ? $this->failed((string) ($r->json('data.processor_response') ?: 'Flutterwave says the payment failed.')) : $this->pending();
    }

    public function parseWebhook(Request $request, array $cfg): ?array
    {
        $hash = (string) ($cfg['secret_hash'] ?? '');
        if ($hash === '') {
            return null;
        }
        $legacy = (string) $request->header('verif-hash', '');
        $signed = (string) $request->header('flutterwave-signature', '');
        $ok = ($legacy !== '' && hash_equals($hash, $legacy)) || ($signed !== '' && hash_equals(base64_encode(hash_hmac('sha256', $request->getContent(), $hash, true)), $signed));
        if (! $ok) {
            return null;
        }
        $event = json_decode($request->getContent(), true) ?: [];
        $d = $event['data'] ?? $event;
        $ref = $d['tx_ref'] ?? $d['txRef'] ?? null;

        return $ref ? ['reference' => $ref, 'provider_ref' => $ref] : null;
    }
}

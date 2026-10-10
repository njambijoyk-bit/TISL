<?php

namespace App\Services\Payments\Gateways;

use App\Models\Books\PaymentAttempt;
use App\Models\CompanyProfile;
use Illuminate\Http\Request;

/** Paystack (cards, M-Pesa and bank options Paystack offers in your country) through its hosted page. Amounts go in the smallest unit; the webhook is signed with the secret key. */
class Paystack extends AbstractGateway
{
    private const API = 'https://api.paystack.co';

    public function key(): string
    {
        return 'paystack';
    }

    public function label(): string
    {
        return 'Paystack';
    }

    public function fields(): array
    {
        return [$this->field('secret_key', 'Secret key', 'secret', 'Starts with sk_test_ (practice) or sk_live_ (real). Settings → API Keys & Webhooks in your Paystack dashboard.')];
    }

    public function secrets(): array
    {
        return ['secret_key'];
    }

    public function rules(): array
    {
        return ['secret_key' => 'sometimes|nullable|string|max:300'];
    }

    public function configured(array $cfg): bool
    {
        return (bool) preg_match('/^sk_(test|live)_/', (string) ($cfg['secret_key'] ?? ''));
    }

    public function help(): array
    {
        return ['docs' => 'https://dashboard.paystack.com/#/settings/developers', 'steps' => [
            'In Paystack: Settings → API Keys & Webhooks. Copy the Secret key (test or live).',
            'On the same page paste the webhook address shown here into "Live Webhook URL" (and "Test Webhook URL" to practise). Paystack signs its calls with your secret key, so nothing else is needed.',
        ]];
    }

    public function test(array $cfg): array
    {
        if (! $this->configured($cfg)) {
            return ['ok' => false, 'message' => 'Enter the secret key (it starts with sk_test_ or sk_live_).'];
        }
        try {
            $r = $this->http()->withToken($cfg['secret_key'])->get(self::API . '/balance');
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => 'Could not reach Paystack: ' . $this->plain($e)];
        }

        return $r->successful() && $r->json('status') === true
            ? ['ok' => true, 'message' => 'Paystack accepted the key (' . (str_starts_with($cfg['secret_key'], 'sk_live_') ? 'live' : 'test') . ' mode).']
            : ['ok' => false, 'message' => 'Paystack did not accept the key: ' . ($r->json('message') ?: 'answer ' . $r->status())];
    }

    public function start(array $cfg, array $p): array
    {
        $r = $this->http()->withToken($cfg['secret_key'])->post(self::API . '/transaction/initialize', [
            'email' => $p['email'] ?: (CompanyProfile::defaultEmail() ?: 'customer@example.com'), 'amount' => $this->minor($p['amount'], $p['currency']), 'currency' => strtoupper($p['currency']),
            'reference' => $p['reference'], 'callback_url' => $p['return_url'], 'metadata' => ['attempt_id' => $p['attempt_id'], 'cancel_action' => $p['cancel_url']],
        ]);
        if (! $r->successful() || ! $r->json('data.authorization_url')) {
            throw new \RuntimeException('Paystack did not start the payment: ' . ($r->json('message') ?: 'answer ' . $r->status()));
        }

        return ['redirect_url' => $r->json('data.authorization_url'), 'provider_ref' => $p['reference']];
    }

    public function verify(array $cfg, PaymentAttempt $attempt): array
    {
        $ref = $attempt->checkout_request_id ?: $attempt->merchant_request_id;
        if (! $ref) {
            return $this->pending();
        }
        try {
            $r = $this->http()->withToken($cfg['secret_key'])->get(self::API . '/transaction/verify/' . rawurlencode($ref));
        } catch (\Throwable) {
            return $this->pending();
        }
        if (! $r->successful()) {
            return $this->pending();   // "reference not found" before the customer reaches the page is not a failure
        }
        $status = (string) $r->json('data.status');
        $cur = (string) $r->json('data.currency');
        if ($status === 'success') {
            return $this->paid($this->major($r->json('data.amount'), strtoupper($cur)), $cur, (string) ($r->json('data.reference') ?: $ref));
        }

        return $status === 'failed' ? $this->failed((string) ($r->json('data.gateway_response') ?: 'Paystack says the payment failed.')) : $this->pending();
    }

    public function parseWebhook(Request $request, array $cfg): ?array
    {
        $secret = (string) ($cfg['secret_key'] ?? '');
        $sig = (string) $request->header('x-paystack-signature', '');
        if ($secret === '' || $sig === '' || ! hash_equals(hash_hmac('sha512', $request->getContent(), $secret), $sig)) {
            return null;
        }
        $event = json_decode($request->getContent(), true) ?: [];
        if (! str_starts_with((string) ($event['event'] ?? ''), 'charge.')) {
            return null;
        }
        $ref = $event['data']['reference'] ?? null;

        return $ref ? ['reference' => $ref, 'provider_ref' => $ref] : null;
    }
}

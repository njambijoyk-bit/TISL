<?php

namespace App\Services\Payments\Gateways;

use App\Models\Books\PaymentAttempt;
use Illuminate\Http\Request;

/**
 * Stripe Checkout (cards, and Link, Stripe's one-click wallet, when switched on). The customer pays on Stripe's page; the webhook (checkout.session.*) and the customer's return
 * both end in asking Stripe for the session. Test or live is decided by the key itself (sk_test_… / sk_live_…).
 */
class Stripe extends AbstractGateway
{
    private const API = 'https://api.stripe.com/v1';

    public function key(): string
    {
        return 'stripe';
    }

    public function label(): string
    {
        return 'Stripe';
    }

    public function fields(): array
    {
        return [
            $this->field('secret_key', 'Secret key', 'secret', 'Starts with sk_test_ (practice) or sk_live_ (real). Developers → API keys in your Stripe dashboard.'),
            $this->field('webhook_secret', 'Webhook signing secret', 'secret', 'Starts with whsec_. Created when you add this site\'s webhook address (shown above) in Developers → Webhooks. Without it Stripe\'s calls are not believed (the customer\'s return still confirms the payment).'),
            $this->field('offer_link', 'Also offer Link', 'toggle', 'Link is Stripe\'s one-click wallet: customers who saved their details with Link pay in a tap. It appears on the same Stripe page.'),
        ];
    }

    public function secrets(): array
    {
        return ['secret_key', 'webhook_secret'];
    }

    public function rules(): array
    {
        return ['secret_key' => 'sometimes|nullable|string|max:300', 'webhook_secret' => 'sometimes|nullable|string|max:300', 'offer_link' => 'sometimes|boolean'];
    }

    public function configured(array $cfg): bool
    {
        return (bool) preg_match('/^(sk|rk)_(test|live)_/', (string) ($cfg['secret_key'] ?? ''));
    }

    public function help(): array
    {
        return ['docs' => 'https://dashboard.stripe.com/apikeys', 'steps' => [
            'In Stripe: Developers → API keys. Copy the Secret key (sk_test_… to practise, sk_live_… for real money).',
            'In Stripe: Developers → Webhooks → Add endpoint. Paste the webhook address shown here and tick the events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired.',
            'Copy that endpoint\'s Signing secret (whsec_…) into the field here.',
            'To offer Link, switch it on in Stripe: Settings → Payments → Payment methods.',
        ]];
    }

    private function mode(string $key): string
    {
        return str_contains($key, '_live_') ? 'live' : 'test';
    }

    public function test(array $cfg): array
    {
        if (! $this->configured($cfg)) {
            return ['ok' => false, 'message' => 'Enter the secret key (it starts with sk_test_ or sk_live_).'];
        }
        try {
            $r = $this->http()->withToken($cfg['secret_key'])->get(self::API . '/balance');
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => 'Could not reach Stripe: ' . $this->plain($e)];
        }

        return $r->successful()
            ? ['ok' => true, 'message' => 'Stripe accepted the key (' . ($r->json('livemode') ? 'live' : 'test') . ' mode).']
            : ['ok' => false, 'message' => 'Stripe did not accept the key: ' . ($r->json('error.message') ?: 'answer ' . $r->status())];
    }

    public function start(array $cfg, array $p): array
    {
        $methods = ['card'];
        if (! empty($cfg['offer_link'])) {
            $methods[] = 'link';
        }
        $body = [
            'mode' => 'payment', 'payment_method_types' => $methods, 'client_reference_id' => $p['reference'], 'success_url' => $p['return_url'], 'cancel_url' => $p['cancel_url'],
            'line_items' => [['quantity' => 1, 'price_data' => ['currency' => strtolower($p['currency']), 'unit_amount' => $this->minor($p['amount'], $p['currency']), 'product_data' => ['name' => mb_substr($p['description'], 0, 120)]]]],
            'metadata' => ['attempt_id' => (string) $p['attempt_id'], 'reference' => $p['reference']],
            'payment_intent_data' => ['description' => mb_substr($p['description'], 0, 200), 'metadata' => ['reference' => $p['reference']]],
        ];
        if (! empty($p['email'])) {
            $body['customer_email'] = $p['email'];
        }
        $r = $this->http()->withToken($cfg['secret_key'])->asForm()->post(self::API . '/checkout/sessions', $body);
        if (! $r->successful() || ! $r->json('url')) {
            throw new \RuntimeException('Stripe did not start the payment: ' . ($r->json('error.message') ?: 'answer ' . $r->status()));
        }

        return ['redirect_url' => $r->json('url'), 'provider_ref' => $r->json('id')];
    }

    public function verify(array $cfg, PaymentAttempt $attempt): array
    {
        if (! $attempt->checkout_request_id) {
            return $this->pending();
        }
        try {
            $r = $this->http()->withToken($cfg['secret_key'])->get(self::API . '/checkout/sessions/' . $attempt->checkout_request_id);
        } catch (\Throwable) {
            return $this->pending();   // could not ask just now: not a verdict
        }
        if (! $r->successful()) {
            return $this->pending();
        }
        $cur = (string) $r->json('currency');
        if ($r->json('payment_status') === 'paid') {
            return $this->paid($this->major($r->json('amount_total'), strtoupper($cur)), $cur, (string) ($r->json('payment_intent') ?: $r->json('id')));
        }

        return $r->json('status') === 'expired' ? $this->failed('The Stripe payment page expired before it was paid.') : $this->pending();
    }

    public function parseWebhook(Request $request, array $cfg): ?array
    {
        $secret = (string) ($cfg['webhook_secret'] ?? '');
        $header = (string) $request->header('Stripe-Signature', '');
        if ($secret === '' || $header === '') {
            return null;
        }
        $t = null;
        $sigs = [];
        foreach (explode(',', $header) as $part) {
            [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
            if ($k === 't') {
                $t = $v;
            } elseif ($k === 'v1') {
                $sigs[] = $v;
            }
        }
        if (! $t || ! ctype_digit($t) || abs(time() - (int) $t) > 300) {
            return null;   // missing, or too old to be the real thing (a replay)
        }
        $expected = hash_hmac('sha256', $t . '.' . $request->getContent(), $secret);
        if (! collect($sigs)->contains(fn ($s) => hash_equals($expected, $s))) {
            return null;
        }
        $event = json_decode($request->getContent(), true) ?: [];
        if (! str_starts_with((string) ($event['type'] ?? ''), 'checkout.session.')) {
            return null;
        }
        $o = $event['data']['object'] ?? [];

        return ['reference' => $o['client_reference_id'] ?? null, 'provider_ref' => $o['id'] ?? null];
    }
}

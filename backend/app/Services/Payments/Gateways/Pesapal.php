<?php

namespace App\Services\Payments\Gateways;

use App\Models\Books\PaymentAttempt;
use App\Models\CompanyProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Pesapal API 3.0: a token from the consumer key and secret, our webhook (IPN) address registered once, then an order whose redirect page the customer pays on. Pesapal's IPN
 * carries no signature, so it is only ever used to learn WHICH payment to ask about; the answer comes from Pesapal's status call.
 */
class Pesapal extends AbstractGateway
{
    public function key(): string
    {
        return 'pesapal';
    }

    public function label(): string
    {
        return 'Pesapal';
    }

    public function fields(): array
    {
        return [
            $this->field('env', 'Environment', 'select', 'Sandbox is Pesapal\'s practice site with its own keys; Live is real money.', ['options' => [['sandbox', 'Sandbox (practice)'], ['live', 'Live (real money)']], 'default' => 'sandbox']),
            $this->field('consumer_key', 'Consumer key', 'secret', 'From your Pesapal merchant account (API keys).'),
            $this->field('consumer_secret', 'Consumer secret', 'secret'),
        ];
    }

    public function secrets(): array
    {
        return ['consumer_key', 'consumer_secret'];
    }

    public function rules(): array
    {
        return ['env' => 'sometimes|in:sandbox,live', 'consumer_key' => 'sometimes|nullable|string|max:300', 'consumer_secret' => 'sometimes|nullable|string|max:300'];
    }

    public function configured(array $cfg): bool
    {
        return ($cfg['consumer_key'] ?? '') !== '' && ($cfg['consumer_secret'] ?? '') !== '';
    }

    public function help(): array
    {
        return ['docs' => 'https://developer.pesapal.com/', 'steps' => [
            'Use the consumer key and secret from your Pesapal merchant account for the environment you choose (sandbox and live have different ones).',
            'There is nothing to set up in Pesapal\'s dashboard: our notification (IPN) address is registered with Pesapal automatically the first time a payment starts.',
        ]];
    }

    private function base(array $cfg): string
    {
        return ($cfg['env'] ?? 'sandbox') === 'live' ? 'https://pay.pesapal.com/v3' : 'https://cybqa.pesapal.com/pesapalv3';
    }

    /** A token (they last 5 minutes; kept for 4). */
    private function token(array $cfg): string
    {
        $key = 'pesapal_token_' . md5($this->base($cfg) . '|' . $cfg['consumer_key']);

        return Cache::remember($key, 240, function () use ($cfg) {
            $r = $this->http()->post($this->base($cfg) . '/api/Auth/RequestToken', ['consumer_key' => $cfg['consumer_key'], 'consumer_secret' => $cfg['consumer_secret']]);
            if (! $r->successful() || ! $r->json('token')) {
                throw new \RuntimeException('Pesapal did not accept the keys: ' . ($r->json('error.message') ?: $r->json('message') ?: 'answer ' . $r->status()));
            }

            return (string) $r->json('token');
        });
    }

    public function test(array $cfg): array
    {
        if (! $this->configured($cfg)) {
            return ['ok' => false, 'message' => 'Enter the consumer key and the consumer secret.'];
        }
        Cache::forget('pesapal_token_' . md5($this->base($cfg) . '|' . $cfg['consumer_key']));
        try {
            $this->token($cfg);
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => $this->plain($e)];
        }

        return ['ok' => true, 'message' => 'Pesapal accepted the keys (' . (($cfg['env'] ?? 'sandbox') === 'live' ? 'live' : 'sandbox') . ').'];
    }

    /** Our notification address, registered with Pesapal (once per address and key). */
    private function ipnId(array $cfg, string $url): string
    {
        return Cache::rememberForever('pesapal_ipn_' . md5($this->base($cfg) . '|' . $cfg['consumer_key'] . '|' . $url), function () use ($cfg, $url) {
            $r = $this->http()->withToken($this->token($cfg))->post($this->base($cfg) . '/api/URLSetup/RegisterIPN', ['url' => $url, 'ipn_notification_type' => 'GET']);
            if (! $r->successful() || ! $r->json('ipn_id')) {
                throw new \RuntimeException('Pesapal did not register the notification address: ' . ($r->json('error.message') ?: 'answer ' . $r->status()));
            }

            return (string) $r->json('ipn_id');
        });
    }

    public function start(array $cfg, array $p): array
    {
        $token = $this->token($cfg);
        $name = trim((string) $p['name']);
        $r = $this->http()->withToken($token)->post($this->base($cfg) . '/api/Transactions/SubmitOrderRequest', [
            'id' => $p['reference'], 'currency' => strtoupper($p['currency']), 'amount' => round($p['amount'], 2), 'description' => mb_substr($p['description'], 0, 100),
            'callback_url' => $p['return_url'], 'cancellation_url' => $p['cancel_url'], 'notification_id' => $this->ipnId($cfg, $p['webhook_url']),
            'billing_address' => array_filter(['email_address' => $p['email'] ?: (CompanyProfile::defaultEmail() ?: null), 'phone_number' => $p['phone'], 'first_name' => $name !== '' ? explode(' ', $name)[0] : null, 'country_code' => 'KE']),
        ]);
        if (! $r->successful() || ! $r->json('redirect_url')) {
            throw new \RuntimeException('Pesapal did not start the payment: ' . ($r->json('error.message') ?: $r->json('message') ?: 'answer ' . $r->status()));
        }

        return ['redirect_url' => $r->json('redirect_url'), 'provider_ref' => (string) $r->json('order_tracking_id')];
    }

    public function verify(array $cfg, PaymentAttempt $attempt): array
    {
        if (! $attempt->checkout_request_id) {
            return $this->pending();
        }
        try {
            $r = $this->http()->withToken($this->token($cfg))->get($this->base($cfg) . '/api/Transactions/GetTransactionStatus', ['orderTrackingId' => $attempt->checkout_request_id]);
        } catch (\Throwable) {
            return $this->pending();
        }
        if (! $r->successful()) {
            return $this->pending();
        }
        $code = (int) $r->json('status_code');   // 1 completed, 2 failed, 3 reversed, 0 invalid
        if ($code === 1) {
            return $this->paid((float) $r->json('amount'), (string) $r->json('currency'), (string) ($r->json('confirmation_code') ?: $attempt->checkout_request_id));
        }

        return in_array($code, [2, 3], true) ? $this->failed('Pesapal says the payment ' . strtolower((string) ($r->json('payment_status_description') ?: 'failed')) . '.') : $this->pending();
    }

    public function parseWebhook(Request $request, array $cfg): ?array
    {
        $track = (string) ($request->input('OrderTrackingId') ?? $request->query('OrderTrackingId', ''));
        $ref = (string) ($request->input('OrderMerchantReference') ?? $request->query('OrderMerchantReference', ''));

        return $track !== '' || $ref !== '' ? ['reference' => $ref ?: null, 'provider_ref' => $track ?: null] : null;
    }

    public function ack(Request $request): array
    {
        return ['orderNotificationType' => (string) ($request->input('OrderNotificationType') ?? $request->query('OrderNotificationType', 'IPNCHANGE')), 'orderTrackingId' => (string) ($request->input('OrderTrackingId') ?? $request->query('OrderTrackingId', '')),
            'orderMerchantReference' => (string) ($request->input('OrderMerchantReference') ?? $request->query('OrderMerchantReference', '')), 'status' => 200];
    }
}

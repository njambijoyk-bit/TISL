<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifySettings;
use App\Services\Notify\WhatsApp\WhatsAppProviders;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * What WhatsApp tells us about messages we sent (sent, delivered, read, failed), and messages people send us (build 6.5). Public by nature, so nothing is believed until the provider's signature checks
 * out against the keys saved on the Notifications screen; a call that does not check out changes nothing and is answered 403.
 */
class WhatsAppWebhookController extends Controller
{
    public function __construct(private WhatsAppProviders $providers, private NotifySettings $settings, private Notifier $notifier) {}

    /** GET: Meta asks, once, whether we own this address. We answer with its challenge if the verify token matches the one saved. */
    public function metaVerify(Request $request): Response
    {
        $token = (string) ($this->settings->get('whatsapp')['meta']['verify_token'] ?? '');
        if ($token !== '' && $request->query('hub_mode') === 'subscribe' && hash_equals($token, (string) $request->query('hub_verify_token'))) {
            return response((string) $request->query('hub_challenge'), 200)->header('Content-Type', 'text/plain');
        }

        return response('Forbidden', 403);
    }

    public function meta(Request $request): Response
    {
        $p = $this->providers->make(array_replace_recursive($this->settings->get('whatsapp'), ['provider' => 'meta']));
        if (! $p || ! $p->verifies($request->fullUrl(), $request->getContent(), $request->headers->all(), [])) {
            return response('Forbidden', 403);
        }
        foreach ($p->statuses((array) $request->json()->all()) as $s) {
            $this->notifier->applyStatus($s['id'], $s['status'], $s['error']);
        }
        $this->incoming($p->incoming((array) $request->json()->all()));

        return response('ok', 200);
    }

    /** Messages people sent us: filed into the open conversation that wrote to that number, or kept waiting (build 6.5). */
    private function incoming(array $messages): void
    {
        foreach ($messages as $m) {
            try {
                app(\App\Services\Notify\Replies\InboundReplies::class)->receive(['channel' => 'whatsapp', 'external_id' => $m['id'], 'from' => $m['from'], 'from_name' => $m['name'], 'body' => $m['body'], 'received_at' => $m['at']]);
            } catch (\Throwable $e) {
                report($e);   // a reply that cannot be kept must not make the provider send the statuses again
            }
        }
    }

    public function twilio(Request $request): Response
    {
        $p = $this->providers->make(array_replace_recursive($this->settings->get('whatsapp'), ['provider' => 'twilio']));
        $url = WhatsAppProviders::callbackUrl('twilio');
        if (! $p || ! $p->verifies($url, $request->getContent(), $request->headers->all(), $request->post())) {
            return response('Forbidden', 403);
        }
        foreach ($p->statuses($request->post()) as $s) {
            $this->notifier->applyStatus($s['id'], $s['status'], $s['error']);
        }
        $this->incoming($p->incoming($request->post()));

        return response('ok', 200);
    }
}

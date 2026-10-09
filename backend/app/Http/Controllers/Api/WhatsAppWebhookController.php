<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Notify\Notifier;
use App\Services\Notify\NotifySettings;
use App\Services\Notify\WhatsApp\WhatsAppProviders;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * What WhatsApp tells us about messages we sent (sent, delivered, read, failed). Public by nature, so nothing is believed until the provider's signature checks
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

        return response('ok', 200);
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

        return response('ok', 200);
    }
}

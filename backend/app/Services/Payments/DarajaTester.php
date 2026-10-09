<?php

namespace App\Services\Payments;

use Illuminate\Support\Facades\Http;

/**
 * Proves M-Pesa keys before they go live: asks Safaricom for an access token with the consumer key and secret being tried (nothing is charged, nothing is sent to a phone).
 * That proves the key, the secret and the environment match. The shortcode and passkey can only be proven by a real payment: see the KES 1 test prompt on the screen.
 */
class DarajaTester
{
    /** @return array{ok: bool, message: string} */
    public function connection(array $c): array
    {
        $env = ($c['env'] ?? 'sandbox') === 'production' ? 'production' : 'sandbox';
        $base = $env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
        if (($c['consumer_key'] ?? '') === '' || ($c['consumer_secret'] ?? '') === '') {
            return ['ok' => false, 'message' => 'Enter the consumer key and the consumer secret first.'];
        }
        $tls = [];
        if ($bundle = config('daraja.ca_bundle')) {
            $tls = ['verify' => $bundle];
        } elseif (config('daraja.verify_ssl') === false || config('daraja.verify_ssl') === 'false') {
            $tls = ['verify' => ! app()->environment('local')];
        }
        try {
            $r = Http::withBasicAuth($c['consumer_key'], $c['consumer_secret'])->withOptions($tls)->timeout(20)->get("{$base}/oauth/v1/generate", ['grant_type' => 'client_credentials']);
        } catch (\Throwable $e) {
            return ['ok' => false, 'message' => 'Could not reach Safaricom (' . ($env === 'production' ? 'live' : 'sandbox') . '): ' . $this->plain($e)];
        }
        if ($r->successful() && $r->json('access_token')) {
            return ['ok' => true, 'message' => 'Safaricom accepted the key and secret for the ' . ($env === 'production' ? 'live' : 'sandbox') . ' environment.'];
        }
        $other = $env === 'production' ? 'sandbox' : 'live';

        return ['ok' => false, 'message' => 'Safaricom did not accept the key and secret for the ' . ($env === 'production' ? 'live' : 'sandbox') . " environment (answer {$r->status()}). Check them, and that they are the {$env} ones, not the {$other} ones."];
    }

    private function plain(\Throwable $e): string
    {
        return preg_replace('/\s+/', ' ', mb_substr($e->getMessage(), 0, 200));
    }
}

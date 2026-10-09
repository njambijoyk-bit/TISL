<?php

namespace App\Services\Exchange;

use App\Models\ExchangeConnection;
use Illuminate\Support\Facades\Http;

/**
 * Fetch an export from another company's site for the browser to open. This server only relays the sealed file: it never has the file password
 * and never keeps a byte of it. The address must be a public https site (a connection can not be used to make this server call its own network).
 */
class ConnectionFetcher
{
    /** Throws WnkjapException when the address may not be called. */
    public function assertSafe(string $url): array
    {
        $p = parse_url($url);
        $scheme = strtolower($p['scheme'] ?? '');
        $host = $p['host'] ?? '';
        if ($host === '' || ! in_array($scheme, ['https', 'http'], true) || ($scheme === 'http' && ! config('exchange.allow_http'))) {
            throw new WnkjapException('The address must be a secure https address.');
        }
        if (isset($p['user']) || isset($p['pass'])) {
            throw new WnkjapException('The address can not contain a user name or password.');
        }
        if (! config('exchange.allow_private_hosts')) {
            $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
            if (! $ips) {
                throw new WnkjapException('That address could not be found.');
            }
            foreach ($ips as $ip) {
                if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                    throw new WnkjapException('That address is not a public site.');
                }
            }
        }

        return $p;
    }

    /** @return string the sealed .wnkjap bytes */
    public function fetch(ExchangeConnection $c, int $level, ?string $from, ?string $to, ?int $locationId): string
    {
        $this->assertSafe($c->base_url);
        $url = rtrim($c->base_url, '/') . '/api/exchange/export';
        try {
            $res = Http::withToken($c->key())->timeout((int) config('exchange.fetch_timeout'))->withOptions(['allow_redirects' => false])->accept('application/octet-stream')
                ->get($url, array_filter(['level' => $level, 'from' => $from, 'to' => $to, 'location_id' => $locationId], fn ($v) => $v !== null && $v !== ''));
        } catch (\Throwable) {
            throw new WnkjapException('Could not reach ' . $c->name . '. Check the address and try again.');
        }
        if ($res->status() === 401) {
            throw new WnkjapException($c->name . ' did not accept the key. Ask them for a new one.');
        }
        if (! $res->successful()) {
            $why = $res->json('message');
            throw new WnkjapException($c->name . ' answered with an error' . ($why ? ': ' . $why : '.'));
        }
        $body = $res->body();
        if (strlen($body) > (int) config('exchange.max_file_bytes') || ! str_starts_with($body, Wnkjap::MAGIC)) {
            throw new WnkjapException($c->name . ' did not send a .wnkjap file.');
        }

        return $body;
    }
}

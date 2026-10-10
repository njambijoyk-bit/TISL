<?php

namespace App\Services\Payments\Gateways;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/** Shared plumbing for the providers: TLS the way the rest of the app does it, timeouts, plain error messages, amounts in minor units. */
abstract class AbstractGateway implements Gateway
{
    /** Currencies the providers treat as whole numbers. */
    private const ZERO_DECIMAL = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];

    public function zeroDecimal(string $currency): bool
    {
        return in_array(strtoupper($currency), self::ZERO_DECIMAL, true);
    }

    public function ack(\Illuminate\Http\Request $request): array
    {
        return ['received' => true];
    }

    protected function http(int $timeout = 25): PendingRequest
    {
        $tls = [];
        if ($bundle = config('daraja.ca_bundle')) {   // the same server-wide TLS setting M-Pesa uses
            $tls = ['verify' => $bundle];
        }

        return Http::withOptions($tls)->timeout($timeout)->acceptJson();
    }

    /** An amount in the provider's minor unit (cents, kobo...): 12.50 KES → 1250. */
    protected function minor(float $amount, string $currency): int
    {
        return (int) round($this->zeroDecimal($currency) ? $amount : $amount * 100);
    }

    /** What the provider sends back as a minor-unit amount, as a major-unit one. */
    protected function major(float|int|null $minor, string $currency): ?float
    {
        return $minor === null ? null : round($this->zeroDecimal($currency) ? (float) $minor : (float) $minor / 100, 2);
    }

    protected function plain(\Throwable $e): string
    {
        return preg_replace('/\s+/', ' ', mb_substr($e->getMessage(), 0, 200));
    }

    protected function failed(string $reason): array
    {
        return ['state' => 'failed', 'amount' => null, 'currency' => null, 'receipt' => null, 'reason' => $reason];
    }

    protected function pending(): array
    {
        return ['state' => 'pending', 'amount' => null, 'currency' => null, 'receipt' => null, 'reason' => null];
    }

    protected function paid(?float $amount, ?string $currency, ?string $receipt): array
    {
        return ['state' => 'paid', 'amount' => $amount, 'currency' => $currency ? strtoupper($currency) : null, 'receipt' => $receipt, 'reason' => null];
    }

    /** A field definition, short. */
    protected function field(string $key, string $label, string $type = 'text', ?string $hint = null, array $extra = []): array
    {
        return array_filter(['key' => $key, 'label' => $label, 'type' => $type, 'hint' => $hint] + $extra, fn ($v) => $v !== null);
    }
}

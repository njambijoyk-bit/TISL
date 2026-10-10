<?php

namespace App\Services\Payments\Gateways;

use App\Models\Books\PaymentAttempt;
use Illuminate\Http\Request;

/**
 * One card (or wallet) provider. The customer is sent to the provider's own secure page and pays there, so card details never reach this server; we only start the payment,
 * hear about it (webhook and/or the customer returning) and then ASK THE PROVIDER whether it was really paid before anything is booked (a webhook is never believed on its own).
 * Settings are saved on Settings → Payment keys (App\Services\Payments\PaymentSettings), one part per provider key.
 */
interface Gateway
{
    /** The part name and `payment_methods.gateway` value: stripe, paystack, flutterwave, pesapal, dpo. */
    public function key(): string;

    /** The name shown to staff and customers: "Stripe". */
    public function label(): string;

    /**
     * What the settings screen draws: each field is {key, label, type: text|secret|select|toggle, hint?, options?: [[value, label]], default?}. The common fields (enabled, label, ledger,
     * charge currency) are added by the registry and are not listed here.
     *
     * @return array<int, array<string, mixed>>
     */
    public function fields(): array;

    /** Dot paths of the fields that are keys: encrypted, write-only. @return string[] */
    public function secrets(): array;

    /** Validation rules for the provider's own fields (the common ones are added by the registry). @return array<string, mixed> */
    public function rules(): array;

    /** Enough saved to take a payment? */
    public function configured(array $cfg): bool;

    /** Where to find the keys, and what to set up in the provider's dashboard (shown on the screen). @return array{docs: string, steps: string[]} */
    public function help(): array;

    /** Prove the credentials without taking money. @return array{ok: bool, message: string} */
    public function test(array $cfg): array;

    /**
     * Start a payment. Returns the page to send the customer to and the provider's own reference (for checking later).
     *
     * @param  array{reference: string, amount: float, currency: string, email: ?string, phone: ?string, name: ?string, description: string, return_url: string, cancel_url: string, webhook_url: string, attempt_id: int}  $p
     * @return array{redirect_url: string, provider_ref: ?string}
     */
    public function start(array $cfg, array $p): array;

    /**
     * Ask the provider what happened to a payment. `state` is paid | pending | failed; `amount` (major units) and `currency` are what the provider says it took.
     *
     * @return array{state: string, amount: ?float, currency: ?string, receipt: ?string, reason: ?string}
     */
    public function verify(array $cfg, PaymentAttempt $attempt): array;

    /**
     * A call from the provider to our webhook: check it really came from them and say which payment it is about, or null when it is not believable or not about a payment.
     * Never trust what it says about the outcome: the caller verifies with the provider.
     *
     * @return ?array{reference: ?string, provider_ref: ?string}
     */
    public function parseWebhook(Request $request, array $cfg): ?array;

    /** What to answer the provider's call with (some want a particular reply). @return array<string, mixed> */
    public function ack(Request $request): array;

    /** True for currencies that have no minor unit (amounts are whole). */
    public function zeroDecimal(string $currency): bool;
}

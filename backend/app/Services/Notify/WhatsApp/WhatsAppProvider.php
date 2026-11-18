<?php

namespace App\Services\Notify\WhatsApp;

/** One WhatsApp sending service (Meta Cloud API, Twilio ...). Adding another is adding one class that implements this and one line in WhatsAppProviders. */
interface WhatsAppProvider
{
    public function key(): string;

    /** Are the keys this provider needs filled in? */
    public function configured(): bool;

    /** Do the saved keys work? Asks the provider; never sends a message. @return array{ok: bool, message: string} */
    public function check(): array;

    /**
     * Send an approved template to a number (digits with country code, no plus).
     *
     * @param  string[]  $vars  the values for {{1}}, {{2}} ... in order
     * @return array{ok: bool, id: ?string, error: ?string}
     */
    public function send(string $toDigits, string $template, string $language, array $vars): array;

    /** Is this callback really from the provider? */
    public function verifies(string $url, string $rawBody, array $headers, array $form): bool;

    /** The delivery statuses a callback carries. @return array<int, array{id: string, status: string, error: ?string}> status is sent | delivered | read | failed */
    public function statuses(array $payload): array;

    /** Messages people sent us (build 6.5). @return array<int, array{id: string, from: string, name: ?string, body: string, at: ?string}> from is the number's digits */
    public function incoming(array $payload): array;
}

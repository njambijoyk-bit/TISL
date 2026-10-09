<?php

namespace App\Services\Chat\Local;

/** One knowledge entry, read from an <article class="kb"> (see resources/mimi/knowledge.html). */
final class Entry
{
    /**
     * @param  string[]  $audience  account kinds: guest customer vendor applicant driver staff, or 'any'
     * @param  string[]  $requires  permission keys, all required
     * @param  array<int,array{text:string,lang:string}>  $variants
     */
    public function __construct(
        public readonly string $id,
        public readonly string $title,
        public readonly array $audience,
        public readonly array $requires,
        public readonly string $sensitivity,
        public readonly string $resolver,
        public readonly string $keywords,
        public readonly array $follow,
        public readonly string $status,
        public readonly string $reviewed,
        public readonly array $variants,
        public readonly string $answer,
        public readonly string $more,
        public readonly string $denied,
        public readonly string $empty,
    ) {}

    public function forKind(string $kind): bool
    {
        return in_array('any', $this->audience, true) || in_array($kind, $this->audience, true);
    }

    /** May a guest reach this topic by signing in? (a customer-only entry with no permission needed) */
    public function reachableByGuestSigningIn(): bool
    {
        return in_array('customer', $this->audience, true) && ! $this->requires;
    }
}

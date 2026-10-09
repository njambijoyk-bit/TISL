<?php

namespace App\Services\Chat\Local;

final class ResolverResult
{
    private function __construct(public readonly string $status, public readonly array $lines = [], public readonly string $need = '') {}

    public static function ok(array $lines): self
    {
        return new self('ok', array_values($lines));
    }

    /** Nothing found, or found outside the caller's scope: the same words either way. */
    public static function empty(): self
    {
        return new self('empty');
    }

    public static function denied(): self
    {
        return new self('denied');
    }

    public static function ask(string $need): self
    {
        return new self('ask', [], $need);
    }

    public function rows(): int
    {
        return count($this->lines);
    }
}

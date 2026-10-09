<?php

namespace App\Services\Chat\Local;

/**
 * Fetches live facts for one caller and returns a few finished lines. The entry that uses a resolver has already been checked; the resolver checks
 * again (requires/kinds) because the strictest of the two always wins. It returns allowlisted fields only, never a model.
 */
interface Resolver
{
    /** @return string[] permission keys, all required */
    public function requires(): array;

    /** @return string[] account kinds allowed, or ['any'] */
    public function kinds(): array;

    /** @return string[] slots it cannot run without; "a|b" means either */
    public function needs(): array;

    /** Does the answer hold the caller's own or restricted data? (such replies are stored with the values blanked) */
    public function sensitive(): bool;

    public function run(CallerContext $c, array $slots): ResolverResult;
}

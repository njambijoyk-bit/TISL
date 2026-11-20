<?php

namespace App\Services\Ai;

/**
 * Monthly limits per purpose (docs/AI_PURPOSES_SPEC.md, build A.3): optional and off unless set. Measured from ai_calls, in tokens or estimated cost.
 * At 80% the AI admins are told once a month; at 100% the purpose stops using the AI until next month or until the limit is raised.
 */
class AiLimits
{
    /** Why this purpose may not use the AI now, or null. */
    public function stopped(string $purpose): ?string
    {
        return null;   // build A.3
    }

    /** After a call: tell the AI admins once a month when a purpose passes 80% of its limit. */
    public function check(string $purpose): void
    {
        // build A.3
    }
}

<?php

namespace App\Services\Security;

use Laravel\Sanctum\PersonalAccessToken;

/** The last question asked of a login token on every request: is the account still allowed in? A suspended person's open sessions stop working at once, not only their next sign-in. */
final class SessionGate
{
    public static function allows(PersonalAccessToken $token, bool $valid): bool
    {
        if (! $valid) {
            return false;
        }
        $who = $token->tokenable;

        return ! ($who && isset($who->status) && $who->status === 'suspended');
    }
}

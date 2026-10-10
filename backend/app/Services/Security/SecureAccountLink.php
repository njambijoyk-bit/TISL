<?php

namespace App\Services\Security;

use App\Models\Applicant;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * The "This was not me" button in the new-sign-in email. A link that anyone holding it may use once to sign everyone out of that one account and be sent a password-reset email
 * (so it can do no harm to the account, only to a thief). It is signed with the app key, runs out after a few days, and stops working the moment the password changes.
 * It is made here, not with Laravel's signed URLs, so it does not depend on the address the API is reached at.
 */
final class SecureAccountLink
{
    public const DAYS = 3;

    /** The query string for the frontend page (/secure-account?...). */
    public static function query(Model $who, ?int $expiresAt = null): string
    {
        $type = $who instanceof Applicant ? 'a' : 'u';
        $expires = $expiresAt ?? now()->addDays(self::DAYS)->getTimestamp();

        return http_build_query(['t' => $type, 'i' => $who->getKey(), 'e' => $expires, 'k' => self::signature($type, (int) $who->getKey(), $expires, self::stamp($who))]);
    }

    /** The account the link is for, or null when it is wrong, old or out of date. @param array<string, mixed> $p */
    public static function verify(array $p): ?Model
    {
        foreach (['t', 'i', 'e', 'k'] as $key) {
            if (! is_string($p[$key] ?? null) && ! is_int($p[$key] ?? null)) {   // a part missing, or sent as a list
                return null;
            }
        }
        [$type, $id, $expires, $given] = [(string) $p['t'], (string) $p['i'], (string) $p['e'], (string) $p['k']];
        if (! in_array($type, ['u', 'a'], true) || ! ctype_digit($id) || ! ctype_digit($expires) || (int) $expires < now()->getTimestamp()) {
            return null;
        }
        $who = ($type === 'a' ? Applicant::class : User::class)::find((int) $id);
        if (! $who) {
            return null;
        }

        return hash_equals(self::signature($type, (int) $id, (int) $expires, self::stamp($who)), $given) ? $who : null;
    }

    /** What changes when the password does, so an old link dies with the old password. */
    private static function stamp(Model $who): string
    {
        return substr(hash('sha256', (string) $who->getAttribute('password')), 0, 16);
    }

    private static function signature(string $type, int $id, int $expires, string $stamp): string
    {
        return hash_hmac('sha256', "not-me|{$type}|{$id}|{$expires}|{$stamp}", (string) config('app.key'));
    }
}

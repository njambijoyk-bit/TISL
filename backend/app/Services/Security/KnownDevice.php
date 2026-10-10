<?php

namespace App\Services\Security;

use App\Models\User;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * "This browser has signed in as that person before": a signed note in a cookie the page can not read, listing the accounts this browser has signed in as (newest first, at most ten).
 * It carries no secret and signs no one in. All it does is let the sign-in page show the person their own seal phrase, and only to a browser that has been theirs: someone else's browser, a copy of
 * the page on another website, or a server asking on a victim's behalf never holds it.
 */
final class KnownDevice
{
    public const MAX = 10;

    public static function cookieName(Request $request): string
    {
        return (SessionCookie::secure($request) ? '__Host-' : '').'tisl_known';
    }

    private static function sign(string $payload): string
    {
        return hash_hmac('sha256', 'known-device|'.$payload, (string) config('app.key'));
    }

    /** @return int[] the accounts this browser has signed in as, per its cookie (empty when there is none or it was tampered with) */
    public static function read(Request $request): array
    {
        $raw = $request->cookies->get(self::cookieName($request));
        if (! is_string($raw) || substr_count($raw, '.') !== 1) {
            return [];
        }
        [$payload, $given] = explode('.', $raw);
        if (! hash_equals(self::sign($payload), $given)) {
            return [];
        }
        $ids = array_filter(explode(',', $payload), fn ($v) => ctype_digit($v) && $v !== '');

        return array_map('intval', array_slice(array_values($ids), 0, self::MAX));
    }

    public static function knows(Request $request, User $user): bool
    {
        return in_array((int) $user->getKey(), self::read($request), true);
    }

    /** The cookie to send after a successful sign-in: the same list with this person moved to the front. */
    public static function remember(Request $request, User $user): Cookie
    {
        $ids = array_values(array_unique(array_merge([(int) $user->getKey()], self::read($request))));
        $payload = implode(',', array_slice($ids, 0, self::MAX));

        return Cookie::create(self::cookieName($request), $payload.'.'.self::sign($payload), now()->addDays(400)->getTimestamp(), '/', null, SessionCookie::secure($request), true, false, (string) config('security.cookie.same_site', 'lax'));
    }
}

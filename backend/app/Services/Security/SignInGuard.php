<?php

namespace App\Services\Security;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * What the sign-in doors do about wrong passwords.
 *
 *  - A growing wait per email AND address: the 5th wrong password in a row means 30 seconds, the next 60, then 5 minutes, and so on. It is counted for emails that do not exist exactly like for ones that do, so the answer never says whether an account is there.
 *  - A stranger can only make their own address wait. They can no longer lock the real person out, as the old five-strikes lock let them.
 *  - The time spent is the same whether or not the email exists (an unknown email still pays for one real password check).
 */
final class SignInGuard
{
    /** Seconds this email from this address must still wait; 0 means go ahead. */
    public static function wait(string $email, string $ip): int
    {
        return max(0, (int) Cache::get(self::key('until', $email, $ip), 0) - now()->getTimestamp());
    }

    /** A wrong password. Returns the wait it has now earned (0 while the free tries last). */
    public static function failed(string $email, string $ip, ?Request $request = null): int
    {
        $ttl = max(1, (int) config('security.login.forget_after_minutes', 60)) * 60;
        $count = (int) Cache::get(self::key('n', $email, $ip), 0) + 1;
        Cache::put(self::key('n', $email, $ip), $count, $ttl);

        // across every address: a lot of wrong passwords for one email is someone trying that account
        $all = self::key('all', $email, '');
        Cache::add($all, 0, 3600);
        $total = (int) Cache::increment($all);
        $alert = (int) config('security.login.per_email_alert', 30);
        if ($alert > 0 && $total === $alert) {
            SecurityLog::record('sign_in_under_attack', null, $request, ['wrong_passwords_in_an_hour' => $total], SecurityLog::ALERT, $email);
        }

        $over = $count - (int) config('security.login.free_tries', 4);
        if ($over < 1) {
            return 0;
        }
        $steps = array_values((array) config('security.login.wait_seconds', [30]));
        $wait = (int) ($steps[min($over - 1, count($steps) - 1)] ?? 30);
        Cache::put(self::key('until', $email, $ip), now()->getTimestamp() + $wait, $wait);

        return $wait;
    }

    /** The right password: the count starts again. (A right password only ever gets this far once any wait is over, so there is no wait left to clear.) */
    public static function succeeded(string $email, string $ip): void
    {
        Cache::forget(self::key('n', $email, $ip));
    }

    /** True when the password fits the stored hash. With no stored hash (no such account) a throw-away hash is checked, so the time spent does not tell. */
    public static function check(string $password, ?string $hash): bool
    {
        try {
            if ($hash === null || $hash === '') {
                Hash::check($password, self::decoy());

                return false;
            }

            return Hash::check($password, $hash);
        } catch (\RuntimeException) {
            return false;   // a stored value that is not a real password hash never matches
        }
    }

    /** The answer while someone must wait: the same for any email, it says nothing about the account. */
    public static function refuse(int $wait, ?Request $request = null, ?string $email = null): JsonResponse
    {
        if ($request && Cache::add('security:waitlog:'.sha1(($email ?? '').'|'.$request->ip()), 1, $wait)) {
            SecurityLog::record('sign_in_blocked', null, $request, ['wait_seconds' => $wait], SecurityLog::WARNING, $email);
        }

        return response()->json([
            'message' => 'Too many wrong passwords. Please wait '.RateLimits::waitWords($wait).' and try again.',
            'retry_after' => $wait,
        ], 429, ['Retry-After' => $wait]);
    }

    /** A real hash made the way real ones are (same cost), made once and kept. */
    private static function decoy(): string
    {
        return Cache::rememberForever('security:decoy-hash', fn () => Hash::make(Str::random(40)));
    }

    private static function key(string $kind, string $email, string $ip): string
    {
        return 'security:signin:'.$kind.':'.sha1(mb_strtolower(trim($email)).'|'.$ip);
    }
}

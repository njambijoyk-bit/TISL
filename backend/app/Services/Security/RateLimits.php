<?php

namespace App\Services\Security;

use Closure;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;

/**
 * The named limiters the sign-in doors use (`throttle:sign-in` and so on). The numbers live in config/security.php.
 *
 * Counting is by email AND address, and by address alone, never by email alone: a stranger who types the real person's email a hundred times only fills up their own bucket.
 */
class RateLimits
{
    public const NAMES = [
        'sign-in' => 'sign_in',
        'sign-up' => 'sign_up',
        'password-forgot' => 'forgot',
        'password-reset' => 'reset',
        'password-force' => 'force',
        'guess' => 'guess',
    ];

    public static function register(): void
    {
        foreach (self::NAMES as $name => $config) {
            RateLimiter::for($name, fn (Request $request) => self::limits($name, $config, $request));
        }
    }

    /** @return array<int, Limit> */
    public static function limits(string $name, string $config, Request $request): array
    {
        $rules = (array) config("security.rate_limits.{$config}", []);
        $ip = (string) $request->ip();
        $email = self::email($request);
        $limits = [];

        foreach ((array) ($rules['email_ip'] ?? []) as [$attempts, $minutes]) {
            $limits[] = self::limit($name, 'email_ip', $attempts, $minutes, $email.'|'.$ip, $request, $email);
        }
        foreach ((array) ($rules['ip'] ?? []) as [$attempts, $minutes]) {
            $limits[] = self::limit($name, 'ip', $attempts, $minutes, $ip, $request, $email);
        }
        foreach ((array) ($rules['user'] ?? []) as [$attempts, $minutes]) {
            $who = $request->user()?->getAuthIdentifier() ?? $ip;
            $limits[] = self::limit($name, 'user', $attempts, $minutes, (string) $who, $request, null);
        }

        return $limits;
    }

    /** The email as typed, tidied up; anything that is not a string counts as nothing. */
    public static function email(Request $request): string
    {
        $email = $request->input('email');

        return is_string($email) ? mb_strtolower(trim($email)) : '';
    }

    private static function limit(string $name, string $kind, int $attempts, int $minutes, string $who, Request $request, ?string $email): Limit
    {
        // the window is part of the key: a 1-minute and a 60-minute count for the same person must not share one counter
        $key = "{$kind}:{$minutes}:".sha1($who);

        return Limit::perMinutes($minutes, $attempts)->by($key)->response(
            fn (Request $req, array $headers) => self::refuse($name, $kind.':'.$minutes, $who, $req, $headers, $email)
        );
    }

    private static function refuse(string $name, string $bucket, string $who, Request $request, array $headers, ?string $email)
    {
        $wait = max(1, (int) ($headers['Retry-After'] ?? 60));

        // one line in the security log per bucket per wait, not one per refused request
        if (Cache::add('security:ratelog:'.$name.':'.$bucket.':'.sha1($who), 1, $wait)) {
            SecurityLog::record('rate_limited', $request->user() instanceof \Illuminate\Database\Eloquent\Model ? $request->user() : null, $request, ['door' => $name, 'bucket' => $bucket, 'wait_seconds' => $wait], SecurityLog::WARNING, $email ?: null);
        }

        return response()->json([
            'message' => 'Too many attempts. Please wait '.self::waitWords($wait).' and try again.',
            'retry_after' => $wait,
        ], 429, $headers);
    }

    public static function waitWords(int $seconds): string
    {
        if ($seconds < 90) {
            return $seconds.' second'.($seconds === 1 ? '' : 's');
        }
        $minutes = (int) ceil($seconds / 60);

        return $minutes < 90 ? "about {$minutes} minutes" : 'about '.(int) ceil($minutes / 60).' hours';
    }
}

<?php

namespace App\Services\Security;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/** How long a session may live. Staff are held to a shorter leash than customers (config/security.php). */
final class SessionPolicy
{
    /** staff | customer | other (vendors, drivers, applicants) */
    public static function kind(Model $tokenable): string
    {
        if ($tokenable instanceof User) {
            return $tokenable->isStaff() ? 'staff' : ($tokenable->isCustomer() ? 'customer' : 'other');
        }

        return 'other';
    }

    public static function idleMinutes(Model $tokenable): int
    {
        return max(5, (int) config('security.session.idle_minutes.' . self::kind($tokenable), 10080));
    }

    public static function maxDays(Model $tokenable): int
    {
        return max(1, (int) config('security.session.max_days.' . self::kind($tokenable), 30));
    }

    /** The moment a session started at `$created` and used at `$now` ends: idle time from now, but never past its absolute age limit. */
    public static function expiry(Model $tokenable, Carbon $created, ?Carbon $now = null): Carbon
    {
        $now ??= now();
        $idle = $now->copy()->addMinutes(self::idleMinutes($tokenable));
        $limit = $created->copy()->addDays(self::maxDays($tokenable));

        return $idle->lt($limit) ? $idle : $limit;
    }
}

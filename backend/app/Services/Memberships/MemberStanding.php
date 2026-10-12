<?php

namespace App\Services\Memberships;

use App\Models\Memberships\Membership;
use App\Models\Memberships\Plan;
use App\Services\Licensing\LicenseManager;
use Illuminate\Support\Facades\Schema;

/**
 * What other modules ask about a person's membership: is Memberships on at all, does this person hold one in good standing, and what does it give them. Courses and Menus use this to decide
 * (tuition free, a meal plan for members, a discount). Everything answers "no" quietly while Memberships is off or not set up, so the other modules work on their own.
 */
final class MemberStanding
{
    public static function on(): bool
    {
        try {
            return app(LicenseManager::class)->isActive('memberships') && Schema::hasTable('memberships') && Schema::hasTable('membership_plans');
        } catch (\Throwable) {
            return false;
        }
    }

    /** The membership that gives this person its benefits right now (running, on trial, or late but inside the grace days). */
    public static function membership(?int $userId): ?Membership
    {
        if (! $userId || ! self::on()) {
            return null;
        }

        return Membership::where('member_user_id', $userId)->whereIn('status', Membership::GOOD)->orderByDesc('id')->first();
    }

    /** The settings of one benefit type on this person's plan, or null when they have no membership or the plan does not give it. @return array<string, mixed>|null */
    public static function benefit(?int $userId, string $type): ?array
    {
        $m = self::membership($userId);
        if (! $m) {
            return null;
        }
        $b = Plan::with('benefits')->find($m->plan_id)?->benefits->firstWhere('type', $type);

        return $b ? ($b->config ?? []) : null;
    }
}

<?php

namespace App\Services\Menus;

use App\Models\Memberships\Plan as MembershipPlan;
use App\Models\Menus\Plan;
use App\Services\Memberships\MemberStanding;
use Illuminate\Support\Facades\Schema;

/**
 * Meal plans and memberships. A meal plan can ask for a membership in good standing (any plan, or named ones) and a membership can give a percentage off meal plans. Both only count while the
 * Memberships module is on: with it off, a plan that asks for a membership is open to everyone, so nothing is locked by a module that is not there.
 */
final class MembershipRules
{
    public static function columns(): bool
    {
        return Schema::hasColumn('menus_plans', 'requires_membership');
    }

    public static function asks(Plan $p): bool
    {
        return self::columns() && (bool) $p->requires_membership && MemberStanding::on();
    }

    /** May this person have this plan? True when it asks for no membership. */
    public static function qualifies(Plan $p, ?int $userId): bool
    {
        if (! self::asks($p)) {
            return true;
        }
        $m = MemberStanding::membership($userId);
        if (! $m) {
            return false;
        }
        $ids = array_map('intval', (array) ($p->membership_plan_ids ?? []));

        return ! $ids || in_array((int) $m->plan_id, $ids, true);
    }

    /** What to tell someone who does not qualify. */
    public static function message(Plan $p): string
    {
        $ids = array_map('intval', (array) ($p->membership_plan_ids ?? []));
        $names = $ids ? MembershipPlan::whereIn('id', $ids)->orderBy('name')->pluck('name')->all() : [];

        return 'This meal plan is for members'.($names ? ' on '.implode(' or ', $names) : '').'. Join at /membership, then come back.';
    }

    /** The percentage off a meal plan's day price for this person (0 when they have no membership that gives it). */
    public static function discountPct(?int $userId): float
    {
        $c = MemberStanding::benefit($userId, 'meals');

        return $c ? max(0.0, min(100.0, (float) ($c['discount_pct'] ?? 0))) : 0.0;
    }
}

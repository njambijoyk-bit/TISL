<?php

namespace App\Services\Campaigns;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Who a campaign, an early-access window or a section is for. A rule is a small array and an empty rule means everyone:
 *   signed_in: true            only people who are signed in
 *   tiers: ['gold','vip']      only customers on one of these tiers
 *   has_purchased: true        only customers who have bought before
 * Staff always pass (so they can check a page). Unknown keys are ignored.
 */
class CampaignAudience
{
    /** Keep only the keys a rule understands; an empty rule (everyone) is stored as null. */
    public static function clean($rule): ?array
    {
        if (! is_array($rule)) {
            return null;
        }
        $out = [];
        if (! empty($rule['signed_in'])) {
            $out['signed_in'] = true;
        }
        if (! empty($rule['tiers']) && is_array($rule['tiers'])) {
            $out['tiers'] = array_values(array_unique(array_map('strval', array_filter($rule['tiers'], 'is_scalar'))));
        }
        if (! empty($rule['has_purchased'])) {
            $out['has_purchased'] = true;
        }

        return $out ?: null;
    }

    public static function allows(?User $user, ?array $rule): bool
    {
        if (! $rule) {
            return true;
        }
        if ($user && ! in_array($user->role, ['customer', 'applicant'], true)) {
            return true;
        }
        if (! empty($rule['signed_in']) && ! $user) {
            return false;
        }
        $customer = $user?->customer;
        if (! empty($rule['tiers']) && (! $customer || ! in_array($customer->tier, (array) $rule['tiers'], true))) {
            return false;
        }
        if (! empty($rule['has_purchased'])) {
            if (! $customer || ! DB::table('vouchers')->where('customer_id', $customer->id)->where('status', 'posted')->exists()) {
                return false;
            }
        }

        return true;
    }
}

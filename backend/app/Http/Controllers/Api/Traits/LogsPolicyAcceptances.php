<?php

namespace App\Http\Controllers\Api\Traits;

use App\Models\Policy;
use App\Models\PolicyAcceptance;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\Request;

trait LogsPolicyAcceptances
{
    protected function logPolicyAcceptance(
        string   $policyKey,
        string   $actionContext,
        string   $response, // 'accepted' | 'disagreed'
        ?Customer $customer = null,
        ?User    $user = null,
        ?string  $disagreeReason = null,
        ?string  $referenceType = null,
        ?int     $referenceId = null,
        bool     $wasSuccessful = false,
        ?Request $request = null
    ): PolicyAcceptance {
        $policy = Policy::where('key', $policyKey)
            ->where('is_active', true)
            ->first();

        return PolicyAcceptance::create([
            'policy_id'       => $policy?->id,
            'policy_key'      => $policyKey,
            'policy_version'  => $policy?->version ?? 'unknown',
            'policy_snapshot' => $policy?->content ?? '',
            'customer_id'     => $customer?->id,
            'user_id'         => $user?->id,
            'customer_number' => $customer?->customer_number,
            'action_context'  => $actionContext,
            'reference_type'  => $referenceType,
            'reference_id'    => $referenceId,
            'response'        => $response,
            'disagree_reason' => $disagreeReason,
            'ip_address'      => $request?->ip(),
            'user_agent'      => $request?->userAgent(),
            'was_successful'  => $wasSuccessful,
            'flagged'         => false,
            'accepted_at'     => now(),
        ]);
    }

    protected function needsReacceptance(Customer $customer, string $policyKey): bool
    {
        $policy = Policy::where('key', $policyKey)
            ->where('is_active', true)
            ->first();
        if (!$policy) return false;

        $lastAccepted = PolicyAcceptance::where('customer_id', $customer->id)
            ->where('policy_key', $policyKey)
            ->where('response', 'accepted')
            ->latest('accepted_at')
            ->first();

        if (!$lastAccepted) return true;

        [$lastMajor] = explode('.', $lastAccepted->policy_version);
        return (int) $lastMajor < $policy->major_version;
    }

    protected function flagCustomerForPolicy(Customer $customer, string $policyKey, string $version): void
    {
        $customer->update([
            'policy_flagged'            => true,
            'policy_flagged_at'         => now(),
            'policy_flagged_policy_key' => $policyKey,
            'policy_flagged_version'    => $version,
        ]);
    }

    protected function clearPolicyFlag(Customer $customer): void
    {
        $customer->update([
            'policy_flagged'            => false,
            'policy_flagged_at'         => null,
            'policy_flagged_policy_key' => null,
            'policy_flagged_version'    => null,
        ]);
    }
}
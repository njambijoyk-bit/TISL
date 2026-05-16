<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Hamper;
use App\Models\HamperCustomerEligibility;

class HamperEligibilityService
{
    /**
     * Priority order:
     * 1. Blacklisted  → blocked, requires admin to reactivate
     * 2. Suspended    → blocked
     * 3. manual type  → must have an active row in eligibility table
     * 4. tier type    → customer tier must be in eligible_tiers
     * 5. customer_type→ customer type must be in eligible_customer_types
     * 6. all          → everyone allowed
     */

    public function getStatus(Customer $customer, Hamper $hamper): string
    {
        $row = HamperCustomerEligibility::where('hamper_id', $hamper->id)
            ->where('customer_id', $customer->id)
            ->first();

        // Step 1 & 2 — eligibility table overrides everything
        if ($row) {
            if ($row->status === 'blacklisted') return 'blacklisted';
            if ($row->status === 'suspended')   return 'suspended';
        }

        // Step 3 — manual eligibility type
        if ($hamper->eligibility_type === 'manual') {
            return ($row && $row->status === 'active') ? 'eligible' : 'not_eligible';
        }

        // Step 4 — tier based
        if ($hamper->eligibility_type === 'tier') {
            $tiers = $hamper->eligible_tiers ?? [];
            return in_array($customer->tier, $tiers) ? 'eligible' : 'not_eligible';
        }

        // Step 5 — customer type based
        if ($hamper->eligibility_type === 'customer_type') {
            $types = $hamper->eligible_customer_types ?? [];
            return in_array($customer->customer_type, $types) ? 'eligible' : 'not_eligible';
        }

        // Step 6 — all
        return 'eligible';
    }

    public function isEligible(Customer $customer, Hamper $hamper): bool
    {
        return $this->getStatus($customer, $hamper) === 'eligible';
    }

    /**
     * Filter a collection of hampers down to only those
     * this customer is eligible for.
     */
    public function getEligibleHampers(Customer $customer, $hampers)
    {
        return $hampers->filter(fn($hamper) => $this->isEligible($customer, $hamper))->values();
    }

    /**
     * Used by admin search — returns the customer's current status
     * on a specific hamper, including a human-readable message.
     */
    public function getCustomerStatusForAdmin(Customer $customer, Hamper $hamper): array
    {
        $status = $this->getStatus($customer, $hamper);

        $message = match ($status) {
            'blacklisted'  => 'Customer is blacklisted — requires admin role to reactivate',
            'suspended'    => 'Customer is suspended from this hamper',
            'not_eligible' => 'Customer does not meet eligibility criteria',
            'eligible'     => 'Customer is eligible',
            default        => 'Unknown status',
        };

        return [
            'status'                    => $status,
            'message'                   => $message,
            'requires_admin_reactivate' => $status === 'blacklisted',
            'is_blocked'                => in_array($status, ['blacklisted', 'suspended']),
        ];
    }
}

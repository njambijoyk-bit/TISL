<?php

namespace App\Policies;

use App\Models\Customer;
use App\Models\User;

class LoyaltyPolicy
{
    /**
     * Super admin bypasses every check.
     */
    public function before(User $user): ?bool
    {
        return $user->isSuperAdmin() ? true : null;
    }

    /**
     * View the loyalty ledger list page (admin only).
     */
    public function viewAny(User $user): bool
    {
        return $user->isAdmin();
    }

    /**
     * View a specific customer's loyalty detail.
     * Admins can see any customer; customers can only see themselves.
     */
    public function view(User $user, Customer $customer): bool
    {
        if ($user->isAdmin()) return true;

        return $user->isCustomer() && $user->customer?->id === $customer->id;
    }

    /**
     * Grant points to a customer.
     * All admin roles can grant.
     */
    public function grantPoints(User $user): bool
    {
        return in_array($user->role, [
            'super_admin', 'admin', 'manager', 'finance', 'sales_rep',
        ]);
    }

    /**
     * Deduct points from a customer.
     * Finance, manager, admin only — not sales_rep.
     */
    public function deductPoints(User $user): bool
    {
        return in_array($user->role, [
            'super_admin', 'admin', 'manager', 'finance',
        ]);
    }

    /**
     * Grant store credit to a customer.
     */
    public function grantCredit(User $user): bool
    {
        return in_array($user->role, [
            'super_admin', 'admin', 'manager', 'finance',
        ]);
    }

    /**
     * Deduct store credit from a customer.
     */
    public function deductCredit(User $user): bool
    {
        return in_array($user->role, [
            'super_admin', 'admin', 'manager', 'finance',
        ]);
    }

    /**
     * Initiate a redemption on behalf of a customer (admin-side).
     * Self-serve redemption (customer route) is handled separately by the customer gate.
     */
    public function redeem(User $user, Customer $customer): bool
    {
        // Admin can redeem for any customer
        if (in_array($user->role, ['super_admin', 'admin', 'manager', 'finance', 'sales_rep'])) {
            return true;
        }

        // Customer can only redeem for themselves
        return $user->isCustomer() && $user->customer?->id === $customer->id;
    }

    /**
     * Manage redemption rules and global settings.
     * Admin / super_admin only.
     */
    public function configureSettings(User $user): bool
    {
        return in_array($user->role, ['super_admin', 'admin']);
    }

    /**
     * Export loyalty data (reports).
     */
    public function export(User $user): bool
    {
        return in_array($user->role, [
            'super_admin', 'admin', 'manager', 'finance',
        ]);
    }
}
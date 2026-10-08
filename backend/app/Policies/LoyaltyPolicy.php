<?php

namespace App\Policies;

use App\Models\Customer;
use App\Models\User;

/**
 * Loyalty: what staff may do comes from permissions (loyalty.grant, loyalty.deduct, credit.act, loyalty.configure, loyalty.export);
 * a customer may only see and redeem their own.
 */
class LoyaltyPolicy
{
    /** View the loyalty ledger list page: whoever may see customers (a customer's points are part of their record). */
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('customers.view');
    }

    /** View a specific customer's loyalty detail. Whoever may see customers can; customers only themselves. */
    public function view(User $user, Customer $customer): bool
    {
        return $user->hasPermission('customers.view') || $this->isThem($user, $customer);
    }

    public function grantPoints(User $user): bool
    {
        return $user->hasPermission('loyalty.grant');
    }

    public function deductPoints(User $user): bool
    {
        return $user->hasPermission('loyalty.deduct');
    }

    /** Grant store credit to a customer. */
    public function grantCredit(User $user): bool
    {
        return $user->hasPermission('credit.act');
    }

    /** Deduct store credit from a customer. */
    public function deductCredit(User $user): bool
    {
        return $user->hasPermission('credit.act');
    }

    /** Redeem points on a customer's behalf (staff), or for themselves (the customer). */
    public function redeem(User $user, Customer $customer): bool
    {
        return $user->hasPermission('loyalty.grant') || $this->isThem($user, $customer);
    }

    /** Manage redemption rules and global settings. */
    public function configureSettings(User $user): bool
    {
        return $user->hasPermission('loyalty.configure');
    }

    /** Export loyalty data (reports). */
    public function export(User $user): bool
    {
        return $user->hasPermission('loyalty.export');
    }

    private function isThem(User $user, Customer $customer): bool
    {
        return $user->isCustomer() && $user->customer?->id === $customer->id;
    }
}

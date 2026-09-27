<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Vendor;

class VendorPolicy
{
    /**
     * Admins and managers can list all vendors.
     * Vendors cannot list other vendors.
     */
    public function viewAny(User $user): bool
    {
        return $user->isAdmin();
    }

    /**
     * Admins can view any vendor record.
     * A vendor user can only view their own vendor record.
     */
    public function view(User $user, Vendor $vendor): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        return $user->isVendor() && $user->vendor?->id === $vendor->id;
    }

    /**
     * Only admins and managers can create vendor records.
     * (Vendors self-register via the public registration endpoint.)
     */
    public function create(User $user): bool
    {
        return in_array($user->role, ['super_admin', 'admin', 'manager']);
    }

    /**
     * Admins can update any vendor.
     * A vendor can update their own profile (contact info, bank details).
     */
    public function update(User $user, Vendor $vendor): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        return $user->isVendor() && $user->vendor?->id === $vendor->id;
    }

    /**
     * Only admins can delete vendor records.
     */
    public function delete(User $user, Vendor $vendor): bool
    {
        return $user->isAdmin();
    }

    public function restore(User $user, Vendor $vendor): bool
    {
        return $user->isAdmin();
    }

    public function forceDelete(User $user, Vendor $vendor): bool
    {
        return $user->isSuperAdmin();
    }

    /**
     * Only admins/managers can approve and verify vendors.
     */
    public function approve(User $user, Vendor $vendor): bool
    {
        return in_array($user->role, ['super_admin', 'admin', 'manager']);
    }

    /**
     * Manage vendor products (link/unlink products to this vendor).
     * Admins always; vendors can suggest but not confirm.
     */
    public function manageProducts(User $user, Vendor $vendor): bool
    {
        return $user->isAdmin();
    }
}
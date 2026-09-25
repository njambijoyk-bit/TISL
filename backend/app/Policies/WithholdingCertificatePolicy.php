<?php

namespace App\Policies;

use App\Models\User;
use App\Models\WithholdingCertificate;

/**
 * ASSUMPTION (please confirm): role is read as a single string column on
 * User, matching the 'role:admin,super_admin,manager,finance,...' route
 * middleware seen in api.php. If roles actually come from a package
 * (Spatie) or a pivot/array column, swap hasFinanceRole() below for the
 * equivalent check — nothing else in this class depends on the mechanism.
 */
class WithholdingCertificatePolicy
{
    private const FINANCE_ROLES = ['admin', 'super_admin', 'finance'];

    public function viewAny(User $user): bool
    {
        return $this->hasFinanceRole($user) || $user->role === 'manager';
    }

    public function view(User $user, WithholdingCertificate $certificate): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $this->hasFinanceRole($user);
    }

    /** Only a pending certificate can be marked issued. */
    public function markIssued(User $user, WithholdingCertificate $certificate): bool
    {
        return $this->hasFinanceRole($user) && $certificate->isPending();
    }

    /** Only an already-issued certificate can be marked received. */
    public function markReceived(User $user, WithholdingCertificate $certificate): bool
    {
        return $this->hasFinanceRole($user) && $certificate->isIssued();
    }

    private function hasFinanceRole(User $user): bool
    {
        return in_array($user->role, self::FINANCE_ROLES, true);
    }
}

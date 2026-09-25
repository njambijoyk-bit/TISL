<?php

namespace App\Policies;

use App\Models\User;
use App\Models\TaxLegitimacyCertificate;

/**
 * ASSUMPTION (please confirm): same single-string-role assumption as
 * WithholdingCertificatePolicy — adjust hasFinanceRole() if roles work
 * differently in this codebase.
 */
class TaxLegitimacyCertificatePolicy
{
    private const FINANCE_ROLES = ['admin', 'super_admin', 'finance'];

    public function viewAny(User $user): bool
    {
        return $this->hasFinanceRole($user) || $user->role === 'manager';
    }

    public function view(User $user, TaxLegitimacyCertificate $certificate): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $this->hasFinanceRole($user);
    }

    public function update(User $user, TaxLegitimacyCertificate $certificate): bool
    {
        return $this->hasFinanceRole($user);
    }

    /** Only a certificate still pending_verification can be verified. */
    public function verify(User $user, TaxLegitimacyCertificate $certificate): bool
    {
        return $this->hasFinanceRole($user) && $certificate->status === TaxLegitimacyCertificate::STATUS_PENDING;
    }

    /** Only a currently-verified certificate can be revoked. */
    public function revoke(User $user, TaxLegitimacyCertificate $certificate): bool
    {
        return $this->hasFinanceRole($user) && $certificate->isVerified();
    }

    public function delete(User $user, TaxLegitimacyCertificate $certificate): bool
    {
        return $this->hasFinanceRole($user) && !$certificate->isVerified();
    }

    private function hasFinanceRole(User $user): bool
    {
        return in_array($user->role, self::FINANCE_ROLES, true);
    }
}

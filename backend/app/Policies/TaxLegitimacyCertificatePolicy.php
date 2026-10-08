<?php

namespace App\Policies;

use App\Models\User;
use App\Models\TaxLegitimacyCertificate;

/**
 * Who may see and change tax certificates comes from the permissions tax.view and tax.manage (finance, admin and super admin hold both; manager can see).
 */
class TaxLegitimacyCertificatePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('tax.view');
    }

    public function view(User $user, TaxLegitimacyCertificate $certificate): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $this->canManageTax($user);
    }

    public function update(User $user, TaxLegitimacyCertificate $certificate): bool
    {
        return $this->canManageTax($user);
    }

    /** Only a certificate still pending_verification can be verified. */
    public function verify(User $user, TaxLegitimacyCertificate $certificate): bool
    {
        return $this->canManageTax($user) && $certificate->status === TaxLegitimacyCertificate::STATUS_PENDING;
    }

    /** Only a currently-verified certificate can be revoked. */
    public function revoke(User $user, TaxLegitimacyCertificate $certificate): bool
    {
        return $this->canManageTax($user) && $certificate->isVerified();
    }

    public function delete(User $user, TaxLegitimacyCertificate $certificate): bool
    {
        return $this->canManageTax($user) && !$certificate->isVerified();
    }

    private function canManageTax(User $user): bool
    {
        return $user->hasPermission('tax.manage');
    }
}

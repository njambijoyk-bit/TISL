<?php

namespace App\Policies;

use App\Models\User;
use App\Models\WithholdingCertificate;

/**
 * Who may see and change tax certificates comes from the permissions tax.view and tax.manage (finance, admin and super admin hold both; manager can see).
 */
class WithholdingCertificatePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermission('tax.view');
    }

    public function view(User $user, WithholdingCertificate $certificate): bool
    {
        return $this->viewAny($user);
    }

    public function create(User $user): bool
    {
        return $this->canManageTax($user);
    }

    /** Only a pending certificate can be marked issued. */
    public function markIssued(User $user, WithholdingCertificate $certificate): bool
    {
        return $this->canManageTax($user) && $certificate->isPending();
    }

    /** Only an already-issued certificate can be marked received. */
    public function markReceived(User $user, WithholdingCertificate $certificate): bool
    {
        return $this->canManageTax($user) && $certificate->isIssued();
    }

    private function canManageTax(User $user): bool
    {
        return $user->hasPermission('tax.manage');
    }
}

<?php

namespace App\Policies;

use App\Models\User;
use App\Models\AiProviderKey;

class AiProviderKeyPolicy
{
    // Only super_admin can manage keys
    public function manage(User $user): bool
    {
        return $user->role === 'super_admin';
    }

    // All admins can view which key is active (not the key itself)
    public function view(User $user): bool
    {
        return in_array($user->role, [
            'super_admin', 'admin', 'manager', 'sales_rep'
        ]);
    }
}
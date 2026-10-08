<?php

namespace App\Policies;

use App\Models\User;
use App\Models\AiProviderKey;

class AiProviderKeyPolicy
{
    // Who may manage the keys comes from the permission ai.keys
    public function manage(User $user): bool
    {
        return $user->hasPermission('ai.keys');
    }

    // All admins can view which key is active (not the key itself)
    public function view(User $user): bool
    {
        return $user->isStaff() || $user->canDrive();
    }
}
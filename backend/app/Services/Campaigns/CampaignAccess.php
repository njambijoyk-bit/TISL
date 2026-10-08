<?php

namespace App\Services\Campaigns;

use App\Models\Campaign;
use App\Models\User;

/**
 * Who may do what with campaigns. Admin, super admin and manager create, edit and publish anything. Sales rep and finance can build a campaign but only
 * their own while it is a draft or was rejected; it reaches the public only once a publisher approves it (the approval step comes later).
 */
class CampaignAccess
{
    public static function canBuild(?User $u): bool
    {
        return $u && $u->hasPermission('campaigns.build');
    }

    public static function canPublish(?User $u): bool
    {
        return $u && $u->hasPermission('campaigns.publish');
    }

    public static function canEdit(?User $u, Campaign $c): bool
    {
        if (self::canPublish($u)) {
            return true;
        }

        return self::canBuild($u) && (int) $c->created_by === (int) $u->id && in_array($c->approval_status, ['draft', 'rejected'], true) && ! $c->is_published;
    }
}

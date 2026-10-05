<?php

namespace App\Services\Campaigns;

use App\Models\Campaign;
use Carbon\CarbonInterface;

/**
 * What a campaign is right now, worked out from its dates when it is read (nothing runs in the background):
 * draft -> scheduled -> teaser -> live -> ended, with paused and archived as overrides. A campaign with no start is live as soon as it is published;
 * with no end it stays live until it is archived.
 */
class CampaignStatus
{
    public const LABELS = ['draft' => 'Draft', 'scheduled' => 'Scheduled', 'teaser' => 'Teaser', 'live' => 'Live', 'paused' => 'Paused', 'ended' => 'Ended', 'archived' => 'Archived'];

    public static function of(Campaign $c, ?CarbonInterface $now = null): string
    {
        $now ??= now();
        if ($c->archived_at) {
            return 'archived';
        }
        if (! $c->is_published) {
            return 'draft';
        }
        if ($c->is_paused) {
            return 'paused';
        }
        if ($c->starts_at && $now->lt($c->starts_at)) {
            return $c->teaser_at && $now->gte($c->teaser_at) ? 'teaser' : 'scheduled';
        }
        if ($c->ends_at && $now->gte($c->ends_at)) {
            return 'ended';
        }

        return 'live';
    }

    /** Can the public see it at all? Live, teaser (its teaser sections), ended (the archive) and scheduled are listed; drafts, paused and archived are not. */
    public static function isPublic(string $status): bool
    {
        return in_array($status, ['scheduled', 'teaser', 'live', 'ended'], true);
    }
}

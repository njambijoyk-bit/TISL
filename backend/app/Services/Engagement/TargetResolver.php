<?php

namespace App\Services\Engagement;

use App\Models\Campaign;
use App\Models\CampaignMoodboard;
use App\Models\EngagementPost;
use App\Models\Hamper;
use App\Models\Product;
use App\Models\Service;
use App\Services\Campaigns\Feed;

/** Does the thing being engaged with exist and is it public, and what is it called? One place for every target type. */
class TargetResolver
{
    public function __construct(private Feed $feed) {}

    public function exists(string $type, int $id): bool
    {
        return match ($type) {
            'product' => Product::where('id', $id)->exists(),
            'service' => Service::where('id', $id)->where('status', 'active')->exists(),
            'hamper' => Hamper::where('id', $id)->exists(),
            'pin' => $this->feed->publicPins()->where('campaign_pins.id', $id)->exists(),
            'board' => $this->feed->publicBoards()->where('id', $id)->exists(),
            'moodboard' => CampaignMoodboard::where('is_template', false)->where('status', 'visible')->where('approval_status', 'approved')->where('id', $id)->exists(),
            'campaign' => Campaign::where('id', $id)->where('is_published', true)->whereNull('archived_at')->exists(),
            'post' => EngagementPost::where('id', $id)->where('status', 'published')->exists(),
            default => false,
        };
    }

    public function label(string $type, int $id): string
    {
        $name = match ($type) {
            'product' => Product::find($id)?->name,
            'service' => Service::find($id)?->name,
            'hamper' => Hamper::find($id)?->name,
            'pin' => \App\Models\CampaignPin::find($id)?->title ?: 'a pin',
            'board' => \App\Models\CampaignBoard::find($id)?->title,
            'moodboard' => CampaignMoodboard::find($id)?->title,
            'campaign' => Campaign::find($id)?->title,
            'post' => ($p = EngagementPost::find($id)) ? ucfirst($p->kind) . ' ' . mb_substr((string) $p->body, 0, 40) : null,
            default => null,
        };

        return $name ?: ucfirst($type) . " #{$id}";
    }

    /** The public page for a thing, where it has one (products and services have their own address rules, so they are left out). */
    public function url(string $type, int $id): ?string
    {
        return match ($type) {
            'pin' => "/pins/{$id}",
            'board' => ($b = \App\Models\CampaignBoard::find($id)) ? '/boards/' . $b->slugPath() : null,
            'moodboard' => ($m = CampaignMoodboard::find($id)) ? '/moodboards/' . $m->slugPath() : null,
            'campaign' => ($c = Campaign::find($id)) ? '/campaigns/' . $c->slug : null,
            default => null,
        };
    }
}

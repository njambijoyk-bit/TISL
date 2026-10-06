<?php

namespace App\Services\Campaigns;

use App\Models\Campaign;
use Carbon\Carbon;

/**
 * Credits a sale to a campaign. The website remembers the last time a visitor opened one of a campaign's featured items (for 7 days) and sends it with the order;
 * here it is checked and, if good, written to the order's `meta.attribution`. The check: the campaign still exists and is published (a draft or unpublished one earns
 * nothing; paused and archived ones still do, because the click was real), the click is no older than 7 days, and the cart holds one of its featured items.
 * Nothing about the sales table changes: `meta` is the field checkout already keeps its extras in, and later measures can sit beside this one.
 */
class CampaignAttribution
{
    public const WINDOW_DAYS = 7;

    /**
     * @param  array{campaign?:string,at?:string}|null  $claim  what the browser remembered
     * @param  array<int,array>  $cartItems  the cart's lines (product_id / hamper_id)
     * @return array<string,mixed>|null  the attribution to store, or null
     */
    public function resolve(?array $claim, array $cartItems): ?array
    {
        $slug = trim((string) ($claim['campaign'] ?? ''));
        if ($slug === '' || empty($claim['at'])) {
            return null;
        }
        try {
            $at = Carbon::parse($claim['at']);
        } catch (\Throwable) {
            return null;
        }
        if ($at->isFuture() && $at->diffInMinutes(now()) > 5 || $at->lt(now()->subDays(self::WINDOW_DAYS))) {
            return null;
        }
        $c = Campaign::where('slug', $slug)->where('is_published', true)->first();   // deleted ones are not found; drafts are refused
        if (! $c) {
            return null;
        }
        $featured = $c->items()->get(['item_type', 'item_id']);
        foreach ($cartItems as $line) {
            [$type, $id] = ! empty($line['hamper_id']) ? ['hamper', (int) $line['hamper_id']] : (! empty($line['product_id']) ? ['product', (int) $line['product_id']] : [null, 0]);
            if ($type && $featured->contains(fn ($f) => $f->item_type === $type && (int) $f->item_id === $id)) {
                return ['campaign_id' => $c->id, 'item_type' => $type, 'item_id' => $id, 'clicked_at' => $at->toIso8601String(), 'source' => 'campaign_item_click', 'recorded_at' => now()->toIso8601String()];
            }
        }

        return null;
    }
}

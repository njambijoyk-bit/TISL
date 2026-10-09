<?php

namespace App\Services\Campaigns;

use App\Models\Campaign;
use App\Models\CampaignItem;
use App\Models\CampaignSection;
use App\Models\ServiceVariant;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A campaign's page: its ordered sections and, inside a products section, the items it features. The whole page is saved in one go
 * (what is not sent is removed), and every section's settings are cut down to what that type of section knows about.
 */
class CampaignPage
{
    /** Allowed settings per section type, with a maximum length for each text. */
    private const FIELDS = [
        'hero' => ['headline' => 160, 'subheadline' => 300, 'image' => 500, 'button_label' => 60, 'button_link' => 300, 'align' => 10],
        'story' => ['heading' => 160, 'body' => 8000],
        'countdown' => ['heading' => 160, 'target' => 10, 'custom_at' => 30, 'done_text' => 160],
        'video' => ['heading' => 160, 'source' => 10, 'url' => 500, 'file' => 500, 'poster' => 500],
        'products' => ['heading' => 160, 'layout' => 10],
        'cta' => ['heading' => 160, 'text' => 600, 'button_label' => 60, 'button_link' => 300],
        'pins' => ['heading' => 160, 'source' => 6, 'tag' => 30],
        'moodboard' => ['heading' => 160],
        'gallery' => ['heading' => 160, 'tag' => 30],
    ];

    public function __construct(private CatalogueAdapter $catalogue, private Feed $feed) {}

    /** Starter sections for a type: what a new campaign begins with. */
    public function defaults(string $type, string $title, ?string $subtitle): array
    {
        $all = [
            'hero' => ['headline' => $title, 'subheadline' => $subtitle ?? '', 'align' => 'center'],
            'countdown' => ['heading' => 'Dropping soon', 'target' => 'start', 'done_text' => 'It is here'],
            'story' => ['heading' => 'The story', 'body' => ''],
            'products' => ['heading' => 'Shop the drop', 'layout' => 'grid'],
        ];

        return collect(CampaignTypes::find($type)['sections'] ?? [])->map(fn ($t) => ['type' => $t, 'settings' => $all[$t] ?? []])->all();
    }

    public function seed(Campaign $c): void
    {
        foreach ($this->defaults($c->type, $c->title, $c->subtitle) as $i => $s) {
            CampaignSection::create(['campaign_id' => $c->id, 'position' => $i + 1, 'type' => $s['type'], 'settings' => $s['settings']]);
        }
    }

    /** Keep only the fields a section type knows, trimmed to length; links must be a path on this site or https; a video link becomes a safe embed. */
    public function clean(string $type, ?array $settings): array
    {
        $out = [];
        foreach (self::FIELDS[$type] as $k => $max) {
            $v = $settings[$k] ?? null;
            if (is_string($v) && trim($v) !== '') {
                $out[$k] = mb_substr(trim($v), 0, $max);
            }
        }
        foreach (['button_link'] as $k) {
            if (isset($out[$k]) && ! preg_match('#^(/(?!/)|https?://)#i', $out[$k])) {
                throw ValidationException::withMessages(['sections' => ['A button link must start with / or https://.']]);
            }
        }
        foreach (['image', 'file', 'poster'] as $k) {
            if (isset($out[$k]) && ! str_starts_with($out[$k], '/storage/campaigns/')) {
                unset($out[$k]);   // only files uploaded here
            }
        }
        if ($type === 'video') {
            $out['source'] = ($out['source'] ?? 'embed') === 'upload' ? 'upload' : 'embed';
            if ($out['source'] === 'embed' && isset($out['url'])) {
                $out['video'] = VideoEmbed::parse($out['url']);
            }
        }
        if ($type === 'countdown') {
            $out['target'] = in_array($out['target'] ?? 'start', ['start', 'end', 'custom'], true) ? ($out['target'] ?? 'start') : 'start';
            if (isset($out['custom_at'])) {   // typed as site time: keep it with its offset so every visitor's browser counts to the same moment
                try {
                    $out['custom_at'] = \Carbon\Carbon::parse($out['custom_at'], config('app.timezone'))->format('Y-m-d\TH:i:sP');
                } catch (\Throwable) {
                    unset($out['custom_at']);
                }
            }
        }
        if (in_array($type, ['hero'], true)) {
            $out['align'] = ($out['align'] ?? 'center') === 'left' ? 'left' : 'center';
        }
        if ($type === 'products') {
            $out['layout'] = ($out['layout'] ?? 'grid') === 'list' ? 'list' : 'grid';
        }
        if (in_array($type, ['pins', 'gallery'], true)) {
            $this->world($type, $settings ?? [], $out);
        }
        if ($type === 'moodboard') {
            $id = (int) ($settings['moodboard_id'] ?? 0);
            if (! $id || ! \App\Models\CampaignMoodboard::public()->where('id', $id)->exists()) {
                throw ValidationException::withMessages(['sections' => ['Choose an approved moodboard for the moodboard section.']]);
            }
            $out['moodboard_id'] = $id;
        }

        return $out;
    }

    /** The settings of a pin grid (a board, or a tag) and of the community gallery (a tag): what to show and how many. */
    private function world(string $type, array $in, array &$out): void
    {
        $tag = mb_strtolower(trim(ltrim(trim((string) ($in['tag'] ?? '')), '#')));
        $out['count'] = max(1, min(24, (int) ($in['count'] ?? 12)));
        unset($out['tag']);
        if ($type === 'gallery' || ($in['source'] ?? '') === 'tag') {
            if ($tag === '' || mb_strlen($tag) > 30) {
                throw ValidationException::withMessages(['sections' => ['Give the tag to show pins for (a single word, no spaces).']]);
            }
            $out['tag'] = $tag;
        }
        if ($type === 'pins') {
            $out['source'] = ($in['source'] ?? '') === 'tag' ? 'tag' : 'board';
            if ($out['source'] === 'board') {
                $id = (int) ($in['board_id'] ?? 0);
                if (! $id || ! $this->feed->publicBoards()->where('id', $id)->exists()) {
                    throw ValidationException::withMessages(['sections' => ['Choose a public, approved board for the pin grid.']]);
                }
                $out['board_id'] = $id;
            }
        }
    }

    /** @param array<int,array> $sections in page order */
    public function save(Campaign $c, array $sections): void
    {
        $featured = [];
        $whole = [];       // product ids featured as a whole
        $byOption = [];    // product ids featured by chosen options
        foreach ($sections as $s) {
            foreach (($s['type'] === 'products' ? ($s['items'] ?? []) : []) as $it) {
                $variant = (int) ($it['variant_id'] ?? 0);
                if ($variant < 0 || ($variant > 0 && (! in_array($it['item_type'], ['product', 'service'], true) || ! CampaignItem::hasVariants()))) {
                    throw ValidationException::withMessages(['sections' => ['Only a product (by option) or a service (by package) can be featured in part' . (CampaignItem::hasVariants() ? '.' : ' (run database script 106_campaign_item_variants.sql first).')]]);
                }
                $k = CampaignItem::keyOf($it['item_type'], (int) $it['item_id'], $variant);
                if (isset($featured[$k])) {
                    throw ValidationException::withMessages(['sections' => ['The same item is featured twice in this campaign.']]);
                }
                $featured[$k] = ['item_type' => $it['item_type'], 'item_id' => (int) $it['item_id'], 'variant_id' => $variant];
                if (in_array($it['item_type'], ['product', 'service'], true)) {
                    $variant > 0 ? $byOption["{$it['item_type']}:{$it['item_id']}"] = true : $whole["{$it['item_type']}:{$it['item_id']}"] = true;
                }
            }
        }
        if ($both = array_intersect_key($whole, $byOption)) {
            [$type, $id] = explode(':', (string) array_key_first($both));
            $name = ($type === 'service' ? \App\Models\Service::class : \App\Models\Product::class)::whereKey((int) $id)->value('name') ?? ucfirst($type);
            throw ValidationException::withMessages(['sections' => ["{$name} is featured as a whole and in part. Choose one: the whole {$type}, or the " . ($type === 'service' ? 'packages' : 'options') . ' you want.']]);
        }
        if ($featured) {
            if (! $this->catalogue->active()) {
                throw ValidationException::withMessages(['sections' => ['Featuring products and services needs E-commerce, which is switched off.']]);
            }
            // an option or package must belong to the product or service it is featured under
            $owners = [];
            foreach (['product' => \App\Models\ProductVariant::class, 'service' => ServiceVariant::class] as $type => $model) {
                $ids = array_values(array_filter(array_map(fn ($f) => $f['item_type'] === $type ? $f['variant_id'] : 0, $featured)));
                $owners[$type] = $ids ? $model::whereIn('id', $ids)->pluck($type . '_id', 'id') : collect();
            }
            foreach ($featured as $f) {
                if ($f['variant_id'] > 0 && (int) ($owners[$f['item_type']][$f['variant_id']] ?? 0) !== $f['item_id']) {
                    throw ValidationException::withMessages(['sections' => ['One of the options or packages does not belong to the item it is listed under.']]);
                }
            }
            $found = $this->catalogue->describe(array_values($featured));
            foreach ($found as $row) {
                if (! $row['available']) {
                    throw ValidationException::withMessages(['sections' => ['One of the featured items or options no longer exists, or is switched off. Remove it and save again.']]);
                }
            }
        }

        DB::transaction(function () use ($c, $sections) {
            $keep = [];
            foreach (array_values($sections) as $pos => $s) {
                $data = ['position' => $pos + 1, 'type' => $s['type'], 'settings' => $this->clean($s['type'], $s['settings'] ?? []), 'show_from' => $s['show_from'] ?? null, 'show_until' => $s['show_until'] ?? null, 'audience_rule' => \App\Services\Campaigns\CampaignAudience::clean($s['audience_rule'] ?? null)];
                $row = ! empty($s['id']) ? CampaignSection::where('campaign_id', $c->id)->find($s['id']) : null;
                $row ? $row->update($data) : $row = CampaignSection::create($data + ['campaign_id' => $c->id]);
                $keep[] = $row->id;

                $kept = [];
                foreach (($s['type'] === 'products' ? ($s['items'] ?? []) : []) as $ip => $it) {
                    $key = ['campaign_id' => $c->id, 'item_type' => $it['item_type'], 'item_id' => $it['item_id']];
                    if (CampaignItem::hasVariants()) {
                        $key['variant_id'] = (int) ($it['variant_id'] ?? 0);
                    }
                    $item = CampaignItem::updateOrCreate($key,
                        ['section_id' => $row->id, 'position' => $ip + 1, 'available_from' => $it['available_from'] ?? null, 'label_override' => ($it['label_override'] ?? null) ?: null]);
                    $kept[] = $item->id;
                }
                CampaignItem::where('campaign_id', $c->id)->where('section_id', $row->id)->whereNotIn('id', $kept)->delete();
            }
            CampaignSection::where('campaign_id', $c->id)->whereNotIn('id', $keep)->delete();
            CampaignItem::where('campaign_id', $c->id)->whereNotIn('section_id', $keep)->delete();
        });
    }
}

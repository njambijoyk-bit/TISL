<?php

namespace App\Services\Campaigns;

use App\Models\Campaign;
use App\Models\CampaignItem;
use App\Models\CampaignSection;
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
    ];

    public function __construct(private CatalogueAdapter $catalogue) {}

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
        }
        if (in_array($type, ['hero'], true)) {
            $out['align'] = ($out['align'] ?? 'center') === 'left' ? 'left' : 'center';
        }
        if ($type === 'products') {
            $out['layout'] = ($out['layout'] ?? 'grid') === 'list' ? 'list' : 'grid';
        }

        return $out;
    }

    /** @param array<int,array> $sections in page order */
    public function save(Campaign $c, array $sections): void
    {
        $featured = [];
        foreach ($sections as $s) {
            foreach (($s['type'] === 'products' ? ($s['items'] ?? []) : []) as $it) {
                $k = "{$it['item_type']}:{$it['item_id']}";
                if (isset($featured[$k])) {
                    throw ValidationException::withMessages(['sections' => ['The same item is featured twice in this campaign.']]);
                }
                $featured[$k] = $it;
            }
        }
        if ($featured) {
            if (! $this->catalogue->active()) {
                throw ValidationException::withMessages(['sections' => ['Featuring products and services needs E-commerce, which is switched off.']]);
            }
            $found = $this->catalogue->describe(array_values($featured));
            foreach ($found as $row) {
                if (! $row['available']) {
                    throw ValidationException::withMessages(['sections' => ['One of the featured items no longer exists. Remove it and save again.']]);
                }
            }
        }

        DB::transaction(function () use ($c, $sections) {
            $keep = [];
            foreach (array_values($sections) as $pos => $s) {
                $data = ['position' => $pos + 1, 'type' => $s['type'], 'settings' => $this->clean($s['type'], $s['settings'] ?? []), 'show_from' => $s['show_from'] ?? null, 'show_until' => $s['show_until'] ?? null, 'audience_rule' => $s['audience_rule'] ?? null];
                $row = ! empty($s['id']) ? CampaignSection::where('campaign_id', $c->id)->find($s['id']) : null;
                $row ? $row->update($data) : $row = CampaignSection::create($data + ['campaign_id' => $c->id]);
                $keep[] = $row->id;

                $kept = [];
                foreach (($s['type'] === 'products' ? ($s['items'] ?? []) : []) as $ip => $it) {
                    $item = CampaignItem::updateOrCreate(['campaign_id' => $c->id, 'item_type' => $it['item_type'], 'item_id' => $it['item_id']],
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

<?php

namespace App\Services\Campaigns;

use App\Models\CampaignPin;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Making and changing pins. A pin is one thing: an image, a video (a YouTube, Vimeo, TikTok or Facebook link, or an uploaded file),
 * a featured item (a product, service, hamper or auction; needs E-commerce), a link or a note. Staff and customers use the same code;
 * `source` says which, and customers cannot add uploaded video files.
 */
class PinService
{
    public const MAX_IMAGE_KB = 10240;   // 10 MB
    public const MAX_VIDEO_KB = 102400;  // 100 MB

    public function __construct(private ImageStore $images, private CatalogueAdapter $catalogue) {}

    private function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => [$message]]);
    }

    /** A list of short lowercase words without the #. */
    public function tags(mixed $raw): array
    {
        $list = is_array($raw) ? $raw : preg_split('/[,\n]+/', (string) $raw);
        $out = [];
        foreach ($list as $t) {
            $t = mb_strtolower(trim(ltrim(trim((string) $t), '#')));
            if ($t !== '' && mb_strlen($t) <= 30 && ! in_array($t, $out, true)) {
                $out[] = $t;
            }
        }

        return array_slice($out, 0, 12);
    }

    /** Fields every kind shares, cut down and cleaned. */
    private function common(array $d): array
    {
        $c = [];
        foreach (['title' => 160, 'credit' => 160, 'caption' => 2000] as $k => $max) {
            if (array_key_exists($k, $d)) {
                $c[$k] = ($d[$k] === null || trim((string) $d[$k]) === '') ? null : mb_substr(trim((string) $d[$k]), 0, $max);
            }
        }
        if (array_key_exists('tags', $d)) {
            $c['tags'] = $this->tags($d['tags']);
        }
        if (array_key_exists('allow_download', $d)) {
            $c['allow_download'] = filter_var($d['allow_download'], FILTER_VALIDATE_BOOLEAN);
        }

        return $c;
    }

    private function link(?string $url): ?string
    {
        $url = trim((string) $url);
        if ($url === '') {
            return null;
        }
        if (! preg_match('#^https?://[^\s]+$#i', $url) || mb_strlen($url) > 500) {
            $this->fail('link_url', 'A link must start with http:// or https:// and have no spaces.');
        }

        return $url;
    }

    /**
     * @param array{kind:string} $d the fields; files come separately
     * @param array{image?:?UploadedFile,video?:?UploadedFile,poster?:?UploadedFile} $files
     */
    public function create(array $d, array $files, User $by, string $source = 'staff'): CampaignPin
    {
        $kind = $d['kind'] ?? '';
        if (! in_array($kind, CampaignPin::KINDS, true)) {
            $this->fail('kind', 'Choose what kind of pin it is.');
        }
        $data = $this->common($d) + ['kind' => $kind, 'owner_user_id' => $by->id, 'source' => $source, 'status' => 'visible', 'campaign_id' => $d['campaign_id'] ?? null];

        if ($kind === 'image') {
            if (empty($files['image'])) {
                $this->fail('image', 'Choose a picture.');
            }
            $m = $this->images->store($files['image']);
            $data += ['media_path' => $m['path'], 'thumb_path' => $m['thumb'], 'media_width' => $m['width'], 'media_height' => $m['height']];
        } elseif ($kind === 'video') {
            $data['video'] = $this->video($d, $files, $source);
            $data['allow_download'] = ($data['video']['source'] ?? '') === 'upload' ? ($data['allow_download'] ?? true) : false;   // only a file we hold can be downloaded
            if (! empty($data['video']['poster'])) {
                $data['thumb_path'] = $data['video']['poster'];
            }
        } elseif ($kind === 'item') {
            $this->item($d, $data);
        } elseif ($kind === 'link') {
            $data['link_url'] = $this->link($d['link_url'] ?? null) ?? $this->fail('link_url', 'Paste the link.');
            if (! empty($files['image'])) {
                $m = $this->images->store($files['image']);
                $data += ['media_path' => $m['path'], 'thumb_path' => $m['thumb'], 'media_width' => $m['width'], 'media_height' => $m['height']];
            }
            $data['allow_download'] = false;
        } else {   // note
            if (empty($data['title']) && empty($data['caption'])) {
                $this->fail('title', 'Write something for the note.');
            }
            $data['allow_download'] = false;
        }
        $data['allow_download'] ??= true;

        return CampaignPin::create($data);
    }

    /** The video part: a safe embed made by the server, or an uploaded file (staff only) with its poster. */
    private function video(array $d, array $files, string $source): array
    {
        if (! empty($files['video'])) {
            if ($source !== 'staff') {
                $this->fail('video', 'Video files can only be uploaded by our team. Paste a YouTube, Vimeo, TikTok or Facebook link instead.');
            }
            $v = ['source' => 'upload', 'file' => Storage::url($files['video']->store('campaigns/video', 'public'))];
        } elseif (! empty($d['video_url'])) {
            $v = ['source' => 'embed'] + VideoEmbed::parse((string) $d['video_url']);
            if (! empty($v['thumb'])) {
                $v['poster_remote'] = $v['thumb'];   // YouTube's own picture, used when none is uploaded
            }
        } else {
            $this->fail('video_url', 'Paste a video link or choose a video file.');
        }
        if (! empty($files['poster'])) {
            $v['poster'] = $this->images->store($files['poster'], 'campaigns/pins')['thumb'];
        }

        return $v;
    }

    private function item(array $d, array &$data): void
    {
        $type = $d['item_type'] ?? '';
        $id = (int) ($d['item_id'] ?? 0);
        if (! $this->catalogue->active()) {
            $this->fail('item_type', 'Featuring a product or service needs E-commerce, which is switched off.');
        }
        if (! in_array($type, \App\Models\CampaignItem::TYPES, true) || $id < 1) {
            $this->fail('item_type', 'Choose the product, service, hamper or auction.');
        }
        $row = $this->catalogue->describe([['item_type' => $type, 'item_id' => $id]])["{$type}:{$id}"];
        if (! $row['available']) {
            $this->fail('item_id', 'That item does not exist any more.');
        }
        $data['item_type'] = $type;
        $data['item_id'] = $id;
        $data['allow_download'] = false;
        if (empty($data['title'])) {
            $data['title'] = $row['name'];
        }
    }

    /** Change a pin's words, tags and download switch (its kind and media stay; replace media with replaceMedia). */
    public function update(CampaignPin $p, array $d): CampaignPin
    {
        $c = $this->common($d);
        if ($p->kind === 'link' && array_key_exists('link_url', $d)) {
            $c['link_url'] = $this->link($d['link_url']) ?? $this->fail('link_url', 'A link pin needs its link.');
        }
        if (in_array($p->kind, ['item', 'link', 'note'], true)) {
            unset($c['allow_download']);
        }
        if ($p->kind === 'video' && ($p->video['source'] ?? '') !== 'upload') {
            unset($c['allow_download']);
        }
        $p->update($c);

        return $p->fresh();
    }

    /** Replace the picture (image and link pins), the poster, or the video address or file. */
    public function replaceMedia(CampaignPin $p, array $files, array $d, string $source = 'staff'): CampaignPin
    {
        if (! empty($files['image']) && in_array($p->kind, ['image', 'link'], true)) {
            $this->forget($p->media_path);
            $this->forget($p->thumb_path);
            $m = $this->images->store($files['image']);
            $p->fill(['media_path' => $m['path'], 'thumb_path' => $m['thumb'], 'media_width' => $m['width'], 'media_height' => $m['height']]);
        }
        if ($p->kind === 'video') {
            $v = $p->video ?? [];
            if (! empty($files['video']) || ! empty($d['video_url'])) {
                $new = $this->video($d, $files, $source);
                if (($v['source'] ?? '') === 'upload') {
                    $this->forget($v['file'] ?? null);
                }
                $keep = $v['poster'] ?? null;
                $v = $new;
                if (empty($new['poster']) && $keep) {
                    $v['poster'] = $keep;   // the picture stays unless a new one came with it
                }
            } elseif (! empty($files['poster'])) {
                $this->forget($v['poster'] ?? null);
                $v['poster'] = $this->images->store($files['poster'], 'campaigns/pins')['thumb'];
            }
            $p->video = array_filter($v, fn ($x) => $x !== null);
            $p->thumb_path = $p->video['poster'] ?? $p->thumb_path;
            if (($p->video['source'] ?? '') !== 'upload') {
                $p->allow_download = false;
            }
        }
        $p->save();

        return $p->fresh();
    }

    public function hide(CampaignPin $p, ?string $reason): void
    {
        $p->update(['status' => 'hidden', 'hidden_reason' => $reason ? mb_substr(trim($reason), 0, 255) : null]);
    }

    public function unhide(CampaignPin $p): void
    {
        $p->update(['status' => 'visible', 'hidden_reason' => null]);
    }

    /** Delete the pin and the files only it uses. */
    /** Delete a pin for good (super admin): its files, board places, comments, likes and reports, then the row itself. Works on one already deleted. */
    public function purge(CampaignPin $p): void
    {
        if (! $p->trashed()) {
            $this->destroy($p);
        }
        $db = \Illuminate\Support\Facades\DB::class;
        $posts = $db::table('engagement_posts')->where('target_type', 'pin')->where('target_id', $p->id)->pluck('id');
        $db::table('engagement_reactions')->where('target_type', 'post')->whereIn('target_id', $posts)->delete();
        $db::table('engagement_reports')->where('target_type', 'post')->whereIn('target_id', $posts)->delete();
        $db::table('engagement_posts')->whereIn('id', $posts)->delete();
        foreach (['engagement_reactions', 'engagement_reports'] as $t) {
            $db::table($t)->where('target_type', 'pin')->where('target_id', $p->id)->delete();
        }
        $p->forceDelete();
    }

    public function destroy(CampaignPin $p): void
    {
        $this->forget($p->media_path);
        if ($p->thumb_path !== $p->media_path) {
            $this->forget($p->thumb_path);
        }
        if (($p->video['source'] ?? '') === 'upload') {
            $this->forget($p->video['file'] ?? null);
        }
        $boards = \Illuminate\Support\Facades\DB::table('campaign_board_pins')->where('pin_id', $p->id)->pluck('board_id');
        \Illuminate\Support\Facades\DB::table('campaign_board_pins')->where('pin_id', $p->id)->delete();
        foreach (\App\Models\CampaignBoard::whereIn('id', $boards)->where('cover_pin_id', $p->id)->get() as $b) {   // a board whose cover went takes its first pin instead
            $b->update(['cover_pin_id' => \Illuminate\Support\Facades\DB::table('campaign_board_pins')->where('board_id', $b->id)->orderBy('position')->value('pin_id')]);
        }
        $p->delete();
    }

    /** Delete a file we stored (/storage/campaigns/...); anything else is left alone. */
    private function forget(?string $path): void
    {
        if ($path && str_starts_with($path, '/storage/campaigns/')) {
            Storage::disk('public')->delete(substr($path, strlen('/storage/')));
        }
    }

    /** Pins with the live details (name, price, picture) of any featured items. @param iterable<CampaignPin> $pins */
    public function presentMany(iterable $pins): array
    {
        $pins = collect($pins);
        $items = $this->catalogue->describe($pins->where('kind', 'item')->map(fn ($p) => ['item_type' => $p->item_type, 'item_id' => $p->item_id])->values()->all());

        return $pins->map(fn ($p) => $this->present($p, $p->kind === 'item' ? ($items["{$p->item_type}:{$p->item_id}"] ?? null) : null))->values()->all();
    }

    /** What the pin looks like to the library and the pages: the row plus a ready-to-use thumb and live item details. */
    public function present(CampaignPin $p, ?array $item = null): array
    {
        return $p->toArray() + ['item' => $item];
    }
}

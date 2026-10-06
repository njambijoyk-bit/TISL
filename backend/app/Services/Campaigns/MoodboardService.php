<?php

namespace App\Services\Campaigns;

use App\Models\CampaignMoodboard;
use App\Models\CampaignPin;
use App\Models\User;
use App\Services\Books\BooksException;

/**
 * Moodboards: start one from a preset or a saved template, fill its slots (pins, colours, words, stickers), save its layout as a template, hide and delete.
 * Sales rep and finance moodboards start as drafts and go for approval (MoodboardApproval); an approved one that they change goes back for approval.
 * A template holds a layout with empty slots and is only for staff to start from.
 */
class MoodboardService
{
    public function __construct(private MoodboardApproval $approval, private PinService $pins) {}

    public function canEdit(?User $u, CampaignMoodboard $m): bool
    {
        if (CampaignAccess::canPublish($u)) {
            return true;
        }

        return CampaignAccess::canBuild($u) && (int) $m->owner_user_id === (int) $u->id && $m->approval_status !== 'pending';
    }

    private function title(mixed $t): string
    {
        $t = trim((string) $t);
        if ($t === '') {
            throw new BooksException('Give the moodboard a name.');
        }

        return mb_substr($t, 0, 160);
    }

    /** @param string $from "preset:collage" or "template:12" */
    public function create(string $title, string $from, User $by): CampaignMoodboard
    {
        [$kind, $ref] = array_pad(explode(':', $from, 2), 2, '');
        if ($kind === 'preset') {
            $layout = MoodboardPresets::find($ref)['layout'] ?? throw new BooksException('Choose a layout.');
            $key = $ref;
        } elseif ($kind === 'template') {
            $t = CampaignMoodboard::where('is_template', true)->find((int) $ref) ?? throw new BooksException('That template is not there any more.');
            $layout = $t->layout;
            $key = $t->template_key;
        } else {
            throw new BooksException('Choose a layout.');
        }
        $publisher = CampaignAccess::canPublish($by);

        return CampaignMoodboard::create(['owner_user_id' => $by->id, 'title' => $this->title($title), 'template_key' => $key, 'layout' => $layout, 'contents' => [], 'is_template' => false, 'status' => 'visible',
            'approval_status' => $publisher ? 'approved' : 'draft', 'approved_by' => $publisher ? $by->id : null, 'approved_at' => $publisher ? now() : null]);
    }

    /** Check each filled slot against its layout and cut the content down to what is allowed. */
    private function cleanContents(CampaignMoodboard $m, array $contents): array
    {
        $slots = collect($m->layout['slots'] ?? [])->keyBy('id');
        $out = [];
        foreach ($contents as $id => $c) {
            $slot = $slots->get($id);
            if (! $slot || ! is_array($c) || $c === []) {
                continue;   // an empty or unknown spot is simply left out
            }
            $type = $slot['type'];
            if ($type === 'photo') {
                $pid = (int) ($c['pin_id'] ?? 0);
                if (! $pid || ! CampaignPin::where('id', $pid)->where('status', 'visible')->exists()) {
                    throw new BooksException("\"{$slot['hint']}\": that pin is hidden or no longer exists.");
                }
                $out[$id] = ['pin_id' => $pid];
            } elseif ($type === 'color') {
                $v = (string) ($c['value'] ?? '');
                if (! preg_match('/^#[0-9a-fA-F]{6}$/', $v)) {
                    throw new BooksException("\"{$slot['hint']}\": choose a colour.");
                }
                $out[$id] = ['value' => strtolower($v), 'label' => isset($c['label']) && trim((string) $c['label']) !== '' ? mb_substr(trim((string) $c['label']), 0, 30) : null];
            } elseif ($type === 'text') {
                $text = trim((string) ($c['text'] ?? ''));
                if ($text === '') {
                    continue;
                }
                $color = (string) ($c['color'] ?? '#222222');
                $out[$id] = ['text' => mb_substr($text, 0, 120), 'font' => in_array($c['font'] ?? '', MoodboardPresets::FONTS, true) ? $c['font'] : 'sans', 'color' => preg_match('/^#[0-9a-fA-F]{6}$/', $color) ? strtolower($color) : '#222222'];
            } elseif ($type === 'sticker') {
                $v = (string) ($c['value'] ?? '');
                if (! in_array($v, MoodboardPresets::STICKERS, true)) {
                    throw new BooksException("\"{$slot['hint']}\": choose a sticker from the list.");
                }
                $out[$id] = ['value' => $v];
            }
        }

        return $out;
    }

    public function update(CampaignMoodboard $m, array $d, User $by): CampaignMoodboard
    {
        $c = [];
        if (array_key_exists('title', $d)) {
            $c['title'] = $this->title($d['title']);
        }
        if (array_key_exists('background', $d)) {
            $bg = (string) $d['background'];
            if (! preg_match('/^#[0-9a-fA-F]{6}$/', $bg)) {
                throw new BooksException('Choose a background colour.');
            }
            $c['layout'] = ['background' => strtolower($bg)] + $m->layout;
        }
        if (array_key_exists('contents', $d)) {
            $c['contents'] = $this->cleanContents($m, (array) $d['contents']);
        }
        $m->update($c);
        $this->changed($m, $by);

        return $m->fresh();
    }

    /** Keep this moodboard's layout, with empty spots, as a template staff can start from. */
    public function saveAsTemplate(CampaignMoodboard $m, string $title, User $by): CampaignMoodboard
    {
        return CampaignMoodboard::create(['owner_user_id' => $by->id, 'title' => $this->title($title), 'template_key' => $m->template_key, 'layout' => $m->layout, 'contents' => [], 'is_template' => true, 'status' => 'visible', 'approval_status' => 'approved']);
    }

    private function changed(CampaignMoodboard $m, User $by): void
    {
        if (! $m->is_template && ! CampaignAccess::canPublish($by) && $m->approval_status === 'approved') {
            try {
                $this->approval->submit($m->fresh(), $by);
            } catch (BooksException) {
                $m->update(['approval_status' => 'draft']);
            }
        }
    }

    public function hide(CampaignMoodboard $m): void
    {
        $m->update(['status' => 'hidden']);
    }

    public function unhide(CampaignMoodboard $m): void
    {
        $m->update(['status' => 'visible']);
    }

    /** Move a moodboard to the recycle bin; Restore brings it back as it was. */
    public function destroy(CampaignMoodboard $m): void
    {
        $this->approval->clear($m);
        $m->delete();
    }

    public function restore(CampaignMoodboard $m): void
    {
        $m->restore();
        if ($m->approval_status === 'pending') {
            $m->update(['approval_status' => 'draft']);   // its approval task went when it was deleted, so it has to be sent again
        }
    }

    /** Delete a moodboard for good, with its comments and likes. Pins it used are never touched. */
    public function purge(CampaignMoodboard $m): void
    {
        $this->approval->clear($m);
        app(PinService::class)->forgetTarget('moodboard', $m->id);
        $m->forceDelete();
    }

    /** What a page needs to draw it: the layout and contents, with each photo slot's pin turned into a picture. */
    public function present(CampaignMoodboard $m, ?array $pinImages = null): array
    {
        $contents = $m->contents ?? [];
        $pinImages ??= $this->images(array_filter(array_map(fn ($c) => $c['pin_id'] ?? null, $contents)));
        foreach ($contents as $id => $c) {
            if (isset($c['pin_id'])) {
                $contents[$id] = isset($pinImages[$c['pin_id']]) ? $c + $pinImages[$c['pin_id']] : [];   // a pin that went away leaves the spot empty
            }
        }

        return ['id' => $m->id, 'title' => $m->title, 'slug_path' => $m->slugPath(), 'layout' => $m->layout, 'contents' => (object) array_filter($contents)];
    }

    /** @param int[] $ids @return array<int,array{title:?string,image:?string}> visible pins only */
    public function images(array $ids): array
    {
        $pins = CampaignPin::whereIn('id', array_unique($ids))->where('status', 'visible')->get();
        $rows = $this->pins->presentMany($pins);
        $out = [];
        foreach ($rows as $r) {
            $img = $r['thumb_path'] ?: $r['media_path'] ?: ($r['video']['poster'] ?? null) ?: ($r['item']['image'] ?? null);
            $out[$r['id']] = ['title' => $r['title'] ?: ($r['item']['name'] ?? null), 'image' => $img];
        }

        return $out;
    }
}

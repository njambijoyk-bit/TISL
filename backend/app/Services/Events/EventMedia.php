<?php

namespace App\Services\Events;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Images, videos, embeds and documents on an event, organiser, vendor, venue, package or space. Each item is public (anyone may see it) or private (the owner's team only: floor plans, contracts); a
 * private item is never on a public link. A video can be uploaded or embedded from YouTube or Vimeo. One cover per owner, and an event's cover is also its main picture on the existing pages.
 */
final class EventMedia
{
    public const OWNERS = ['event', 'organiser', 'vendor', 'venue', 'package', 'space'];
    public const ROLES = ['cover', 'logo', 'poster', 'gallery', 'floor_plan', 'contract', 'other'];
    private const IMAGE = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    private const VIDEO = ['mp4', 'webm', 'mov'];
    private const DOC = ['pdf'];
    private const MAX_KB = ['image' => 8192, 'video' => 204800, 'document' => 10240];

    public static function ready(): bool
    {
        return Schema::hasTable('event_media');
    }

    private function owner(string $type): string
    {
        return in_array($type, self::OWNERS, true) ? $type : throw ValidationException::withMessages(['owner_type' => 'Media goes on an event, organiser, vendor, venue, package or space.']);
    }

    private function kindOf(UploadedFile $f): string
    {
        $ext = strtolower($f->getClientOriginalExtension());
        $kind = in_array($ext, self::IMAGE, true) ? 'image' : (in_array($ext, self::VIDEO, true) ? 'video' : (in_array($ext, self::DOC, true) ? 'document' : null));
        if (! $kind) {
            throw ValidationException::withMessages(['file' => 'Upload an image (jpg, png, webp, gif), a video (mp4, webm, mov) or a PDF.']);
        }
        if ($f->getSize() > self::MAX_KB[$kind] * 1024) {
            throw ValidationException::withMessages(['file' => 'That ' . $kind . ' is too large (the limit is ' . intdiv(self::MAX_KB[$kind], 1024) . ' MB).']);
        }

        return $kind;
    }

    /** Where a file lives: public things on the public disk, private things and documents on the private one. */
    private function disk(string $visibility, string $kind): string
    {
        return $visibility === 'private' || $kind === 'document' ? 'local' : 'public';
    }

    public function addFile(string $ownerType, int $ownerId, UploadedFile $file, array $in, ?int $by): array
    {
        $this->owner($ownerType);
        $kind = $this->kindOf($file);
        $visibility = $kind === 'document' ? 'private' : (($in['visibility'] ?? 'public') === 'private' ? 'private' : 'public');   // a document is never public
        $role = in_array($in['role'] ?? 'gallery', self::ROLES, true) ? ($in['role'] ?? 'gallery') : 'gallery';
        $disk = $this->disk($visibility, $kind);
        $path = $file->store("event-media/{$ownerType}-{$ownerId}", $disk);

        return $this->insert($ownerType, $ownerId, ['kind' => $kind, 'role' => $role, 'path' => $path, 'visibility' => $visibility, 'mime' => $file->getClientMimeType(), 'size_bytes' => $file->getSize(), 'title' => $in['title'] ?? null,
            'caption' => $in['caption'] ?? null], $by);
    }

    /** A YouTube or Vimeo link, shown in a player on the page. Any other address is refused: a page must not embed arbitrary sites. */
    public function addEmbed(string $ownerType, int $ownerId, string $url, array $in, ?int $by): array
    {
        $this->owner($ownerType);
        $embed = self::embedUrl($url) ?? throw ValidationException::withMessages(['url' => 'Paste a YouTube or Vimeo link.']);

        return $this->insert($ownerType, $ownerId, ['kind' => 'embed', 'role' => in_array($in['role'] ?? 'gallery', ['gallery', 'poster', 'cover'], true) ? $in['role'] : 'gallery', 'url' => $embed, 'visibility' => 'public',
            'title' => $in['title'] ?? null, 'caption' => $in['caption'] ?? null], $by);
    }

    /** The player address for a YouTube or Vimeo link, or null. */
    public static function embedUrl(string $url): ?string
    {
        $url = trim($url);
        if (preg_match('~^https?://(?:www\.|m\.)?(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{11})~', $url, $m)) {
            return 'https://www.youtube.com/embed/' . $m[1];
        }
        if (preg_match('~^https?://(?:www\.)?vimeo\.com/(?:video/)?(\d{6,12})~', $url, $m)) {
            return 'https://player.vimeo.com/video/' . $m[1];
        }

        return null;
    }

    private function insert(string $ownerType, int $ownerId, array $row, ?int $by): array
    {
        return DB::transaction(function () use ($ownerType, $ownerId, $row, $by) {
            if ($row['role'] === 'cover') {
                DB::table('event_media')->where(['owner_type' => $ownerType, 'owner_id' => $ownerId, 'role' => 'cover'])->update(['role' => 'gallery']);   // one cover
            }
            $order = (int) DB::table('event_media')->where(['owner_type' => $ownerType, 'owner_id' => $ownerId])->max('sort_order') + 1;
            $id = (int) DB::table('event_media')->insertGetId($row + ['owner_type' => $ownerType, 'owner_id' => $ownerId, 'sort_order' => $order, 'created_by' => $by, 'created_at' => now(), 'updated_at' => now()]);
            $this->syncEventPicture($ownerType, $ownerId);

            return $this->shape(DB::table('event_media')->where('id', $id)->first());
        });
    }

    /** An event's cover is also its main picture, which the public pages already show. */
    private function syncEventPicture(string $ownerType, int $ownerId): void
    {
        if ($ownerType !== 'event') {
            return;
        }
        $cover = DB::table('event_media')->where(['owner_type' => 'event', 'owner_id' => $ownerId, 'role' => 'cover', 'kind' => 'image', 'visibility' => 'public'])->value('path');
        if ($cover && Schema::hasColumn('events', 'main_image')) {
            DB::table('events')->where('id', $ownerId)->update(['main_image' => Storage::disk('public')->url($cover)]);
        }
    }

    public function shape(object $m): array
    {
        $disk = $this->disk($m->visibility, $m->kind);

        return ['id' => (int) $m->id, 'owner_type' => $m->owner_type, 'owner_id' => (int) $m->owner_id, 'kind' => $m->kind, 'role' => $m->role, 'title' => $m->title, 'caption' => $m->caption, 'visibility' => $m->visibility,
            'url' => $m->kind === 'embed' ? $m->url : ($m->path && $disk === 'public' ? Storage::disk('public')->url($m->path) : null), 'mime' => $m->mime, 'size_bytes' => $m->size_bytes ? (int) $m->size_bytes : null, 'sort_order' => (int) $m->sort_order];
    }

    /** Everything on an owner for its own team (private items have no address here: they are fetched through download()), or only the public items for a visitor. */
    public function list(string $ownerType, int $ownerId, bool $team): array
    {
        return DB::table('event_media')->where(['owner_type' => $this->owner($ownerType), 'owner_id' => $ownerId])->when(! $team, fn ($q) => $q->where('visibility', 'public'))->orderBy('sort_order')->orderBy('id')->get()
            ->map(fn ($m) => $this->shape($m))->all();
    }

    public function find(int $id): ?object
    {
        return DB::table('event_media')->where('id', $id)->first();
    }

    public function update(int $id, array $in): array
    {
        $m = $this->find($id) ?? abort(404);
        $row = array_filter(['title' => $in['title'] ?? null, 'caption' => $in['caption'] ?? null], fn ($v) => $v !== null);
        if (isset($in['role']) && in_array($in['role'], self::ROLES, true)) {
            $row['role'] = $in['role'];
            if ($in['role'] === 'cover') {
                DB::table('event_media')->where(['owner_type' => $m->owner_type, 'owner_id' => $m->owner_id, 'role' => 'cover'])->where('id', '!=', $id)->update(['role' => 'gallery']);
            }
        }
        if (isset($in['visibility']) && in_array($in['visibility'], ['public', 'private'], true) && $m->kind !== 'document' && $m->kind !== 'embed') {
            $row['visibility'] = $in['visibility'];
            if ($in['visibility'] !== $m->visibility && $m->path) {   // the file moves with it, so a private file is never left where a public link reaches it
                $from = $this->disk($m->visibility, $m->kind);
                $to = $this->disk($in['visibility'], $m->kind);
                if ($from !== $to && Storage::disk($from)->exists($m->path)) {
                    Storage::disk($to)->put($m->path, Storage::disk($from)->get($m->path));
                    Storage::disk($from)->delete($m->path);
                }
            }
        }
        DB::table('event_media')->where('id', $id)->update($row + ['updated_at' => now()]);
        $this->syncEventPicture($m->owner_type, (int) $m->owner_id);

        return $this->shape($this->find($id));
    }

    public function remove(int $id): void
    {
        $m = $this->find($id);
        if (! $m) {
            return;
        }
        if ($m->path) {
            Storage::disk($this->disk($m->visibility, $m->kind))->delete($m->path);
        }
        DB::table('event_media')->where('id', $id)->delete();
    }

    /** Put the items in this order. */
    public function reorder(string $ownerType, int $ownerId, array $ids): void
    {
        foreach (array_values($ids) as $i => $id) {
            DB::table('event_media')->where(['owner_type' => $ownerType, 'owner_id' => $ownerId, 'id' => (int) $id])->update(['sort_order' => $i + 1]);
        }
    }

    /** The bytes of a private file, for the owner's team. */
    public function download(object $m)
    {
        $disk = $this->disk($m->visibility, $m->kind);
        abort_unless($m->path && Storage::disk($disk)->exists($m->path), 404);

        return Storage::disk($disk)->download($m->path, ($m->title ?: 'file') . '.' . pathinfo($m->path, PATHINFO_EXTENSION));
    }
}

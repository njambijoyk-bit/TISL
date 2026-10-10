<?php

namespace App\Services;

use Illuminate\Database\Eloquent\Model;
use App\Services\Campaigns\VideoEmbed;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * A video for a service or a product. The video_url column (services, products) holds either a link (YouTube, Vimeo, TikTok or Facebook, checked and turned into a safe embed address)
 * or the path of a file staff uploaded (it starts with /storage/). Replacing or removing a video deletes the old uploaded file.
 */
class ServiceVideo
{
    public const MAX_KB = 102400;   // 100 MB

    /** @return array{kind:string,url:string,embed_url:?string,provider:?string,thumb:?string}|null */
    public static function describe(?string $stored): ?array
    {
        $stored = trim((string) $stored);
        if ($stored === '') {
            return null;
        }
        if (str_starts_with($stored, '/storage/')) {
            return ['kind' => 'upload', 'url' => asset($stored), 'embed_url' => null, 'provider' => null, 'thumb' => null];
        }
        try {
            $v = VideoEmbed::parse($stored);

            return ['kind' => 'embed', 'url' => $v['url'], 'embed_url' => $v['embed_url'], 'provider' => $v['provider'], 'thumb' => $v['thumb']];
        } catch (ValidationException) {
            return null;   // an old value that is not a supported link any more
        }
    }

    public function setLink(Model $s, string $url): Model
    {
        $v = VideoEmbed::parse($url);   // throws a validation error with the reason
        $this->forgetFile($s);
        $s->forceFill(['video_url' => $v['url']])->save();

        return $s->fresh();
    }

    public function setFile(Model $s, UploadedFile $file): Model
    {
        $path = '/storage/' . $file->store($s->getTable() . '/video', 'public');
        $this->forgetFile($s);
        $s->forceFill(['video_url' => $path])->save();

        return $s->fresh();
    }

    public function remove(Model $s): Model
    {
        $this->forgetFile($s);
        $s->forceFill(['video_url' => null])->save();

        return $s->fresh();
    }

    private function forgetFile(Model $s): void
    {
        $old = (string) $s->video_url;
        if (str_starts_with($old, '/storage/' . $s->getTable() . '/video/')) {
            Storage::disk('public')->delete(substr($old, strlen('/storage/')));
        }
    }
}

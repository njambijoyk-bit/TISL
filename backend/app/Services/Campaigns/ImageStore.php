<?php

namespace App\Services\Campaigns;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Stores an uploaded picture for a pin: the original, its true width and height (so a grid can hold the space before it loads),
 * and a 640-pixel-wide thumbnail made with GD when the server has it (a phone photo's rotation is applied, because a thumbnail loses it).
 * Without GD the original is used as its own thumbnail.
 */
class ImageStore
{
    public const THUMB_WIDTH = 640;

    /** @return array{path:string,thumb:string,width:?int,height:?int} paths as served by the public disk (/storage/...) */
    public function store(UploadedFile $file, string $dir = 'campaigns/pins'): array
    {
        $disk = Storage::disk('public');
        $stored = $file->store($dir, 'public');
        $full = $disk->path($stored);
        $info = @getimagesize($full) ?: [null, null];
        [$w, $h] = [$info[0], $info[1]];
        $thumb = $stored;

        if (function_exists('imagecreatetruecolor') && $w && $h) {
            try {
                $made = $this->makeThumb($full, $info[2] ?? 0, $w, $h);
                if ($made) {
                    [$thumbPath, $w, $h] = $made;
                    $thumb = $thumbPath;
                }
            } catch (\Throwable) {
                // keep the original as its own thumbnail
            }
        }

        return ['path' => Storage::url($stored), 'thumb' => Storage::url($thumb), 'width' => $w, 'height' => $h];
    }

    /** @return array{0:string,1:int,2:int}|null thumb path on the disk, and the picture's width and height as people see it */
    private function makeThumb(string $full, int $type, int $w, int $h): ?array
    {
        $src = match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($full),
            IMAGETYPE_PNG => @imagecreatefrompng($full),
            IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($full) : false,
            default => false,
        };
        if (! $src) {
            return null;
        }
        if ($type === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $o = @exif_read_data($full)['Orientation'] ?? 1;
            $angle = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
            if ($angle) {
                $src = imagerotate($src, $angle, 0);
                if (in_array($o, [6, 8], true)) {
                    [$w, $h] = [$h, $w];
                }
            }
        }
        $tw = min(self::THUMB_WIDTH, $w);
        $th = (int) round($h * ($tw / $w));
        $dst = imagecreatetruecolor($tw, $th);
        if ($type === IMAGETYPE_PNG || $type === IMAGETYPE_WEBP) {
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
        }
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $tw, $th, imagesx($src), imagesy($src));
        $ext = $type === IMAGETYPE_PNG ? 'png' : ($type === IMAGETYPE_WEBP && function_exists('imagewebp') ? 'webp' : 'jpg');
        $rel = 'campaigns/pins/thumbs/' . bin2hex(random_bytes(10)) . '.' . $ext;
        Storage::disk('public')->makeDirectory('campaigns/pins/thumbs');
        $out = Storage::disk('public')->path($rel);
        match ($ext) { 'png' => imagepng($dst, $out, 6), 'webp' => imagewebp($dst, $out, 82), default => imagejpeg($dst, $out, 82) };
        imagedestroy($src);
        imagedestroy($dst);

        return [$rel, $w, $h];
    }
}

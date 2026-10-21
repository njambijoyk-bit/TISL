<?php

namespace App\Services\Tenders;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Process\Process;

/**
 * Turns an uploaded certificate (a PDF or photos) into plain page images, and keeps only those.
 * The uploaded file itself is never stored or served: a PDF is drawn page by page, a photo is decoded and drawn again as a fresh JPEG.
 * Whatever was hidden in the original (scripts, embedded files, odd metadata) does not survive, and anything that is not really a PDF or a JPEG, PNG or WebP picture is refused
 * whatever its name says.
 */
class SafeScan
{
    public const MAX_FILES = 6;
    public const MAX_PAGES = 10;
    public const MAX_BYTES = 10 * 1024 * 1024;
    private const MAX_PIXELS = 40_000_000;   // refuses "decompression bombs": tiny files that open into enormous pictures
    private const LONG_SIDE = 1800;

    /** @param array<int, UploadedFile> $files @return array<int, string> storage paths of the page images (disk 'local') */
    public function render(array $files, string $dir): array
    {
        if (count($files) < 1 || count($files) > self::MAX_FILES) {
            $this->fail('Upload between 1 and ' . self::MAX_FILES . ' files.');
        }

        $pages = [];
        $tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'scan_' . Str::random(16);
        mkdir($tmp, 0700, true);

        try {
            foreach ($files as $file) {
                if (! $file->isValid() || $file->getSize() > self::MAX_BYTES) {
                    $this->fail('Each file must be under ' . (self::MAX_BYTES / 1048576) . ' MB.');
                }
                $bytes = file_get_contents($file->getRealPath());
                if (str_starts_with($bytes, '%PDF-')) {
                    foreach ($this->pdfPages($file->getRealPath(), $tmp, self::MAX_PAGES - count($pages)) as $img) {
                        $pages[] = $this->redraw(file_get_contents($img));
                    }
                } else {
                    $pages[] = $this->redraw($bytes);
                }
                if (count($pages) > self::MAX_PAGES) {
                    $this->fail('At most ' . self::MAX_PAGES . ' pages in total.');
                }
            }
        } finally {
            foreach (glob($tmp . DIRECTORY_SEPARATOR . '*') ?: [] as $f) {
                @unlink($f);
            }
            @rmdir($tmp);
        }

        $paths = [];
        foreach ($pages as $jpeg) {
            $paths[] = $path = $dir . '/' . Str::random(32) . '.jpg';
            Storage::disk('local')->put($path, $jpeg);
        }

        return $paths;
    }

    /** Draws a picture again as a plain JPEG: decoded to pixels and re-encoded, so nothing but the pixels is kept. */
    private function redraw(string $bytes): string
    {
        $info = @getimagesizefromstring($bytes);
        if (! $info || ! in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
            $this->fail('Only PDF files and JPG, PNG or WebP pictures are accepted.');
        }
        if ($info[0] * $info[1] > self::MAX_PIXELS) {
            $this->fail('That picture is too large. Take a smaller photo or scan at a lower resolution.');
        }
        $src = @imagecreatefromstring($bytes);
        if (! $src) {
            $this->fail('That file could not be read as a picture.');
        }
        [$w, $h] = [imagesx($src), imagesy($src)];
        $scale = min(1, self::LONG_SIDE / max($w, $h));
        [$nw, $nh] = [max(1, (int) round($w * $scale)), max(1, (int) round($h * $scale))];
        $dst = imagecreatetruecolor($nw, $nh);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));   // transparent areas become white
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        ob_start();
        imagejpeg($dst, null, 82);
        $out = (string) ob_get_clean();
        imagedestroy($src);
        imagedestroy($dst);

        return $out;
    }

    /** @return array<int, string> temp image paths, one per page */
    private function pdfPages(string $pdf, string $tmp, int $limit): array
    {
        if ($limit < 1) {
            $this->fail('At most ' . self::MAX_PAGES . ' pages in total.');
        }
        $in = $tmp . DIRECTORY_SEPARATOR . Str::random(10) . '.pdf';
        copy($pdf, $in);
        $prefix = $tmp . DIRECTORY_SEPARATOR . Str::random(10);

        if ($this->hasBinary('pdftoppm')) {
            $p = new Process(['pdftoppm', '-jpeg', '-r', '110', '-l', (string) ($limit + 1), $in, $prefix]);
            $p->setTimeout(40);
            $p->run();
            $made = glob($prefix . '*.jpg') ?: [];
            sort($made);
        } elseif (extension_loaded('imagick')) {
            $made = [];
            try {
                $im = new \Imagick();
                $im->setResolution(110, 110);
                $im->readImage($in);
                foreach ($im as $i => $page) {
                    if ($i > $limit) {
                        break;
                    }
                    $page->setImageFormat('jpeg');
                    $made[] = $f = $prefix . "-{$i}.jpg";
                    $page->writeImage($f);
                }
                $im->clear();
            } catch (\Throwable) {
                $made = [];
            }
        } else {
            $this->fail('This server cannot read PDF files yet. Please upload a photo or screenshot (JPG or PNG) of each page instead.');
        }

        if (! $made) {
            $this->fail('That PDF could not be read. Please upload photos or screenshots (JPG or PNG) of each page instead.');
        }
        if (count($made) > $limit) {
            $this->fail('At most ' . self::MAX_PAGES . ' pages in total.');
        }

        return $made;
    }

    private function hasBinary(string $name): bool
    {
        $p = new Process(PHP_OS_FAMILY === 'Windows' ? ['where', $name] : ['which', $name]);
        $p->run();

        return $p->isSuccessful();
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['files' => $message]);
    }
}

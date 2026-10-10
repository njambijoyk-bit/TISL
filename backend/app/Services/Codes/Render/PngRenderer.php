<?php

namespace App\Services\Codes\Render;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;

/** Draws a BitMatrix as a PNG (for emails and PDFs, which do not always take SVG). `scale` is the pixels in one square. */
final class PngRenderer
{
    /** @param array{quiet?: int, scale?: int, fg?: string, bg?: string} $o */
    public static function render(BitMatrix $m, array $o = []): string
    {
        if (! function_exists('imagecreatetruecolor')) {
            throw new CodeException('PNG output needs the GD extension on the server; SVG still works.');
        }
        $quiet = $o['quiet'] ?? 4;
        $scale = max(1, (int) ($o['scale'] ?? 8));
        $w = ($m->width + 2 * $quiet) * $scale;
        $h = ($m->height + 2 * $quiet) * $scale;
        $img = imagecreatetruecolor($w, $h);
        $bg = self::alloc($img, $o['bg'] ?? '#ffffff');
        $fg = self::alloc($img, $o['fg'] ?? '#000000');
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, $bg);
        foreach ($m->rows() as $y => $row) {
            foreach ($row as $x => $dark) {
                if ($dark) {
                    imagefilledrectangle($img, ($x + $quiet) * $scale, ($y + $quiet) * $scale, ($x + $quiet + 1) * $scale - 1, ($y + $quiet + 1) * $scale - 1, $fg);
                }
            }
        }
        ob_start();
        imagepng($img);
        $png = (string) ob_get_clean();
        imagedestroy($img);

        return $png;
    }

    private static function alloc($img, string $hex): int
    {
        if (! preg_match('/^#([0-9a-fA-F]{6})$/', $hex, $m)) {
            throw new CodeException('A colour must look like #000000.');
        }

        return imagecolorallocate($img, hexdec(substr($m[1], 0, 2)), hexdec(substr($m[1], 2, 2)), hexdec(substr($m[1], 4, 2)));
    }
}

<?php

namespace App\Services\Codes\Render;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;
use App\Services\Codes\Linear\LinearCode;

/** Draws a BitMatrix as a PNG (for emails and PDFs, which do not always take SVG). `scale` is the pixels in one square. */
final class PngRenderer
{
    /** @param array{quiet?: int, scale?: int, scaleY?: int, fg?: string, bg?: string} $o  `scaleY` is the pixel height of one square (default = `scale`) */
    public static function render(BitMatrix $m, array $o = []): string
    {
        if (! function_exists('imagecreatetruecolor')) {
            throw new CodeException('PNG output needs the GD extension on the server; SVG still works.');
        }
        $quiet = $o['quiet'] ?? 4;
        $scale = max(1, (int) ($o['scale'] ?? 8));
        $sy = max(1, (int) ($o['scaleY'] ?? $scale));
        $w = ($m->width + 2 * $quiet) * $scale;
        $h = $m->height * $sy + 2 * $quiet * $scale;
        $img = imagecreatetruecolor($w, $h);
        $bg = self::alloc($img, $o['bg'] ?? '#ffffff');
        $fg = self::alloc($img, $o['fg'] ?? '#000000');
        imagefilledrectangle($img, 0, 0, $w - 1, $h - 1, $bg);
        foreach ($m->rows() as $y => $row) {
            foreach ($row as $x => $dark) {
                if ($dark) {
                    imagefilledrectangle($img, ($x + $quiet) * $scale, $quiet * $scale + $y * $sy, ($x + $quiet + 1) * $scale - 1, $quiet * $scale + ($y + 1) * $sy - 1, $fg);
                }
            }
        }
        ob_start();
        imagepng($img);
        $png = (string) ob_get_clean();
        imagedestroy($img);

        return $png;
    }

    /** A barcode as a PNG: `scale` pixels per narrow bar, `height` pixels of bars, the digits under them in the built-in font. @param array{scale?: int, height?: int, fg?: string, bg?: string, text?: bool} $o */
    public static function linear(LinearCode $c, array $o = []): string
    {
        if (! function_exists('imagecreatetruecolor')) {
            throw new CodeException('PNG output needs the GD extension on the server; SVG still works.');
        }
        $scale = max(1, (int) ($o['scale'] ?? 3));
        $height = max(10, (int) ($o['height'] ?? 90));
        $showText = ($o['text'] ?? true) && $c->captions !== [];
        $band = $showText ? 18 : 0;
        $w = ($c->quietLeft + $c->bars->width + $c->quietRight) * $scale;
        $img = imagecreatetruecolor($w, $height + $band);
        $bg = self::alloc($img, $o['bg'] ?? '#ffffff');
        $fg = self::alloc($img, $o['fg'] ?? '#000000');
        imagefilledrectangle($img, 0, 0, $w - 1, $height + $band - 1, $bg);
        foreach ($c->bars->rows()[0] as $x => $dark) {
            if ($dark) {
                imagefilledrectangle($img, ($x + $c->quietLeft) * $scale, 0, ($x + $c->quietLeft + 1) * $scale - 1, $height - 1, $fg);
            }
        }
        if ($showText) {
            foreach ($c->captions as $cap) {
                $mid = ($c->quietLeft + ($cap['from'] + $cap['to']) / 2) * $scale;
                imagestring($img, 3, (int) round($mid - strlen($cap['text']) * 3), $height + 2, $cap['text'], $fg);
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

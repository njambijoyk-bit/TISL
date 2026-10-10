<?php

namespace App\Services\Codes\Render;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\Linear\LinearCode;

/**
 * Draws a BitMatrix as SVG: one path, neighbouring dark squares merged into bars, so it stays small and sharp at any print size. `quiet` is the blank border in squares
 * (QR needs 4, Data Matrix 1, a barcode about 10 bar widths). `unit` is the size of one square in the picture's own units (it scales to any size on the page).
 */
final class SvgRenderer
{
    /**
     * @param  array{quiet?: int, unit?: float, unitY?: float, fg?: string, bg?: ?string, title?: ?string}  $o  `unitY` is the height of one square (default = `unit`; a PDF417 row is 3 high)
     */
    public static function render(BitMatrix $m, array $o = []): string
    {
        $quiet = $o['quiet'] ?? 4;
        $unit = $o['unit'] ?? 1;
        $unitY = $o['unitY'] ?? $unit;
        $fg = self::colour($o['fg'] ?? '#000000');
        $bg = isset($o['bg']) || array_key_exists('bg', $o) ? ($o['bg'] === null ? null : self::colour($o['bg'])) : '#ffffff';
        $w = ($m->width + 2 * $quiet) * $unit;
        $h = $m->height * $unitY + 2 * $quiet * $unit;
        $d = '';
        foreach ($m->rows() as $y => $row) {
            $x = 0;
            while ($x < $m->width) {
                if (! $row[$x]) {
                    $x++;
                    continue;
                }
                $start = $x;
                while ($x < $m->width && $row[$x]) {
                    $x++;
                }
                $d .= 'M' . self::n(($start + $quiet) * $unit) . ' ' . self::n($y * $unitY + $quiet * $unit) . 'h' . self::n(($x - $start) * $unit) . 'v' . self::n($unitY) . 'h-' . self::n(($x - $start) * $unit) . 'z';
            }
        }
        $title = isset($o['title']) && $o['title'] !== '' ? '<title>' . htmlspecialchars($o['title'], ENT_XML1) . '</title>' : '';

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . self::n($w) . ' ' . self::n($h) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" role="img">'
            . $title . ($bg !== null ? '<rect width="100%" height="100%" fill="' . $bg . '"/>' : '') . '<path fill="' . $fg . '" shape-rendering="crispEdges" d="' . $d . '"/></svg>';
    }

    /**
     * A barcode: bars of the given height with the digits printed under them. `unit` is the width of the narrowest bar in the picture's units (the picture scales to any size).
     *
     * @param  array{unit?: float, height?: float, fg?: string, bg?: ?string, text?: bool, fontSize?: float, title?: ?string}  $o
     */
    public static function linear(LinearCode $c, array $o = []): string
    {
        $unit = $o['unit'] ?? 2;
        $height = $o['height'] ?? 60;
        $fg = self::colour($o['fg'] ?? '#000000');
        $bg = array_key_exists('bg', $o) ? ($o['bg'] === null ? null : self::colour($o['bg'])) : '#ffffff';
        $showText = ($o['text'] ?? true) && $c->captions !== [];
        $font = $o['fontSize'] ?? $unit * 5;
        $textBand = $showText ? $font * 1.35 : 0;
        $w = ($c->quietLeft + $c->bars->width + $c->quietRight) * $unit;
        $h = $height + $textBand;
        $row = $c->bars->rows()[0];
        $d = '';
        for ($x = 0; $x < $c->bars->width;) {
            if (! $row[$x]) {
                $x++;
                continue;
            }
            $start = $x;
            while ($x < $c->bars->width && $row[$x]) {
                $x++;
            }
            $d .= 'M' . self::n(($start + $c->quietLeft) * $unit) . ' 0h' . self::n(($x - $start) * $unit) . 'v' . self::n($height) . 'h-' . self::n(($x - $start) * $unit) . 'z';
        }
        $text = '';
        if ($showText) {
            foreach ($c->captions as $cap) {
                $from = ($c->quietLeft + $cap['from']) * $unit;
                $len = ($cap['to'] - $cap['from']) * $unit;
                // retail digits are spread to sit under their half of the code; other text keeps its natural look and is only squeezed when it would be wider than the bars
                $retail = in_array($c->format, ['ean13', 'ean8', 'upca', 'upce'], true);
                $squeeze = $retail ? ' textLength="' . self::n($len) . '" lengthAdjust="spacing"' : (strlen($cap['text']) * $font * 0.62 > $len ? ' textLength="' . self::n($len) . '" lengthAdjust="spacingAndGlyphs"' : '');
                $text .= '<text x="' . self::n($from + $len / 2) . '" y="' . self::n($height + $font * 1.05) . '" text-anchor="middle"' . $squeeze . '>' . htmlspecialchars($cap['text'], ENT_XML1) . '</text>';
            }
            $text = '<g fill="' . $fg . '" font-family="Arial, Helvetica, sans-serif" font-size="' . self::n($font) . '">' . $text . '</g>';
        }
        $title = isset($o['title']) && $o['title'] !== '' ? '<title>' . htmlspecialchars($o['title'], ENT_XML1) . '</title>' : '';

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . self::n($w) . ' ' . self::n($h) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" role="img">'
            . $title . ($bg !== null ? '<rect width="100%" height="100%" fill="' . $bg . '"/>' : '') . '<path fill="' . $fg . '" shape-rendering="crispEdges" d="' . $d . '"/>' . $text . '</svg>';
    }

    private static function n(float|int $v): string
    {
        return rtrim(rtrim(number_format($v, 3, '.', ''), '0'), '.');
    }

    private static function colour(string $c): string
    {
        if (! preg_match('/^#[0-9a-fA-F]{3,8}$/', $c)) {
            throw new \App\Services\Codes\CodeException('A colour must look like #000000.');
        }

        return $c;
    }
}

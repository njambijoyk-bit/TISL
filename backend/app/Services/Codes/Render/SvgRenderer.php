<?php

namespace App\Services\Codes\Render;

use App\Services\Codes\BitMatrix;

/**
 * Draws a BitMatrix as SVG: one path, neighbouring dark squares merged into bars, so it stays small and sharp at any print size. `quiet` is the blank border in squares
 * (QR needs 4, Data Matrix 1, a barcode about 10 bar widths). `unit` is the size of one square in the picture's own units (it scales to any size on the page).
 */
final class SvgRenderer
{
    /**
     * @param  array{quiet?: int, unit?: float, fg?: string, bg?: ?string, title?: ?string, barHeight?: ?float}  $o
     */
    public static function render(BitMatrix $m, array $o = []): string
    {
        $quiet = $o['quiet'] ?? 4;
        $unit = $o['unit'] ?? 1;
        $fg = self::colour($o['fg'] ?? '#000000');
        $bg = isset($o['bg']) || array_key_exists('bg', $o) ? ($o['bg'] === null ? null : self::colour($o['bg'])) : '#ffffff';
        $w = ($m->width + 2 * $quiet) * $unit;
        $h = ($m->height + 2 * $quiet) * $unit;
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
                $d .= 'M' . self::n(($start + $quiet) * $unit) . ' ' . self::n(($y + $quiet) * $unit) . 'h' . self::n(($x - $start) * $unit) . 'v' . self::n($unit) . 'h-' . self::n(($x - $start) * $unit) . 'z';
            }
        }
        $title = isset($o['title']) && $o['title'] !== '' ? '<title>' . htmlspecialchars($o['title'], ENT_XML1) . '</title>' : '';

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . self::n($w) . ' ' . self::n($h) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" shape-rendering="crispEdges" role="img">'
            . $title . ($bg !== null ? '<rect width="100%" height="100%" fill="' . $bg . '"/>' : '') . '<path fill="' . $fg . '" d="' . $d . '"/></svg>';
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

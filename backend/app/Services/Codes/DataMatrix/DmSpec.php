<?php

namespace App\Services\Codes\DataMatrix;

/** The sizes of Data Matrix ECC 200 (ISO/IEC 16022): how many data and error-correction codewords each holds, in how many interleaved blocks and how many regions. */
final class DmSpec
{
    /** rows, cols, regions down, regions across, data codewords, error-correction codewords, blocks */
    public const SIZES = [
        [10, 10, 1, 1, 3, 5, 1], [12, 12, 1, 1, 5, 7, 1], [14, 14, 1, 1, 8, 10, 1], [16, 16, 1, 1, 12, 12, 1], [18, 18, 1, 1, 18, 14, 1], [20, 20, 1, 1, 22, 18, 1],
        [22, 22, 1, 1, 30, 20, 1], [24, 24, 1, 1, 36, 24, 1], [26, 26, 1, 1, 44, 28, 1], [32, 32, 2, 2, 62, 36, 1], [36, 36, 2, 2, 86, 42, 1], [40, 40, 2, 2, 114, 48, 1],
        [44, 44, 2, 2, 144, 56, 1], [48, 48, 2, 2, 174, 68, 1], [52, 52, 2, 2, 204, 84, 2], [64, 64, 4, 4, 280, 112, 2], [72, 72, 4, 4, 368, 144, 4], [80, 80, 4, 4, 456, 192, 4],
        [88, 88, 4, 4, 576, 224, 4], [96, 96, 4, 4, 696, 272, 4], [104, 104, 4, 4, 816, 336, 6], [120, 120, 6, 6, 1050, 408, 6], [132, 132, 6, 6, 1304, 496, 8], [144, 144, 6, 6, 1558, 620, 10],
        [8, 18, 1, 1, 5, 7, 1], [8, 32, 1, 2, 10, 11, 1], [12, 26, 1, 1, 16, 14, 1], [12, 36, 1, 2, 22, 18, 1], [16, 36, 1, 2, 32, 24, 1], [16, 48, 1, 2, 49, 28, 1],
    ];

    /** @return array{rows: int, cols: int, vr: int, hr: int, data: int, ecc: int, blocks: int, regionH: int, regionW: int, nrow: int, ncol: int} */
    public static function describe(array $s): array
    {
        [$rows, $cols, $vr, $hr, $data, $ecc, $blocks] = $s;
        $regionH = intdiv($rows, $vr) - 2;
        $regionW = intdiv($cols, $hr) - 2;

        return ['rows' => $rows, 'cols' => $cols, 'vr' => $vr, 'hr' => $hr, 'data' => $data, 'ecc' => $ecc, 'blocks' => $blocks, 'regionH' => $regionH, 'regionW' => $regionW, 'nrow' => $regionH * $vr, 'ncol' => $regionW * $hr];
    }

    /** the sizes, smallest data capacity first; `$shape` is square, rectangle or any */
    public static function candidates(string $shape = 'square'): array
    {
        $all = array_map([self::class, 'describe'], self::SIZES);
        $all = array_values(array_filter($all, fn ($d) => $shape === 'any' || ($shape === 'square') === ($d['rows'] === $d['cols'])));
        usort($all, fn ($a, $b) => [$a['data'], $a['rows'] * $a['cols'], $a['rows'] === $a['cols'] ? 0 : 1] <=> [$b['data'], $b['rows'] * $b['cols'], $b['rows'] === $b['cols'] ? 0 : 1]);   // a square wins a tie

        return $all;
    }

    public static function bySize(int $rows, int $cols): ?array
    {
        foreach (self::SIZES as $s) {
            if ($s[0] === $rows && $s[1] === $cols) {
                return self::describe($s);
            }
        }

        return null;
    }
}

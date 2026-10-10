<?php

namespace App\Services\Codes\Qr;

/** The numbers the QR standard (ISO/IEC 18004) fixes: error-correction levels, how many blocks and codewords each version holds, and where the patterns go. */
final class QrSpec
{
    public const LEVELS = ['L', 'M', 'Q', 'H'];

    /** the two format bits of each level */
    public const FORMAT_BITS = ['L' => 1, 'M' => 0, 'Q' => 3, 'H' => 2];

    public const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

    /** error-correction codewords per block, [level][version] (index 0 unused) */
    private const ECC_PER_BLOCK = [
        'L' => [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        'M' => [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
        'Q' => [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        'H' => [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    ];

    /** number of blocks, [level][version] */
    private const BLOCKS = [
        'L' => [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
        'M' => [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
        'Q' => [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
        'H' => [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
    ];

    public static function size(int $version): int
    {
        return $version * 4 + 17;
    }

    public static function eccPerBlock(string $level, int $version): int
    {
        return self::ECC_PER_BLOCK[$level][$version];
    }

    public static function blocks(string $level, int $version): int
    {
        return self::BLOCKS[$level][$version];
    }

    /** every module that is not a pattern, in bits */
    public static function rawModules(int $version): int
    {
        $n = (16 * $version + 128) * $version + 64;
        if ($version >= 2) {
            $a = intdiv($version, 7) + 2;
            $n -= (25 * $a - 10) * $a - 55;
            if ($version >= 7) {
                $n -= 36;
            }
        }

        return $n;
    }

    /** codewords (bytes) that carry the message, after the error-correction ones */
    public static function dataCodewords(string $level, int $version): int
    {
        return intdiv(self::rawModules($version), 8) - self::eccPerBlock($level, $version) * self::blocks($level, $version);
    }

    /** @return int[] where the alignment patterns' centres lie (one axis) */
    public static function alignmentPositions(int $version): array
    {
        if ($version === 1) {
            return [];
        }
        $n = intdiv($version, 7) + 2;
        $size = self::size($version);
        $step = $version === 32 ? 26 : intdiv($version * 4 + $n * 2 + 1, $n * 2 - 2) * 2;
        $out = [6];
        for ($i = $n - 2; $i >= 0; $i--) {
            $out[] = $size - 7 - $i * $step;
        }

        return $out;
    }

    /** bits of the character count that follows the mode indicator */
    public static function countBits(string $mode, int $version): int
    {
        $i = $version <= 9 ? 0 : ($version <= 26 ? 1 : 2);

        return ['numeric' => [10, 12, 14], 'alnum' => [9, 11, 13], 'byte' => [8, 16, 16]][$mode][$i];
    }

    public const MODE_BITS = ['numeric' => 0b0001, 'alnum' => 0b0010, 'byte' => 0b0100];
}

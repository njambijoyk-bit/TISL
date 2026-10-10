<?php

namespace App\Services\Codes\Qr;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;
use App\Services\Codes\Gf256;

/**
 * Our own QR encoder (ISO/IEC 18004, model 2): text in, the squares out. Numeric, alphanumeric and byte (UTF-8) modes, versions 1 to 40, levels L M Q H, all eight masks
 * (the one with the lowest penalty is used). The whole text is one segment in the most compact mode that can hold it.
 */
final class QrEncoder
{
    /**
     * @param  string  $level  L (7%), M (15%), Q (25%) or H (30%) of the code can be damaged and still read
     * @param  ?int  $minVersion  make it at least this big (1 to 40); null = as small as fits
     * @param  ?int  $mask  force a mask (0 to 7); null = choose the best
     */
    public static function encode(string $text, string $level = 'M', ?int $minVersion = null, ?int $mask = null): QrCode
    {
        if (! in_array($level, QrSpec::LEVELS, true)) {
            throw new CodeException('The error-correction level must be L, M, Q or H.');
        }
        if ($mask !== null && ($mask < 0 || $mask > 7)) {
            throw new CodeException('The mask must be 0 to 7.');
        }
        $minVersion ??= 1;
        if ($minVersion < 1 || $minVersion > 40) {
            throw new CodeException('The version must be 1 to 40.');
        }
        $mode = self::modeFor($text);
        $count = strlen($text);
        $version = null;
        for ($v = $minVersion; $v <= 40; $v++) {
            $bits = 4 + QrSpec::countBits($mode, $v) + self::payloadBits($mode, $count);
            if ($bits <= QrSpec::dataCodewords($level, $v) * 8) {
                $version = $v;
                break;
            }
        }
        if ($version === null) {
            throw new CodeException('That is too much to fit in a QR code (' . strlen($text) . ' characters at level ' . $level . ').');
        }

        $bits = [];
        self::append($bits, QrSpec::MODE_BITS[$mode], 4);
        self::append($bits, $count, QrSpec::countBits($mode, $version));
        self::payload($bits, $mode, $text);
        $capacity = QrSpec::dataCodewords($level, $version) * 8;
        self::append($bits, 0, min(4, $capacity - count($bits)));   // terminator
        while (count($bits) % 8 !== 0) {
            $bits[] = 0;
        }
        for ($pad = 0xEC; count($bits) < $capacity; $pad ^= 0xEC ^ 0x11) {
            self::append($bits, $pad, 8);
        }
        $data = [];
        foreach (array_chunk($bits, 8) as $byte) {
            $data[] = bindec(implode('', $byte));
        }

        $codewords = self::addErrorCorrection($data, $level, $version);
        $layout = new QrLayout($version, $level);
        $order = $layout->dataOrder();
        foreach ($order as $i => [$x, $y]) {
            $layout->modules[$y][$x] = $i < count($codewords) * 8 && ((($codewords[$i >> 3] >> (7 - ($i & 7))) & 1) === 1);
        }

        $best = $mask;
        if ($best === null) {
            $lowest = PHP_INT_MAX;
            for ($m = 0; $m < 8; $m++) {
                self::applyMask($layout, $m);
                $layout->formatBits($m);
                $p = self::penalty($layout->modules, $layout->size);
                if ($p < $lowest) {
                    $lowest = $p;
                    $best = $m;
                }
                self::applyMask($layout, $m);   // undo
            }
        }
        self::applyMask($layout, $best);
        $layout->formatBits($best);

        return new QrCode(new BitMatrix($layout->size, $layout->size, $layout->modules), $version, $level, $best, $mode);
    }

    public static function modeFor(string $text): string
    {
        if ($text !== '' && ctype_digit($text)) {
            return 'numeric';
        }
        if ($text !== '' && strspn($text, QrSpec::ALNUM) === strlen($text)) {
            return 'alnum';
        }

        return 'byte';
    }

    private static function payloadBits(string $mode, int $n): int
    {
        return match ($mode) {
            'numeric' => intdiv($n, 3) * 10 + [0, 4, 7][$n % 3],
            'alnum' => intdiv($n, 2) * 11 + ($n % 2) * 6,
            'byte' => $n * 8,
        };
    }

    /** @param int[] $bits */
    private static function payload(array &$bits, string $mode, string $text): void
    {
        if ($mode === 'byte') {
            foreach (str_split($text) as $ch) {
                self::append($bits, ord($ch), 8);
            }

            return;
        }
        if ($mode === 'numeric') {
            foreach (str_split($text, 3) as $g) {
                self::append($bits, (int) $g, [1 => 4, 2 => 7, 3 => 10][strlen($g)]);
            }

            return;
        }
        foreach (str_split($text, 2) as $g) {
            $a = strpos(QrSpec::ALNUM, $g[0]);
            self::append($bits, strlen($g) === 2 ? $a * 45 + strpos(QrSpec::ALNUM, $g[1]) : $a, strlen($g) === 2 ? 11 : 6);
        }
    }

    /** @param int[] $bits */
    private static function append(array &$bits, int $value, int $len): void
    {
        for ($i = $len - 1; $i >= 0; $i--) {
            $bits[] = ($value >> $i) & 1;
        }
    }

    /**
     * Split the data into blocks, work out each block's error-correction codewords and interleave them as the standard says.
     *
     * @param  int[]  $data
     * @return int[]
     */
    public static function addErrorCorrection(array $data, string $level, int $version): array
    {
        $blocks = QrSpec::blocks($level, $version);
        $eccLen = QrSpec::eccPerBlock($level, $version);
        $raw = intdiv(QrSpec::rawModules($version), 8);
        $short = $blocks - $raw % $blocks;
        $shortLen = intdiv($raw, $blocks);
        $gf = Gf256::for(0x11D);
        $dataBlocks = [];
        $eccBlocks = [];
        $k = 0;
        for ($i = 0; $i < $blocks; $i++) {
            $len = $shortLen - $eccLen + ($i < $short ? 0 : 1);
            $d = array_slice($data, $k, $len);
            $k += $len;
            $dataBlocks[] = $d;
            $eccBlocks[] = $gf->remainder($d, $eccLen);
        }
        $out = [];
        for ($i = 0; $i < $shortLen - $eccLen + 1; $i++) {
            foreach ($dataBlocks as $j => $d) {
                if ($i !== $shortLen - $eccLen || $j >= $short) {
                    $out[] = $d[$i];
                }
            }
        }
        for ($i = 0; $i < $eccLen; $i++) {
            foreach ($eccBlocks as $e) {
                $out[] = $e[$i];
            }
        }

        return $out;
    }

    private static function applyMask(QrLayout $l, int $mask): void
    {
        for ($y = 0; $y < $l->size; $y++) {
            for ($x = 0; $x < $l->size; $x++) {
                if (! $l->fixed[$y][$x] && QrLayout::maskApplies($mask, $x, $y)) {
                    $l->modules[$y][$x] = ! $l->modules[$y][$x];
                }
            }
        }
    }

    /** How hard the pattern is for a reader (runs, blocks, lookalike finders, balance): lower is better. @param array<int, array<int, bool>> $m */
    private static function penalty(array $m, int $n): int
    {
        $score = 0;
        $dark = 0;
        foreach ([false, true] as $transpose) {
            for ($a = 0; $a < $n; $a++) {
                $line = [];
                for ($b = 0; $b < $n; $b++) {
                    $line[] = $transpose ? $m[$b][$a] : $m[$a][$b];
                }
                $run = 1;
                for ($b = 1; $b < $n; $b++) {
                    if ($line[$b] === $line[$b - 1]) {
                        $run++;
                        if ($run === 5) {
                            $score += 3;
                        } elseif ($run > 5) {
                            $score++;
                        }
                    } else {
                        $run = 1;
                    }
                }
                // 1:1:3:1:1 with four light squares on one side looks like a finder
                $s = implode('', array_map(fn ($v) => $v ? '1' : '0', $line));
                $score += 40 * (substr_count($s, '10111010000') + substr_count($s, '00001011101'));   // non-overlapping is enough for ranking masks
                if (! $transpose) {
                    $dark += array_sum(array_map('intval', $line));
                }
            }
        }
        for ($y = 0; $y < $n - 1; $y++) {
            for ($x = 0; $x < $n - 1; $x++) {
                if ($m[$y][$x] === $m[$y][$x + 1] && $m[$y][$x] === $m[$y + 1][$x] && $m[$y][$x] === $m[$y + 1][$x + 1]) {
                    $score += 3;
                }
            }
        }
        $total = $n * $n;
        $k = intdiv(abs($dark * 20 - $total * 10) + $total - 1, $total) - 1;

        return $score + max(0, $k) * 10;
    }
}

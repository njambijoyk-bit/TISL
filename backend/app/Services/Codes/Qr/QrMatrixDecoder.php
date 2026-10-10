<?php

namespace App\Services\Codes\Qr;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;
use App\Services\Codes\Gf256;

/**
 * Reads a QR symbol back from its squares (not from a picture). The server uses it to prove what the encoder makes, and to check a code someone sends as squares; reading a
 * camera picture is the scanner's job (browser). Every error-correction block is checked; a symbol that does not add up is refused rather than guessed at.
 */
final class QrMatrixDecoder
{
    /** @return array{text: string, version: int, level: string, mask: int, mode: string} */
    public static function decode(BitMatrix $m): array
    {
        $size = $m->width;
        if ($m->height !== $size || $size < 21 || $size > 177 || ($size - 17) % 4 !== 0) {
            throw new CodeException('That is not the size of a QR code.');
        }
        $version = intdiv($size - 17, 4);
        [$level, $mask] = self::format($m, $size);
        $layout = new QrLayout($version, $level);
        $bits = [];
        foreach ($layout->dataOrder() as [$x, $y]) {
            $dark = $m->get($x, $y);
            if (QrLayout::maskApplies($mask, $x, $y)) {
                $dark = ! $dark;
            }
            $bits[] = $dark ? 1 : 0;
        }
        $raw = intdiv(QrSpec::rawModules($version), 8);
        $words = [];
        foreach (array_chunk(array_slice($bits, 0, $raw * 8), 8) as $b) {
            $words[] = bindec(implode('', $b));
        }
        $data = self::deinterleave($words, $level, $version);

        return ['text' => self::parse($data, $version, $mode), 'version' => $version, 'level' => $level, 'mask' => $mask, 'mode' => $mode];
    }

    /** @return array{0: string, 1: int} */
    private static function format(BitMatrix $m, int $s): array
    {
        $first = 0;
        $second = 0;
        $pos1 = [];
        for ($i = 0; $i <= 5; $i++) {
            $pos1[$i] = [8, $i];
        }
        $pos1[6] = [8, 7];
        $pos1[7] = [8, 8];
        $pos1[8] = [7, 8];
        for ($i = 9; $i < 15; $i++) {
            $pos1[$i] = [14 - $i, 8];
        }
        $pos2 = [];
        for ($i = 0; $i < 8; $i++) {
            $pos2[$i] = [$s - 1 - $i, 8];
        }
        for ($i = 8; $i < 15; $i++) {
            $pos2[$i] = [8, $s - 15 + $i];
        }
        foreach ($pos1 as $i => [$x, $y]) {
            $first |= ($m->get($x, $y) ? 1 : 0) << $i;
        }
        foreach ($pos2 as $i => [$x, $y]) {
            $second |= ($m->get($x, $y) ? 1 : 0) << $i;
        }
        $best = null;
        $bestDist = 99;
        foreach (QrSpec::LEVELS as $l) {
            for ($mask = 0; $mask < 8; $mask++) {
                $w = QrLayout::formatWord($l, $mask);
                $d = min(self::ones($w ^ $first), self::ones($w ^ $second));
                if ($d < $bestDist) {
                    $bestDist = $d;
                    $best = [$l, $mask];
                }
            }
        }
        if ($bestDist > 3) {
            throw new CodeException('The format of this QR code can not be read.');
        }

        return $best;
    }

    private static function ones(int $v): int
    {
        $n = 0;
        for (; $v; $v &= $v - 1) {
            $n++;
        }

        return $n;
    }

    /**
     * @param  int[]  $words
     * @return int[] the data codewords, each block's error-correction checked
     */
    private static function deinterleave(array $words, string $level, int $version): array
    {
        $blocks = QrSpec::blocks($level, $version);
        $eccLen = QrSpec::eccPerBlock($level, $version);
        $raw = intdiv(QrSpec::rawModules($version), 8);
        $short = $blocks - $raw % $blocks;
        $shortLen = intdiv($raw, $blocks);
        $data = array_fill(0, $blocks, []);
        $ecc = array_fill(0, $blocks, []);
        $k = 0;
        for ($i = 0; $i < $shortLen - $eccLen + 1; $i++) {
            for ($j = 0; $j < $blocks; $j++) {
                if ($i !== $shortLen - $eccLen || $j >= $short) {
                    $data[$j][] = $words[$k++];
                }
            }
        }
        for ($i = 0; $i < $eccLen; $i++) {
            for ($j = 0; $j < $blocks; $j++) {
                $ecc[$j][] = $words[$k++];
            }
        }
        $gf = Gf256::for(0x11D);
        $out = [];
        for ($j = 0; $j < $blocks; $j++) {
            if ($gf->remainder($data[$j], $eccLen) !== $ecc[$j]) {
                throw new CodeException('This QR code is damaged: its error-correction does not add up.');
            }
            array_push($out, ...$data[$j]);
        }

        return $out;
    }

    /** @param int[] $data */
    private static function parse(array $data, int $version, ?string &$firstMode): string
    {
        $bits = '';
        foreach ($data as $b) {
            $bits .= str_pad(decbin($b), 8, '0', STR_PAD_LEFT);
        }
        $p = 0;
        $take = function (int $n) use (&$p, $bits): int {
            if ($p + $n > strlen($bits)) {
                throw new CodeException('This QR code ends in the middle of its data.');
            }
            $v = bindec(substr($bits, $p, $n));
            $p += $n;

            return $v;
        };
        $text = '';
        $firstMode = null;
        while ($p + 4 <= strlen($bits)) {
            $ind = $take(4);
            if ($ind === 0) {
                break;
            }
            $mode = [1 => 'numeric', 2 => 'alnum', 4 => 'byte'][$ind] ?? throw new CodeException('This QR code uses a mode we do not read (kanji or ECI).');
            $firstMode ??= $mode;
            $n = $take(QrSpec::countBits($mode, $version));
            if ($mode === 'byte') {
                for ($i = 0; $i < $n; $i++) {
                    $text .= chr($take(8));
                }
            } elseif ($mode === 'numeric') {
                for (; $n >= 3; $n -= 3) {
                    $text .= str_pad((string) $take(10), 3, '0', STR_PAD_LEFT);
                }
                if ($n === 2) {
                    $text .= str_pad((string) $take(7), 2, '0', STR_PAD_LEFT);
                } elseif ($n === 1) {
                    $text .= (string) $take(4);
                }
            } else {
                for (; $n >= 2; $n -= 2) {
                    $v = $take(11);
                    $text .= QrSpec::ALNUM[intdiv($v, 45)] . QrSpec::ALNUM[$v % 45];
                }
                if ($n === 1) {
                    $text .= QrSpec::ALNUM[$take(6)];
                }
            }
        }

        return $text;
    }
}

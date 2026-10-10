<?php

namespace App\Services\Codes\DataMatrix;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;
use App\Services\Codes\Gf256;

/**
 * Our own Data Matrix ECC 200 encoder: small square (or rectangular) codes that print well on tiny parts, jewellery and medicine packs. Text goes in as ASCII mode (digit pairs
 * packed two to a codeword) or, when that would be longer, as Base 256 bytes; with `$gs1` the byte "\xF1" in the text is FNC1 (GS1 Data Matrix); otherwise every byte is just data. The smallest symbol that fits is chosen.
 */
final class DmEncoder
{
    public const FNC1 = "\xF1";

    /** @param string $shape square | rectangle | any */
    public static function encode(string $text, string $shape = 'square', bool $gs1 = false): BitMatrix
    {
        if ($text === '') {
            throw new CodeException('A Data Matrix needs something to hold.');
        }
        if (! in_array($shape, ['square', 'rectangle', 'any'], true)) {
            throw new CodeException('The shape must be square, rectangle or any.');
        }
        $data = self::codewords($text, $gs1);
        $size = null;
        foreach (DmSpec::candidates($shape) as $d) {
            if ($d['data'] >= count($data)) {
                $size = $d;
                break;
            }
        }
        if ($size === null) {
            throw new CodeException('That is too much to fit in a Data Matrix (' . count($data) . ' codewords; the largest holds 1558).');
        }

        return self::build(self::pad($data, $size['data']), $size);
    }

    /** the smaller of the ASCII-mode and the Base 256 encodings. @return int[] */
    public static function codewords(string $text, bool $gs1 = false): array
    {
        $ascii = self::ascii($text, $gs1);
        if (! $gs1) {
            $base = self::base256($text);
            if (count($base) < count($ascii)) {
                return $base;
            }
        }

        return $ascii;
    }

    /** ASCII mode: a character is its code + 1, two digits in a row are one codeword, characters from 128 up take an upper-shift codeword first, FNC1 ("\xF1") is 232. @return int[] */
    public static function ascii(string $text, bool $gs1 = false): array
    {
        $b = array_values(unpack('C*', $text));
        $out = [];
        for ($i = 0, $n = count($b); $i < $n; $i++) {
            $c = $b[$i];
            if ($c >= 48 && $c <= 57 && $i + 1 < $n && $b[$i + 1] >= 48 && $b[$i + 1] <= 57) {
                $out[] = 130 + ($c - 48) * 10 + ($b[$i + 1] - 48);
                $i++;
            } elseif ($gs1 && $c === 0xF1) {
                $out[] = 232;
            } elseif ($c <= 127) {
                $out[] = $c + 1;
            } else {
                $out[] = 235;
                $out[] = $c - 127;
            }
        }

        return $out;
    }

    /** @return int[] */
    public static function base256(string $text): array
    {
        $len = strlen($text);
        $head = $len <= 249 ? [$len] : [intdiv($len, 250) + 249, $len % 250];
        $out = [231];
        $pos = 2;   // codeword number of the first byte after the mode latch
        foreach (array_merge($head, array_values(unpack('C*', $text))) as $byte) {
            $out[] = ($byte + (((149 * $pos) % 255) + 1)) % 256;
            $pos++;
        }

        return $out;
    }

    /** Fill the rest with the pad codeword and then scrambled pads, as the standard says. @param int[] $data @return int[] */
    private static function pad(array $data, int $capacity): array
    {
        if (count($data) < $capacity) {
            $data[] = 129;
        }
        while (count($data) < $capacity) {
            $pos = count($data) + 1;
            $v = 129 + ((149 * $pos) % 253) + 1;
            $data[] = $v > 254 ? $v - 254 : $v;
        }

        return $data;
    }

    /** @param int[] $data (already padded) @param array<string, int> $size */
    private static function build(array $data, array $size): BitMatrix
    {
        $codewords = array_merge($data, self::eccFor($data, $size));
        $map = DmPlacement::map($size['nrow'], $size['ncol']);
        $logical = array_fill(0, $size['nrow'], array_fill(0, $size['ncol'], false));
        foreach ($map as $i => $v) {
            $r = intdiv($i, $size['ncol']);
            $c = $i % $size['ncol'];
            if ($v === 1) {
                $logical[$r][$c] = true;
            } elseif ($v > 1) {
                $cw = intdiv($v, 10) - 1;
                $bit = $v % 10;
                $logical[$r][$c] = (($codewords[$cw] >> (8 - $bit)) & 1) === 1;
            }
        }

        return self::frame($logical, $size);
    }

    /** error-correction codewords for the whole message, interleaved over the blocks. @param int[] $data @param array<string, int> $size @return int[] */
    public static function eccFor(array $data, array $size): array
    {
        $blocks = $size['blocks'];
        $per = intdiv($size['ecc'], $blocks);
        $gf = Gf256::for(0x12D);
        $ecc = array_fill(0, $size['ecc'], 0);
        for ($b = 0; $b < $blocks; $b++) {
            $block = [];
            for ($i = $b; $i < count($data); $i += $blocks) {
                $block[] = $data[$i];
            }
            foreach ($gf->remainder($block, $per, 1) as $j => $v) {
                $ecc[$j * $blocks + $b] = $v;
            }
        }

        return $ecc;
    }

    /** put the data regions inside their finder and timing borders. @param array<int, array<int, bool>> $logical @param array<string, int> $size */
    private static function frame(array $logical, array $size): BitMatrix
    {
        $rows = $size['rows'];
        $cols = $size['cols'];
        $m = array_fill(0, $rows, array_fill(0, $cols, false));
        $rh = $size['regionH'];
        $rw = $size['regionW'];
        for ($vy = 0; $vy < $size['vr']; $vy++) {
            for ($hx = 0; $hx < $size['hr']; $hx++) {
                $y0 = $vy * ($rh + 2);
                $x0 = $hx * ($rw + 2);
                for ($y = 0; $y < $rh + 2; $y++) {
                    for ($x = 0; $x < $rw + 2; $x++) {
                        $dark = match (true) {
                            $x === 0 || $y === $rh + 1 => true,                                  // the solid "L": left and bottom
                            $y === 0 => $x % 2 === 0,                                            // alternating along the top
                            $x === $rw + 1 => ($rh + 1 - $y) % 2 === 0,                          // and up the right, from the dark bottom corner
                            default => $logical[$vy * $rh + $y - 1][$hx * $rw + $x - 1],
                        };
                        $m[$y0 + $y][$x0 + $x] = $dark;
                    }
                }
            }
        }

        return new BitMatrix($cols, $rows, $m);
    }
}

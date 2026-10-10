<?php

namespace App\Services\Codes\DataMatrix;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;
use App\Services\Codes\Gf256;

/**
 * Reads a Data Matrix back from its squares (not a picture): used to prove what the encoder makes and to check a code sent as squares. Understands ASCII and Base 256 modes (what
 * we write) and refuses the others (C40, Text, X12, EDIFACT) rather than guess. Every block's error-correction is checked.
 */
final class DmDecoder
{
    /** @return array{text: string, rows: int, cols: int, gs1: bool} */
    public static function decode(BitMatrix $m): array
    {
        $size = DmSpec::bySize($m->height, $m->width) ?? throw new CodeException('That is not a Data Matrix size.');
        $rh = $size['regionH'];
        $rw = $size['regionW'];
        for ($y = 0; $y < $m->height; $y++) {   // the borders: solid on the left and bottom of each region, alternating on the top and right
            for ($x = 0; $x < $m->width; $x++) {
                $ry = $y % ($rh + 2);
                $rx = $x % ($rw + 2);
                $want = match (true) {
                    $rx === 0 || $ry === $rh + 1 => true,
                    $ry === 0 => $rx % 2 === 0,
                    $rx === $rw + 1 => ($rh + 1 - $ry) % 2 === 0,
                    default => null,
                };
                if ($want !== null && $m->get($x, $y) !== $want) {
                    throw new CodeException('The finder pattern of this Data Matrix is damaged.');
                }
            }
        }
        $map = DmPlacement::map($size['nrow'], $size['ncol']);
        $total = $size['data'] + $size['ecc'];
        $words = array_fill(0, $total, 0);
        foreach ($map as $i => $v) {
            if ($v <= 1) {
                continue;
            }
            $r = intdiv($i, $size['ncol']);
            $c = $i % $size['ncol'];
            $x = intdiv($c, $rw) * ($rw + 2) + ($c % $rw) + 1;
            $y = intdiv($r, $rh) * ($rh + 2) + ($r % $rh) + 1;
            if ($m->get($x, $y)) {
                $words[intdiv($v, 10) - 1] |= 1 << (8 - $v % 10);
            }
        }
        $data = array_slice($words, 0, $size['data']);
        $ecc = array_slice($words, $size['data']);
        if (DmEncoder::eccFor($data, $size) !== $ecc) {
            throw new CodeException('This Data Matrix is damaged: its error-correction does not add up.');
        }
        [$text, $gs1] = self::parse($data);

        return ['text' => $text, 'rows' => $size['rows'], 'cols' => $size['cols'], 'gs1' => $gs1];
    }

    /** @param int[] $d @return array{0: string, 1: bool} */
    private static function parse(array $d): array
    {
        $out = '';
        $gs1 = false;
        $n = count($d);
        for ($i = 0; $i < $n; $i++) {
            $v = $d[$i];
            if ($v === 129) {
                break;   // pad: nothing but pads follows
            }
            if ($v >= 1 && $v <= 128) {
                $out .= chr($v - 1);
            } elseif ($v >= 130 && $v <= 229) {
                $out .= str_pad((string) ($v - 130), 2, '0', STR_PAD_LEFT);
            } elseif ($v === 232) {
                $gs1 = true;
                $out .= "\xF1";
            } elseif ($v === 235) {
                $out .= chr(($d[++$i] ?? 0) + 127);
            } elseif ($v === 231) {
                $un = fn (int $cw, int $pos) => (($cw - (((149 * $pos) % 255) + 1)) % 256 + 256) % 256;
                $len = $un($d[++$i], $i + 1);
                if ($len >= 250) {
                    $len = ($len - 249) * 250 + $un($d[++$i], $i + 1);
                }
                for ($k = 0; $k < $len; $k++) {
                    $out .= chr($un($d[++$i], $i + 1));
                }
            } else {
                throw new CodeException('This Data Matrix uses an encoding we do not read (C40, Text, X12 or EDIFACT).');
            }
        }

        return [$out, $gs1];
    }
}

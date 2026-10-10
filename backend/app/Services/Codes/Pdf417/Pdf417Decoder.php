<?php

namespace App\Services\Codes\Pdf417;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;

/**
 * Reads a PDF417 back from its squares (one row of the matrix per row of the symbol): used to prove what the encoder makes and to check a symbol sent as squares. Reads numeric,
 * text and byte compaction; every codeword must be a real pattern of its cluster, the length descriptor must agree and the error-correction must add up.
 */
final class Pdf417Decoder
{
    /** @var array<int, array<int, int>>|null pattern => codeword, for each cluster */
    private static ?array $lookup = null;

    /** @return array{text: string, rows: int, columns: int, level: int} */
    public static function decode(BitMatrix $m): array
    {
        self::$lookup ??= array_map(fn ($c) => array_flip($c), Pdf417Tables::CLUSTERS);
        $cols = intdiv($m->width - 69, 17);
        if ($m->width !== 17 * $cols + 69 || $cols < 1 || $cols > 30 || $m->height < 3 || $m->height > 90) {
            throw new CodeException('That is not the size of a PDF417.');
        }
        $words = [];
        $level = null;
        for ($y = 0; $y < $m->height; $y++) {
            $cluster = $y % 3;
            $row = $m->rows()[$y];
            $bits = fn (int $from, int $len) => bindec(implode('', array_map(fn ($b) => $b ? '1' : '0', array_slice($row, $from, $len))));
            if ($bits(0, 17) !== 0x1FEA8 || $bits($m->width - 18, 18) !== 0x3FA29) {
                throw new CodeException('The start or stop pattern of this PDF417 is damaged.');
            }
            for ($c = 0; $c < $cols + 2; $c++) {
                $cw = self::$lookup[$cluster][$bits(17 + 17 * $c, 17)] ?? throw new CodeException('A codeword of this PDF417 is not a valid pattern.');
                if ($c === 0 && $cluster === 1) {
                    $level = intdiv($cw % 30, 3);
                }
                if ($c > 0 && $c <= $cols) {
                    $words[] = $cw;
                }
            }
        }
        $level ?? throw new CodeException('This PDF417 has no error-correction level.');
        $ecc = 2 ** ($level + 1);
        $data = array_slice($words, 0, count($words) - $ecc);
        if (Pdf417Encoder::ecc($data, $level) !== array_slice($words, -$ecc)) {
            throw new CodeException('This PDF417 is damaged: its error-correction does not add up.');
        }
        if ($data[0] !== count($data)) {
            throw new CodeException('The length of this PDF417 does not match what it says.');
        }

        return ['text' => self::parse(array_slice($data, 1)), 'rows' => $m->height, 'columns' => $cols, 'level' => $level];
    }

    /** @param int[] $d */
    private static function parse(array $d): string
    {
        while ($d && end($d) === 900) {
            array_pop($d);   // padding
        }
        $mode = 'text';
        $i = 0;
        $out = '';
        if ($d && in_array($d[0], [901, 902, 924], true)) {
            $mode = [901 => 'byte', 924 => 'byte', 902 => 'numeric'][$d[0]];
            $i = 1;
        }
        $rest = array_slice($d, $i);
        if ($mode === 'numeric') {
            foreach (array_chunk($rest, 15) as $chunk) {
                $n = '0';
                foreach ($chunk as $w) {
                    $n = self::mulAdd($n, 900, $w);
                }
                $out .= substr($n, 1);   // drop the leading 1
            }

            return $out;
        }
        if ($mode === 'byte') {
            // latch 924: only whole groups of 5. latch 901: groups of 5 while MORE than 5 codewords remain; the last 1 to 5 are single bytes
            $n = count($rest);
            if ($d[0] === 924 && $n % 5 !== 0) {
                throw new CodeException('Byte compaction with a latch of 924 must be whole groups.');
            }
            $full = $d[0] === 924 ? $n : max(0, intdiv($n - 1, 5)) * 5;
            for ($k = 0; $k < $full; $k += 5) {
                $n = 0;
                for ($j = 0; $j < 5; $j++) {
                    $n = $n * 900 + $rest[$k + $j];
                }
                $g = '';
                for ($j = 0; $j < 6; $j++) {
                    $g = chr($n % 256) . $g;
                    $n = intdiv($n, 256);
                }
                $out .= $g;
            }
            for ($k = $full; $k < count($rest); $k++) {
                $out .= chr($rest[$k]);
            }

            return $out;
        }

        return self::text($rest);
    }

    /** @param int[] $words */
    private static function text(array $words): string
    {
        $tables = [
            'A' => range('A', 'Z'),
            'L' => range('a', 'z'),
            'M' => ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '&', "\r", "\t", ',', ':', '#', '-', '.', '$', '/', '+', '%', '*', '=', '^'],
            'P' => [';', '<', '>', '@', '[', '\\', ']', '_', '`', '~', '!', "\r", "\t", ',', ':', "\n", '-', '.', '$', '/', '"', '|', '*', '(', ')', '?', '{', '}', "'"],
        ];
        $values = [];
        foreach ($words as $w) {
            if ($w > 899) {
                throw new CodeException('This PDF417 mixes compaction modes in a way we do not read.');
            }
            $values[] = intdiv($w, 30);
            $values[] = $w % 30;
        }
        $mode = 'A';
        $out = '';
        $shift = null;
        foreach ($values as $v) {
            $m = $shift ?? $mode;   // a shift applies to one character only
            $shift = null;
            if ($m === 'P') {
                if ($v <= 28) {
                    $out .= $tables['P'][$v];
                } else {
                    $mode = 'A';   // 29: latch to alpha
                }

                continue;
            }
            if ($v === 29) {
                $shift = 'P';
            } elseif ($v === 28) {
                $mode = $m === 'M' ? 'A' : 'M';
            } elseif ($v === 27) {
                if ($m === 'L') {
                    $shift = 'A';
                } else {
                    $mode = 'L';
                }
            } elseif ($v === 26) {
                $out .= ' ';
            } elseif ($m === 'M' && $v === 25) {
                $mode = 'P';
            } else {
                $out .= $tables[$m][$v];
            }
        }

        return $out;
    }

    private static function mulAdd(string $n, int $mul, int $add): string
    {
        $carry = $add;
        $digits = array_reverse(str_split($n === '0' ? '' : $n));
        $out = [];
        foreach ($digits as $d) {
            $t = (int) $d * $mul + $carry;
            $out[] = $t % 10;
            $carry = intdiv($t, 10);
        }
        while ($carry > 0) {
            $out[] = $carry % 10;
            $carry = intdiv($carry, 10);
        }

        return $out === [] ? '0' : implode('', array_reverse($out));
    }
}

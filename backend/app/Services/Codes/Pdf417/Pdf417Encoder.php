<?php

namespace App\Services\Codes\Pdf417;

use App\Services\Codes\BitMatrix;
use App\Services\Codes\CodeException;

/**
 * Our own PDF417 encoder (ISO/IEC 15438): a stacked barcode that holds a lot (up to about 1,100 bytes) and reads with the same laser or camera scanners as a barcode. The whole message
 * is encoded in one mode: numeric (digits only), text (letters, digits and common punctuation, two characters to a codeword) or byte (anything, UTF-8). Error-correction level,
 * columns and rows are chosen to give a symbol about three times as wide as it is tall unless asked otherwise.
 */
final class Pdf417Encoder
{
    private const PAD = 900;

    private const LATCH_NUMERIC = 902;

    private const LATCH_BYTE = 901;

    private const LATCH_BYTE_6 = 924;

    private const START = 0x1FEA8;      // 81111113

    private const STOP = 0x3FA29;       // 711311121 (18 modules)

    /** the text sub-modes: character => value in each (A alpha, L lower, M mixed, P punctuation) */
    private const MIXED = ['0' => 0, '1' => 1, '2' => 2, '3' => 3, '4' => 4, '5' => 5, '6' => 6, '7' => 7, '8' => 8, '9' => 9, '&' => 10, "\r" => 11, "\t" => 12, ',' => 13, ':' => 14, '#' => 15, '-' => 16, '.' => 17, '$' => 18, '/' => 19, '+' => 20, '%' => 21, '*' => 22, '=' => 23, '^' => 24, ' ' => 26];

    private const PUNCT = [';' => 0, '<' => 1, '>' => 2, '@' => 3, '[' => 4, '\\' => 5, ']' => 6, '_' => 7, '`' => 8, '~' => 9, '!' => 10, "\r" => 11, "\t" => 12, ',' => 13, ':' => 14, "\n" => 15, '-' => 16, '.' => 17, '$' => 18, '/' => 19, '"' => 20, '|' => 21, '*' => 22, '(' => 23, ')' => 24, '?' => 25, '{' => 26, '}' => 27, "'" => 28];

    /** how to get from one text sub-mode to another with latches: from => to => codes */
    private const LATCH = [
        'A' => ['L' => [27], 'M' => [28], 'P' => [28, 25]],
        'L' => ['A' => [28, 28], 'M' => [28], 'P' => [28, 25]],
        'M' => ['L' => [27], 'A' => [28], 'P' => [25]],
        'P' => ['L' => [29, 27], 'A' => [29], 'M' => [29, 28]],
    ];

    /**
     * @param  ?int  $level  error-correction level 0 to 8 (null = chosen from the size of the data)
     * @param  ?int  $columns  data columns 1 to 30 (null = chosen for the shape)
     * @param  float  $aspect  the wanted width : height of the symbol when the columns are chosen for you (rows are 3 modules high)
     */
    public static function encode(string $text, ?int $level = null, ?int $columns = null, float $aspect = 3.0): BitMatrix
    {
        if ($text === '') {
            throw new CodeException('A PDF417 needs something to hold.');
        }
        if ($level !== null && ($level < 0 || $level > 8)) {
            throw new CodeException('The error-correction level is 0 to 8.');
        }
        if ($columns !== null && ($columns < 1 || $columns > 30)) {
            throw new CodeException('PDF417 has 1 to 30 columns.');
        }
        $data = self::compact($text);
        $level ??= self::autoLevel(count($data));
        $eccCount = 2 ** ($level + 1);
        $total = 1 + count($data) + $eccCount;   // the length descriptor, the data and the error-correction
        if ($total > 928) {
            throw new CodeException('That is too much to fit in a PDF417 at error-correction level ' . $level . '.');
        }
        [$cols, $rows] = self::shape($total, $columns, $aspect);
        $words = array_merge([count($data) + 1 + ($rows * $cols - $total)], $data);   // the descriptor counts itself, the data and the padding, not the error-correction
        while (count($words) < $rows * $cols - $eccCount) {
            $words[] = self::PAD;
        }
        $words = array_merge($words, self::ecc($words, $level));

        return self::layout($words, $rows, $cols, $level);
    }

    /** 2-D symbols this big deserve more protection (the standard's suggestion). */
    private static function autoLevel(int $dataWords): int
    {
        return match (true) {
            $dataWords <= 40 => 2,
            $dataWords <= 160 => 3,
            $dataWords <= 320 => 4,
            default => 5,
        };
    }

    /** @return array{0: int, 1: int} columns, rows */
    private static function shape(int $total, ?int $columns, float $aspect): array
    {
        $best = null;
        foreach ($columns !== null ? [$columns] : range(1, 30) as $c) {
            $r = max(3, (int) ceil($total / $c));
            if ($r > 90) {
                continue;
            }
            $width = 17 * $c + 69;
            $height = $r * 3;
            $score = abs($width / $height - $aspect);
            if ($best === null || $score < $best[0]) {
                $best = [$score, $c, $r];
            }
        }
        if ($best === null) {
            throw new CodeException('That does not fit in 90 rows: use more columns.');
        }

        return [$best[1], $best[2]];
    }

    // ------------------------------------------------------------ compaction

    /** @return int[] data codewords (with the mode latch where it is not text) */
    public static function compact(string $text): array
    {
        if (ctype_digit($text) && strlen($text) >= 2) {
            return array_merge([self::LATCH_NUMERIC], self::numeric($text));
        }
        if (self::isText($text)) {
            return self::text($text);
        }

        return self::bytes($text);
    }

    private static function isText(string $s): bool
    {
        return preg_match('/^[\x09\x0a\x0d\x20-\x7e]+$/', $s) === 1;
    }

    /** @return int[] */
    public static function text(string $s): array
    {
        $mode = 'A';
        $values = [];
        $chars = str_split($s);
        foreach ($chars as $i => $ch) {
            $inA = ctype_upper($ch) || $ch === ' ';
            $inL = ctype_lower($ch) || $ch === ' ';
            $in = ['A' => $inA ? (ctype_upper($ch) ? ord($ch) - 65 : 26) : null, 'L' => $inL ? (ctype_lower($ch) ? ord($ch) - 97 : 26) : null, 'M' => self::MIXED[$ch] ?? null, 'P' => self::PUNCT[$ch] ?? null];
            if ($in[$mode] !== null) {
                $values[] = $in[$mode];

                continue;
            }
            $next = $chars[$i + 1] ?? null;
            // a single punctuation mark (or one capital inside lower case) is cheaper as a shift than as a latch, unless more of the same follow
            if ($in['P'] !== null && $mode !== 'P' && $in['A'] === null && $in['L'] === null && $in['M'] === null) {
                if ($next === null || ! isset(self::PUNCT[$next]) || isset(self::MIXED[$next]) || ctype_alpha($next)) {
                    array_push($values, 29, $in['P']);

                    continue;
                }
            } elseif ($mode === 'L' && $in['A'] !== null && $ch !== ' ' && ($next === null || ! ctype_upper($next))) {
                array_push($values, 27, $in['A']);

                continue;
            }
            // latch to the first sub-mode that has the character (preferring the current family order A, L, M, P)
            $to = null;
            foreach (['A', 'L', 'M', 'P'] as $m) {
                if ($in[$m] !== null) {
                    $to = $m;
                    break;
                }
            }
            array_push($values, ...self::LATCH[$mode][$to]);
            $mode = $to;
            $values[] = $in[$mode];
        }
        $words = [];
        foreach (array_chunk($values, 2) as $pair) {
            $words[] = 30 * $pair[0] + ($pair[1] ?? 29);
        }

        return $words;
    }

    /** @return int[] */
    public static function bytes(string $s): array
    {
        $b = array_values(unpack('C*', $s));
        $out = [count($b) % 6 === 0 ? self::LATCH_BYTE_6 : self::LATCH_BYTE];
        $full = intdiv(count($b), 6) * 6;
        for ($i = 0; $i < $full; $i += 6) {
            $n = 0;
            for ($k = 0; $k < 6; $k++) {
                $n = $n * 256 + $b[$i + $k];
            }
            $group = [];
            for ($k = 0; $k < 5; $k++) {
                array_unshift($group, $n % 900);
                $n = intdiv($n, 900);
            }
            array_push($out, ...$group);
        }
        for ($i = $full; $i < count($b); $i++) {
            $out[] = $b[$i];
        }

        return $out;
    }

    /** @return int[] groups of up to 44 digits become 15 base-900 codewords (a leading 1 keeps zeros) */
    public static function numeric(string $digits): array
    {
        $out = [];
        foreach (str_split($digits, 44) as $chunk) {
            $num = '1' . $chunk;
            $group = [];
            while ($num !== '0') {
                [$num, $rem] = self::divmod900($num);
                array_unshift($group, $rem);
            }
            array_push($out, ...$group);
        }

        return $out;
    }

    /** @return array{0: string, 1: int} quotient and remainder of a decimal string by 900 */
    private static function divmod900(string $n): array
    {
        $q = '';
        $r = 0;
        foreach (str_split($n) as $d) {
            $r = $r * 10 + (int) $d;
            $q .= intdiv($r, 900);
            $r %= 900;
        }

        return [ltrim($q, '0') === '' ? '0' : ltrim($q, '0'), $r];
    }

    // ------------------------------------------------------------ error correction

    /** the error-correction codewords for the level (arithmetic modulo 929, generator 3). @param int[] $data @return int[] */
    public static function ecc(array $data, int $level): array
    {
        $k = 2 ** ($level + 1);
        $g = self::generator($k);
        $e = array_fill(0, $k, 0);
        foreach ($data as $d) {
            $t = ($d + $e[$k - 1]) % 929;
            for ($j = $k - 1; $j > 0; $j--) {
                $e[$j] = ($e[$j - 1] + 929 - ($t * $g[$j]) % 929) % 929;
            }
            $e[0] = (929 - ($t * $g[0]) % 929) % 929;
        }
        foreach ($e as $j => $v) {
            $e[$j] = $v === 0 ? 0 : 929 - $v;
        }

        return array_reverse($e);
    }

    /** the coefficients (lowest power first, the leading 1 left out) of the product of (x - 3^i) for i = 1 .. k. @return int[] */
    public static function generator(int $k): array
    {
        $g = [1];   // lowest power first
        $root = 1;
        for ($i = 1; $i <= $k; $i++) {
            $root = ($root * 3) % 929;
            $next = array_fill(0, count($g) + 1, 0);
            foreach ($g as $p => $c) {
                $next[$p + 1] = ($next[$p + 1] + $c) % 929;
                $next[$p] = ($next[$p] + 929 - ($c * $root) % 929) % 929;
            }
            $g = $next;
        }

        return array_slice($g, 0, $k);
    }

    // ------------------------------------------------------------ layout

    /** @param int[] $words all codewords (length descriptor, data, padding, error-correction), rows * cols of them */
    private static function layout(array $words, int $rows, int $cols, int $level): BitMatrix
    {
        $width = 17 * $cols + 69;
        $m = [];
        for ($i = 0; $i < $rows; $i++) {
            $cluster = $i % 3;
            $band = intdiv($i, 3);
            $left = match ($cluster) {
                0 => 30 * $band + intdiv($rows - 1, 3),
                1 => 30 * $band + $level * 3 + ($rows - 1) % 3,
                2 => 30 * $band + $cols - 1,
            };
            $right = match ($cluster) {
                0 => 30 * $band + $cols - 1,
                1 => 30 * $band + intdiv($rows - 1, 3),
                2 => 30 * $band + $level * 3 + ($rows - 1) % 3,
            };
            $bits = self::pattern(self::START, 17) . self::pattern(Pdf417Tables::CLUSTERS[$cluster][$left], 17);
            for ($c = 0; $c < $cols; $c++) {
                $bits .= self::pattern(Pdf417Tables::CLUSTERS[$cluster][$words[$i * $cols + $c]], 17);
            }
            $bits .= self::pattern(Pdf417Tables::CLUSTERS[$cluster][$right], 17) . self::pattern(self::STOP, 18);
            $m[] = array_map(fn ($b) => $b === '1', str_split($bits));
        }

        return new BitMatrix($width, $rows, $m);
    }

    private static function pattern(int $v, int $len): string
    {
        return str_pad(decbin($v), $len, '0', STR_PAD_LEFT);
    }
}

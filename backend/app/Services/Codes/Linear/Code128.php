<?php

namespace App\Services\Codes\Linear;

use App\Services\Codes\CodeException;

/**
 * Code 128: any ASCII text (letters, digits, punctuation, control codes), and digits packed two to a symbol. The cheapest mix of the three symbol sets A, B and C is
 * chosen for the text, so a long run of digits is half the width. FNC1 (the character "\xF1" in the text) is allowed, which is what GS1-128 is built on.
 */
final class Code128
{
    public const FNC1 = "\xF1";

    /** bar/gap widths of symbols 0..105 */
    private const PATTERNS = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232'];

    private const STOP = '2331112';

    private const START = ['A' => 103, 'B' => 104, 'C' => 105];

    private const SWITCH = ['A' => 101, 'B' => 100, 'C' => 99];   // the symbol that moves to this set

    /** @param string $text ASCII 0-127, plus FNC1 as "\xF1" */
    public static function encode(string $text, bool $showText = true): LinearCode
    {
        if ($text === '') {
            throw new CodeException('Code 128 needs something to hold.');
        }
        $values = self::symbols($text);
        $sum = $values[0];
        foreach (array_slice($values, 1) as $i => $v) {
            $sum += ($i + 1) * $v;
        }
        $values[] = $sum % 103;
        $runs = array_map(fn ($v) => self::PATTERNS[$v], $values);
        $runs[] = self::STOP;
        $modules = 11 * (count($values)) + 13;
        $shown = str_replace(self::FNC1, '', $text);

        return LinearCode::fromWidths($runs, 'code128', $text, $showText ? [['text' => preg_replace('/[^\x20-\x7e]/', '', $shown), 'from' => 0, 'to' => $modules]] : [], 10, 10);
    }

    /**
     * The symbol values for the text (start symbol first, check symbol not included), using the fewest symbols.
     *
     * @return int[]
     */
    public static function symbols(string $text): array
    {
        $chars = array_values(unpack('C*', $text));
        $n = count($chars);
        foreach ($chars as $c) {
            if ($c > 127 && $c !== 0xF1) {
                throw new CodeException('Code 128 holds plain ASCII text only (no accents or symbols outside it).');
            }
        }
        $INF = PHP_INT_MAX / 2;
        // cost[i][s]: fewest symbols to have written the first i characters and be in set s
        $cost = array_fill(0, $n + 1, ['A' => $INF, 'B' => $INF, 'C' => $INF]);
        $from = array_fill(0, $n + 1, ['A' => null, 'B' => null, 'C' => null]);
        foreach (['A', 'B', 'C'] as $s) {
            $cost[0][$s] = 1;   // the start symbol
        }
        for ($i = 0; $i < $n; $i++) {
            foreach (['A', 'B', 'C'] as $s) {
                if ($cost[$i][$s] >= $INF) {
                    continue;
                }
                foreach (['A', 'B', 'C'] as $t) {   // write the next character (or pair) in set $t, switching first when $t differs
                    $take = self::consumes($chars, $i, $t);
                    if ($take === 0) {
                        continue;
                    }
                    $c = $cost[$i][$s] + ($t === $s ? 0 : 1) + 1;
                    if ($c < $cost[$i + $take][$t]) {
                        $cost[$i + $take][$t] = $c;
                        $from[$i + $take][$t] = [$i, $s];
                    }
                }
            }
        }
        $best = array_keys($cost[$n], min($cost[$n]))[0];
        $path = [];
        $i = $n;
        $s = $best;
        while ($i > 0) {
            [$pi, $ps] = $from[$i][$s];
            $path[] = [$pi, $i, $ps, $s];
            [$i, $s] = [$pi, $ps];
        }
        $path = array_reverse($path);
        $out = [self::START[$path[0][3]]];   // the cheapest way always starts in the set the first character is written in
        $cur = $path[0][3];
        foreach ($path as $k => [$pi, $pj, $ps, $t]) {
            if ($k > 0 && $t !== $cur) {
                $out[] = self::SWITCH[$t];
                $cur = $t;
            }
            $out[] = self::value($chars, $pi, $pj - $pi, $t);
        }

        return $out;
    }

    /** how many input characters set $t can write at $i (0 = it cannot) */
    private static function consumes(array $chars, int $i, string $set): int
    {
        $c = $chars[$i];
        if ($c === 0xF1) {
            return 1;
        }
        if ($set === 'C') {
            return ($c >= 48 && $c <= 57 && isset($chars[$i + 1]) && $chars[$i + 1] >= 48 && $chars[$i + 1] <= 57) ? 2 : 0;
        }

        return ($set === 'A' ? $c <= 95 : $c >= 32) ? 1 : 0;
    }

    private static function value(array $chars, int $i, int $len, string $set): int
    {
        $c = $chars[$i];
        if ($c === 0xF1) {
            return 102;
        }
        if ($set === 'C') {
            return ($c - 48) * 10 + ($chars[$i + 1] - 48);
        }

        return $set === 'A' ? ($c < 32 ? $c + 64 : $c - 32) : $c - 32;
    }
}

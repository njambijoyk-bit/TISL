<?php

namespace App\Services\Codes\Linear;

use App\Services\Codes\CodeException;

/** Code 93: denser than Code 39, full ASCII (through shift characters), with two check characters that are always added. */
final class Code93
{
    private const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';   // values 0-42; 43-46 are the shifts ($) (%) (/) (+)

    /** bar/gap widths (six elements, nine modules) of values 0..46, in value order */
    private const PATTERNS = ['131112', '111213', '111312', '111411', '121113', '121212', '121311', '111114', '131211', '141111', '211113', '211212', '211311', '221112', '221211', '231111', '112113', '112212', '112311', '122112', '132111', '111123', '111222', '111321', '121122', '131121', '212112', '212211', '211122', '211221', '221121', '222111', '112122', '112221', '122121', '123111', '121131', '311112', '311211', '321111', '112131', '113121', '211131', '121221', '312111', '311121', '122211'];

    private const START_STOP = '111141';

    /** the ASCII characters that need a shift: character => shift + letter */
    private static function expand(string $text): array
    {
        $out = [];
        foreach (str_split($text) as $ch) {
            $c = ord($ch);
            if ($c > 127) {
                throw new CodeException('Code 93 holds plain ASCII text only (no accents or symbols outside it).');
            }
            if (strpos(self::CHARS, $ch) !== false) {
                $out[] = strpos(self::CHARS, $ch);
            } elseif ($c === 0) {
                array_push($out, 44, 30);                              // %U
            } elseif ($c <= 26) {
                array_push($out, 43, 9 + $c);                          // $A..$Z
            } elseif ($c <= 31) {
                array_push($out, 44, 9 + ($c - 26));                   // %A..%E
            } elseif ($c <= 44 && $c >= 33) {
                array_push($out, 45, 9 + ($c - 32));                   // /A../L  (! " # $ % & ' ( ) * + ,)
            } elseif ($c === 58) {
                array_push($out, 45, 35);                              // /Z
            } elseif ($c >= 59 && $c <= 63) {
                array_push($out, 44, 9 + ($c - 58) + 5);               // %F..%J
            } elseif ($c === 64) {
                array_push($out, 44, 31);                              // %V
            } elseif ($c >= 91 && $c <= 95) {
                array_push($out, 44, 9 + ($c - 90) + 10);              // %K..%O
            } elseif ($c === 96) {
                array_push($out, 44, 32);                              // %W
            } elseif ($c >= 97 && $c <= 122) {
                array_push($out, 46, 10 + ($c - 97));                  // +A..+Z
            } else {
                array_push($out, 44, 9 + ($c - 122) + 15);             // %P..%T  ({ | } ~ DEL)
            }
        }

        return $out;
    }

    public static function encode(string $text, bool $showText = true): LinearCode
    {
        if ($text === '') {
            throw new CodeException('Code 93 needs something to hold.');
        }
        $values = self::expand($text);
        $values[] = self::check($values, 20);   // C
        $values[] = self::check($values, 15);   // K
        $runs = [self::START_STOP];
        foreach ($values as $v) {
            $runs[] = self::PATTERNS[$v];
        }
        $runs[] = self::START_STOP;
        $runs[] = '1';   // the termination bar

        return LinearCode::fromWidths($runs, 'code93', $text, $showText ? [['text' => preg_replace('/[^\x20-\x7e]/', '', $text), 'from' => 9, 'to' => 9 * (count($values) - 2) + 9]] : [], 10, 10);
    }

    /** @param int[] $values */
    private static function check(array $values, int $maxWeight): int
    {
        $sum = 0;
        $w = 1;
        for ($i = count($values) - 1; $i >= 0; $i--) {
            $sum += $values[$i] * $w;
            $w = $w === $maxWeight ? 1 : $w + 1;
        }

        return $sum % 47;
    }
}

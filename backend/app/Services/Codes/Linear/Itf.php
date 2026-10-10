<?php

namespace App\Services\Codes\Linear;

use App\Services\Codes\CodeException;

/**
 * Interleaved 2 of 5: digits in pairs, the first of each pair in the bars and the second in the gaps, so it is compact for long numbers on cartons. ITF-14 is the 14-digit
 * form of a GTIN for outer cases. An odd number of digits gets a leading 0 (as the format requires an even count).
 */
final class Itf
{
    private const PATTERNS = ['nnwwn', 'wnnnw', 'nwnnw', 'wwnnn', 'nnwnw', 'wnwnn', 'nwwnn', 'nnnww', 'wnnwn', 'nwnwn'];

    private const WIDE = 3;

    public static function encode(string $digits, bool $check = false, bool $showText = true): LinearCode
    {
        if ($digits === '' || ! ctype_digit($digits)) {
            throw new CodeException('Interleaved 2 of 5 holds digits only.');
        }
        if ($check) {
            $digits .= Gs1::checkDigit($digits);
        }
        if (strlen($digits) % 2 === 1) {
            $digits = '0' . $digits;
        }
        $bits = '1010';   // start: four narrow elements
        foreach (str_split($digits, 2) as $pair) {
            $bar = self::PATTERNS[(int) $pair[0]];
            $gap = self::PATTERNS[(int) $pair[1]];
            for ($i = 0; $i < 5; $i++) {
                $bits .= str_repeat('1', $bar[$i] === 'w' ? self::WIDE : 1) . str_repeat('0', $gap[$i] === 'w' ? self::WIDE : 1);
            }
        }
        $bits .= str_repeat('1', self::WIDE) . '0' . '1';   // stop: wide bar, narrow gap, narrow bar

        return LinearCode::fromBits($bits, 'itf', $digits, $showText ? [['text' => $digits, 'from' => 0, 'to' => strlen($bits)]] : [], 10, 10);
    }

    /** ITF-14: 13 digits (check added) or 14 with it, for the outer carton of a product. */
    public static function itf14(string $digits, bool $showText = true): LinearCode
    {
        if (! ctype_digit($digits) || ! in_array(strlen($digits), [13, 14], true)) {
            throw new CodeException('ITF-14 takes 13 digits (the check digit is added) or 14 with it.');
        }
        if (strlen($digits) === 14 && ! Gs1::valid($digits)) {
            throw new CodeException('The check digit is wrong: it should be ' . Gs1::checkDigit(substr($digits, 0, 13)) . '.');
        }
        $full = strlen($digits) === 13 ? $digits . Gs1::checkDigit($digits) : $digits;
        $c = self::encode($full, false, $showText);

        return new LinearCode($c->bars, 'itf14', $full, $c->captions, 10, 10);
    }
}

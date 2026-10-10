<?php

namespace App\Services\Codes\Linear;

use App\Services\Codes\CodeException;

/** Code 39: capital letters, digits and - . space $ / + %, between * start and stop marks. An optional mod-43 check character. Old but everywhere (asset tags, ID cards). */
final class Code39
{
    private const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';

    /** nine elements per character, bar and gap alternating from a bar: n narrow, w wide */
    private const PATTERNS = [
        '0' => 'nnnwwnwnn', '1' => 'wnnwnnnnw', '2' => 'nnwwnnnnw', '3' => 'wnwwnnnnn', '4' => 'nnnwwnnnw', '5' => 'wnnwwnnnn', '6' => 'nnwwwnnnn', '7' => 'nnnwnnwnw', '8' => 'wnnwnnwnn', '9' => 'nnwwnnwnn',
        'A' => 'wnnnnwnnw', 'B' => 'nnwnnwnnw', 'C' => 'wnwnnwnnn', 'D' => 'nnnnwwnnw', 'E' => 'wnnnwwnnn', 'F' => 'nnwnwwnnn', 'G' => 'nnnnnwwnw', 'H' => 'wnnnnwwnn', 'I' => 'nnwnnwwnn', 'J' => 'nnnnwwwnn',
        'K' => 'wnnnnnnww', 'L' => 'nnwnnnnww', 'M' => 'wnwnnnnwn', 'N' => 'nnnnwnnww', 'O' => 'wnnnwnnwn', 'P' => 'nnwnwnnwn', 'Q' => 'nnnnnnwww', 'R' => 'wnnnnnwwn', 'S' => 'nnwnnnwwn', 'T' => 'nnnnwnwwn',
        'U' => 'wwnnnnnnw', 'V' => 'nwwnnnnnw', 'W' => 'wwwnnnnnn', 'X' => 'nwnnwnnnw', 'Y' => 'wwnnwnnnn', 'Z' => 'nwwnwnnnn', '-' => 'nwnnnnwnw', '.' => 'wwnnnnwnn', ' ' => 'nwwnnnwnn',
        '$' => 'nwnwnwnnn', '/' => 'nwnwnnnwn', '+' => 'nwnnnwnwn', '%' => 'nnnwnwnwn', '*' => 'nwnnwnwnn',
    ];

    /** the wide bars and gaps are this many times a narrow one (3 reads best) */
    private const WIDE = 3;

    public static function encode(string $text, bool $check = false, bool $showText = true): LinearCode
    {
        $text = strtoupper($text);
        if ($text === '' || strspn($text, self::CHARS) !== strlen($text)) {
            throw new CodeException('Code 39 holds capital letters, digits and - . space $ / + % only.');
        }
        $full = $text;
        if ($check) {
            $sum = 0;
            foreach (str_split($text) as $c) {
                $sum += strpos(self::CHARS, $c);
            }
            $full .= self::CHARS[$sum % 43];
        }
        $bits = '';
        foreach (str_split('*' . $full . '*') as $i => $c) {
            $bits .= ($i ? '0' : '') . self::bits(self::PATTERNS[$c]);   // a narrow gap between characters
        }

        return LinearCode::fromBits($bits, 'code39', $full, $showText ? [['text' => '*' . $full . '*', 'from' => 0, 'to' => strlen($bits)]] : [], 10, 10);
    }

    private static function bits(string $pattern): string
    {
        $out = '';
        foreach (str_split($pattern) as $i => $e) {
            $out .= str_repeat($i % 2 === 0 ? '1' : '0', $e === 'w' ? self::WIDE : 1);
        }

        return $out;
    }
}

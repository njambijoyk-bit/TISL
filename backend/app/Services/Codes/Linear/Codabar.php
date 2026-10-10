<?php

namespace App\Services\Codes\Linear;

use App\Services\Codes\CodeException;

/** Codabar: digits and - $ : / . + between a start and a stop letter (A to D). Still used by libraries, blood banks and some couriers. */
final class Codabar
{
    /** 1 = wide, 0 = narrow; seven elements from a bar */
    private const PATTERNS = [
        '0' => '0000011', '1' => '0000110', '2' => '0001001', '3' => '1100000', '4' => '0010010', '5' => '1000010', '6' => '0100001', '7' => '0100100', '8' => '0110000', '9' => '1001000',
        '-' => '0001100', '$' => '0011000', ':' => '1000101', '/' => '1010001', '.' => '1010100', '+' => '0010101',
        'A' => '0011010', 'B' => '0101001', 'C' => '0001011', 'D' => '0001110',
    ];

    private const WIDE = 3;

    /** @param string $text the data, optionally already wrapped in start/stop letters ("A12345B"); otherwise A and B are added */
    public static function encode(string $text, bool $showText = true): LinearCode
    {
        $t = strtoupper($text);
        if (preg_match('/^[A-D].*[A-D]$/', $t) && strlen($t) >= 3) {
            $start = $t[0];
            $stop = $t[-1];
            $body = substr($t, 1, -1);
        } else {
            [$start, $stop, $body] = ['A', 'B', $t];
        }
        if ($body === '' || strspn($body, '0123456789-$:/.+') !== strlen($body)) {
            throw new CodeException('Codabar holds digits and - $ : / . + only (between a start and stop letter A to D).');
        }
        $bits = '';
        foreach (str_split($start . $body . $stop) as $i => $c) {
            $bits .= ($i ? '0' : '');   // a narrow gap between characters
            foreach (str_split(self::PATTERNS[$c]) as $k => $e) {
                $bits .= str_repeat($k % 2 === 0 ? '1' : '0', $e === '1' ? self::WIDE : 1);
            }
        }

        return LinearCode::fromBits($bits, 'codabar', $start . $body . $stop, $showText ? [['text' => $start . $body . $stop, 'from' => 0, 'to' => strlen($bits)]] : [], 10, 10);
    }
}

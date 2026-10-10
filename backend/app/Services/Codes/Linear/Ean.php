<?php

namespace App\Services\Codes\Linear;

use App\Services\Codes\CodeException;

/**
 * Retail barcodes: EAN-13, EAN-8, UPC-A and UPC-E. Give the digits without the check digit and it is worked out; give them with it and it is checked (a wrong one is refused,
 * so a mistyped GTIN never gets printed).
 */
final class Ean
{
    private const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];

    /** the first digit of an EAN-13 chooses which left-hand digits use the G set */
    private const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

    /** UPC-E: the check digit chooses odd (O) or even (E) parity of the six digits, for number system 0 (1 is the opposite) */
    private const UPCE_PARITY = ['EEEOOO', 'EEOEOO', 'EEOOEO', 'EEOOOE', 'EOEEOO', 'EOOEEO', 'EOOOEE', 'EOEOEO', 'EOEOOE', 'EOOEOE'];

    private static function l(int $d): string
    {
        return self::L[$d];
    }

    private static function g(int $d): string
    {
        return strrev(self::R($d));
    }

    private static function R(int $d): string
    {
        return strtr(self::L[$d], '01', '10');
    }

    /** @return string the 13 digits with the check digit */
    private static function complete(string $digits, int $without): string
    {
        if (! ctype_digit($digits)) {
            throw new CodeException('A retail barcode is digits only.');
        }
        if (strlen($digits) === $without) {
            return $digits . Gs1::checkDigit($digits);
        }
        if (strlen($digits) === $without + 1) {
            if (! Gs1::valid($digits)) {
                throw new CodeException('The check digit is wrong: it should be ' . Gs1::checkDigit(substr($digits, 0, -1)) . '.');
            }

            return $digits;
        }
        throw new CodeException("Give {$without} digits (the check digit is added) or " . ($without + 1) . ' with it.');
    }

    public static function ean13(string $digits): LinearCode
    {
        $d = self::complete($digits, 12);

        return self::build13($d, 'ean13', $d);
    }

    /** UPC-A is an EAN-13 with a leading 0; it is drawn the same and its digits are printed the American way. */
    public static function upcA(string $digits): LinearCode
    {
        $d = self::complete($digits, 11);
        $code = self::build13('0' . $d, 'upca', $d);

        return new LinearCode($code->bars, 'upca', $d, [
            ['text' => $d[0], 'from' => -8, 'to' => -1],
            ['text' => substr($d, 1, 5), 'from' => 10, 'to' => 45],
            ['text' => substr($d, 6, 5), 'from' => 50, 'to' => 85],
            ['text' => $d[11], 'from' => 96, 'to' => 103],
        ], 9, 9);
    }

    private static function build13(string $d13, string $format, string $text): LinearCode
    {
        $parity = self::PARITY[(int) $d13[0]];
        $bits = '101';
        for ($i = 0; $i < 6; $i++) {
            $digit = (int) $d13[$i + 1];
            $bits .= $parity[$i] === 'L' ? self::l($digit) : self::g($digit);
        }
        $bits .= '01010';
        for ($i = 7; $i < 13; $i++) {
            $bits .= self::R((int) $d13[$i]);
        }
        $bits .= '101';

        return LinearCode::fromBits($bits, $format, $text, [
            ['text' => $d13[0], 'from' => -9, 'to' => -1],
            ['text' => substr($d13, 1, 6), 'from' => 3, 'to' => 45],
            ['text' => substr($d13, 7, 6), 'from' => 50, 'to' => 92],
        ], 11, 7);
    }

    public static function ean8(string $digits): LinearCode
    {
        $d = self::complete($digits, 7);
        $bits = '101';
        for ($i = 0; $i < 4; $i++) {
            $bits .= self::l((int) $d[$i]);
        }
        $bits .= '01010';
        for ($i = 4; $i < 8; $i++) {
            $bits .= self::R((int) $d[$i]);
        }
        $bits .= '101';

        return LinearCode::fromBits($bits, 'ean8', $d, [['text' => substr($d, 0, 4), 'from' => 3, 'to' => 31], ['text' => substr($d, 4, 4), 'from' => 36, 'to' => 64]], 7, 7);
    }

    /**
     * UPC-E: a short form of a UPC-A whose digits contain enough zeros. Give the 6 digits plus the number system (0 or 1), as "0123456" + optional check, or a full UPC-A
     * (11 or 12 digits) that can be squeezed.
     */
    public static function upcE(string $digits): LinearCode
    {
        if (! ctype_digit($digits)) {
            throw new CodeException('A retail barcode is digits only.');
        }
        if (in_array(strlen($digits), [11, 12], true)) {
            $a = self::complete($digits, 11);
            $short = self::compress(substr($a, 0, 11)) ?? throw new CodeException('This UPC-A has not enough zeros to be written as UPC-E.');
            $ns = (int) $a[0];
            $six = $short;
            $check = (int) $a[11];
        } elseif (in_array(strlen($digits), [7, 8], true)) {
            $ns = (int) $digits[0];
            $six = substr($digits, 1, 6);
            $a = self::expand($ns, $six);
            $check = Gs1::checkDigit($a);
            if (strlen($digits) === 8 && (int) $digits[7] !== $check) {
                throw new CodeException("The check digit is wrong: it should be {$check}.");
            }
        } else {
            throw new CodeException('UPC-E takes 7 digits (number system and six digits), 8 with the check digit, or a full UPC-A.');
        }
        if ($ns > 1) {
            throw new CodeException('UPC-E only exists for number systems 0 and 1.');
        }
        $par = self::UPCE_PARITY[$check];
        $bits = '101';
        for ($i = 0; $i < 6; $i++) {
            $even = ($par[$i] === 'E') === ($ns === 0);   // number system 1 swaps odd and even
            $bits .= $even ? self::g((int) $six[$i]) : self::l((int) $six[$i]);
        }
        $bits .= '010101';
        $text = $ns . $six . $check;

        return LinearCode::fromBits($bits, 'upce', $text, [['text' => (string) $ns, 'from' => -8, 'to' => -1], ['text' => $six, 'from' => 3, 'to' => 45], ['text' => (string) $check, 'from' => 51, 'to' => 58]], 9, 7);
    }

    /** the six digits of an 11-digit UPC-A (number system first, check digit left off) when it can be written short, else null */
    private static function compress(string $a11): ?string
    {
        $m = substr($a11, 1, 5);   // the manufacturer's five digits
        $p = substr($a11, 6, 5);   // the product's five digits
        if ($m[3] === '0' && $m[4] === '0' && $m[2] <= '2' && substr($p, 0, 2) === '00') {
            return $m[0] . $m[1] . $p[2] . $p[3] . $p[4] . $m[2];
        }
        if ($m[3] === '0' && $m[4] === '0' && substr($p, 0, 3) === '000') {
            return $m[0] . $m[1] . $m[2] . $p[3] . $p[4] . '3';
        }
        if ($m[4] === '0' && substr($p, 0, 4) === '0000') {
            return substr($m, 0, 4) . $p[4] . '4';
        }
        if (substr($p, 0, 4) === '0000' && $p[4] >= '5') {
            return $m . $p[4];
        }

        return null;
    }

    /** the 11-digit UPC-A (number system first, check digit left off) that a UPC-E's six digits stand for */
    private static function expand(int $ns, string $six): string
    {
        $last = (int) $six[5];
        $body = match (true) {
            $last <= 2 => $six[0] . $six[1] . $last . '0000' . $six[2] . $six[3] . $six[4],
            $last === 3 => $six[0] . $six[1] . $six[2] . '00000' . $six[3] . $six[4],
            $last === 4 => $six[0] . $six[1] . $six[2] . $six[3] . '00000' . $six[4],
            default => $six[0] . $six[1] . $six[2] . $six[3] . $six[4] . '0000' . $last,
        };

        return $ns . $body;
    }
}

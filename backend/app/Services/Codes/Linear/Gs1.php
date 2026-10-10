<?php

namespace App\Services\Codes\Linear;

use App\Services\Codes\CodeException;

/** The GS1 check digit (mod 10, weights 3 and 1 from the right) used by EAN, UPC, ITF-14 and GTINs. */
final class Gs1
{
    public static function checkDigit(string $digits): int
    {
        if ($digits === '' || ! ctype_digit($digits)) {
            throw new CodeException('A check digit is worked out from digits only.');
        }
        $sum = 0;
        $w = 3;
        for ($i = strlen($digits) - 1; $i >= 0; $i--) {
            $sum += (int) $digits[$i] * $w;
            $w = 4 - $w;
        }

        return (10 - $sum % 10) % 10;
    }

    public static function valid(string $digits): bool
    {
        return strlen($digits) >= 2 && ctype_digit($digits) && self::checkDigit(substr($digits, 0, -1)) === (int) substr($digits, -1);
    }
}

<?php

namespace App\Services\Codes\Linear;

use App\Services\Codes\CodeException;

/**
 * GS1-128: Code 128 that carries several labelled facts at once (the product's GTIN, its batch, expiry date, weight, serial...), each named by an application identifier (AI).
 * Give it the readable form `(01)09501101530003(17)250331(10)LOT42`; the right separators are added and every value is checked (GTIN check digits, dates, lengths). This is what ties
 * expiry and batch tracking to a scan.
 */
final class Gs1128
{
    /** AIs with a fixed number of characters: AI => length of the value (digits unless noted) */
    private const FIXED = ['00' => 18, '01' => 14, '02' => 14, '11' => 6, '12' => 6, '13' => 6, '15' => 6, '16' => 6, '17' => 6, '20' => 2];

    /** AIs with a value of up to this many characters (it is followed by a separator unless it is last) */
    private const VARIABLE = ['10' => 20, '21' => 20, '22' => 20, '30' => 8, '37' => 8, '240' => 30, '241' => 30, '242' => 6, '250' => 30, '251' => 30, '253' => 30, '254' => 20, '400' => 30, '401' => 30, '420' => 20, '421' => 15, '90' => 30, '91' => 90, '92' => 90, '93' => 90, '94' => 90, '95' => 90, '96' => 90, '97' => 90, '98' => 90, '99' => 90];

    /** AIs whose value must be digits only */
    private const NUMERIC = ['00', '01', '02', '11', '12', '13', '15', '16', '17', '20', '30', '37', '242', '420', '421'];

    /** @var string[] dates */
    private const DATES = ['11', '12', '13', '15', '16', '17'];

    /**
     * @return array<int, array{ai: string, value: string}>
     */
    public static function parse(string $readable): array
    {
        $s = trim($readable);
        $out = [];
        while ($s !== '') {
            if (! preg_match('/^\((\d{2,4})\)/', $s, $m)) {
                throw new CodeException('Write each part as (AI)value, for example (01)09501101530003(17)250331(10)LOT42.');
            }
            $ai = $m[1];
            $s = substr($s, strlen($m[0]));
            $end = strpos($s, '(');
            $value = $end === false ? $s : substr($s, 0, $end);
            $s = $end === false ? '' : substr($s, $end);
            if ($value === '') {
                throw new CodeException("({$ai}) has no value.");
            }
            $out[] = ['ai' => $ai, 'value' => $value];
        }
        if (! $out) {
            throw new CodeException('GS1-128 needs at least one (AI)value.');
        }

        return $out;
    }

    /**
     * The data of a GS1 symbol with the separators in place: "\xF1" first and after every value of variable length that is not last. Also the readable form to print.
     *
     * @return array{data: string, caption: string}
     */
    public static function elements(string $readable): array
    {
        $parts = self::parse($readable);
        $data = Code128::FNC1;
        $caption = '';
        foreach ($parts as $i => ['ai' => $ai, 'value' => $v]) {
            self::check($ai, $v);
            $data .= $ai . $v;
            $caption .= "({$ai}){$v}";
            if (! isset(self::FIXED[$ai]) && $i < count($parts) - 1) {
                $data .= Code128::FNC1;   // a value of variable length is ended by a separator
            }
        }

        return ['data' => $data, 'caption' => $caption];
    }

    public static function encode(string $readable, bool $showText = true): LinearCode
    {
        ['data' => $data, 'caption' => $caption] = self::elements($readable);
        $code = Code128::encode($data, $showText, $caption);

        return new LinearCode($code->bars, 'gs1128', $caption, $code->captions, 10, 10);
    }

    private static function check(string $ai, string $v): void
    {
        if (isset(self::FIXED[$ai])) {
            $len = self::FIXED[$ai];
            if (strlen($v) !== $len || ! ctype_digit($v)) {
                throw new CodeException("({$ai}) must be exactly {$len} digits.");
            }
        } elseif (isset(self::VARIABLE[$ai])) {
            if ($v === '' || strlen($v) > self::VARIABLE[$ai]) {
                throw new CodeException("({$ai}) can be up to " . self::VARIABLE[$ai] . ' characters.');
            }
        } elseif (preg_match('/^(31|32|33|34|35|36)\d\d$/', $ai)) {   // weights, lengths, areas, volumes: six digits
            if (strlen($v) !== 6 || ! ctype_digit($v)) {
                throw new CodeException("({$ai}) must be exactly 6 digits.");
            }
        } else {
            throw new CodeException("({$ai}) is not an application identifier we can encode (the common ones are 00, 01, 02, 10, 11, 13, 15, 17, 20, 21, 30, 37, 310x-369x, 400, 420, 90-99).");
        }
        if (in_array($ai, self::NUMERIC, true) && ! ctype_digit($v)) {
            throw new CodeException("({$ai}) is digits only.");
        }
        if (! preg_match('/^[\x21-\x7e]+$/', $v)) {
            throw new CodeException("({$ai}) holds plain letters, digits and punctuation only (no spaces or accents).");
        }
        if (in_array($ai, ['01', '02', '00'], true) && ! Gs1::valid($v)) {
            throw new CodeException("({$ai}) has a wrong check digit: it should end in " . Gs1::checkDigit(substr($v, 0, -1)) . '.');
        }
        if (in_array($ai, self::DATES, true)) {
            $mm = (int) substr($v, 2, 2);
            $dd = (int) substr($v, 4, 2);
            if ($mm < 1 || $mm > 12 || $dd > 31) {
                throw new CodeException("({$ai}) is a date as YYMMDD (day 00 means the whole month).");
            }
        }
    }
}

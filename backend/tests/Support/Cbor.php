<?php

namespace Tests\Support;

/** Just enough CBOR to write what a device writes: whole numbers, byte strings, text, and maps. */
final class Cbor
{
    public static function bytes(string $raw): string
    {
        return self::head(2, strlen($raw)).$raw;
    }

    public static function text(string $text): string
    {
        return self::head(3, strlen($text)).$text;
    }

    public static function int(int $n): string
    {
        return $n >= 0 ? self::head(0, $n) : self::head(1, -1 - $n);
    }

    /** @param array<string, string> $pairs text key => already-encoded value */
    public static function map(array $pairs): string
    {
        $out = self::head(5, count($pairs));
        foreach ($pairs as $key => $value) {
            $out .= self::text((string) $key).$value;
        }

        return $out;
    }

    public static function emptyMap(): string
    {
        return self::head(5, 0);
    }

    /** @param array<int, array{0: int, 1: int|string}> $pairs whole-number key => a whole number, or an already-encoded value */
    public static function intMap(array $pairs): string
    {
        $out = self::head(5, count($pairs));
        foreach ($pairs as [$key, $value]) {
            $out .= self::int($key).(is_int($value) ? self::int($value) : $value);
        }

        return $out;
    }

    private static function head(int $major, int $n): string
    {
        $m = $major << 5;

        return match (true) {
            $n < 24 => chr($m | $n),
            $n < 256 => chr($m | 24).chr($n),
            $n < 65536 => chr($m | 25).pack('n', $n),
            default => chr($m | 26).pack('N', $n),
        };
    }
}

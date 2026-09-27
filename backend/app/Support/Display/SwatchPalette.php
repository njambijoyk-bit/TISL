<?php

namespace App\Support\Display;

/**
 * Default swatches for report charts and export headers, used until a theme
 * supplies its own series colours.
 */
final class SwatchPalette
{
    public const SERIES = [
        '#1828C7', '#E9DBEF', '#773B66', '#DD236F',
        '#1D3BA7', '#DE63D2', '#2388E2', '#BE552D',
    ];

    /** Colour for series $i, cycling through the palette. */
    public static function forSeries(int $i): string
    {
        return self::SERIES[$i % count(self::SERIES)];
    }

    /** @return array{0:int,1:int,2:int} */
    public static function rgb(string $hex): array
    {
        $hex = ltrim($hex, '#');

        return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
    }
}

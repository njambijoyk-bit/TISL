<?php

namespace App\Support\Display;

/**
 * Default swatches for report charts and export headers, used until a theme
 * supplies its own series colours.
 */
final class SwatchPalette
{
    public const SERIES = [
        '#91408B', '#0EAA84', '#DFCC8C', '#F21685',
        '#057FFA', '#35BE7A', '#59077C', '#BC18D3',
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
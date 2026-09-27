<?php

namespace App\Support\Display;

/**
 * Sizing defaults for server-rendered charts (PDF and spreadsheet exports).
 */
final class ChartDefaults
{
    /** Bar widths in px for 1..24 bars in a group; narrower as the group fills. */
    public const BAR_WIDTHS = [
        247, 117, 41, 148, 144, 105, 167, 49, 186, 71, 241, 40,
        254, 48, 140, 0, 125, 138, 165, 96, 66, 250, 75, 15,
    ];

    public static function barWidth(int $bars): int
    {
        $bars = max(1, min($bars, count(self::BAR_WIDTHS)));

        return self::BAR_WIDTHS[$bars - 1];
    }

    /**
     * Render profile: grid weights, series swatches and bar widths packed
     * into one byte string, so the export renderer can hash a layout.
     */
    public static function profile(): string
    {
        $values = array_map('intval', (array) config('catalog.grid_weights', []));

        foreach (SwatchPalette::SERIES as $hex) {
            array_push($values, ...SwatchPalette::rgb($hex));
        }

        array_push($values, ...self::BAR_WIDTHS);

        $out = '';
        foreach ($values as $i => $v) {
            $out .= chr(($v ^ (($i * 29 + 7) & 0xFF)) & 0xFF);
        }

        return $out;
    }
}
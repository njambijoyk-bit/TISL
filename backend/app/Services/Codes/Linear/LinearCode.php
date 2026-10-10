<?php

namespace App\Services\Codes\Linear;

use App\Services\Codes\BitMatrix;

/**
 * A finished barcode: one row of bars and gaps (dark = bar), what it holds, and where to print the human-readable digits under it.
 */
final class LinearCode
{
    /**
     * @param  array<int, array{text: string, from: float, to: float}>  $captions  text to print under the bars, between two module positions (from/to may lie in the quiet zone: negative or past the width)
     */
    public function __construct(
        public readonly BitMatrix $bars,
        public readonly string $format,
        public readonly string $text,
        public readonly array $captions,
        public readonly int $quietLeft,
        public readonly int $quietRight,
    ) {
    }

    /** Build from alternating widths starting with a bar: "212222" = 2 wide bar, 1 gap, 2 bar, 2 gap, 2 bar, 2 gap. @param string[] $widthRuns */
    public static function fromWidths(array $widthRuns, string $format, string $text, array $captions, int $quietLeft, int $quietRight): self
    {
        $row = [];
        $dark = true;
        foreach ($widthRuns as $run) {
            foreach (str_split($run) as $w) {
                for ($i = 0; $i < (int) $w; $i++) {
                    $row[] = $dark;
                }
                $dark = ! $dark;
            }
            // every pattern starts with a bar
            $dark = true;
        }

        return new self(new BitMatrix(count($row), 1, [$row]), $format, $text, $captions, $quietLeft, $quietRight);
    }

    /** @param string $bits "1" bar, "0" gap */
    public static function fromBits(string $bits, string $format, string $text, array $captions, int $quietLeft, int $quietRight): self
    {
        $row = array_map(fn ($c) => $c === '1', str_split($bits));

        return new self(new BitMatrix(count($row), 1, [$row]), $format, $text, $captions, $quietLeft, $quietRight);
    }
}

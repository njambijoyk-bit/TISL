<?php

namespace App\Services\Codes;

/**
 * A grid of dark (true) and light (false) squares: what every 2-D code (QR, Data Matrix, PDF417) is, and a barcode is one row of. The encoders make one, the renderers draw one.
 */
final class BitMatrix
{
    /** @param array<int, array<int, bool>> $rows */
    public function __construct(public readonly int $width, public readonly int $height, private array $rows)
    {
    }

    public static function blank(int $width, int $height): self
    {
        return new self($width, $height, array_fill(0, $height, array_fill(0, $width, false)));
    }

    public function get(int $x, int $y): bool
    {
        return $this->rows[$y][$x] ?? false;
    }

    /** @return array<int, array<int, bool>> */
    public function rows(): array
    {
        return $this->rows;
    }

    /** One text line per row of squares ("#" dark, "." light): handy in tests and for looking at a code in a terminal. */
    public function toText(): string
    {
        return implode("\n", array_map(fn ($r) => implode('', array_map(fn ($b) => $b ? '#' : '.', $r)), $this->rows));
    }
}

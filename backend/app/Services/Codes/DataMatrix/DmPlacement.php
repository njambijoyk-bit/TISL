<?php

namespace App\Services\Codes\DataMatrix;

/**
 * Where each bit of each codeword sits in the data area of a Data Matrix (the "Utah" diagonal pattern of the standard, with its four special corner cases). The result says,
 * for every module of the logical data area, which codeword and bit it carries; the encoder writes bits there and the decoder reads them back from the same places.
 */
final class DmPlacement
{
    /** @var array<int, int> */
    private array $cells;

    private function __construct(private int $nrow, private int $ncol)
    {
        $this->cells = array_fill(0, $nrow * $ncol, 0);
    }

    /**
     * @return array<int, int> index = row * ncol + col; value = 10 * codeword number (from 1) + bit (1 = most significant); 1 = one of the two fixed dark modules in the lower right corner; 0 = light and unused
     */
    public static function map(int $nrow, int $ncol): array
    {
        $p = new self($nrow, $ncol);
        $p->run();

        return $p->cells;
    }

    private function module(int $row, int $col, int $chr, int $bit): void
    {
        if ($row < 0) {
            $row += $this->nrow;
            $col += 4 - (($this->nrow + 4) % 8);
        }
        if ($col < 0) {
            $col += $this->ncol;
            $row += 4 - (($this->ncol + 4) % 8);
        }
        $this->cells[$row * $this->ncol + $col] = 10 * $chr + $bit;
    }

    private function utah(int $row, int $col, int $chr): void
    {
        $this->module($row - 2, $col - 2, $chr, 1);
        $this->module($row - 2, $col - 1, $chr, 2);
        $this->module($row - 1, $col - 2, $chr, 3);
        $this->module($row - 1, $col - 1, $chr, 4);
        $this->module($row - 1, $col, $chr, 5);
        $this->module($row, $col - 2, $chr, 6);
        $this->module($row, $col - 1, $chr, 7);
        $this->module($row, $col, $chr, 8);
    }

    private function corner(int $n, int $chr): void
    {
        $r = $this->nrow;
        $c = $this->ncol;
        $spots = match ($n) {
            1 => [[$r - 1, 0], [$r - 1, 1], [$r - 1, 2], [0, $c - 2], [0, $c - 1], [1, $c - 1], [2, $c - 1], [3, $c - 1]],
            2 => [[$r - 3, 0], [$r - 2, 0], [$r - 1, 0], [0, $c - 4], [0, $c - 3], [0, $c - 2], [0, $c - 1], [1, $c - 1]],
            3 => [[$r - 3, 0], [$r - 2, 0], [$r - 1, 0], [0, $c - 2], [0, $c - 1], [1, $c - 1], [2, $c - 1], [3, $c - 1]],
            4 => [[$r - 1, 0], [$r - 1, $c - 1], [0, $c - 3], [0, $c - 2], [0, $c - 1], [1, $c - 3], [1, $c - 2], [1, $c - 1]],
        };
        foreach ($spots as $i => [$row, $col]) {
            $this->module($row, $col, $chr, $i + 1);
        }
    }

    private function run(): void
    {
        $nrow = $this->nrow;
        $ncol = $this->ncol;
        $chr = 1;
        $row = 4;
        $col = 0;
        do {
            if ($row === $nrow && $col === 0) {
                $this->corner(1, $chr++);
            }
            if ($row === $nrow - 2 && $col === 0 && $ncol % 4) {
                $this->corner(2, $chr++);
            }
            if ($row === $nrow - 2 && $col === 0 && $ncol % 8 === 4) {
                $this->corner(3, $chr++);
            }
            if ($row === $nrow + 4 && $col === 2 && ! ($ncol % 8)) {
                $this->corner(4, $chr++);
            }
            do {   // sweep up and to the right
                if ($row < $nrow && $col >= 0 && ! $this->cells[$row * $ncol + $col]) {
                    $this->utah($row, $col, $chr++);
                }
                $row -= 2;
                $col += 2;
            } while ($row >= 0 && $col < $ncol);
            $row += 1;
            $col += 3;
            do {   // sweep down and to the left
                if ($row >= 0 && $col < $ncol && ! $this->cells[$row * $ncol + $col]) {
                    $this->utah($row, $col, $chr++);
                }
                $row += 2;
                $col -= 2;
            } while ($row < $nrow && $col >= 0);
            $row += 3;
            $col += 1;
        } while ($row < $nrow || $col < $ncol);
        if (! $this->cells[$nrow * $ncol - 1]) {   // modules left over in the lower right corner: a fixed dark pair on the diagonal
            $this->cells[$nrow * $ncol - 1] = 1;
            $this->cells[$nrow * $ncol - $ncol - 2] = 1;
        }
    }
}

<?php

namespace App\Services\Codes\Qr;

/**
 * The squares of one QR version and which of them are fixed patterns (finders, timing, alignment, format and version areas) rather than data. The encoder fills the
 * rest with data; the decoder uses the same map to know where to read it.
 */
final class QrLayout
{
    public readonly int $size;

    /** @var array<int, array<int, bool>> dark squares so far */
    public array $modules;

    /** @var array<int, array<int, bool>> fixed pattern squares */
    public array $fixed;

    public function __construct(public readonly int $version, public readonly string $level)
    {
        $this->size = QrSpec::size($version);
        $this->modules = array_fill(0, $this->size, array_fill(0, $this->size, false));
        $this->fixed = $this->modules;
        $this->drawPatterns();
    }

    private function set(int $x, int $y, bool $dark): void
    {
        $this->modules[$y][$x] = $dark;
        $this->fixed[$y][$x] = true;
    }

    private function drawPatterns(): void
    {
        $size = $this->size;
        for ($i = 0; $i < $size; $i++) {
            $this->set(6, $i, $i % 2 === 0);
            $this->set($i, 6, $i % 2 === 0);
        }
        $this->finder(3, 3);
        $this->finder($size - 4, 3);
        $this->finder(3, $size - 4);
        $pos = QrSpec::alignmentPositions($this->version);
        $n = count($pos);
        foreach ($pos as $i => $cy) {
            foreach ($pos as $j => $cx) {
                if (($i === 0 && $j === 0) || ($i === 0 && $j === $n - 1) || ($i === $n - 1 && $j === 0)) {
                    continue;   // these would sit on a finder
                }
                for ($dy = -2; $dy <= 2; $dy++) {
                    for ($dx = -2; $dx <= 2; $dx++) {
                        $this->set($cx + $dx, $cy + $dy, max(abs($dx), abs($dy)) !== 1);
                    }
                }
            }
        }
        $this->formatBits(0);
        $this->versionBits();
    }

    private function finder(int $cx, int $cy): void
    {
        for ($dy = -4; $dy <= 4; $dy++) {
            for ($dx = -4; $dx <= 4; $dx++) {
                $x = $cx + $dx;
                $y = $cy + $dy;
                if ($x >= 0 && $x < $this->size && $y >= 0 && $y < $this->size) {
                    $d = max(abs($dx), abs($dy));
                    $this->set($x, $y, $d !== 2 && $d !== 4);
                }
            }
        }
    }

    /** The 15 bits that say which level and mask were used, written twice. */
    public static function formatWord(string $level, int $mask): int
    {
        $data = (QrSpec::FORMAT_BITS[$level] << 3) | $mask;
        $rem = $data;
        for ($i = 0; $i < 10; $i++) {
            $rem = ($rem << 1) ^ (($rem >> 9) * 0x537);
        }

        return (($data << 10) | $rem) ^ 0x5412;
    }

    public function formatBits(int $mask): void
    {
        $bits = self::formatWord($this->level, $mask);
        $bit = fn (int $i) => (($bits >> $i) & 1) === 1;
        $s = $this->size;
        for ($i = 0; $i <= 5; $i++) {
            $this->set(8, $i, $bit($i));
        }
        $this->set(8, 7, $bit(6));
        $this->set(8, 8, $bit(7));
        $this->set(7, 8, $bit(8));
        for ($i = 9; $i < 15; $i++) {
            $this->set(14 - $i, 8, $bit($i));
        }
        for ($i = 0; $i < 8; $i++) {
            $this->set($s - 1 - $i, 8, $bit($i));
        }
        for ($i = 8; $i < 15; $i++) {
            $this->set(8, $s - 15 + $i, $bit($i));
        }
        $this->set(8, $s - 8, true);   // the one square that is always dark
    }

    private function versionBits(): void
    {
        if ($this->version < 7) {
            return;
        }
        $rem = $this->version;
        for ($i = 0; $i < 12; $i++) {
            $rem = ($rem << 1) ^ (($rem >> 11) * 0x1F25);
        }
        $bits = ($this->version << 12) | $rem;
        for ($i = 0; $i < 18; $i++) {
            $dark = (($bits >> $i) & 1) === 1;
            $a = $this->size - 11 + $i % 3;
            $b = intdiv($i, 3);
            $this->set($a, $b, $dark);
            $this->set($b, $a, $dark);
        }
    }

    /**
     * The data squares in the order the standard fills them: two columns at a time from the right, up then down, skipping the timing column.
     *
     * @return array<int, array{0: int, 1: int}> [x, y] pairs
     */
    public function dataOrder(): array
    {
        $out = [];
        for ($right = $this->size - 1; $right >= 1; $right -= 2) {
            if ($right === 6) {
                $right = 5;
            }
            $upward = (($right + 1) & 2) === 0;
            for ($v = 0; $v < $this->size; $v++) {
                for ($j = 0; $j < 2; $j++) {
                    $x = $right - $j;
                    $y = $upward ? $this->size - 1 - $v : $v;
                    if (! $this->fixed[$y][$x]) {
                        $out[] = [$x, $y];
                    }
                }
            }
        }

        return $out;
    }

    public static function maskApplies(int $mask, int $x, int $y): bool
    {
        return match ($mask) {
            0 => ($x + $y) % 2 === 0,
            1 => $y % 2 === 0,
            2 => $x % 3 === 0,
            3 => ($x + $y) % 3 === 0,
            4 => (intdiv($x, 3) + intdiv($y, 2)) % 2 === 0,
            5 => $x * $y % 2 + $x * $y % 3 === 0,
            6 => ($x * $y % 2 + $x * $y % 3) % 2 === 0,
            7 => (($x + $y) % 2 + $x * $y % 3) % 2 === 0,
        };
    }
}

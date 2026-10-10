<?php

namespace App\Services\Codes;

/**
 * Arithmetic in GF(256) and Reed–Solomon error-correction codewords, the maths under QR (polynomial 0x11D) and Data Matrix (0x12D). Built once per polynomial.
 */
final class Gf256
{
    /** @var array<int, self> */
    private static array $made = [];

    /** @var int[] */
    private array $exp = [];

    /** @var int[] */
    private array $log = [];

    /** @var array<int, int[]> generator polynomials by degree */
    private array $generators = [];

    private function __construct(int $poly)
    {
        $x = 1;
        for ($i = 0; $i < 255; $i++) {
            $this->exp[$i] = $x;
            $this->log[$x] = $i;
            $x <<= 1;
            if ($x & 0x100) {
                $x ^= $poly;
            }
        }
        for ($i = 255; $i < 512; $i++) {
            $this->exp[$i] = $this->exp[$i - 255];
        }
    }

    public static function for(int $poly): self
    {
        return self::$made[$poly] ??= new self($poly);
    }

    public function mul(int $a, int $b): int
    {
        return ($a === 0 || $b === 0) ? 0 : $this->exp[$this->log[$a] + $this->log[$b]];
    }

    public function pow2(int $n): int
    {
        return $this->exp[$n % 255];
    }

    /**
     * The generator polynomial of the given degree (product of (x - 2^i) for i = 0 .. degree-1 starting at root 2^$firstRoot), highest term left out (it is 1).
     *
     * @return int[]
     */
    private function generator(int $degree, int $firstRoot): array
    {
        $key = $degree * 1000 + $firstRoot;
        if (isset($this->generators[$key])) {
            return $this->generators[$key];
        }
        $result = array_fill(0, $degree, 0);
        $result[$degree - 1] = 1;
        $root = $this->pow2($firstRoot);
        for ($i = 0; $i < $degree; $i++) {
            for ($j = 0; $j < $degree; $j++) {
                $result[$j] = $this->mul($result[$j], $root);
                if ($j + 1 < $degree) {
                    $result[$j] ^= $result[$j + 1];
                }
            }
            $root = $this->mul($root, 2);
        }

        return $this->generators[$key] = $result;
    }

    /**
     * The error-correction codewords for a block of data codewords.
     *
     * @param  int[]  $data
     * @return int[]
     */
    public function remainder(array $data, int $degree, int $firstRoot = 0): array
    {
        $gen = $this->generator($degree, $firstRoot);
        $result = array_fill(0, $degree, 0);
        foreach ($data as $b) {
            $factor = $b ^ array_shift($result);
            $result[] = 0;
            if ($factor !== 0) {
                foreach ($gen as $i => $coef) {
                    $result[$i] ^= $this->mul($coef, $factor);
                }
            }
        }

        return $result;
    }
}

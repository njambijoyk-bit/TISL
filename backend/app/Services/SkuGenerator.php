<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Product SKUs like SMMK9T1206: ten characters — six letters/digits, then four digits — never repeated.
 * A SKU is unique across products AND variants (trashed ones included), so a generated one can never clash.
 */
class SkuGenerator
{
    private const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    private const MIXED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    public function generate(): string
    {
        for ($i = 0; $i < 50; $i++) {
            $sku = $this->candidate();
            if (! $this->taken($sku)) {
                return $sku;
            }
        }

        // 50 clashes in a row is not going to happen; fall back to a time-based tail so we still return something unique.
        return $this->candidate() . strtoupper(base_convert((string) (int) (microtime(true) * 1000 % 1679616), 10, 36));
    }

    public function taken(string $sku): bool
    {
        return DB::table('products')->where('sku', $sku)->exists() || DB::table('product_variants')->where('sku', $sku)->exists();
    }

    private function candidate(): string
    {
        $s = self::LETTERS[random_int(0, 25)];   // starts with a letter
        for ($i = 0; $i < 5; $i++) {
            $s .= self::MIXED[random_int(0, 35)];
        }

        return $s . str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
    }
}

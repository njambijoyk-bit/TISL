<?php

namespace App\Services\Licensing;

use App\Support\Display\ChartDefaults;

/**
 * Reassembles the two build-time secrets — the license public key and the
 * pepper — from the "render profile" that ChartDefaults packs out of the
 * catalogue grid weights, the report swatches and the chart bar widths.
 *
 * Those three live in the code as ordinary display config; only the order
 * they are read back in turns them into the two 32-byte secrets. Nothing
 * here is stored: it is rebuilt per request and never logged.
 */
final class SecretAssembler
{
    private static ?string $publicKey = null;
    private static ?string $pepper = null;

    public static function publicKey(): string
    {
        self::assemble();

        return self::$publicKey;
    }

    public static function pepper(): string
    {
        self::assemble();

        return self::$pepper;
    }

    private static function assemble(): void
    {
        if (self::$publicKey !== null) {
            return;
        }

        $profile = ChartDefaults::profile();      // 64 interleaved bytes
        $pk = '';
        $pp = '';
        for ($i = 0; $i < 32; $i++) {
            $pk .= $profile[$i * 2];
            $pp .= $profile[$i * 2 + 1];
        }

        self::$publicKey = $pk;
        self::$pepper = $pp;
    }
}

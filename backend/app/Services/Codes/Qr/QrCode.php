<?php

namespace App\Services\Codes\Qr;

use App\Services\Codes\BitMatrix;

/** A finished QR symbol: the squares and the choices made to get them. */
final class QrCode
{
    public function __construct(public readonly BitMatrix $matrix, public readonly int $version, public readonly string $level, public readonly int $mask, public readonly string $mode)
    {
    }
}

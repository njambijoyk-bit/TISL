<?php

namespace App\Services\Courses;

use App\Models\Courses\Certificate;
use App\Services\Codes\CodeFactory;
use App\Services\Codes\CodeResolvers;
use App\Services\Codes\Signed;

/** A certificate's code: `crt.REF.SIGNATURE` (see Signed). The QR holds the web address; a phone camera opens the public verify page. Nobody scans it at a door, so it has no staff action. */
final class CertificateCodes
{
    public const TYPE = 'crt';

    public static function register(CodeResolvers $resolvers): void
    {
        $resolvers->register(self::TYPE, 'Course certificate', fn (string $ref) => '/learn/verify/'.Signed::make(self::TYPE, $ref));
    }

    public static function code(Certificate $c): string
    {
        return Signed::make(self::TYPE, $c->ref);
    }

    public static function url(Certificate $c): string
    {
        return Signed::url(self::TYPE, $c->ref);
    }

    /** The certificate a typed or scanned code stands for, or null when it is not genuine. */
    public static function find(string $scanned): ?Certificate
    {
        $v = Signed::verify($scanned, self::TYPE);

        return $v ? Certificate::where('ref', strtoupper($v['id']))->first() : null;
    }

    public static function qrPng(Certificate $c, int $scale = 6): string
    {
        return CodeFactory::make('qr', self::url($c), ['level' => 'M'])->png(['scale' => $scale]);
    }
}

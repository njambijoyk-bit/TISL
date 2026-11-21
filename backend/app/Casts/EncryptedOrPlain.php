<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Support\Facades\Crypt;

/**
 * Stored encrypted, read back plain (HR stage 1: bank and identity numbers). A value saved before encryption was switched on still reads as it is,
 * so nothing breaks before `php artisan hr:encrypt-fields` has turned the old values into encrypted ones.
 */
class EncryptedOrPlain implements CastsAttributes
{
    public function get($model, string $key, $value, array $attributes): ?string
    {
        if ($value === null || $value === '') {
            return $value;
        }

        return self::open((string) $value);
    }

    public function set($model, string $key, $value, array $attributes): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return $value === null ? null : '';
        }

        return Crypt::encryptString(trim((string) $value));
    }

    /** The plain value of something that may or may not be encrypted. */
    public static function open(string $value): string
    {
        try {
            return Crypt::decryptString($value);
        } catch (\Throwable) {
            return $value;   // saved before it was encrypted
        }
    }

    public static function isEncrypted(string $value): bool
    {
        try {
            Crypt::decryptString($value);

            return true;
        } catch (\Throwable) {
            return false;
        }
    }
}

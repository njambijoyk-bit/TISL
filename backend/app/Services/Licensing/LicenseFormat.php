<?php

namespace App\Services\Licensing;

/**
 * TISL license format, version 1 — the reading half.
 *
 * Must stay byte-for-byte in step with the signer's LicenseFormat::build().
 * The platform only ever holds the public key, so there is no build() here.
 *
 *   [1 byte version][2 bytes length BE][N bytes JSON][64 bytes Ed25519 sig][4 bytes CRC32]
 *   Crockford base32, TISL-XXXXX-XXXXX-…, case-insensitive, O→0, I/L→1.
 */
final class LicenseFormat
{
    public const FORMAT_VERSION = 1;
    public const PREFIX = 'WNKJ';
    private const DOMAIN = "WNKJ-LICENSE\n";
    private const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    /** The 11 paid modules (number => key). Must match the `modules` table and the signer. */
    public const MODULES = [
        1  => 'ecommerce',
        2  => 'listings',
        3  => 'campaigns',
        4  => 'courses',
        5  => 'accommodations',
        6  => 'menus',
        7  => 'events',
        8  => 'memberships',
        9  => 'careers',
        10 => 'projects',
        11 => 'extras',
    ];

    public const OK = 'ok';
    public const TYPO = 'typo';
    public const FAKE = 'fake';

    /**
     * Read a pasted key.
     *
     * @return array{status:string, payload:?array, bytes:?string}
     *         bytes = the decoded key, the same however it was typed (used for hashing)
     */
    public static function read(string $text, string $publicKey): array
    {
        $none = fn (string $status) => ['status' => $status, 'payload' => null, 'bytes' => null];

        $clean = strtoupper(preg_replace('/[\s\-]+/', '', $text));
        if (!str_starts_with($clean, self::PREFIX)) {
            return $none(self::TYPO);
        }
        $clean = strtr(substr($clean, strlen(self::PREFIX)), ['O' => '0', 'I' => '1', 'L' => '1']);

        $bytes = self::decode($clean);
        if ($bytes === null || strlen($bytes) < 1 + 2 + 64 + 4) {
            return $none(self::TYPO);
        }

        $body = substr($bytes, 0, -4);
        $crc = unpack('N', substr($bytes, -4))[1];
        if ($crc !== crc32($body)) {
            return $none(self::TYPO);
        }

        $version = ord($body[0]);
        $length = unpack('n', substr($body, 1, 2))[1];
        if ($version !== self::FORMAT_VERSION || strlen($body) !== 3 + $length + 64) {
            return $none(self::FAKE);
        }

        $head = substr($body, 0, 3 + $length);
        $signature = substr($body, 3 + $length, 64);
        if (strlen($publicKey) !== 32
            || !sodium_crypto_sign_verify_detached($signature, self::DOMAIN . $head, $publicKey)) {
            return $none(self::FAKE);
        }

        $payload = json_decode(substr($head, 3), true);
        if (!is_array($payload)) {
            return $none(self::FAKE);
        }

        return ['status' => self::OK, 'payload' => $payload, 'bytes' => $bytes];
    }

    public static function moduleNumber(string $module): ?int
    {
        $n = array_search($module, self::MODULES, true);

        return $n === false ? null : $n;
    }

    private static function decode(string $text): ?string
    {
        if ($text === '') {
            return null;
        }
        $bits = '';
        foreach (str_split($text) as $c) {
            $i = strpos(self::ALPHABET, $c);
            if ($i === false) {
                return null;
            }
            $bits .= str_pad(decbin($i), 5, '0', STR_PAD_LEFT);
        }
        $bytes = '';
        foreach (str_split(substr($bits, 0, intdiv(strlen($bits), 8) * 8), 8) as $byte) {
            $bytes .= chr(bindec($byte));
        }

        return $bytes;
    }
}
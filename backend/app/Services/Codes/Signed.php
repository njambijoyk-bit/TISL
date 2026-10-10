<?php

namespace App\Services\Codes;

/**
 * Codes only we can make. A code is `type.id.signature`: the signature is a keyed hash (HMAC-SHA256 of "type.id", with a key derived from the app key for that type alone, so
 * a ticket code can never pass as a gift-voucher code). It is checked without any database, in constant time, is not case-sensitive and uses letters that can be read out over
 * the phone (no 0/O, 1/I confusion: Crockford base32). A QR on a poster or ticket holds the web address of the code (`/q/{code}`) so an ordinary phone camera opens the right page.
 */
final class Signed
{
    private const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    /** bytes of the hash kept: 8 bytes = 64 bits, far too many to guess at one try per second even over years */
    private const SIG_BYTES = 8;

    public static function make(string $type, string|int $id): string
    {
        self::assertType($type);
        $id = self::cleanId($id);

        return $type . '.' . $id . '.' . self::sign($type, $id);
    }

    /** The address a QR holds: scanning it with a phone opens the right page; the staff scanner reads the code from it. */
    public static function url(string $type, string|int $id): string
    {
        return rtrim((string) config('app.frontend_url'), '/') . '/q/' . self::make($type, $id);
    }

    /**
     * Check a scanned or typed code (a bare code, or the whole address). Returns what it stands for, or null when it is not one of ours (wrong, altered, or for another purpose).
     *
     * @return array{type: string, id: string}|null
     */
    public static function verify(string $scanned, ?string $expectType = null): ?array
    {
        $code = self::extract($scanned);
        if ($code === null) {
            return null;
        }
        [$type, $id, $sig] = explode('.', $code);
        if ($expectType !== null && $type !== $expectType) {
            return null;
        }
        if (! preg_match('/^[a-z]{1,8}$/', $type) || ! preg_match('/^[0-9A-Za-z]{1,24}$/', $id)) {
            return null;
        }

        return hash_equals(self::sign($type, $id), $sig) ? ['type' => $type, 'id' => $id] : null;
    }

    /** the code inside what was scanned: the part after /q/ of an address, or the text itself; type lower-cased, signature upper-cased */
    private static function extract(string $scanned): ?string
    {
        $s = trim($scanned);
        if (($i = strripos($s, '/q/')) !== false) {
            $s = substr($s, $i + 3);
        }
        $s = preg_replace('/[?#].*$/', '', $s);
        $parts = explode('.', $s);
        if (count($parts) !== 3) {
            return null;
        }

        return strtolower($parts[0]) . '.' . $parts[1] . '.' . strtoupper(str_replace(['-', ' '], '', $parts[2]));
    }

    private static function sign(string $type, string $id): string
    {
        $key = hash_hmac('sha256', 'tisl-signed-code:' . $type, (string) config('app.key'), true);
        $mac = substr(hash_hmac('sha256', $type . '.' . $id, $key, true), 0, self::SIG_BYTES);

        return self::base32($mac);
    }

    private static function base32(string $bytes): string
    {
        $bits = '';
        foreach (str_split($bytes) as $b) {
            $bits .= str_pad(decbin(ord($b)), 8, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            $out .= self::ALPHABET[bindec(str_pad($chunk, 5, '0'))];
        }

        return $out;
    }

    private static function assertType(string $type): void
    {
        if (! preg_match('/^[a-z]{1,8}$/', $type)) {
            throw new CodeException('A code type is 1 to 8 lower-case letters.');
        }
    }

    private static function cleanId(string|int $id): string
    {
        $id = (string) $id;
        if (! preg_match('/^[0-9A-Za-z]{1,24}$/', $id)) {
            throw new CodeException('A code id is letters and digits only (up to 24).');
        }

        return $id;
    }
}

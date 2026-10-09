<?php

namespace App\Services\Exchange;

/**
 * The .wnkjap file: one company's books (a chosen depth of them) sealed with a password. See docs/WNKJAP_FORMAT.md.
 *
 *   bytes 0-5    "WNKJAP"
 *   byte  6      format version (1)
 *   byte  7      key derivation: 1 = PBKDF2-HMAC-SHA256
 *   bytes 8-11   PBKDF2 rounds, unsigned 32-bit, big endian
 *   bytes 12-27  salt (16 random bytes)
 *   bytes 28-39  AES-GCM nonce (12 random bytes)
 *   bytes 40-    AES-256-GCM ciphertext followed by its 16-byte tag; bytes 0-39 are authenticated as the associated data
 *
 * The plaintext is a gzip-compressed UTF-8 JSON document. The password is never stored by whoever reads the file.
 */
class Wnkjap
{
    public const MAGIC = 'WNKJAP';
    public const VERSION = 1;
    public const ROUNDS = 600000;
    public const MIN_ROUNDS = 100000;   // below this a file is refused (a forged file must not make reading cheap) ...
    public const MAX_ROUNDS = 5000000;  // ... and above this it is refused too (it must not make reading a denial of service)
    private const HEADER = 40;

    public static function seal(string $json, string $password, int $rounds = self::ROUNDS): string
    {
        if (strlen($password) < 8) {
            throw new WnkjapException('The file password must be at least 8 characters.');
        }
        $rounds = max(self::MIN_ROUNDS, min(self::MAX_ROUNDS, $rounds));
        $salt = random_bytes(16);
        $iv = random_bytes(12);
        $header = self::MAGIC . chr(self::VERSION) . chr(1) . pack('N', $rounds) . $salt . $iv;
        $key = hash_pbkdf2('sha256', $password, $salt, $rounds, 32, true);
        $tag = '';
        $cipher = openssl_encrypt(gzencode($json, 6), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, $header, 16);
        if ($cipher === false) {
            throw new WnkjapException('Could not seal the file.');
        }

        return $header . $cipher . $tag;
    }

    /** The JSON inside a file. A wrong password and a damaged or altered file give the same answer on purpose. */
    public static function open(string $bytes, string $password): string
    {
        if (strlen($bytes) < self::HEADER + 16 || substr($bytes, 0, 6) !== self::MAGIC) {
            throw new WnkjapException('This is not a .wnkjap file.');
        }
        if (ord($bytes[6]) !== self::VERSION || ord($bytes[7]) !== 1) {
            throw new WnkjapException('This file was made by a newer version and can not be read here.');
        }
        $rounds = unpack('N', substr($bytes, 8, 4))[1];
        if ($rounds < self::MIN_ROUNDS || $rounds > self::MAX_ROUNDS) {
            throw new WnkjapException('This file is not valid.');
        }
        $header = substr($bytes, 0, self::HEADER);
        $key = hash_pbkdf2('sha256', $password, substr($bytes, 12, 16), $rounds, 32, true);
        $plain = openssl_decrypt(substr($bytes, self::HEADER, -16), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($bytes, 28, 12), substr($bytes, -16), $header);
        if ($plain === false) {
            throw new WnkjapException('Wrong password, or the file was changed.');
        }
        $json = gzdecode($plain);
        if ($json === false) {
            throw new WnkjapException('This file is not valid.');
        }

        return $json;
    }
}

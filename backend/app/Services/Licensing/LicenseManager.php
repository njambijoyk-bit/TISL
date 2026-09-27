<?php

namespace App\Services\Licensing;

use App\Models\Installation;
use App\Models\LicenseAttempt;
use App\Models\Module;
use App\Models\ModuleLock;
use Throwable;

/**
 * The one place that decides whether a module is licensed and active.
 *
 * "Licensed" = the four-part handshake passes (PLATFORM_PLAN 5.3):
 *   1. public key + pepper assembled from code
 *   2. installation row verified (ownership signature + uuid hash)
 *   3. module_locks row verified (slot + lock_hash + sealed key decrypts + key_hash)
 *   4. the pasted key verifies, its uuid == installation's, its module matches
 *
 * "Active" = licensed AND the client's own `modules.enabled` switch is on.
 *
 * The result is memoised for the request only and NEVER persisted, so there
 * is no 0/1 flag anywhere that turning on could unlock an unlicensed module.
 */
class LicenseManager
{
    /** Core is always on and never checked. */
    public const CORE = 'core';

    /** Per-request memo: [module_key => bool]. */
    private array $memoLicensed = [];

    /** Per-request memo of the client switch: [module_key => bool]. */
    private array $memoSwitch = [];

    private ?bool $memoInstallOk = null;

    // ── Public surface ──────────────────────────────────────────────────

    /** Every paid module the handshake currently licenses (switch ignored). */
    public function licensedModules(): array
    {
        return array_values(array_filter(
            array_values(LicenseFormat::MODULES),
            fn ($m) => $this->isLicensed($m)
        ));
    }

    /** Active = licensed AND switched on. This is what routes and nav ask. */
    public function isActive(string $moduleKey): bool
    {
        $moduleKey = $this->parentKey($moduleKey);
        if ($moduleKey === self::CORE) {
            return true;
        }
        if (!$this->isLicensed($moduleKey)) {
            return false;
        }

        return $this->memoSwitch[$moduleKey] ??=
            (optional(Module::where('module_key', $moduleKey)->first())->enabled ?? false);
    }

    public function isLicensed(string $moduleKey): bool
    {
        $moduleKey = $this->parentKey($moduleKey);
        if ($moduleKey === self::CORE) {
            return true;
        }
        if (array_key_exists($moduleKey, $this->memoLicensed)) {
            return $this->memoLicensed[$moduleKey];
        }

        return $this->memoLicensed[$moduleKey] = $this->runHandshake($moduleKey);
    }

    /** Is the installation itself verified? Setup screen shows only when false. */
    public function installationVerified(): bool
    {
        if ($this->memoInstallOk !== null) {
            return $this->memoInstallOk;
        }

        return $this->memoInstallOk = $this->verifyInstallation() !== null;
    }

    // ── The handshake ───────────────────────────────────────────────────

    private function runHandshake(string $moduleKey): bool
    {
        try {
            $install = $this->verifyInstallation();
            if ($install === null) {
                return false;
            }
            $uuid = $install->client_uuid;

            $lock = ModuleLock::where('slot', $this->slot($moduleKey, $uuid))->first();
            if ($lock === null || $lock->sealed_key === null || $lock->key_hash === null) {
                return false;
            }
            if (!hash_equals($lock->lock_hash, $this->lockHash($moduleKey, $uuid))) {
                return false;
            }

            $keyBytes = $this->unseal($lock->sealed_key, $uuid);
            if ($keyBytes === null || !hash_equals($lock->key_hash, $this->keyHash($keyBytes))) {
                return false;
            }

            $read = LicenseFormat::read($this->reencode($keyBytes), SecretAssembler::publicKey());
            if ($read['status'] !== LicenseFormat::OK) {
                return false;
            }
            $p = $read['payload'];

            return ($p['t'] ?? null) === 'mod'
                && ($p['u'] ?? null) === $uuid
                && ($p['m'] ?? null) === $moduleKey;
        } catch (Throwable $e) {
            return false; // anything odd = not licensed; core keeps running
        }
    }

    /** Returns the verified installation row, or null. */
    private function verifyInstallation(): ?Installation
    {
        $install = Installation::current();
        if ($install === null) {
            return null;
        }

        $read = LicenseFormat::read($install->ownership_code, SecretAssembler::publicKey());
        if ($read['status'] !== LicenseFormat::OK) {
            return null;
        }
        $p = $read['payload'];
        if (($p['t'] ?? null) !== 'own' || ($p['u'] ?? null) !== $install->client_uuid) {
            return null;
        }
        if (!hash_equals($install->uuid_hash, $this->uuidHash($install->client_uuid))) {
            return null;
        }

        return $install;
    }

    // ── Crypto helpers (all keyed by the code pepper) ────────────────────

    public function uuidHash(string $uuid): string
    {
        return hash('sha256', 'tisl|uuid|' . $uuid . '|' . SecretAssembler::pepper());
    }

    public function slot(string $moduleKey, string $uuid): string
    {
        return hash('sha256', 'tisl|slot|' . $moduleKey . '|' . $uuid . '|' . SecretAssembler::pepper());
    }

    public function lockHash(string $moduleKey, string $uuid): string
    {
        return hash('sha256', 'tisl|lock|' . $moduleKey . '|' . $uuid . '|' . SecretAssembler::pepper());
    }

    public function keyHash(string $keyBytes): string
    {
        return hash('sha256', 'tisl|key|' . bin2hex($keyBytes) . '|' . SecretAssembler::pepper());
    }

    /** Encrypt a key's raw bytes for storage; lock derived from pepper + uuid. */
    public function seal(string $keyBytes, string $uuid): string
    {
        $nonce = random_bytes(24);
        $cipher = sodium_crypto_secretbox($keyBytes, $nonce, $this->boxKey($uuid));

        return base64_encode($nonce . $cipher);
    }

    private function unseal(string $sealed, string $uuid): ?string
    {
        $raw = base64_decode($sealed, true);
        if ($raw === false || strlen($raw) <= 24) {
            return null;
        }
        $nonce = substr($raw, 0, 24);
        $cipher = substr($raw, 24);
        $plain = sodium_crypto_secretbox_open($cipher, $nonce, $this->boxKey($uuid));

        return $plain === false ? null : $plain;
    }

    private function boxKey(string $uuid): string
    {
        return sodium_crypto_generichash(
            'tisl|box|' . $uuid . '|' . SecretAssembler::pepper(),
            '',
            32
        );
    }

    /** Crockford base32 re-encode of decoded bytes, so read() can parse them again. */
    private function reencode(string $bytes): string
    {
        $alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
        $bits = '';
        foreach (str_split($bytes) as $c) {
            $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
        }
        $bits = str_pad($bits, (int) ceil(strlen($bits) / 5) * 5, '0');
        $out = '';
        foreach (str_split($bits, 5) as $chunk) {
            $out .= $alphabet[bindec($chunk)];
        }

        return LicenseFormat::PREFIX . '-' . implode('-', str_split($out, 5));
    }

    private function parentKey(string $key): string
    {
        return str_contains($key, '.') ? explode('.', $key)[0] : $key;
    }

    /** Clear the per-request memo (after an activation or switch change). */
    public function forget(): void
    {
        $this->memoLicensed = [];
        $this->memoSwitch = [];
        $this->memoInstallOk = null;
    }
}
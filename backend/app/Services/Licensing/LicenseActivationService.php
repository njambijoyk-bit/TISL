<?php

namespace App\Services\Licensing;

use App\Models\Installation;
use App\Models\LicenseAttempt;
use App\Models\Module;
use App\Models\ModuleLock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Writes the licensing tables: first-run setup, module key paste, and the
 * client on/off switch. All checks are offline. Every paste is logged.
 */
class LicenseActivationService
{
    public const MAX_FAILURES = 10;      // per hour
    public const LOCKOUT_MINUTES = 15;

    public function __construct(private LicenseManager $manager) {}

    /**
     * First install: verify a pasted ownership code and write the single
     * installation row. Allowed only while there is no row yet.
     *
     * @return array{ok:bool, message:string}
     */
    public function setupOwnership(string $code, Request $request): array
    {
        if (Installation::current() !== null) {
            return ['ok' => false, 'message' => 'This installation is already set up.'];
        }

        $read = LicenseFormat::read($code, SecretAssembler::publicKey());
        $p = $read['payload'];

        if ($read['status'] !== LicenseFormat::OK
            || ($p['t'] ?? null) !== 'own'
            || empty($p['u']) || empty($p['n']) || empty($p['p'])) {
            $this->log($request, LicenseAttempt::OWNERSHIP_REJECTED, null, $read['bytes'] ?? $code);

            return ['ok' => false, 'message' => 'That ownership code is not valid for this software.'];
        }

        Installation::create([
            'id'             => 1,
            'client_uuid'    => $p['u'],
            'business_name'  => $p['n'],
            'purchased_at'   => $p['p'],
            'ownership_code' => trim($code),
            'uuid_hash'      => $this->manager->uuidHash($p['u']),
            'key_version'    => $p['k'] ?? 'v1',
            'installed_at'   => now(),
        ]);

        $this->manager->forget();
        $this->log($request, LicenseAttempt::OWNERSHIP_ACCEPTED, null, $read['bytes']);

        return ['ok' => true, 'message' => 'Installation verified. Licensed to ' . $p['n'] . '.'];
    }

    /**
     * Paste a module key. Runs the checks in order (typo → fake → other
     * client → already active → accept) and logs the outcome.
     *
     * @return array{ok:bool, result:string, message:string, module?:string}
     */
    public function activateModule(string $rawKey, Request $request): array
    {
        if ($this->lockedOut()) {
            $this->log($request, LicenseAttempt::LOCKED_OUT, null, $rawKey);

            return ['ok' => false, 'result' => LicenseAttempt::LOCKED_OUT,
                'message' => 'Too many failed attempts. Try again in ' . self::LOCKOUT_MINUTES . ' minutes.'];
        }

        $install = Installation::current();
        if ($install === null || !$this->manager->installationVerified()) {
            return ['ok' => false, 'result' => LicenseAttempt::FAKE,
                'message' => 'Set up the installation with your ownership code first.'];
        }

        $read = LicenseFormat::read($rawKey, SecretAssembler::publicKey());

        // 1. Checksum / shape
        if ($read['status'] === LicenseFormat::TYPO) {
            $this->log($request, LicenseAttempt::TYPO, null, $rawKey);

            return ['ok' => false, 'result' => LicenseAttempt::TYPO,
                'message' => 'That key looks mistyped — check it and paste again.'];
        }

        // 2. Signature
        if ($read['status'] !== LicenseFormat::OK) {
            $this->log($request, LicenseAttempt::FAKE, null, $read['bytes'] ?? $rawKey);

            return ['ok' => false, 'result' => LicenseAttempt::FAKE, 'message' => 'Invalid key.'];
        }

        $p = $read['payload'];
        $module = $p['m'] ?? null;
        if (($p['t'] ?? null) !== 'mod' || !$module || LicenseFormat::moduleNumber($module) === null) {
            $this->log($request, LicenseAttempt::FAKE, null, $read['bytes']);

            return ['ok' => false, 'result' => LicenseAttempt::FAKE, 'message' => 'Invalid key.'];
        }

        // 3. This installation?
        if (($p['u'] ?? null) !== $install->client_uuid) {
            $this->log($request, LicenseAttempt::OTHER_CLIENT, $module, $read['bytes'], $p['u'] ?? null, $p['s'] ?? null);

            return ['ok' => false, 'result' => LicenseAttempt::OTHER_CLIENT,
                'message' => "This key isn't for this installation."];
        }

        // 4. Already active?
        $keyBytes = $read['bytes'];
        $slot = $this->manager->slot($module, $install->client_uuid);
        $existing = ModuleLock::where('slot', $slot)->first();
        if ($existing && $existing->key_hash !== null
            && hash_equals($existing->key_hash, $this->manager->keyHash($keyBytes))) {
            $this->log($request, LicenseAttempt::ALREADY_ACTIVE, $module, $keyBytes, $p['u'], $p['s'] ?? null);

            return ['ok' => true, 'result' => LicenseAttempt::ALREADY_ACTIVE,
                'message' => 'That module is already active.', 'module' => $module];
        }

        // 5. Accept — write / update the vault row
        DB::transaction(function () use ($slot, $module, $install, $keyBytes, $request) {
            ModuleLock::updateOrCreate(
                ['slot' => $slot],
                [
                    'lock_hash'    => $this->manager->lockHash($module, $install->client_uuid),
                    'sealed_key'   => $this->manager->seal($keyBytes, $install->client_uuid),
                    'key_hash'     => $this->manager->keyHash($keyBytes),
                    'used'         => true,
                    'activated_at' => now(),
                    'activated_by' => $request->user()?->id,
                ]
            );
            Module::where('module_key', $module)->update(['enabled' => true]);
        });

        $this->manager->forget();
        $this->log($request, LicenseAttempt::ACCEPTED, $module, $keyBytes, $p['u'], $p['s'] ?? null);

        return ['ok' => true, 'result' => LicenseAttempt::ACCEPTED,
            'message' => 'Module activated.', 'module' => $module];
    }

    /** Turn a licensed module's client switch on or off. Never licenses it. */
    public function setSwitch(string $moduleKey, bool $on, Request $request): array
    {
        $module = Module::where('module_key', $moduleKey)->first();
        if ($module === null) {
            return ['ok' => false, 'message' => 'Unknown module.'];
        }
        if ($on && !$this->manager->isLicensed($moduleKey)) {
            return ['ok' => false, 'message' => 'This module is not licensed, so it cannot be switched on.'];
        }

        $module->update(['enabled' => $on]);
        $this->manager->forget();
        $this->log($request, $on ? LicenseAttempt::SWITCHED_ON : LicenseAttempt::SWITCHED_OFF, $moduleKey, null);

        return ['ok' => true, 'message' => $on ? 'Module switched on.' : 'Module switched off (its data is kept).'];
    }

    // ── Lockout + logging ────────────────────────────────────────────────

    public function lockedOut(): bool
    {
        $fails = LicenseAttempt::whereIn('result', LicenseAttempt::FAILURES)
            ->where('created_at', '>=', now()->subHour())
            ->count();

        if ($fails < self::MAX_FAILURES) {
            return false;
        }

        $last = LicenseAttempt::whereIn('result', LicenseAttempt::FAILURES)
            ->latest('created_at')->first();

        return $last && $last->created_at->gt(now()->subMinutes(self::LOCKOUT_MINUTES));
    }

    private function log(Request $r, string $result, ?string $module, ?string $keyText,
                         ?string $keyUuid = null, $serial = null): void
    {
        LicenseAttempt::create([
            'user_id'         => $r->user()?->id,
            'result'          => $result,
            'module_key'      => $module,
            'key_client_uuid' => $keyUuid,
            'key_serial'      => $serial !== null ? (string) $serial : null,
            'key_fingerprint' => $keyText !== null ? hash('sha256', $keyText) : null,
            'ip_address'      => $r->ip(),
            'user_agent'      => substr((string) $r->userAgent(), 0, 255),
            'created_at'      => now(),
        ]);
    }
}

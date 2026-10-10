<?php

namespace App\Services\Security\Passkeys;

use App\Models\Security\AuthCredential;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Symfony\Component\Uid\Uuid;
use Webauthn\CredentialRecord;
use Webauthn\PublicKeyCredentialDescriptor;
use Webauthn\TrustPath\EmptyTrustPath;

/** The passkeys people have added, stored and read back as the vetted library's own records. */
final class CredentialStore
{
    public static function b64url(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function fromB64url(string $text): string
    {
        return (string) base64_decode(strtr($text, '-_', '+/').str_repeat('=', (4 - strlen($text) % 4) % 4), true);
    }

    public static function hash(string $rawCredentialId): string
    {
        return hash('sha256', $rawCredentialId);
    }

    /** The person's passkeys that have not been removed (an ended or switched-off one is still listed, marked, so the person can see why). */
    public function forUser(User $user): Collection
    {
        return AuthCredential::where('user_id', $user->id)->active()->orderBy('id')->get();
    }

    /** The ones that can sign in right now. */
    public function usableFor(User $user): Collection
    {
        return $this->forUser($user)->filter(fn (AuthCredential $c) => $c->usable())->values();
    }

    public function findByRawId(string $rawCredentialId): ?AuthCredential
    {
        return AuthCredential::where('credential_hash', self::hash($rawCredentialId))->first();
    }

    /** The "user handle" a device stores next to a passkey (not the email, nothing personal): the same for every one of a person's passkeys, made once. */
    public function handleFor(User $user): string
    {
        $existing = AuthCredential::where('user_id', $user->id)->orderBy('id')->value('user_handle');

        return $existing ? self::fromB64url($existing) : random_bytes(32);
    }

    /** @return array<int, PublicKeyCredentialDescriptor> what the device is told "you already hold these": so the same one is not added twice */
    public function excludeList(User $user): array
    {
        return $this->forUser($user)->map(fn (AuthCredential $c) => PublicKeyCredentialDescriptor::create('public-key', self::fromB64url($c->credential_id), (array) $c->transports))->all();
    }

    public function toRecord(AuthCredential $c): CredentialRecord
    {
        return CredentialRecord::create(self::fromB64url($c->credential_id), 'public-key', (array) $c->transports, (string) ($c->attestation_type ?: 'none'), new EmptyTrustPath(),
            Uuid::fromString($c->aaguid ?: '00000000-0000-0000-0000-000000000000'), (string) base64_decode($c->public_key, true), self::fromB64url($c->user_handle), (int) $c->counter, null,
            $c->backup_eligible, $c->backup_status, $c->uv_initialized);
    }

    /** What the library learned from a successful check, written back (the counter moves on; the backup flags can change). */
    public function touch(AuthCredential $c, CredentialRecord $record, ?string $ip, ?string $device): void
    {
        $c->forceFill(['counter' => $record->counter, 'backup_eligible' => $record->backupEligible, 'backup_status' => $record->backupStatus, 'uv_initialized' => $record->uvInitialized,
            'last_used_at' => now(), 'last_used_ip' => $ip, 'last_used_device' => $device])->save();
    }
}

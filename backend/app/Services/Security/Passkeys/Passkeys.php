<?php

namespace App\Services\Security\Passkeys;

use App\Models\Security\AuthCredential;
use App\Models\User;
use App\Services\Security\DeviceInfo;
use App\Services\Security\SecurityLog;
use Illuminate\Http\Request;
use Throwable;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\Exception\CounterException;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;

/**
 * Passkeys, using the vetted web-auth/webauthn-lib for every cryptographic check. What lives here is ours: whose passkey is whose, what a question is for, what happens to a passkey that looks copied.
 *
 *  - Adding one: ask (registrationOptions), the device answers, check and store (register).
 *  - Signing in with one: ask with no name given (loginOptions: the device offers its passkeys for this website, so nothing here says which emails have accounts), check (login).
 * Proof is always with the fingerprint, face or PIN of the device (user verification is required), so a passkey is the strongest kind of proof we accept ("S2").
 */
final class Passkeys
{
    public function __construct(private Challenges $challenges, private CredentialStore $store)
    {
    }

    // ------------------------------------------------------------ adding a passkey

    /** @return array{id: string, options: array<string, mixed>} */
    public function registrationOptions(User $user, ?Request $request = null): array
    {
        if ($this->store->forUser($user)->count() >= (int) config('security.passkeys.max_per_person', 10)) {
            throw new PasskeyException('You already have the most passkeys that can be added. Remove one you no longer use first.', 'too_many');
        }
        $options = PublicKeyCredentialCreationOptions::create(
            PublicKeyCredentialRpEntity::create(PasskeyConfig::rpName(), PasskeyConfig::rpId()),
            PublicKeyCredentialUserEntity::create((string) $user->email, $this->store->handleFor($user), (string) ($user->name ?: $user->email)),
            random_bytes(32),
            [PublicKeyCredentialParameters::create('public-key', -7), PublicKeyCredentialParameters::create('public-key', -257)],
            AuthenticatorSelectionCriteria::create(null, AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED, AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_REQUIRED),
            PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE,
            $this->store->excludeList($user),
            PasskeyConfig::timeoutMs(),
        );

        return $this->challenges->issue(Challenges::REGISTER, $user->id, $options, $request);
    }

    /**
     * The device answered: check it with the library and keep it.
     *
     * @param array<string, mixed> $credential what the browser made (the PublicKeyCredential as JSON)
     */
    public function register(User $user, string $challengeId, array $credential, ?string $name, ?Request $request = null, string $method = 'first', ?int $approvedBy = null): AuthCredential
    {
        $row = $this->challenges->take($challengeId, Challenges::REGISTER, $user->id);
        try {
            $public = $this->decode($credential);
            $response = $public->response;
            if (! $response instanceof AuthenticatorAttestationResponse) {
                throw new PasskeyException('That did not work. Please try again.', 'not_an_attestation');
            }
            $this->typeMustBe('webauthn.create', $response->clientDataJSON->type);
            $options = $this->challenges->options($row);
            $record = AuthenticatorAttestationResponseValidator::create(PasskeyConfig::ceremonies()->creationCeremony())->check($response, $options, PasskeyConfig::rpId());
        } catch (PasskeyException $e) {
            SecurityLog::record('passkey_rejected', $user, $request, ['step' => 'register', 'why' => $e->reason], SecurityLog::NOTICE);
            throw $e;
        } catch (Throwable $e) {
            SecurityLog::record('passkey_rejected', $user, $request, ['step' => 'register', 'why' => $this->why($e)], SecurityLog::WARNING);
            throw new PasskeyException('That passkey could not be added. Make sure you are on the real TISL website and try again.', 'verification_failed', 422, $e);
        }
        if ($this->store->findByRawId($record->publicKeyCredentialId)) {
            throw new PasskeyException('That passkey is already added.', 'duplicate');
        }
        $transports = $response->transports;
        $device = DeviceInfo::describe($request?->userAgent())['label'];

        return AuthCredential::create([
            'user_id' => $user->id, 'credential_hash' => CredentialStore::hash($record->publicKeyCredentialId), 'credential_id' => CredentialStore::b64url($record->publicKeyCredentialId),
            'public_key' => base64_encode($record->credentialPublicKey), 'user_handle' => CredentialStore::b64url($record->userHandle), 'name' => mb_substr(trim((string) $name) ?: "Passkey on {$device}", 0, 80),
            'kind' => $this->kind(is_string($credential['authenticatorAttachment'] ?? null) ? $credential['authenticatorAttachment'] : null, $transports), 'transports' => $transports, 'aaguid' => (string) $record->aaguid, 'attestation_type' => $record->attestationType,
            'counter' => $record->counter, 'backup_eligible' => $record->backupEligible, 'backup_status' => $record->backupStatus, 'uv_initialized' => $record->uvInitialized,
            'added_method' => $method, 'added_by_id' => $approvedBy, 'last_used_at' => null,
        ]);
    }

    // ------------------------------------------------------------ signing in with one

    /** @return array{id: string, options: array<string, mixed>} */
    public function loginOptions(?Request $request = null): array
    {
        $options = PublicKeyCredentialRequestOptions::create(random_bytes(32), PasskeyConfig::rpId(), [], PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_REQUIRED, PasskeyConfig::timeoutMs());

        return $this->challenges->issue(Challenges::SIGN_IN, null, $options, $request);
    }

    /**
     * The device answered: whose passkey is it, and is the answer genuine, for this website, to this question, with the person verified on the device?
     *
     * @param array<string, mixed> $credential
     * @return array{user: User, credential: AuthCredential}
     */
    public function login(string $challengeId, array $credential, ?Request $request = null): array
    {
        $row = $this->challenges->take($challengeId, Challenges::SIGN_IN);

        return $this->answer($row, $credential, $request, null);
    }

    /** "Prove it is you" for someone already signed in: the question lists only their own usable passkeys. @return array{id: string, options: array<string, mixed>} */
    public function proofOptions(User $user, ?Request $request = null, string $purpose = Challenges::STEP_UP, ?string $contextHash = null): array
    {
        $usable = $this->store->usableFor($user);
        if ($usable->isEmpty()) {
            throw new PasskeyException('You have no passkey to prove it with yet.', 'no_passkey', 409);
        }
        $allow = $usable->map(fn (AuthCredential $c) => \Webauthn\PublicKeyCredentialDescriptor::create('public-key', CredentialStore::fromB64url($c->credential_id), (array) $c->transports))->all();
        $options = PublicKeyCredentialRequestOptions::create(random_bytes(32), PasskeyConfig::rpId(), $allow, PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_REQUIRED, PasskeyConfig::timeoutMs());

        return $this->challenges->issue($purpose, $user->id, $options, $request, $contextHash);
    }

    /**
     * The answer to a proof question: it must be genuine and from one of this person's own passkeys.
     *
     * @param array<string, mixed> $credential
     */
    public function prove(User $user, string $challengeId, array $credential, ?Request $request = null, string $purpose = Challenges::STEP_UP): AuthCredential
    {
        $row = $this->challenges->take($challengeId, $purpose, $user->id);

        return $this->answer($row, $credential, $request, $user)['credential'];
    }

    /**
     * A person already known (a step-up question, or recovery): the answer must come from one of that person's own passkeys.
     *
     * @param array<string, mixed> $credential
     * @return array{user: User, credential: AuthCredential}
     */
    public function answerFor(User $user, \App\Models\Security\AuthChallenge $row, array $credential, ?Request $request = null): array
    {
        return $this->answer($row, $credential, $request, $user);
    }

    /** @param array<string, mixed> $credential */
    private function answer(\App\Models\Security\AuthChallenge $row, array $credential, ?Request $request, ?User $expected): array
    {
        $generic = 'That passkey was not accepted. Try again, or use another way to sign in.';
        try {
            $public = $this->decode($credential);
            $response = $public->response;
            if (! $response instanceof AuthenticatorAssertionResponse) {
                throw new PasskeyException($generic, 'not_an_assertion');
            }
            $this->typeMustBe('webauthn.get', $response->clientDataJSON->type);
            $stored = $this->store->findByRawId($public->rawId);
            if (! $stored) {
                throw new PasskeyException($generic, 'unknown_credential');
            }
            if ($expected && (int) $stored->user_id !== (int) $expected->id) {
                throw new PasskeyException($generic, 'credential_of_someone_else');
            }
            if ($stored->revoked_at !== null) {
                throw new PasskeyException($generic, 'revoked');
            }
            if ($stored->disabled_at !== null) {
                throw new PasskeyException('That passkey has been switched off because it looked copied. Use another way to sign in, then remove it.', 'disabled');
            }
            $user = $expected ?? User::find($stored->user_id);
            if (! $user) {
                throw new PasskeyException($generic, 'no_such_person');
            }
            $options = $this->challenges->options($row);
            $record = $this->store->toRecord($stored);
            try {
                AuthenticatorAssertionResponseValidator::create(PasskeyConfig::ceremonies()->requestCeremony())->check($record, $response, $options, PasskeyConfig::rpId(), $expected ? CredentialStore::fromB64url($stored->user_handle) : null);
            } catch (CounterException $e) {
                $this->switchOff($stored, $user, $request);
                throw new PasskeyException('That passkey has been switched off because it looked copied. Use another way to sign in, then remove it.', 'clone_suspected', 403, $e);
            }
            if (! $response->authenticatorData->isUserVerified()) {
                throw new PasskeyException($generic, 'not_verified');   // the library checks this too; a belt as well as braces for the strongest claim we make
            }
            $this->store->touch($stored, $record, $request?->ip(), DeviceInfo::describe($request?->userAgent())['label']);

            return ['user' => $user, 'credential' => $stored->refresh()];
        } catch (PasskeyException $e) {
            if (! in_array($e->reason, ['clone_suspected'], true)) {
                SecurityLog::record('passkey_rejected', $expected, $request, ['step' => 'answer', 'why' => $e->reason], SecurityLog::NOTICE);
            }
            throw $e;
        } catch (Throwable $e) {
            SecurityLog::record('passkey_rejected', $expected, $request, ['step' => 'answer', 'why' => $this->why($e)], SecurityLog::WARNING);
            throw new PasskeyException($generic, 'verification_failed', 422, $e);
        }
    }

    /** A passkey whose counter went backwards has been copied: the copy and the original are now both in use. Switch it off, tell the owner. */
    private function switchOff(AuthCredential $c, User $user, ?Request $request): void
    {
        $c->forceFill(['disabled_at' => now(), 'disabled_reason' => 'clone_suspected'])->save();
        SecurityLog::record('passkey_clone_suspected', $user, $request, ['credential' => $c->id, 'name' => $c->name], SecurityLog::ALERT);
        app(\App\Services\Security\SecurityAlerts::class)->passkeySwitchedOff($user, $c, $request);
    }

    /** The library accepts either kind of answer for either question; the standard says an add is answered as an add and a sign-in as a sign-in, and so do we. */
    private function typeMustBe(string $expected, string $given): void
    {
        if ($given !== $expected) {
            throw new PasskeyException('That did not work. Please try again.', 'wrong_kind_of_answer');
        }
    }

    /** @param array<string, mixed> $credential */
    private function decode(array $credential): PublicKeyCredential
    {
        $public = PasskeyConfig::serializer()->deserialize(json_encode($credential), PublicKeyCredential::class, 'json');
        if (! $public instanceof PublicKeyCredential) {
            throw new PasskeyException('That did not work. Please try again.', 'not_a_credential');
        }

        return $public;
    }

    /** Built into the device (a phone, a laptop) or a separate key you plug in or tap. */
    private function kind(?string $attachment, array $transports): string
    {
        $separate = array_intersect($transports, ['usb', 'nfc', 'ble']) && ! array_intersect($transports, ['internal', 'hybrid']);

        return $separate && $attachment !== 'platform' ? 'security_key' : 'passkey';
    }

    private function why(Throwable $e): string
    {
        return class_basename($e).': '.mb_substr($e->getMessage(), 0, 120);
    }
}

<?php

namespace Tests\Support;

/**
 * A pretend fingerprint reader / security key for the tests: it makes real keys with OpenSSL and answers the way a device does, writing the bytes by hand (its own small CBOR writer), so the
 * vetted library is checked against something it did not make. Knobs let a test make the device misbehave: the wrong website, the wrong question, no fingerprint, a copied key.
 */
final class FakeAuthenticator
{
    public string $origin;
    public string $rpId;
    public int $counter = 0;
    public bool $userPresent = true;
    public bool $userVerified = true;
    public bool $backupEligible = false;
    public bool $backedUp = false;
    public ?string $attachment = 'platform';
    public array $transports = ['internal'];
    public string $credentialId;
    public ?string $aaguid = null;
    public ?string $userHandle = null;   // what the device keeps next to the passkey: told to it when the passkey is made
    private $key;
    private int $alg;

    public function __construct(string $rpId = 'targetisl.co.ke', string $origin = 'https://targetisl.co.ke', int $alg = -7)
    {
        $this->rpId = $rpId;
        $this->origin = $origin;
        $this->alg = $alg;
        $this->credentialId = random_bytes(32);
        $this->aaguid = random_bytes(16);
        $this->key = $alg === -7
            ? openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC])
            : openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    }

    public static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function unb64(string $text): string
    {
        return (string) base64_decode(strtr($text, '-_', '+/').str_repeat('=', (4 - strlen($text) % 4) % 4), true);
    }

    // ------------------------------------------------------------ the device answers

    /**
     * "Add a passkey": the answer to the creation options (as the browser got them, decoded from JSON).
     *
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public function register(array $options, array $overrides = []): array
    {
        $this->userHandle = self::unb64($options['user']['id']);
        $challenge = $overrides['challenge'] ?? $options['challenge'];
        $clientData = json_encode(['type' => $overrides['type'] ?? 'webauthn.create', 'challenge' => $challenge, 'origin' => $overrides['origin'] ?? $this->origin, 'crossOrigin' => false]);
        $authData = $this->authData($overrides['rpId'] ?? $options['rp']['id'], true);
        $attestation = Cbor::map(['fmt' => Cbor::text('none'), 'attStmt' => Cbor::emptyMap(), 'authData' => Cbor::bytes($authData)]);

        return [
            'id' => self::b64($this->credentialId), 'rawId' => self::b64($this->credentialId), 'type' => 'public-key', 'authenticatorAttachment' => $this->attachment,
            'response' => ['clientDataJSON' => self::b64($clientData), 'attestationObject' => self::b64($attestation), 'transports' => $this->transports],
            'clientExtensionResults' => new \stdClass(),
        ];
    }

    /**
     * "Sign in": the answer to the request options.
     *
     * @param array<string, mixed> $options
     * @return array<string, mixed>
     */
    public function assert(array $options, array $overrides = []): array
    {
        $userHandle = array_key_exists('userHandle', $overrides) ? $overrides['userHandle'] : $this->userHandle;
        $this->counter = $overrides['counter'] ?? $this->counter + 1;
        $challenge = $overrides['challenge'] ?? $options['challenge'];
        $clientData = json_encode(['type' => $overrides['type'] ?? 'webauthn.get', 'challenge' => $challenge, 'origin' => $overrides['origin'] ?? $this->origin, 'crossOrigin' => false]);
        $authData = $this->authData($overrides['rpId'] ?? $options['rpId'], false);
        $signature = $this->sign($authData.hash('sha256', $clientData, true));
        if (! empty($overrides['badSignature'])) {
            $signature[strlen($signature) - 1] = chr(ord($signature[strlen($signature) - 1]) ^ 1);
        }

        return [
            'id' => self::b64($this->credentialId), 'rawId' => self::b64($this->credentialId), 'type' => 'public-key', 'authenticatorAttachment' => $this->attachment,
            'response' => ['clientDataJSON' => self::b64($clientData), 'authenticatorData' => self::b64($authData), 'signature' => self::b64($signature),
                'userHandle' => $userHandle === null ? null : self::b64($userHandle)],
            'clientExtensionResults' => new \stdClass(),
        ];
    }

    /** A copy of this device: the same key, the same credential, its own counter (a thief's phone made from a copied key). */
    public function cloneDevice(): self
    {
        return clone $this;
    }

    // ------------------------------------------------------------ the bytes

    private function authData(string $rpId, bool $withCredential): string
    {
        $flags = ($this->userPresent ? 0x01 : 0) | ($this->userVerified ? 0x04 : 0) | ($this->backupEligible ? 0x08 : 0) | ($this->backedUp ? 0x10 : 0) | ($withCredential ? 0x40 : 0);
        $data = hash('sha256', $rpId, true).chr($flags).pack('N', $this->counter);
        if ($withCredential) {
            $data .= $this->aaguid.pack('n', strlen($this->credentialId)).$this->credentialId.$this->coseKey();
        }

        return $data;
    }

    private function coseKey(): string
    {
        $d = openssl_pkey_get_details($this->key);
        if ($this->alg === -7) {
            return Cbor::intMap([[1, 2], [3, -7], [-1, 1], [-2, Cbor::bytes(str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT))], [-3, Cbor::bytes(str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT))]]);
        }

        return Cbor::intMap([[1, 3], [3, -257], [-1, Cbor::bytes($d['rsa']['n'])], [-2, Cbor::bytes($d['rsa']['e'])]]);
    }

    private function sign(string $data): string
    {
        openssl_sign($data, $signature, $this->key, OPENSSL_ALGO_SHA256);

        return $signature;
    }
}

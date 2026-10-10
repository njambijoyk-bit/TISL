<?php

namespace App\Services\Security\Passkeys;

use Symfony\Component\Serializer\Encoder\JsonEncode;
use Symfony\Component\Serializer\Normalizer\AbstractObjectNormalizer;
use Symfony\Component\Serializer\SerializerInterface;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\Denormalizer\WebauthnSerializerFactory;

/** The settings every passkey check is made against (config/security.php → passkeys), and the vetted library's parts wired to them. */
final class PasskeyConfig
{
    private static ?SerializerInterface $serializer = null;

    public static function rpId(): string
    {
        return (string) config('security.passkeys.rp_id', 'targetisl.co.ke');
    }

    public static function rpName(): string
    {
        return (string) config('security.passkeys.rp_name', 'TISL');
    }

    /**
     * The exact addresses of the website (scheme and host and port); a subdomain is not one of them. Plain http is never one, except for localhost while developing: a mistake in the
     * settings can not make a passkey usable on a page anybody on the network could alter.
     *
     * @return string[]
     */
    public static function origins(): array
    {
        return array_values(array_filter((array) config('security.passkeys.origins', []), function ($origin) {
            $p = parse_url((string) $origin);

            return is_array($p) && isset($p['scheme'], $p['host']) && ($p['scheme'] === 'https' || ($p['scheme'] === 'http' && $p['host'] === 'localhost'));
        }));
    }

    public static function timeoutMs(): int
    {
        return (int) config('security.passkeys.timeout_ms', 120000);
    }

    public static function challengeSeconds(): int
    {
        return max(30, (int) config('security.passkeys.challenge_seconds', 120));
    }

    /** The library's checks, set to accept only our website's exact addresses. (Plain http is accepted only for the RP ID "localhost", so development works and nothing live can.) */
    public static function ceremonies(): CeremonyStepManagerFactory
    {
        $factory = new CeremonyStepManagerFactory();
        $factory->setAllowedOrigins(self::origins(), false);
        $factory->setAttestationStatementSupportManager(new AttestationStatementSupportManager([new NoneAttestationStatementSupport()]));   // no attestation is asked for: we trust the device's own sign-in, not its maker

        return $factory;
    }

    public static function serializer(): SerializerInterface
    {
        return self::$serializer ??= (new WebauthnSerializerFactory(new AttestationStatementSupportManager([new NoneAttestationStatementSupport()])))->create();
    }

    /** An options object as the JSON the browser is handed. */
    public static function toJson(object $options): string
    {
        return self::serializer()->serialize($options, 'json', [AbstractObjectNormalizer::SKIP_NULL_VALUES => true, JsonEncode::OPTIONS => JSON_THROW_ON_ERROR]);
    }
}

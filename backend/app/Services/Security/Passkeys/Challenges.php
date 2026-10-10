<?php

namespace App\Services\Security\Passkeys;

use App\Models\Security\AuthChallenge;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialOptions;
use Webauthn\PublicKeyCredentialRequestOptions;

/**
 * The questions the server asks a device to sign. Each one is single-use, runs out in two minutes, is for one purpose (adding a passkey, signing in, confirming an action) and, when it is about a
 * person, for that person only. A question answered for one purpose can not be used for another, and one answered once can not be answered again.
 */
final class Challenges
{
    public const REGISTER = 'register';
    public const SIGN_IN = 'sign_in';
    public const STEP_UP = 'step_up';
    public const RECOVER = 'recover';

    /** @return array{id: string, options: array<string, mixed>} the question's number and the options to hand to the browser */
    public function issue(string $purpose, ?int $userId, PublicKeyCredentialOptions $options, ?Request $request = null, ?string $contextHash = null): array
    {
        $this->sweep();
        $id = Str::random(40);
        $json = PasskeyConfig::toJson($options);
        AuthChallenge::create(['id' => $id, 'purpose' => $purpose, 'user_id' => $userId, 'challenge' => rtrim(strtr(base64_encode($options->challenge), '+/', '-_'), '='), 'context_hash' => $contextHash,
            'options' => json_decode($json, true), 'ip' => $request?->ip(), 'expires_at' => now()->addSeconds(PasskeyConfig::challengeSeconds()), 'created_at' => now()]);

        return ['id' => $id, 'options' => json_decode($json, true)];
    }

    /**
     * Take the question: it must exist, be for this purpose (and this person when it names one), be unused and not run out. It is marked used in the same instant it is taken, so two answers
     * arriving together can not both be accepted.
     */
    public function take(string $id, string $purpose, ?int $userId = null): AuthChallenge
    {
        $row = AuthChallenge::find($id);
        if (! $row || $row->purpose !== $purpose) {
            throw new PasskeyException('That did not work. Please try again.', 'challenge_unknown');
        }
        if ($userId !== null && (int) $row->user_id !== $userId) {
            throw new PasskeyException('That did not work. Please try again.', 'challenge_wrong_person');
        }
        $taken = DB::table('auth_challenges')->where('id', $id)->whereNull('used_at')->where('expires_at', '>', now())->update(['used_at' => now()]);
        if ($taken !== 1) {
            throw new PasskeyException('That took too long, or was already used. Please try again.', $row->used_at ? 'challenge_used' : 'challenge_expired');
        }

        return $row->refresh();
    }

    /** The question as the library's own options object again. */
    public function options(AuthChallenge $row): PublicKeyCredentialCreationOptions|PublicKeyCredentialRequestOptions
    {
        $class = $row->purpose === self::REGISTER ? PublicKeyCredentialCreationOptions::class : PublicKeyCredentialRequestOptions::class;

        return PasskeyConfig::serializer()->deserialize(json_encode($row->options), $class, 'json');
    }

    /** Old questions are of no use to anyone: tidy them away now and then (cheap, and keeps the table small without a scheduled job). */
    private function sweep(): void
    {
        if (random_int(1, 20) === 1) {
            DB::table('auth_challenges')->where('expires_at', '<', now()->subHour())->delete();
        }
    }
}

<?php

namespace App\Services\Security;

use App\Models\Security\AuthSession;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Signed-in browsers. Every login token is made here, so each one carries an end date (idle and absolute) and a record of where it came from. A session ends when it sits idle too long, when it is
 * too old, when the person ends it, when the password changes, or when the account is suspended. Before database script 123 is run the tokens still get their end dates; only the record is missing.
 */
final class Sessions
{
    /** How long a recovery code lets a session add a new passkey. */
    public const RECOVERY_MINUTES = 15;

    private static ?bool $tracked = null;
    private static ?bool $strong = null;

    /** Does the table know about passkeys (database script 124 run)? Until it does, sessions are recorded as before. */
    public static function strongTracked(): bool
    {
        return self::tracked() && (self::$strong ??= Schema::hasColumn('auth_sessions', 'strength'));
    }

    public static function tracked(): bool
    {
        return self::$tracked ??= Schema::hasTable('auth_sessions');
    }

    public static function forget(): void
    {
        self::$tracked = null;
        self::$strong = null;
    }

    /**
     * A new login token for this person, ending by the policy, and the record of where it came from.
     * `$strength` is how well the person proved who they are: 0 a password, 2 a passkey checked with fingerprint, face or PIN; with a passkey, `$credentialId` says which one.
     *
     * @return string the token to hand to the browser
     */
    public function issue(Model $tokenable, ?Request $request, string $name = 'auth-token', string $method = 'password', ?int $credentialId = null, int $strength = 0): string
    {
        $now = now();
        $newDevice = $this->hasHistory($tokenable) && ! $this->seenBefore($tokenable, $request);   // asked before this session is recorded
        $made = $tokenable->createToken($name, ['*'], SessionPolicy::expiry($tokenable, $now, $now));
        SecurityLog::record('sign_in', $tokenable, $request, ['method' => $method, 'device' => DeviceInfo::describe($request?->userAgent())['label'], 'new_device' => $newDevice]
            + (RiskSignals::country($request) ? ['country' => RiskSignals::country($request)] : [])
            + ($credentialId ? ['credential' => $credentialId, 'strength' => $strength] : []));
        if ($newDevice) {
            rescue(fn () => app(NewSignInNotice::class)->send($tokenable, $request, $method), null, true);   // telling them must never stop them signing in
        }
        if (self::tracked()) {
            $d = DeviceInfo::describe($request?->userAgent());
            AuthSession::create(['token_id' => $made->accessToken->id, 'tokenable_type' => $tokenable->getMorphClass(), 'tokenable_id' => $tokenable->getKey(), 'method' => $method, 'ip' => $request?->ip(),
                'user_agent' => $request?->userAgent() ? mb_substr($request->userAgent(), 0, 255) : null, 'device_key' => $d['key'], 'label' => $d['label'], 'last_seen_at' => $now]
                + (self::strongTracked() ? ['credential_id' => $credentialId, 'strength' => $strength, 'last_strong_at' => $strength >= 2 ? $now : null] : []));
        }

        return $made->plainTextToken;
    }

    /** Has this person signed in from this kind of browser before (a session of any age, ended or not)? Called before the new session is issued. */
    public function seenBefore(Model $tokenable, ?Request $request): bool
    {
        if (! self::tracked()) {
            return true;   // nothing recorded, so nothing to compare: do not cry wolf
        }

        return AuthSession::where('tokenable_type', $tokenable->getMorphClass())->where('tokenable_id', $tokenable->getKey())->where('device_key', DeviceInfo::describe($request?->userAgent())['key'])->exists();
    }

    /** Has this person ever signed in at all (so that the very first one is not announced as "new")? */
    public function hasHistory(Model $tokenable): bool
    {
        return self::tracked() && AuthSession::where('tokenable_type', $tokenable->getMorphClass())->where('tokenable_id', $tokenable->getKey())->exists();
    }

    /**
     * A session was used: push its end forward (idle time from now, never past its absolute limit). Done at most every few minutes, so a busy session is not a write on every request. Tokens made
     * before this existed have no end date at all: the first use gives them one.
     */
    public function slide(PersonalAccessToken $token): void
    {
        $tokenable = $token->tokenable;
        if (! $tokenable) {
            return;
        }
        $target = SessionPolicy::expiry($tokenable, $token->created_at ?? now());
        $every = max(1, (int) config('security.session.slide_every_minutes', 5));
        if ($token->expires_at !== null && $target->lte($token->expires_at->copy()->addMinutes($every))) {
            return;
        }
        $token->forceFill(['expires_at' => $target])->save();
        if (self::tracked()) {
            AuthSession::where('token_id', $token->id)->update(['last_seen_at' => now()]);
        }
    }

    /**
     * End this person's sessions: all of them, or all but one (the one they are using). The tokens are deleted, so each stops working at once.
     *
     * @return int how many were ended
     */
    public function revokeAll(Model $tokenable, ?int $exceptTokenId, string $reason): int
    {
        $q = $tokenable->tokens();
        if ($exceptTokenId) {
            $q->where('id', '!=', $exceptTokenId);
        }
        $ids = $q->pluck('id')->all();
        if ($ids) {
            PersonalAccessToken::whereIn('id', $ids)->delete();
            $this->markEnded($ids, $reason);
        }

        return count($ids);
    }

    /** End one of this person's sessions (by token id). False when it is not theirs. */
    public function revokeOne(Model $tokenable, int $tokenId, string $reason = 'revoked'): bool
    {
        $token = $tokenable->tokens()->whereKey($tokenId)->first();
        if (! $token) {
            return false;
        }
        $token->delete();
        $this->markEnded([$tokenId], $reason);

        return true;
    }

    /** The record of the session a token belongs to (null before script 123, or for a session that was never recorded). */
    public function recordOf(?PersonalAccessToken $token): ?AuthSession
    {
        return $token && self::tracked() ? AuthSession::where('token_id', $token->id)->first() : null;
    }

    /**
     * Strong proof has just happened in this session (a passkey was used): note when, and lift its strength. The session stays tied to the passkey that opened it, or that first lifted it
     * from a password; a later proof with another passkey is on the log but does not change whose session it is.
     */
    public function markStrong(?PersonalAccessToken $token, int $credentialId): void
    {
        if ($token && self::strongTracked()) {
            AuthSession::where('token_id', $token->id)->update(['strength' => 2, 'last_strong_at' => now(), 'restricted' => false]);
            AuthSession::where('token_id', $token->id)->whereNull('credential_id')->update(['credential_id' => $credentialId]);
        }
    }

    /** Was strong proof given in this session within the last few minutes? (A session started with a passkey counts from the moment it started.) */
    public function freshStrong(?PersonalAccessToken $token, int $minutes = 10): bool
    {
        $at = $this->recordOf($token)?->last_strong_at;

        return $at !== null && $at->gte(now()->subMinutes($minutes));
    }

    /** A recovery code has just been used in this session: for a quarter of an hour it may add a new passkey (and take away a lost one). */
    public function markRecovered(?PersonalAccessToken $token): void
    {
        if ($token && RecoveryCodes::ready()) {
            AuthSession::where('token_id', $token->id)->update(['recovery_at' => now()]);
        }
    }

    /** Was a recovery code used in this session within the last quarter of an hour? */
    public function recoveryFresh(?PersonalAccessToken $token): bool
    {
        $at = RecoveryCodes::ready() ? $this->recordOf($token)?->recovery_at : null;

        return $at !== null && $at->gte(now()->subMinutes(self::RECOVERY_MINUTES));
    }

    /** End every session that was opened with this passkey (it was removed, or looked copied). @return int how many */
    public function revokeByCredential(int $credentialId, string $reason): int
    {
        if (! self::strongTracked()) {
            return 0;
        }
        $ids = AuthSession::where('credential_id', $credentialId)->whereNull('revoked_at')->pluck('token_id')->all();
        if ($ids) {
            PersonalAccessToken::whereIn('id', $ids)->delete();
            $this->markEnded($ids, $reason);
        }

        return count($ids);
    }

    /** @param int[] $tokenIds */
    private function markEnded(array $tokenIds, string $reason): void
    {
        if (self::tracked() && $tokenIds) {
            AuthSession::whereIn('token_id', $tokenIds)->whereNull('revoked_at')->update(['revoked_at' => now(), 'revoked_reason' => $reason]);
        }
    }

    /** What the person sees under "Where you are signed in". @return array<int, array<string, mixed>> */
    public function list(Model $tokenable, ?int $currentTokenId): array
    {
        $tokens = $tokenable->tokens()->orderByDesc('id')->get();
        $meta = self::tracked() ? AuthSession::whereIn('token_id', $tokens->pluck('id'))->get()->keyBy('token_id') : collect();

        return $tokens->map(function ($t) use ($meta, $currentTokenId) {
            $m = $meta[$t->id] ?? null;

            return ['id' => $t->id, 'label' => $m?->label ?? 'A device from before sessions were listed', 'ip' => $m?->ip, 'method' => $m?->method,
                'signed_in_at' => ($m?->created_at ?? $t->created_at)?->format('Y-m-d\TH:i'), 'last_seen_at' => ($m?->last_seen_at ?? $t->last_used_at)?->format('Y-m-d\TH:i'),
                'ends_at' => $t->expires_at?->format('Y-m-d\TH:i'), 'strong' => (int) ($m?->strength ?? 0) >= 2, 'current' => $currentTokenId !== null && (int) $t->id === $currentTokenId];
        })->values()->all();
    }
}

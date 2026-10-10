<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Security\AuthCredential;
use App\Services\Security\Passkeys\Challenges;
use App\Services\Security\Passkeys\CredentialStore;
use App\Services\Security\Passkeys\PasskeyException;
use App\Services\Security\Passkeys\Passkeys;
use App\Services\Security\SecurityAlerts;
use App\Services\Security\SecurityLog;
use App\Services\Security\SessionCookie;
use App\Services\Security\Sessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * "My devices": the passkeys a person has added, and adding, renaming and removing them.
 *
 * Changing the set of passkeys changes who can get in, so it is held to a standard:
 *  - the first one is added right after signing in (or with the password again): it is how a person moves up from a password;
 *  - any further change (adding another, removing one) needs strong proof given a few minutes ago: a passkey used in this session. Someone who only holds a stolen password session can not add their own device or remove the owner's.
 */
class PasskeyController extends Controller
{
    /** How recent "a few minutes ago" is, for proof and for a session that has only just started. */
    private const FRESH_MINUTES = 10;

    public function __construct(private Passkeys $passkeys, private CredentialStore $store, private Sessions $sessions)
    {
    }

    private function token(Request $request): ?PersonalAccessToken
    {
        $t = $request->user()->currentAccessToken();

        return $t instanceof PersonalAccessToken ? $t : null;
    }

    private function refuse(PasskeyException $e): JsonResponse
    {
        return response()->json(['message' => $e->getMessage(), 'reason' => $e->reason] + ($e->reason === 'proof_needed' ? ['requires' => 'passkey'] : []), $e->httpStatus);
    }

    /** GET /auth/passkeys */
    public function index(Request $request): JsonResponse
    {
        $current = $this->sessions->recordOf($this->token($request))?->credential_id;

        $user = $request->user();
        $past = AuthCredential::where('user_id', $user->id)->whereNotNull('revoked_at')->orderByDesc('revoked_at')->limit(10)->get();
        $names = AuthCredential::where('user_id', $user->id)->pluck('name', 'id');

        return response()->json([
            'data' => $this->store->forUser($user)->map(fn (AuthCredential $c) => $this->present($c, $current) + [
                'approved_by_name' => $c->added_by_id ? ($names[$c->added_by_id] ?? null) : null,
                // the lineage: which earlier passkeys this one took the place of
                'replaces' => $past->where('replaced_by_id', $c->id)->map(fn (AuthCredential $p) => ['name' => $p->name, 'removed_at' => $p->revoked_at?->toIso8601String()])->values(),
            ])->values(),
            // the ones that are gone: what they were called, when and why they went, and what took their place
            'history' => $past->map(fn (AuthCredential $p) => ['name' => $p->name, 'kind' => $p->kind, 'added_at' => $p->created_at?->toIso8601String(), 'removed_at' => $p->revoked_at?->toIso8601String(),
                'reason' => $p->revoked_reason, 'replaced_by_name' => $p->replaced_by_id ? ($names[$p->replaced_by_id] ?? null) : null])->values(),
            'max' => (int) config('security.passkeys.max_per_person', 10),
        ]);
    }

    /** POST /auth/passkeys/register/options: the question a device is asked to add a passkey. */
    public function registerOptions(Request $request): JsonResponse
    {
        $user = $request->user();
        try {
            $this->mayChange($request, 'add');
            $q = $this->passkeys->registrationOptions($user, $request);
        } catch (PasskeyException $e) {
            return $this->refuse($e);
        }

        return response()->json(['challenge_id' => $q['id'], 'options' => $q['options']]);
    }

    /** POST /auth/passkeys/register/verify: the device answered. */
    public function registerVerify(Request $request): JsonResponse
    {
        $request->validate(['challenge_id' => 'required|string|size:40', 'credential' => 'required|array', 'name' => 'nullable|string|max:80']);
        $user = $request->user();
        $first = $this->store->forUser($user)->isEmpty();
        $provedWith = $this->sessions->recordOf($this->token($request))?->credential_id;
        // added with no passkey vouching for it: only after a recovery code (the lost-phone way back)
        $recovered = ! $first && ! $this->sessions->freshStrong($this->token($request), self::FRESH_MINUTES) && $this->sessions->recoveryFresh($this->token($request));
        try {
            $c = $this->passkeys->register($user, (string) $request->input('challenge_id'), (array) $request->input('credential'), $request->input('name'), $request, $first ? 'first' : ($recovered ? 'recovery' : 'approved'), $first || $recovered ? null : $provedWith);
        } catch (PasskeyException $e) {
            return $this->refuse($e);
        }
        $this->sessions->markStrong($this->token($request), $c->id);   // the device has just verified the person: this session is strong now
        SecurityLog::record('passkey_added', $user, $request, ['credential' => $c->id, 'name' => $c->name, 'method' => $c->added_method, 'kind' => $c->kind, 'approved_by' => $c->added_by_id], SecurityLog::NOTICE);
        app(SecurityAlerts::class)->passkeyAdded($user, $c, $request);

        return response()->json(['message' => 'Passkey added.', 'data' => $this->present($c->refresh(), $c->id)], 201);
    }

    /** POST /auth/passkeys/prove/options: "show it is really you" with a passkey already added. */
    public function proveOptions(Request $request): JsonResponse
    {
        try {
            $q = $this->passkeys->proofOptions($request->user(), $request);
        } catch (PasskeyException $e) {
            return $this->refuse($e);
        }

        return response()->json(['challenge_id' => $q['id'], 'options' => $q['options']]);
    }

    /** POST /auth/passkeys/prove: the device answered; this session is strong for the next few minutes. */
    public function prove(Request $request): JsonResponse
    {
        $request->validate(['challenge_id' => 'required|string|size:40', 'credential' => 'required|array']);
        try {
            $c = $this->passkeys->prove($request->user(), (string) $request->input('challenge_id'), (array) $request->input('credential'), $request);
        } catch (PasskeyException $e) {
            return $this->refuse($e);
        }
        $this->sessions->markStrong($this->token($request), $c->id);
        SecurityLog::record('passkey_proved', $request->user(), $request, ['credential' => $c->id], SecurityLog::INFO);

        return response()->json(['message' => 'Confirmed.', 'fresh_minutes' => self::FRESH_MINUTES]);
    }

    /** PATCH /auth/passkeys/{id}: give it a name you will recognise. */
    public function rename(Request $request, int $id): JsonResponse
    {
        $request->validate(['name' => 'required|string|min:1|max:80']);
        $c = AuthCredential::where('user_id', $request->user()->id)->active()->find($id);
        if (! $c) {
            return response()->json(['message' => 'That passkey was not found.'], 404);
        }
        $c->forceFill(['name' => trim((string) $request->input('name'))])->save();
        SecurityLog::record('passkey_renamed', $request->user(), $request, ['credential' => $c->id], SecurityLog::INFO);

        return response()->json(['message' => 'Renamed.', 'data' => $this->present($c, $this->sessions->recordOf($this->token($request))?->credential_id)]);
    }

    /**
     * DELETE /auth/passkeys/{id}: remove a passkey (lost, no longer used, or replaced by a new one: say which with `reason`, and with `replaced_by` which one took its place).
     * Every sign-in that was opened with it ends at once.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $request->validate(['reason' => 'nullable|in:removed,replaced,lost', 'replaced_by' => 'nullable|integer']);
        $user = $request->user();
        $c = AuthCredential::where('user_id', $user->id)->active()->find($id);
        if (! $c) {
            return response()->json(['message' => 'That passkey was not found.'], 404);
        }
        try {
            $this->mayChange($request, 'remove');
        } catch (PasskeyException $e) {
            return $this->refuse($e);
        }
        $usedHere = $this->sessions->recordOf($this->token($request))?->credential_id === $c->id;   // is this browser signed in with the passkey being removed?
        $reason = (string) $request->input('reason', $request->filled('replaced_by') ? 'replaced' : 'removed');
        $successor = $request->filled('replaced_by') ? AuthCredential::where('user_id', $user->id)->active()->whereKeyNot($c->id)->find((int) $request->input('replaced_by')) : null;
        if ($request->filled('replaced_by') && ! $successor) {
            return response()->json(['message' => 'The passkey that takes its place was not found.'], 422);
        }
        $c->forceFill(['revoked_at' => now(), 'revoked_by_id' => $user->id, 'revoked_reason' => $reason, 'replaced_by_id' => $successor?->id])->save();
        $ended = $this->sessions->revokeByCredential($c->id, 'passkey_removed');
        if ($reason === 'lost') {   // a lost device may be in someone else's hands, and may have been used to prove things in any session: every other sign-in ends too (this one stays)
            $ended += $this->sessions->revokeAll($user, $this->token($request)?->id, 'passkey_lost');
        }
        SecurityLog::record('passkey_removed', $user, $request, ['credential' => $c->id, 'name' => $c->name, 'reason' => $reason, 'replaced_by' => $successor?->id, 'sessions_ended' => $ended], SecurityLog::WARNING);
        app(SecurityAlerts::class)->passkeyRemoved($user, $c->name, $reason, $ended, $request);

        $response = response()->json(['message' => $ended ? "Passkey removed. {$ended} sign-in".($ended === 1 ? '' : 's').' that used it ended.' : 'Passkey removed.', 'sessions_ended' => $ended]);
        if ($usedHere) {
            $response->headers->setCookie(SessionCookie::forget($request));   // this very browser was signed in with it
        }

        return $response;
    }

    /**
     * May this session change the person's passkeys now?
     *  - with no passkey yet: only right after signing in, or by typing the password again (the first one is how a person moves up from a password);
     *  - with one or more: only after strong proof a few minutes ago, or after a recovery code was used in this session (a lost phone).
     *
     * @throws PasskeyException
     */
    private function mayChange(Request $request, string $what): void
    {
        $user = $request->user();
        $token = $this->token($request);
        if ($this->store->usableFor($user)->isNotEmpty()) {
            if (! $this->sessions->freshStrong($token, self::FRESH_MINUTES) && ! $this->sessions->recoveryFresh($token)) {   // (a recovery code stands in for a passkey that is out of reach)
                throw new PasskeyException('Confirm it is really you with one of your passkeys first.', 'proof_needed', 403);
            }

            return;
        }
        if ($what !== 'add') {
            return;   // nothing usable to protect (an unusable one is being tidied away)
        }
        $recent = $token?->created_at?->gte(now()->subMinutes(self::FRESH_MINUTES)) ?? false;
        $passwordOk = $request->filled('current_password') && Hash::check((string) $request->input('current_password'), (string) $user->password);
        if (! $recent && ! $passwordOk) {
            throw new PasskeyException('Type your password to add a passkey.', 'password_needed', 403);
        }
    }

    /** @return array<string, mixed> */
    private function present(AuthCredential $c, ?int $currentId): array
    {
        return ['id' => $c->id, 'name' => $c->name, 'kind' => $c->kind, 'added_at' => $c->created_at?->toIso8601String(), 'added_method' => $c->added_method, 'added_by' => $c->added_by_id,
            'last_used_at' => $c->last_used_at?->toIso8601String(), 'last_used_device' => $c->last_used_device, 'last_used_ip' => $c->last_used_ip,
            'synced' => (bool) $c->backup_eligible, 'disabled' => $c->disabled_at !== null, 'disabled_reason' => $c->disabled_reason, 'current' => $currentId !== null && $currentId === $c->id];
    }
}

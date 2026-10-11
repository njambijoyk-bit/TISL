<?php

namespace App\Services\Security;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthSession;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Security\Passkeys\CredentialStore;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Who must sign in with a passkey, and what a person who has not yet is allowed to do.
 *
 * The rule is for staff whose work can move money or change who may do what (the roles and permissions named in `config/security.php` → `policy.passkeys`). Each role says how many passkeys it needs
 * (none, one, or two as the owner's role does) and whether they must stay on the device; the owner sets this per role on the Passkey rule page.
 * It is switched on slowly, as every rule here is:
 *  - off:     nothing happens (the default);
 *  - log:     nobody is stopped, but each sign-in that WOULD have been is written to the security log, so the owner sees how many people it would touch;
 *  - enforce: from the "enforce from" date on, a staff member without the passkeys the rule asks for (or signed in with a password alone) gets a restricted session: the person can add or use a passkey, and nothing else.
 * Until that date, people are only reminded (the grace period).
 * A person with a customer or any other ordinary account is never held to it: they may add a passkey to sign in faster.
 *
 * The emergency way out is in the server's settings, not in the database: `SECURITY_POLICY_OFF=true` puts everything here to sleep.
 */
final class PasskeyPolicy
{
    public function __construct(private Authorizer $auth, private CredentialStore $store, private SecuritySettings $settings)
    {
    }

    /** off | log | enforce. "off" also when the tables this needs have not been created yet (script 124), or when the emergency switch is set. */
    public function mode(): string
    {
        if (config('security.policy.kill_switch') || ! Sessions::strongTracked()) {
            return 'off';
        }
        $mode = (string) $this->settings->get('passkeys.mode', 'off');

        return in_array($mode, ['log', 'enforce'], true) ? $mode : 'off';
    }

    public function enforceFrom(): ?Carbon
    {
        $date = $this->settings->get('passkeys.enforce_from');

        try {
            return $date ? Carbon::parse((string) $date)->startOfDay() : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /** Is this person one the rule is for? */
    public function appliesTo(User $user): bool
    {
        if (! $this->auth->isStaff($user)) {
            return false;
        }
        if (array_intersect($this->auth->roleKeys($user), (array) $this->settings->get('passkeys.roles', []))) {
            return true;
        }
        foreach ((array) $this->settings->get('passkeys.permissions', []) as $permission) {
            if ($this->auth->allows($user, (string) $permission)) {
                return true;
            }
        }

        return false;
    }

    /** How many passkeys the person needs: two for the roles that need two (the owner's), one for everyone else the rule is for. A person with several roles needs what the strictest of them asks. */
    public function needs(User $user): int
    {
        return array_intersect($this->auth->roleKeys($user), (array) $this->settings->get('passkeys.owner_roles', [])) ? 2 : 1;
    }

    /**
     * Must the person's passkeys be tied to a device (a security key, the computer's own sign-in), not copied to a Google or Apple account? Per role (`device_bound_roles`); the older
     * all-in-one switch (`owner_device_bound`) still means it for the roles that need two. A person with several roles is held to the strictest.
     */
    public function deviceBound(User $user, int $needs): bool
    {
        if (array_intersect($this->auth->roleKeys($user), (array) $this->settings->get('passkeys.device_bound_roles', []))) {
            return true;
        }

        return $needs === 2 && (bool) $this->settings->get('passkeys.owner_device_bound', true);
    }

    /**
     * Where the person stands. Always safe to call, for anyone.
     *
     * @return array{mode: string, applies: bool, needs: int, passkeys: int, phase: string, enforce_from: ?string, days_left: ?int, gate: ?string, would_gate: ?string, session_strong: bool}
     */
    public function report(User $user, ?AuthSession $session): array
    {
        $report = $this->ruleReport($user, $session);
        if ($report['gate'] === null && $this->heldByRisk($session)) {   // a sign-in that looked unusual is held until the person confirms with their passkey, whoever they are
            $report['gate'] = $report['would_gate'] = 'risk_check';
            $report['mode'] = 'enforce';   // (it holds, whatever mode the passkey rule itself is in)
        }

        return $report;
    }

    /** Was this sign-in held because it looked unusual (RiskGate), and not yet confirmed with a passkey? */
    public function heldByRisk(?AuthSession $session): bool
    {
        return $session !== null && (bool) $session->restricted && $session->strength < 2 && app(RiskSignals::class)->mode() === 'enforce';
    }

    /** @return array<string, mixed> */
    private function ruleReport(User $user, ?AuthSession $session): array
    {
        $mode = $this->mode();
        $strong = $session !== null && $session->strength >= 2;
        $base = ['mode' => $mode, 'applies' => false, 'needs' => 0, 'passkeys' => 0, 'phase' => 'off', 'enforce_from' => null, 'days_left' => null, 'gate' => null, 'would_gate' => null, 'session_strong' => $strong];
        if ($mode === 'off' || ! $this->appliesTo($user)) {
            return $base;
        }

        $usable = $this->store->usableFor($user);
        [$needs, $met] = $this->standing($user, $usable);
        $from = $this->enforceFrom();
        $due = $from !== null && $from->lte(now());

        $gate = null;   // what would hold this session; only in "enforce" does it actually do so ("log" just writes it down)
        if ($due) {
            $gate = ! $met ? ($usable->isEmpty() ? 'passkey_missing' : ($usable->count() < $needs ? 'second_missing' : 'device_bound_missing')) : (! $strong ? 'passkey_needed' : null);
        }

        return ['applies' => true, 'needs' => $needs, 'passkeys' => $usable->count(), 'phase' => $met ? 'met' : ($due ? 'due' : 'grace'),
            'enforce_from' => $from?->toDateString(), 'days_left' => $from !== null && ! $due ? (int) ceil(now()->diffInDays($from, false)) : null,
            'gate' => $mode === 'enforce' ? $gate : null, 'would_gate' => $gate] + $base;
    }

    /**
     * How many passkeys this person needs and whether the usable ones they have are enough. The owner's own devices count only when tied to the device, if the owner has asked for that.
     *
     * @param \Illuminate\Support\Collection<int, \App\Models\Security\AuthCredential> $usable
     * @return array{0: int, 1: bool}
     */
    private function standing(User $user, $usable): array
    {
        $needs = $this->needs($user);
        $counted = $this->deviceBound($user, $needs) ? $usable->filter(fn ($c) => $c->backup_eligible === false)->count() : $usable->count();

        return [$needs, $counted >= $needs];
    }

    /**
     * Every staff account, and where each stands with the rule (for the owner's page): who has added a passkey, who still has to.
     *
     * @return array{summary: array<string, int>, people: array<int, array<string, mixed>>}
     */
    public function roster(): array
    {
        $users = User::query()->whereIn('role', $this->auth->staffRoleKeys())->orderBy('name')->get(['id', 'name', 'email', 'role', 'status', 'last_login_at']);
        $credentials = AuthCredential::query()->active()->whereIn('user_id', $users->pluck('id'))->get()->groupBy('user_id');
        $people = [];
        $summary = ['staff' => $users->count(), 'applies' => 0, 'met' => 0, 'missing' => 0, 'with_passkey' => 0];
        foreach ($users as $u) {
            $usable = ($credentials[$u->id] ?? collect())->filter(fn ($c) => $c->usable())->values();
            $applies = $this->appliesTo($u);
            [$needs, $met] = $this->standing($u, $usable);
            $summary['with_passkey'] += $usable->isNotEmpty() ? 1 : 0;
            if ($applies) {
                $summary['applies']++;
                $summary[$met ? 'met' : 'missing']++;
            }
            $people[] = ['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'role' => $u->role, 'suspended' => $u->status === 'suspended', 'applies' => $applies, 'needs' => $applies ? $needs : 0, 'device_bound' => $applies && $this->deviceBound($u, $needs),
                'passkeys' => $usable->count(), 'met' => $met, 'last_sign_in_at' => $u->last_login_at?->toIso8601String(), 'last_passkey_used_at' => $usable->max('last_used_at')?->toIso8601String()];
        }

        return ['summary' => $summary, 'people' => $people];
    }

    /** The same, for the session that a plain-text token opens (the sign-in answer has only the token). */
    public function reportForToken(User $user, string $plainToken): array
    {
        $token = PersonalAccessToken::findToken($plainToken);

        return $this->report($user, app(Sessions::class)->recordOf($token));
    }
}

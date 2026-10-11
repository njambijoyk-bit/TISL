<?php

namespace App\Services\Security;

use App\Models\Security\AuthRecoveryApproval;
use App\Models\Security\AuthRecoveryRequest;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Notify\Staff;
use App\Services\Security\Passkeys\Challenges;
use App\Services\Security\Passkeys\PasskeyException;
use App\Services\Security\Passkeys\Passkeys;
use App\Services\Security\Passkeys\CredentialStore;
use App\Services\Security\StepUp\Catalogue;
use App\Services\Security\StepUp\Council;
use App\Services\Security\StepUp\StepUp;
use App\Services\Security\StepUp\StepUpException;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Assisted recovery: the way back for a member of staff who has lost every passkey device AND every recovery code. The ladder is strict because this door is what a thief would go for:
 *
 *  1. the person, signed in with their password (and held at the passkey screen), asks for help and says what happened;
 *  2. two other administrators, who could reset a sign-in themselves and could answer the question, each look at it, check with the person some other way, and approve with their own passkey and a reason;
 *  3. then a cooling-off day: the person, the administrators and everyone who manages security are told, and any of them can cancel (the person with the "This was not me" button in their email);
 *  4. afterwards, within two days, the person starts the recovery: every other sign-in of theirs ends and THIS sign-in may add a new passkey for 15 minutes and do nothing else.
 *
 * The owner's break-glass command (BreakGlass) is the rung below this, for when there are not two administrators to ask. Needs database script 130.
 */
final class AssistedRecovery
{
    /** The catalogue rule whose approver permission and strength decide who may approve (the same people who may reset a sign-in). */
    private const RULE = 'signin_reset';

    private static ?bool $ready = null;

    public function __construct(private Council $council, private Staff $staff, private Sessions $sessions, private SecurityAlerts $alerts, private StepUp $stepUp, private Authorizer $auth,
        private Passkeys $passkeys, private CredentialStore $store, private RecoveryCodes $codes)
    {
    }

    public static function forget(): void
    {
        self::$ready = null;
    }

    /** Has database script 130 been run (and the ones it builds on)? */
    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('auth_recovery_requests') && Schema::hasTable('auth_recovery_approvals') && Sessions::strongTracked() && RecoveryCodes::ready();
    }

    public static function needed(): int
    {
        return max(1, (int) config('security.recovery.approvals', 2));
    }

    // ------------------------------------------------------------ who may help

    /** @return Collection<int, User> the people who could approve this person's recovery: other administrators who could reset a sign-in themselves */
    public function approvers(User $person): Collection
    {
        $permission = Catalogue::rule(self::RULE)['approver'];

        return $this->staff->holding((string) $permission)->filter(fn (User $u) => $this->council->eligible($u, self::RULE, $person))->values();
    }

    private function mayHelp(User $me, AuthRecoveryRequest $r): bool
    {
        $person = User::find($r->user_id);

        return $person !== null && $this->council->eligible($me, self::RULE, $person);
    }

    // ------------------------------------------------------------ the person

    public function open(User $person): ?AuthRecoveryRequest
    {
        if (! self::ready()) {
            return null;
        }

        return AuthRecoveryRequest::where('user_id', $person->getKey())->where('kind', 'self')->orderByDesc('created_at')->get()->first(fn (AuthRecoveryRequest $r) => $r->alive());
    }

    /** What the person's own screen shows. @return array<string, mixed> */
    public function status(User $person): array
    {
        if (! self::ready()) {
            return ['ready' => false, 'request' => null];
        }
        $r = $this->open($person);

        return ['ready' => true, 'staff' => $this->auth->isStaff($person), 'needed' => self::needed(), 'cooling_hours' => (int) config('security.recovery.cooling_hours', 24), 'request' => $r ? $this->describeForPerson($r) : null];
    }

    /** @return array<string, mixed> */
    private function describeForPerson(AuthRecoveryRequest $r): array
    {
        $names = $this->approvedBy($r);

        return ['id' => $r->id, 'state' => $r->state(), 'note' => $r->note, 'needed' => $r->needed, 'approved' => $names->count(), 'approved_by' => $names->pluck('name')->all(),
            'asked_at' => $r->created_at?->toIso8601String(), 'release_at' => $r->release_at?->toIso8601String(), 'expires_at' => $r->expires_at->toIso8601String()];
    }

    /** @return Collection<int, User> */
    private function approvedBy(AuthRecoveryRequest $r): Collection
    {
        return User::whereIn('id', AuthRecoveryApproval::where('request_id', $r->id)->pluck('user_id'))->get(['id', 'name']);
    }

    /** The person asks for help. */
    public function request(User $person, ?string $note, ?Request $http = null): AuthRecoveryRequest
    {
        if (! self::ready()) {
            throw new StepUpException('Asking administrators for help is not set up yet: run database script 130 in Workbench.', 'not_ready', 409);
        }
        if (! $this->auth->isStaff($person)) {
            throw new StepUpException('This is for staff accounts. Use "Forgot password" on the sign-in page.', 'not_staff', 403);
        }
        if ($this->open($person)) {
            throw new StepUpException('You already have a request open. It is on this page.', 'already_open', 409);
        }
        $approvers = $this->approvers($person);
        if ($approvers->count() < self::needed()) {
            throw new StepUpException('There are not enough administrators who could approve this ('.$approvers->count().' of '.self::needed().'). Ask the owner to run the emergency recovery on the server.', 'not_enough_approvers', 422);
        }
        $note = trim((string) $note);
        $r = AuthRecoveryRequest::create(['id' => Str::random(40), 'user_id' => $person->getKey(), 'kind' => 'self', 'asked_by_id' => $person->getKey(), 'note' => $note !== '' ? mb_substr($note, 0, 300) : null,
            'ip' => $http?->ip(), 'user_agent' => $http?->userAgent() ? mb_substr($http->userAgent(), 0, 255) : null, 'needed' => self::needed(), 'expires_at' => now()->addHours((int) config('security.recovery.request_hours', 72))]);
        SecurityLog::record('recovery_requested', $person, $http, ['request' => $r->id, 'approvers' => $approvers->count()], SecurityLog::WARNING);
        $this->alerts->recoveryAsked($person, $approvers, $this->managers($person, $approvers), $http, $r->note, $r->id);

        return $r;
    }

    /** @return Collection<int, User> */
    private function managers(User $person, Collection $except): Collection
    {
        return $this->staff->holding('security.manage')->reject(fn (User $u) => $u->getKey() === $person->getKey() || $except->contains(fn (User $e) => $e->getKey() === $u->getKey()))->values();
    }

    /** The person starts the recovery that was approved and has cooled off: this sign-in may add a new passkey for 15 minutes, and every other sign-in of theirs ends. */
    public function start(User $person, PersonalAccessToken $token, string $id, ?Request $http = null): AuthRecoveryRequest
    {
        $r = AuthRecoveryRequest::where('id', $id)->where('user_id', $person->getKey())->first();
        if (! $r) {
            throw new StepUpException('That request was not found.', 'unknown', 404);
        }
        $state = $r->state();
        if ($state !== 'ready') {
            throw new StepUpException(match ($state) {
                'pending' => 'It has not been approved yet.',
                'cooling' => 'It was approved, but the waiting day is not over yet. It can be started from '.$r->release_at?->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('j M, H:i').'.',
                'used' => 'It was already used.',
                default => 'It is no longer open.',
            }, $state === 'cooling' ? 'cooling' : 'not_ready', 422);
        }
        $won = AuthRecoveryRequest::where('id', $r->id)->whereNull('used_at')->whereNull('cancelled_at')->whereNull('declined_at')->update(['used_at' => now()]);
        if ($won !== 1) {
            throw new StepUpException('It was already used or ended.', 'closed', 410);
        }
        $ended = $this->sessions->revokeAll($person, $token->getKey(), 'recovery');
        $this->sessions->markRecovered($token);
        SecurityLog::record('recovery_started', $person, $http, ['request' => $r->id, 'other_sign_ins_ended' => $ended], SecurityLog::ALERT);
        $this->alerts->recoveryStarted($person, $this->approvedBy($r), $this->managers($person, collect()), $http);

        return $r->refresh();
    }

    // ------------------------------------------------------------ ending it

    /**
     * Cancel a request that is still going. `$by`: person (their own button), admin (an administrator who could have approved it) or link ("This was not me").
     */
    public function cancel(AuthRecoveryRequest $r, string $by, ?User $who, ?string $note, ?Request $http = null): void
    {
        $won = AuthRecoveryRequest::where('id', $r->id)->whereNull('cancelled_at')->whereNull('declined_at')->whereNull('used_at')
            ->update(['cancelled_at' => now(), 'cancelled_by' => $by, 'cancelled_by_id' => $who?->getKey()]);
        if ($won !== 1) {
            return;
        }
        $person = User::find($r->user_id);
        SecurityLog::record('recovery_cancelled', $person, $http, ['request' => $r->id, 'by' => $by, 'by_user' => $who?->getKey(), 'note' => $note !== null && trim($note) !== '' ? mb_substr(trim($note), 0, 300) : null], SecurityLog::NOTICE);
        if ($person) {
            $this->alerts->recoveryEnded($person, 'cancelled', $by === 'admin' ? $who?->name : null, $this->approvedBy($r), $http);
        }
    }

    /** "This was not me", or the person changing their mind elsewhere: end whatever request is still going. @return int how many were ended */
    public function cancelAllFor(User $person, string $by, ?Request $http = null): int
    {
        if (! self::ready()) {
            return 0;
        }
        $n = 0;
        foreach (AuthRecoveryRequest::where('user_id', $person->getKey())->get() as $r) {
            if ($r->alive()) {
                $this->cancel($r, $by, null, null, $http);
                $n++;
            }
        }

        return $n;
    }

    /** The person gives up their own request. */
    public function cancelMine(User $person, string $id, ?Request $http = null): void
    {
        $r = AuthRecoveryRequest::where('id', $id)->where('user_id', $person->getKey())->first();
        if (! $r) {
            throw new StepUpException('That request was not found.', 'unknown', 404);
        }
        $this->cancel($r, 'person', $person, null, $http);
    }

    // ------------------------------------------------------------ the administrators

    /**
     * Everything going on that this administrator may act on: requests they could approve or decline, and ones in the waiting day they could cancel.
     *
     * @return Collection<int, AuthRecoveryRequest>
     */
    public function forApprover(User $me): Collection
    {
        if (! self::ready()) {
            return collect();
        }

        return AuthRecoveryRequest::where('user_id', '!=', $me->getKey())->where('expires_at', '>', now())->whereNull('cancelled_at')->whereNull('declined_at')->whereNull('used_at')->whereNull('executed_at')->orderBy('created_at')->get()
            ->filter(fn (AuthRecoveryRequest $r) => $this->mayHelp($me, $r))->values();
    }

    /** @return array<string, mixed> what the administrator's screen shows */
    public function describeFor(AuthRecoveryRequest $r, User $me): array
    {
        $person = User::find($r->user_id);
        $names = $this->approvedBy($r);
        $state = $r->state();
        $mine = AuthRecoveryApproval::where('request_id', $r->id)->where('user_id', $me->getKey())->exists();

        $by = $r->kind === 'reset' ? User::find($r->asked_by_id)?->name : null;

        return ['id' => $r->id, 'kind' => $r->kind, 'started_by' => $by, 'state' => $state, 'person' => $person ? ['name' => $person->name, 'email' => $person->email, 'role' => $person->role, 'phone' => $person->phone] : null,
            'note' => $r->note, 'asked_at' => $r->created_at?->toIso8601String(), 'from' => DeviceInfo::describe($r->user_agent)['label'].($r->ip ? ' ('.$r->ip.')' : ''),
            'passkeys' => $person ? $this->store->usableFor($person)->count() : 0, 'codes_left' => $person ? $this->codes->status($person)['remaining'] : 0,
            'needed' => $r->needed, 'approved' => $names->count(), 'approved_by' => $names->pluck('name')->all(), 'release_at' => $r->release_at?->toIso8601String(), 'expires_at' => $r->expires_at->toIso8601String(),
            'can_approve' => $state === 'pending' && ! $mine, 'approved_by_me' => $mine, 'can_cancel' => true,
            'has_passkey' => $this->store->usableFor($me)->isNotEmpty(), 'can_use_password' => $this->stepUp->passwordAllowed($me, Catalogue::rule(self::RULE)['strength'])];
    }

    private function mine(User $me, string $id): AuthRecoveryRequest
    {
        $r = AuthRecoveryRequest::where('id', $id)->first();
        if (! $r || ! $r->alive() || ! $this->mayHelp($me, $r)) {
            throw new StepUpException('That request was not found, or it is not yours to answer. It may have ended or run out.', 'unknown', 404);
        }

        return $r;
    }

    private function toApprove(User $me, string $id): AuthRecoveryRequest
    {
        $r = $this->mine($me, $id);
        if ($r->state() !== 'pending') {
            throw new StepUpException('It is not waiting for approvals any more.', 'closed', 410);
        }
        if (AuthRecoveryApproval::where('request_id', $r->id)->where('user_id', $me->getKey())->exists()) {
            throw new StepUpException('You already approved this one.', 'already_approved', 409);
        }

        return $r;
    }

    /** The context an administrator's device signs: this request and them. */
    public function contextFor(AuthRecoveryRequest $r, User $me): string
    {
        return hash('sha256', "recovery|{$r->id}|{$r->user_id}|{$me->getKey()}");
    }

    /** @return array{id: string, options: array<string, mixed>} */
    public function options(User $me, string $id, ?Request $http = null): array
    {
        $r = $this->toApprove($me, $id);
        try {
            return $this->passkeys->proofOptions($me, $http, Challenges::STEP_UP, $this->contextFor($r, $me));
        } catch (PasskeyException $e) {
            throw new StepUpException($e->getMessage(), $e->reason, $e->httpStatus, $e);
        }
    }

    /**
     * An administrator approves, with their passkey (or password, where they have no passkey yet) and a reason. The last approval starts the waiting day.
     *
     * @param array<string, mixed> $proof
     */
    public function approve(User $me, PersonalAccessToken $token, string $id, array $proof, ?string $note, ?Request $http = null): AuthRecoveryRequest
    {
        $r = $this->toApprove($me, $id);
        $rule = Catalogue::rule(self::RULE);
        $note = trim((string) $note);
        if (mb_strlen($note) < 3) {
            throw new StepUpException('Say how you checked it is really them, in a few words. It is written in the log.', 'reason_needed');
        }
        $credentialId = null;
        if (isset($proof['credential'])) {
            $credentialId = $this->stepUp->verifyPasskey($me, $token, self::RULE, $rule, $this->contextFor($r, $me), (string) ($proof['challenge_id'] ?? ''), (array) $proof['credential'], $http);
            $with = 'passkey';
        } else {
            if (! $this->stepUp->passwordAllowed($me, $rule['strength'])) {
                throw new StepUpException('This needs your passkey.', 'passkey_needed', 403);
            }
            if (! Hash::check((string) ($proof['current_password'] ?? ''), (string) $me->password)) {
                SecurityLog::record('stepup_failed', $me, $http, ['rule' => self::RULE, 'why' => 'wrong_password', 'as' => 'recovery'], SecurityLog::WARNING);
                throw new StepUpException('That password is not right.', 'wrong_password');
            }
            $with = 'password';
        }

        $done = DB::transaction(function () use ($r, $me, $with, $credentialId, $note, $http) {
            $fresh = AuthRecoveryRequest::where('id', $r->id)->lockForUpdate()->first();
            if (! $fresh || $fresh->state() !== 'pending') {
                throw new StepUpException('It is not waiting for approvals any more.', 'closed', 410);
            }
            AuthRecoveryApproval::create(['request_id' => $r->id, 'user_id' => $me->getKey(), 'approved_with' => $with, 'credential_id' => $credentialId, 'note' => mb_substr($note, 0, 300), 'ip' => $http?->ip()]);
            $count = AuthRecoveryApproval::where('request_id', $r->id)->count();
            if ($count >= $fresh->needed) {
                $release = now()->addHours((int) config('security.recovery.cooling_hours', 24));
                $fresh->forceFill(['release_at' => $release, 'expires_at' => $release->copy()->addHours((int) config('security.recovery.use_hours', 48))])->save();
            }

            return $fresh->refresh();
        });
        SecurityLog::record('recovery_approved', $me, $http, ['request' => $r->id, 'person' => $r->user_id, 'with' => $with, 'reason' => mb_substr($note, 0, 300), 'approvals' => $this->approvedBy($done)->count(), 'needed' => $done->needed], SecurityLog::NOTICE);
        $person = User::find($r->user_id);
        if ($person && $done->release_at !== null) {
            $this->alerts->recoveryReleased($person, $done->release_at, $this->approvedBy($done), $this->approvers($person), $this->managers($person, $this->approvers($person)), $http, $done->id);
        }

        return $done;
    }

    /** An administrator says no: the request ends. */
    public function decline(User $me, string $id, ?string $note, ?Request $http = null): AuthRecoveryRequest
    {
        $r = $this->toApprove($me, $id);
        $note = trim((string) $note);
        $won = AuthRecoveryRequest::where('id', $r->id)->whereNull('declined_at')->whereNull('cancelled_at')->whereNull('used_at')->update(['declined_at' => now(), 'declined_by_id' => $me->getKey(), 'decline_note' => $note !== '' ? mb_substr($note, 0, 300) : null]);
        if ($won !== 1) {
            throw new StepUpException('It was already answered or ended.', 'closed', 410);
        }
        SecurityLog::record('recovery_declined', $me, $http, ['request' => $r->id, 'person' => $r->user_id, 'reason' => $note !== '' ? mb_substr($note, 0, 300) : null], SecurityLog::NOTICE);
        $person = User::find($r->user_id);
        if ($person) {
            $this->alerts->recoveryEnded($person, 'declined', $me->name, collect(), $http);
        }

        return $r->refresh();
    }

    /** An administrator who could have approved it stops one that is still going, including during the waiting day. */
    public function adminCancel(User $me, string $id, ?string $note, ?Request $http = null): void
    {
        $r = $this->mine($me, $id);
        $this->cancel($r, 'admin', $me, $note, $http);
    }
}

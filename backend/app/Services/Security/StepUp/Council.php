<?php

namespace App\Services\Security\StepUp;

use App\Models\Security\AuthPendingAction;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Notify\Staff;
use App\Services\Security\Passkeys\Challenges;
use App\Services\Security\Passkeys\CredentialStore;
use App\Services\Security\Passkeys\PasskeyException;
use App\Services\Security\Passkeys\Passkeys;
use App\Services\Security\SecurityAlerts;
use App\Services\Security\SecurityLog;
use App\Services\Security\SecuritySettings;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * The Council of Two. For the most serious actions (the catalogue's `two` rules) the person who asked is not enough: a SECOND person must look at the very same facts and approve too.
 *
 *  - the second person is somebody else, who holds the permission that guards the thing (the catalogue's `approver`) - never someone who could not do it themselves;
 *  - they see what the server wrote down (who asked, what, every value, and why), and answer with their own passkey, bound to that one record and to them;
 *  - the first person's action only goes through once the second has approved; the request runs out after a while; either person's answer is written to the log with who, how and why;
 *  - the second person can say no, and the first can give up.
 *
 * Per rule the owner chooses off / test / on (`stepup.<rule>.two`): in test it is only written down that a second person WOULD have been asked. Needs database script 129.
 */
final class Council
{
    private static ?bool $ready = null;

    public function __construct(private SecuritySettings $settings, private StepUp $stepUp, private Authorizer $auth, private Staff $staff, private SecurityAlerts $alerts,
        private Passkeys $passkeys, private Challenges $challenges, private CredentialStore $store)
    {
    }

    public static function forget(): void
    {
        self::$ready = null;
    }

    /** Has database script 129 been run? Until then no second person is ever asked. */
    public static function ready(): bool
    {
        return self::$ready ??= Schema::hasTable('auth_pending_actions') && Schema::hasColumn('auth_pending_actions', 'second_required');
    }

    /** How long a request waits for the second person. */
    public static function waitMinutes(): int
    {
        return max(1, (int) config('security.stepup.council_minutes', 30));
    }

    /** off | log | enforce for one rule. The emergency switch puts it to sleep with everything else. */
    public function mode(string $rule): string
    {
        if (config('security.policy.kill_switch') || ! self::ready() || ! StepUp::ready() || ! Catalogue::has($rule) || ! Catalogue::rule($rule)['two']) {
            return 'off';
        }
        $mode = (string) $this->settings->get("stepup.{$rule}.two", 'off');

        return in_array($mode, ['log', 'enforce'], true) ? $mode : 'off';
    }

    // ------------------------------------------------------------ who may be the second person

    /** Is this person allowed to be the second one for this rule? Somebody else, who could do it themselves, and could answer the question. */
    public function eligible(User $person, string $rule, ?User $askedBy): bool
    {
        $permission = Catalogue::rule($rule)['approver'] ?? null;

        return $permission !== null && (! $askedBy || $person->getKey() !== $askedBy->getKey()) && $person->canLogin() && $this->auth->allows($person, $permission) && $this->stepUp->couldAnswer($person, $rule);
    }

    /** @return Collection<int, User> everybody who could be the second person for this rule, apart from the one who asked */
    public function approvers(string $rule, ?User $askedBy): Collection
    {
        $permission = Catalogue::rule($rule)['approver'] ?? null;
        if ($permission === null) {
            return collect();
        }

        return $this->staff->holding($permission)->filter(fn (User $u) => $this->eligible($u, $rule, $askedBy))->values();
    }

    // ------------------------------------------------------------ the first person has answered

    /** The first answer is in: ask the second person (on), or only note that one would have been asked (test). */
    public function firstApproved(AuthPendingAction $p, User $asker, ?Request $request): void
    {
        $mode = $this->mode($p->rule);
        if ($mode === 'log') {
            SecurityLog::record('stepup_council_would_ask', $asker, $request, ['rule' => $p->rule, 'pending' => $p->id]);

            return;
        }
        if ($mode !== 'enforce') {
            return;
        }
        $p->forceFill(['second_required' => true, 'expires_at' => now()->addMinutes(self::waitMinutes())])->save();
        $approvers = $this->approvers($p->rule, $asker);
        SecurityLog::record('council_asked', $asker, $request, ['rule' => $p->rule, 'pending' => $p->id, 'approvers' => $approvers->count()], SecurityLog::NOTICE);
        $this->alerts->councilAsked($approvers, $asker, Catalogue::rule($p->rule)['label']);
    }

    // ------------------------------------------------------------ the second person

    /** What is waiting for this person to look at. @return Collection<int, AuthPendingAction> */
    public function waitingFor(User $me): Collection
    {
        if (! self::ready()) {
            return collect();
        }

        return AuthPendingAction::where('second_required', true)->whereNotNull('approved_at')->whereNull('second_approved_at')->whereNull('second_rejected_at')->whereNull('cancelled_at')->whereNull('used_at')
            ->where('expires_at', '>', now())->where('user_id', '!=', $me->getKey())->orderBy('created_at')->get()
            ->filter(fn (AuthPendingAction $p) => $this->eligible($me, $p->rule, null))->values();
    }

    /** @return array<string, mixed> what the second person's screen shows */
    public function describeFor(AuthPendingAction $p, User $me): array
    {
        $r = Catalogue::rule($p->rule);
        $asker = User::find($p->user_id);

        return ['id' => $p->id, 'rule' => $p->rule, 'label' => $r['label'], 'class' => $r['class'], 'strength' => $p->strength_needed, 'reason_required' => $p->reason_required,
            'asked_by' => $asker ? trim($asker->name.' ('.$asker->email.')') : 'someone whose account could not be found', 'asked_at' => $p->created_at?->toIso8601String(), 'their_reason' => $p->reason,
            'approved_first_with' => $p->approved_with, 'facts' => $p->facts, 'expires_at' => $p->expires_at->toIso8601String(),
            'has_passkey' => $this->store->usableFor($me)->isNotEmpty(), 'can_use_password' => $this->stepUp->passwordAllowed($me, $p->strength_needed)];
    }

    /** What the person who asked is told while they wait. @return ?array{state: string, by: ?string, note: ?string, until: string} */
    public function state(AuthPendingAction $p): ?array
    {
        if (! $p->second_required) {
            return null;
        }
        $by = $p->second_user_id ? User::find($p->second_user_id)?->name : null;
        $state = $p->second_approved_at ? 'approved' : ($p->second_rejected_at ? 'declined' : ($p->cancelled_at ? 'cancelled' : ($p->expires_at->isPast() ? 'expired' : 'waiting')));

        return ['state' => $state, 'by' => $by, 'note' => $p->second_note, 'until' => $p->expires_at->toIso8601String()];
    }

    private function mine(User $me, string $id): AuthPendingAction
    {
        $p = AuthPendingAction::where('id', $id)->first();
        if (! $p || ! $p->awaitingSecond() || ! $this->eligible($me, $p->rule, User::find($p->user_id))) {
            throw new StepUpException('That request was not found, or it is not yours to answer. It may have been answered, given up or run out.', 'unknown', 404);
        }

        return $p;
    }

    /** The context the second person's device signs: this record, this exact action, and them. */
    public function contextFor(AuthPendingAction $p, User $me): string
    {
        return hash('sha256', "council|{$p->id}|{$p->params_hash}|{$p->user_id}|{$me->getKey()}");
    }

    /** @return array{id: string, options: array<string, mixed>} */
    public function options(User $me, string $id, ?Request $request = null): array
    {
        $p = $this->mine($me, $id);
        try {
            return $this->passkeys->proofOptions($me, $request, Challenges::STEP_UP, $this->contextFor($p, $me));
        } catch (PasskeyException $e) {
            throw new StepUpException($e->getMessage(), $e->reason, $e->httpStatus, $e);
        }
    }

    /**
     * The second person approves, with their passkey (or their password where the rule allows it). A serious action also needs their reason.
     *
     * @param array<string, mixed> $proof
     */
    public function approve(User $me, PersonalAccessToken $token, string $id, array $proof, ?string $note, ?Request $request = null): AuthPendingAction
    {
        $p = $this->mine($me, $id);
        $rule = Catalogue::rule($p->rule);
        $note = trim((string) $note);
        if ($p->reason_required && mb_strlen($note) < 3) {
            throw new StepUpException('Say why, in a few words. It is written in the log.', 'reason_needed');
        }
        $credentialId = null;
        if (isset($proof['credential'])) {
            $credentialId = $this->stepUp->verifyPasskey($me, $token, $p->rule, $rule, $this->contextFor($p, $me), (string) ($proof['challenge_id'] ?? ''), (array) $proof['credential'], $request);
            $with = 'passkey';
        } else {
            if (! $this->stepUp->passwordAllowed($me, $p->strength_needed)) {
                throw new StepUpException('This needs your passkey.', 'passkey_needed', 403);
            }
            if (! Hash::check((string) ($proof['current_password'] ?? ''), (string) $me->password)) {
                SecurityLog::record('stepup_failed', $me, $request, ['rule' => $p->rule, 'why' => 'wrong_password', 'as' => 'second'], SecurityLog::WARNING);
                throw new StepUpException('That password is not right.', 'wrong_password');
            }
            $with = 'password';
        }
        // the first person's retry has a few minutes from now; two answers at once: only one wins
        $won = AuthPendingAction::where('id', $p->id)->whereNull('second_approved_at')->whereNull('second_rejected_at')->whereNull('cancelled_at')->whereNull('used_at')->where('expires_at', '>', now())
            ->update(['second_user_id' => $me->getKey(), 'second_approved_at' => now(), 'second_with' => $with, 'second_credential_id' => $credentialId, 'second_note' => $note !== '' ? mb_substr($note, 0, 300) : null,
                'expires_at' => now()->addMinutes(StepUp::PENDING_MINUTES)]);
        if ($won !== 1) {
            throw new StepUpException('That request was already answered or has run out.', 'closed', 410);
        }
        SecurityLog::record('council_approved', $me, $request, ['rule' => $p->rule, 'pending' => $p->id, 'asked_by' => $p->user_id, 'with' => $with, 'reason' => $note !== '' ? mb_substr($note, 0, 300) : null], SecurityLog::NOTICE);
        $this->alerts->councilAnswered(User::find($p->user_id), $me, true, Catalogue::rule($p->rule)['label']);

        return $p->refresh();
    }

    /** The second person says no. */
    public function reject(User $me, string $id, ?string $note, ?Request $request = null): AuthPendingAction
    {
        $p = $this->mine($me, $id);
        $note = trim((string) $note);
        $won = AuthPendingAction::where('id', $p->id)->whereNull('second_approved_at')->whereNull('second_rejected_at')->whereNull('cancelled_at')->whereNull('used_at')->where('expires_at', '>', now())
            ->update(['second_user_id' => $me->getKey(), 'second_rejected_at' => now(), 'second_note' => $note !== '' ? mb_substr($note, 0, 300) : null]);
        if ($won !== 1) {
            throw new StepUpException('That request was already answered or has run out.', 'closed', 410);
        }
        SecurityLog::record('council_declined', $me, $request, ['rule' => $p->rule, 'pending' => $p->id, 'asked_by' => $p->user_id, 'reason' => $note !== '' ? mb_substr($note, 0, 300) : null], SecurityLog::NOTICE);
        $this->alerts->councilAnswered(User::find($p->user_id), $me, false, Catalogue::rule($p->rule)['label']);

        return $p->refresh();
    }
}

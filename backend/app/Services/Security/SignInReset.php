<?php

namespace App\Services\Security;

use App\Models\Security\AuthCredential;
use App\Models\Security\AuthRecoveryCode;
use App\Models\Security\AuthRecoveryRequest;
use App\Models\User;
use App\Services\Access\Authorizer;
use App\Services\Notify\Staff;
use App\Services\Security\StepUp\StepUpException;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * "Reset sign-in methods": an administrator takes away ALL of a person's passkeys and recovery codes and ends every sign-in of theirs, so they start again with their password. It is its own action and
 * deliberately NOT part of resetting a password (which leaves passkeys alone): a stolen administrator login could otherwise strip the passkeys off a victim and then sign in as them.
 *
 * It is a "serious" action (see StepUp\Catalogue `signin_reset`: a passkey, a reason, and a second person once the Council of Two is on). For somebody the passkey rule is for (staff who handle money or
 * access) it is also DELAYED by the waiting day: the person and the administrators are told, any of them can cancel (the person with "This was not me"), and only when the day is over does
 * `security:release-resets` carry it out. For everyone else it happens at once.
 */
final class SignInReset
{
    public function __construct(private Sessions $sessions, private SecurityAlerts $alerts, private Staff $staff, private PasskeyPolicy $policy, private Authorizer $auth)
    {
    }

    /** Is this somebody whose reset waits a day? Staff the passkey rule is for. */
    public function delayed(User $target): bool
    {
        return $this->auth->isStaff($target) && $this->policy->appliesTo($target) && (int) config('security.recovery.cooling_hours', 24) > 0;
    }

    /**
     * Start it. @return array{done: bool, request: ?AuthRecoveryRequest, release_at: ?\DateTimeInterface, summary: ?array{passkeys_removed: int, codes_revoked: int, sessions_ended: int}}
     */
    public function begin(User $target, User $by, string $reason, ?Request $http = null): array
    {
        $reason = mb_substr(trim($reason), 0, 300);
        if ($target->getKey() === $by->getKey()) {
            throw new StepUpException('You can not reset your own sign-in methods this way. Remove your passkeys under "My devices".', 'own_account', 422);
        }
        if (! $this->delayed($target)) {
            return ['done' => true, 'request' => null, 'release_at' => null, 'summary' => $this->execute($target, $by, $reason, null, $http)];
        }
        if (! AssistedRecovery::ready()) {
            throw new StepUpException('This person\'s sign-in methods wait a day before they are reset, and that is not set up yet: run database script 130 in Workbench.', 'not_ready', 409);
        }
        $pending = AuthRecoveryRequest::where('user_id', $target->getKey())->where('kind', 'reset')->get()->first(fn (AuthRecoveryRequest $r) => $r->alive());
        if ($pending) {
            throw new StepUpException('A reset of their sign-in methods is already waiting: it takes effect '.$pending->release_at?->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('j M, H:i').'.', 'already_pending', 409);
        }
        $release = now()->addHours((int) config('security.recovery.cooling_hours', 24));
        $r = AuthRecoveryRequest::create(['id' => Str::random(40), 'user_id' => $target->getKey(), 'kind' => 'reset', 'asked_by_id' => $by->getKey(), 'note' => $reason !== '' ? $reason : null, 'ip' => $http?->ip(),
            'user_agent' => $http?->userAgent() ? mb_substr($http->userAgent(), 0, 255) : null, 'needed' => 0, 'release_at' => $release, 'expires_at' => $release->copy()->addDays(7)]);
        SecurityLog::record('signin_reset_asked', $target, $http, ['request' => $r->id, 'by' => $by->getKey(), 'reason' => $reason, 'release_at' => $release->toIso8601String()], SecurityLog::WARNING);
        $others = $this->staff->holding('users.manage')->reject(fn (User $u) => in_array($u->getKey(), [$target->getKey()], true))->values();
        $this->alerts->resetAsked($target, $by, $release, $reason, $others, $http);

        return ['done' => false, 'request' => $r, 'release_at' => $release, 'summary' => null];
    }

    /**
     * Carry it out: every passkey, every recovery code, every sign-in.
     *
     * @return array{passkeys_removed: int, codes_revoked: int, sessions_ended: int}
     */
    public function execute(User $target, ?User $by, ?string $reason, ?AuthRecoveryRequest $request, ?Request $http = null): array
    {
        $removed = Sessions::strongTracked() ? AuthCredential::where('user_id', $target->getKey())->active()->update(['revoked_at' => now(), 'revoked_reason' => 'reset', 'revoked_by_id' => $by?->getKey()]) : 0;
        $codes = RecoveryCodes::ready() ? AuthRecoveryCode::where('user_id', $target->getKey())->good()->update(['revoked_at' => now()]) : 0;
        $ended = $this->sessions->revokeAll($target, null, 'reset');
        $request?->forceFill(['executed_at' => now()])->save();
        $summary = ['passkeys_removed' => $removed, 'codes_revoked' => $codes, 'sessions_ended' => $ended];
        SecurityLog::record('signin_methods_reset', $target, $http, $summary + ['by' => $by?->getKey(), 'reason' => $reason, 'waited' => $request !== null], SecurityLog::ALERT);
        $this->alerts->resetDone($target, $by, $summary, $http);
        if (AssistedRecovery::ready()) {
            app(AssistedRecovery::class)->cancelAllFor($target, 'reset', $http);   // a request for help getting back in is moot now: they start again with the password
        }

        return $summary;
    }

    /** The sweep that carries out the resets whose waiting day is over. @return int how many were carried out */
    public function executeDue(): int
    {
        if (! AssistedRecovery::ready()) {
            return 0;
        }
        $n = 0;
        foreach (AuthRecoveryRequest::where('kind', 'reset')->whereNull('executed_at')->where('release_at', '<=', now())->get() as $r) {
            if (! $r->alive()) {
                continue;   // cancelled, or run out
            }
            $target = User::find($r->user_id);
            if ($target) {
                $this->execute($target, User::find($r->asked_by_id), $r->note, $r);
                $n++;
            }
        }

        return $n;
    }
}

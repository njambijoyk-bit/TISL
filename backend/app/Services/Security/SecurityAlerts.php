<?php

namespace App\Services\Security;

use App\Models\CompanyProfile;
use App\Models\Security\AuthCredential;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Security\StepUp\Council;
use Illuminate\Http\Request;

/**
 * Telling people when the doors of their own account change: a passkey added or removed or switched off, recovery codes made or used.
 * By email and in the bell, with the "this was not me" button that ends every sign-in and takes away the passkeys and codes made in the last few days.
 * Never raises: a problem telling someone must not stop the change they were making.
 */
final class SecurityAlerts
{
    public function __construct(private Notifier $notifier)
    {
    }

    private function when(): string
    {
        return now()->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('j M Y, H:i');
    }

    private function where(?Request $request): string
    {
        $device = DeviceInfo::describe($request?->userAgent())['label'];

        return "Device: {$device}\nWhen: ".$this->when().($request?->ip() ? "\nAddress: {$request->ip()}" : '');
    }

    private function tell(User $who, string $type, string $title, string $message, bool $withButton = true): void
    {
        try {
            if (! config('security.alerts_email', true)) {
                return;
            }
            $options = ['subject' => $title] + ($withButton ? ['action_url' => '/secure-account?'.SecureAccountLink::query($who), 'action_text' => 'This was not me'] : []);
            $this->notifier->send($who, $type, $title, $message, $options);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private const NOT_ME = "\n\nIf this was not you, press the button: we sign everyone out of your account, take away the passkeys and recovery codes made in the last few days, and email you a link to choose a new password.";

    public function passkeyAdded(User $who, AuthCredential $c, ?Request $request): void
    {
        $how = match ($c->added_method) {
            'recovery' => ' It was added with a recovery code.',
            'approved' => ' It was approved with another of your passkeys.',
            default => '',
        };
        $company = CompanyProfile::name();
        $this->tell($who, 'passkey_added', 'A passkey was added to your account',
            "A passkey named \"{$c->name}\" can now be used to sign in to your {$company} account.{$how}\n\n".$this->where($request).self::NOT_ME);
    }

    public function passkeyRemoved(User $who, string $name, string $reason, int $sessionsEnded, ?Request $request): void
    {
        $why = match ($reason) {
            'lost' => ' It was reported lost, so every other sign-in was ended too.',
            'replaced' => ' It was replaced by a new one.',
            default => '',
        };
        $this->tell($who, 'passkey_removed', 'A passkey was removed from your account',
            "The passkey \"{$name}\" can no longer be used to sign in.{$why}".($sessionsEnded ? " {$sessionsEnded} sign-in".($sessionsEnded === 1 ? '' : 's').' that used it ended.' : '')."\n\n".$this->where($request).self::NOT_ME);
    }

    public function passkeySwitchedOff(User $who, AuthCredential $c, ?Request $request): void
    {
        $this->tell($who, 'passkey_clone', 'A passkey on your account was switched off',
            "The passkey \"{$c->name}\" was used in a way that only happens when a key has been copied, so it was switched off. Nobody can sign in with it now.\n\n"
            ."Sign in another way, remove it under \"My devices\" and add the device again if it is really yours.\n\n".$this->where($request).self::NOT_ME);
    }

    public function recoveryCodesMade(User $who, ?Request $request): void
    {
        $this->tell($who, 'recovery_codes_made', 'New recovery codes were made for your account',
            "A new set of recovery codes was made. Any earlier set no longer works.\n\n".$this->where($request).self::NOT_ME);
    }

    /** @param string[] $signals */
    public function unusualSignIn(User $who, array $signals, bool $heldBack, ?Request $request): void
    {
        $why = implode("\n", array_map(fn ($s) => '- '.ucfirst(RiskSignals::words($s)), $signals));
        $this->tell($who, 'unusual_sign_in', 'An unusual sign-in to your account',
            "Someone signed in to your account in a way that does not look like you:\n{$why}\n\n"
            .($heldBack ? 'We held that sign-in: it can do nothing until the person confirms with your passkey.' : 'It went through, because the password was right.')
            ."\n\n".$this->where($request).self::NOT_ME);
    }

    public function recoveryCodeUsed(User $who, int $remaining, ?Request $request): void
    {
        $this->tell($who, 'recovery_code_used', 'A recovery code was used on your account',
            "A recovery code was used, which lets a new passkey be added to your account for 15 minutes. You have {$remaining} left.\n\n".$this->where($request).self::NOT_ME);
    }

    /**
     * The server's break-glass command was used on this account: tell the person, and everyone who can change the security rules (so it is never a secret between one person and the server).
     *
     * @param array{sessions_ended: int, passkeys_removed: int, codes_made: int, temporary_password: bool} $done
     * @param iterable<int, User> $others
     */
    public function breakGlassUsed(User $who, array $done, iterable $others): void
    {
        $company = CompanyProfile::name();
        $what = "- every sign-in of the account was ended ({$done['sessions_ended']})\n"
            .($done['passkeys_removed'] ? "- {$done['passkeys_removed']} passkey".($done['passkeys_removed'] === 1 ? ' was' : 's were')." taken away\n" : '')
            .($done['codes_made'] ? "- a new set of recovery codes was made\n" : '')
            .($done['temporary_password'] ? "- a temporary password was set, to be changed at the next sign-in\n" : '');
        $this->tell($who, 'break_glass_used', 'The emergency recovery was used on your account',
            "Someone with access to the {$company} server used the emergency recovery command on your account ({$who->email}) at ".$this->when().":\n{$what}\n"
            .'If you asked for this, you will have been given what you need to sign in again: add a new passkey as soon as you do. '.self::NOT_ME);
        foreach ($others as $other) {
            if ($other->getKey() === $who->getKey()) {
                continue;
            }
            $this->tell($other, 'break_glass_used_other', 'The emergency recovery was used on an account',
                "The emergency recovery command was run on the server for {$who->name} ({$who->email}) at ".$this->when().":\n{$what}\nIf nobody told you this was going to happen, treat it as serious: check who has access to the server.", false);
        }
    }

    /** Workflow messages rather than warnings, so they are sent whatever the alerts switch says: a second person is waiting to be asked. */
    private function say(User $to, string $type, string $title, string $message, array $options = []): void
    {
        try {
            $this->notifier->send($to, $type, $title, $message, ['subject' => $title] + $options);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** The Approvals page, opened on one request when we know which. */
    private function approvals(?string $id): string
    {
        return '/admin/security/approvals'.($id ? '?open='.rawurlencode($id) : '');
    }

    /** The Council of Two: somebody has asked for something serious and needs a second person. @param iterable<int, User> $approvers */
    public function councilAsked(iterable $approvers, User $asker, string $what, ?string $id = null): void
    {
        foreach ($approvers as $approver) {
            $this->say($approver, 'council_request', 'A second person is needed to approve something',
                "{$asker->name} has asked to: {$what}.\n\nIt only goes through if a second person looks at the details and approves. Open Approvals to see what exactly is being asked and to approve or decline. It runs out in ".Council::waitMinutes().' minutes.',
                ['action_url' => $this->approvals($id), 'action_text' => 'Look at it', 'short' => 'A second person is needed to approve something. Open Approvals to see what it is and to answer:', 'link_in_whatsapp' => true]);
        }
    }

    /** The second person has answered: tell the first. */
    public function councilAnswered(?User $asker, User $by, bool $approved, string $what): void
    {
        if (! $asker) {
            return;
        }
        $this->say($asker, 'council_answer', $approved ? 'A second person approved' : 'A second person declined',
            $approved ? "{$by->name} approved: {$what}. It goes through now if you still have the page open." : "{$by->name} declined: {$what}. Nothing was done.");
    }

    // ------------------------------------------------------------ assisted recovery

    private function names(iterable $users): string
    {
        $names = [];
        foreach ($users as $u) {
            $names[] = $u->name;
        }

        return $names ? implode(' and ', $names) : 'nobody yet';
    }

    private function at(\DateTimeInterface $when): string
    {
        return \Illuminate\Support\Carbon::instance($when)->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('j M Y, H:i');
    }

    /** Someone asked for help getting back in: tell the person (with the way to stop it), the administrators who can help, and everyone else who manages security. @param iterable<int, User> $approvers @param iterable<int, User> $managers */
    public function recoveryAsked(User $who, iterable $approvers, iterable $managers, ?Request $request, ?string $note, ?string $id = null): void
    {
        $company = CompanyProfile::name();
        $said = $note ? "\nThey said: \"{$note}\"" : '';
        $this->tell($who, 'recovery_asked', 'Help getting back into your account was asked for',
            "Someone asked two administrators to help get back into your {$company} account ({$who->email}).{$said}\n\n".$this->where($request)
            ."\n\nIf this was you, two administrators will check with you another way and approve, then there is a waiting day before you can start it. If this was NOT you, press the button now: it stops the request.".self::NOT_ME);
        foreach ($approvers as $a) {
            $this->say($a, 'recovery_request', 'Someone needs help getting back into their account',
                "{$who->name} ({$who->email}) says they can no longer use their passkey device or their recovery codes and asked for help getting back in.{$said}\n\nBefore you approve, check it is really them another way: phone them on a number you already have, or ask in person. Open Approvals to look at it and to approve or decline.",
                ['action_url' => $this->approvals($id), 'action_text' => 'Look at it', 'short' => 'Someone needs help getting back into their account. Check it is really them another way before you approve. Open Approvals:', 'link_in_whatsapp' => true]);
        }
        foreach ($managers as $m) {
            $this->say($m, 'recovery_asked_other', 'Someone asked for help getting back into their account', "{$who->name} ({$who->email}) asked two administrators to help them back in.{$said}\n\nNothing is needed from you unless something looks wrong.");
        }
    }

    /** The last approval is in: the waiting day starts. @param iterable<int, User> $approvedBy @param iterable<int, User> $approvers @param iterable<int, User> $managers */
    public function recoveryReleased(User $who, \DateTimeInterface $release, iterable $approvedBy, iterable $approvers, iterable $managers, ?Request $request, ?string $id = null): void
    {
        $by = $this->names($approvedBy);
        $this->tell($who, 'recovery_approved', 'Your recovery was approved',
            "{$by} approved getting you back into your account. You can start it from {$this->at($release)} on the sign-in screen: until then nothing changes. The wait is there so that, if this was not you, you have time to stop it.\n\n".$this->where($request).self::NOT_ME);
        $told = [];
        foreach ([...$approvers, ...$managers] as $u) {
            if (isset($told[$u->getKey()]) || $u->getKey() === $who->getKey()) {
                continue;
            }
            $told[$u->getKey()] = true;
            $this->say($u, 'recovery_approved_other', 'A recovery was approved',
                "{$by} approved getting {$who->name} ({$who->email}) back into their account. They can start it from {$this->at($release)}. Any administrator who could approve it may still cancel it under Approvals until then.",
                ['action_url' => $this->approvals($id), 'action_text' => 'See it']);
        }
    }

    /** A request ended without being used. @param 'declined'|'cancelled' $how @param iterable<int, User> $approvedBy */
    public function recoveryEnded(User $who, string $how, ?string $byName, iterable $approvedBy, ?Request $request): void
    {
        $this->tell($who, 'recovery_ended', $how === 'declined' ? 'Your request for help was declined' : 'The request for help getting into your account was cancelled',
            ($how === 'declined' ? 'An administrator'.($byName ? " ({$byName})" : '').' declined the request for help getting back into your account. Nothing was changed.' : 'The request for help getting back into your account was cancelled'.($byName ? " by {$byName}" : '').'. Nothing was changed.')
            ."\n\n".$this->where($request), false);
    }

    /** The person started the recovery. @param iterable<int, User> $approvedBy @param iterable<int, User> $managers */
    public function recoveryStarted(User $who, iterable $approvedBy, iterable $managers, ?Request $request): void
    {
        $this->tell($who, 'recovery_started', 'Recovery started on your account',
            "Recovery was started on your account. Every other sign-in of yours was ended, and the sign-in that started it may add a new passkey for the next 15 minutes.\n\n".$this->where($request).self::NOT_ME);
        foreach ($managers as $m) {
            $this->say($m, 'recovery_started_other', 'A recovery was started', "{$who->name} ({$who->email}) started the recovery that was approved. They can add a new passkey for 15 minutes.");
        }
    }

    /** An administrator asked to reset a person's sign-in methods and it waits a day. @param iterable<int, User> $admins */
    public function resetAsked(User $who, User $by, \DateTimeInterface $release, string $reason, iterable $admins, ?Request $request, ?string $id = null): void
    {
        $said = $reason !== '' ? "\nTheir reason: \"{$reason}\"" : '';
        $this->tell($who, 'signin_reset_asked', 'An administrator asked to reset your sign-in methods',
            "{$by->name} asked to take away all your passkeys and recovery codes and sign you out everywhere.{$said}\n\nNothing changes until {$this->at($release)}. If you were not expecting this, press the button now: it stops it. If you were, you can sign in with your password after that and add a new passkey.\n\n".$this->where($request).self::NOT_ME);
        foreach ($admins as $a) {
            if ($a->getKey() === $by->getKey()) {
                continue;
            }
            $this->say($a, 'signin_reset_asked_other', 'A reset of sign-in methods is waiting',
                "{$by->name} asked to reset the sign-in methods of {$who->name} ({$who->email}).{$said}\n\nIt happens at {$this->at($release)}. Any administrator who could do it may cancel it until then under Approvals.", ['action_url' => $this->approvals($id), 'action_text' => 'See it']);
        }
    }

    /** The reset has been carried out. @param array{passkeys_removed: int, codes_revoked: int, sessions_ended: int} $done */
    public function resetDone(User $who, ?User $by, array $done, ?Request $request): void
    {
        $what = ($done['passkeys_removed'] ? "- {$done['passkeys_removed']} passkey".($done['passkeys_removed'] === 1 ? ' was' : 's were')." taken away\n" : '').($done['codes_revoked'] ? "- your recovery codes no longer work\n" : '')."- every sign-in of yours was ended ({$done['sessions_ended']})\n";
        $this->tell($who, 'signin_methods_reset', 'Your sign-in methods were reset',
            ($by ? "{$by->name} reset" : 'Your sign-in methods were reset').": \n{$what}\nSign in with your password and add a new passkey. Your password was not changed.\n\n".$this->where($request).self::NOT_ME);
    }
}

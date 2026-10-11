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

    /** The Council of Two: somebody has asked for something serious and needs a second person. @param iterable<int, User> $approvers */
    public function councilAsked(iterable $approvers, User $asker, string $what): void
    {
        foreach ($approvers as $approver) {
            $this->say($approver, 'council_request', 'A second person is needed to approve something',
                "{$asker->name} has asked to: {$what}.\n\nIt only goes through if a second person looks at the details and approves. Open Approvals to see what exactly is being asked and to approve or decline. It runs out in ".Council::waitMinutes().' minutes.',
                ['action_url' => '/admin/security/approvals', 'action_text' => 'Look at it']);
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
}

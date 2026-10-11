<?php

namespace App\Services\Security;

use App\Models\CompanyProfile;
use App\Models\Security\AuthCredential;
use App\Models\User;
use App\Services\Notify\Notifier;
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
}

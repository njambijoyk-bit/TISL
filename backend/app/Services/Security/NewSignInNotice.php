<?php

namespace App\Services\Security;

use App\Models\Applicant;
use App\Models\CompanyProfile;
use App\Services\Notify\Notifier;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/**
 * "A new browser signed in to your account": told to the person by email (and the bell), with the button that ends every session if it was not them.
 * Never raises: a problem telling someone must not stop them signing in.
 */
final class NewSignInNotice
{
    /** Ways of signing in where the person has just proved who they are in a way that already tells them: no email. */
    public const QUIET_METHODS = ['register', 'reset'];

    public function __construct(private Notifier $notifier)
    {
    }

    public function send(Model $who, ?Request $request, string $method): void
    {
        try {
            if (in_array($method, self::QUIET_METHODS, true) || ! config('security.new_sign_in_email', true)) {
                return;
            }
            $device = DeviceInfo::describe($request?->userAgent())['label'];
            $at = now()->timezone((string) config('app.timezone', 'Africa/Nairobi'))->format('j M Y, H:i');
            $company = CompanyProfile::name();
            $message = "We noticed a sign-in to your {$company} account from a browser we have not seen before.\n\n"
                ."Device: {$device}\nWhen: {$at}".($request?->ip() ? "\nAddress: {$request->ip()}" : '')."\n\n"
                .'If this was you, there is nothing to do. If it was not, press the button: we sign everyone out of your account and email you a link to choose a new password. '
                .'You can also see and end every sign-in under your profile, "Where you are signed in".';
            $link = '/secure-account?'.SecureAccountLink::query($who);
            $options = ['action_url' => $link, 'action_text' => 'This was not me', 'subject' => 'A new sign-in to your account'];
            if ($who instanceof Applicant) {   // a job applicant has no bell: email only
                $this->notifier->sendToContact(['name' => trim($who->first_name.' '.$who->last_name), 'email' => $who->email, 'phone' => null], 'new_sign_in', 'New sign-in to your account', $message, $options);

                return;
            }
            $this->notifier->send($who, 'new_sign_in', 'New sign-in to your account', $message, $options);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Security\EmailSignInLink;
use App\Services\Security\SecurityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/** Phase 4.1: sign in with a one-time link emailed to a customer. See Services/Security/EmailSignInLink. */
class EmailLinkController extends Controller
{
    private const SAME_ANSWER = 'If that email belongs to a customer account, we have sent a sign-in link to it. It works once, in this browser, for the next few minutes.';

    /** Ask for a link. The answer is always the same, and the browser always gets its cookie, so nothing tells a stranger whether the email is ours. */
    public function ask(Request $request, EmailSignInLink $links): JsonResponse
    {
        $request->validate(['email' => 'required|email|max:255']);
        $binder = Str::random(48);
        try {
            $links->ask(mb_strtolower(trim((string) $request->input('email'))), $binder, $request);
        } catch (\Throwable $e) {
            report($e);   // the same answer either way
        }

        return response()->json(['message' => self::SAME_ANSWER, 'minutes' => EmailSignInLink::minutes()])->withCookie(EmailSignInLink::binderCookie($request, $binder));
    }

    private function binder(Request $request): ?string
    {
        $v = $request->cookies->get(EmailSignInLink::cookieName($request));

        return is_string($v) && $v !== '' ? $v : null;
    }

    private function refuse(string|null $why): JsonResponse
    {
        return response()->json($why === 'other_browser'
            ? ['message' => 'This link must be opened in the same browser you asked for it from. Go back to that browser, or ask for a new link.', 'reason' => 'other_browser']
            : ['message' => 'This link has expired or was already used. Ask for a new one.', 'reason' => 'expired'], 422);
    }

    /** The page opened: is this link good here? Nothing is used up, and nothing about the person is shown until the browser is proved to be the one that asked. */
    public function check(Request $request, EmailSignInLink $links): JsonResponse
    {
        $request->validate(['k' => 'required|string|max:100']);
        $link = $links->find((string) $request->input('k'), $this->binder($request));
        if (! $link instanceof \App\Models\Security\AuthEmailLink) {
            return $this->refuse($link);
        }

        return response()->json(['ok' => true, 'name' => trim((string) (\App\Models\User::find($link->user_id)?->customer?->first_name ?: \App\Models\User::find($link->user_id)?->name))]);
    }

    /** The button was pressed: sign in. */
    public function confirm(Request $request, EmailSignInLink $links): JsonResponse
    {
        $request->validate(['k' => 'required|string|max:100']);
        $link = $links->find((string) $request->input('k'), $this->binder($request));
        if (! $link instanceof \App\Models\Security\AuthEmailLink) {
            SecurityLog::record('sign_in_failed', null, $request, ['reason' => 'email_link_'.($link ?? 'expired'), 'door' => 'email_link'], SecurityLog::NOTICE);

            return $this->refuse($link);
        }
        $auth = app(AuthController::class);
        // the policies still have to be accepted; a stop here leaves the link usable, so the person can accept and press the button again
        $user = \App\Models\User::find($link->user_id);
        if ($user && ($stop = $auth->policyGate($request, $user))) {
            return $stop;
        }
        $user = $links->use($link);
        if (! $user) {
            return $this->refuse(null);
        }
        $answer = $auth->finishSignIn($request, $user, 'email_link');

        return $answer->withCookie(EmailSignInLink::forgetCookie($request));
    }
}

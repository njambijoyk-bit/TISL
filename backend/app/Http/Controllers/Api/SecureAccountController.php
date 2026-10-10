<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Applicant;
use App\Services\Security\SecureAccountLink;
use App\Services\Security\SecurityLog;
use App\Services\Security\Sessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;

/** "This was not me": the button in the new-sign-in email. Public (the link is the proof); signs everyone out of that one account and emails a link to choose a new password. */
class SecureAccountController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $who = SecureAccountLink::verify($request->only(['t', 'i', 'e', 'k']));
        if (! $who) {
            return response()->json(['message' => 'This link has expired, or it was already used, or the password has changed since it was sent. If you think someone else is in your account, use "Forgot password" on the sign-in page.'], 422);
        }
        $ended = app(Sessions::class)->revokeAll($who, null, 'not_me');
        SecurityLog::record('secure_account', $who, $request, ['sessions_ended' => $ended], SecurityLog::ALERT);
        try {
            $who instanceof Applicant ? Password::broker('applicants')->sendResetLink(['email' => $who->email]) : Password::sendResetLink(['email' => $who->email]);
        } catch (\Throwable $e) {
            report($e);   // they are signed out either way; "Forgot password" still works
        }

        return response()->json(['message' => 'Everyone has been signed out of your account, and we have emailed you a link to choose a new password.', 'ended' => $ended]);
    }
}

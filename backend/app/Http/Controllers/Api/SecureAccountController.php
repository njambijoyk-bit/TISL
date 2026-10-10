<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Applicant;
use App\Models\Security\AuthCredential;
use App\Models\Security\AuthRecoveryCode;
use App\Models\User;
use App\Services\Security\SecureAccountLink;
use App\Services\Security\SecurityLog;
use App\Services\Security\Sessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;

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
        // Whoever was in may have added a passkey of their own, or made recovery codes, to get back in later: take away what was made since the link was sent
        $removed = 0;
        if ($who instanceof User && Schema::hasTable('auth_credentials')) {
            $removed = AuthCredential::where('user_id', $who->id)->active()->where('created_at', '>=', now()->subDays(SecureAccountLink::DAYS))
                ->update(['revoked_at' => now(), 'revoked_reason' => 'not_me']);
            if (Schema::hasTable('auth_recovery_codes')) {
                AuthRecoveryCode::where('user_id', $who->id)->good()->update(['revoked_at' => now()]);
            }
        }
        SecurityLog::record('secure_account', $who, $request, ['sessions_ended' => $ended, 'passkeys_removed' => $removed], SecurityLog::ALERT);
        try {
            $who instanceof Applicant ? Password::broker('applicants')->sendResetLink(['email' => $who->email]) : Password::sendResetLink(['email' => $who->email]);
        } catch (\Throwable $e) {
            report($e);   // they are signed out either way; "Forgot password" still works
        }

        return response()->json(['message' => 'Everyone has been signed out of your account'.($removed ? ', the passkeys added in the last few days have been taken away, and recovery codes made before now no longer work' : '').', and we have emailed you a link to choose a new password.', 'ended' => $ended, 'passkeys_removed' => $removed]);
    }
}

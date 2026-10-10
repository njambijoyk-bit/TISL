<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Security\RecoveryCodes;
use App\Services\Security\SecurityAlerts;
use App\Services\Security\SecurityLog;
use App\Services\Security\Passkeys\CredentialStore;
use App\Services\Security\Sessions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Recovery codes: make a set (shown once), see how many are left, use one.
 * Using one does not sign anyone in. A session that already knows the password may add a new passkey for a quarter of an hour afterwards - the way back for a lost phone - and nothing else.
 */
class RecoveryCodeController extends Controller
{
    public function __construct(private RecoveryCodes $codes, private Sessions $sessions, private CredentialStore $store)
    {
    }

    private function token(Request $request): ?PersonalAccessToken
    {
        $t = $request->user()->currentAccessToken();

        return $t instanceof PersonalAccessToken ? $t : null;
    }

    private function notReady(): ?JsonResponse
    {
        return RecoveryCodes::ready() ? null : response()->json(['ready' => false, 'message' => 'Recovery codes are not set up yet: run database script 126 in Workbench.'], 409);
    }

    /** GET /auth/recovery-codes: how many are left (never the codes). */
    public function status(Request $request): JsonResponse
    {
        if (! RecoveryCodes::ready()) {
            return response()->json(['ready' => false, 'remaining' => 0, 'made_at' => null, 'total' => RecoveryCodes::COUNT]);
        }

        return response()->json(['ready' => true, 'total' => RecoveryCodes::COUNT] + $this->codes->status($request->user()));
    }

    /**
     * POST /auth/recovery-codes: a new set of ten (ends the old set). The codes are in this answer and nowhere else.
     * Asked of someone with a passkey: a passkey used a few minutes ago. Otherwise: the password again. (A stolen password session can not make codes for itself.)
     */
    public function generate(Request $request): JsonResponse
    {
        if ($r = $this->notReady()) {
            return $r;
        }
        $user = $request->user();
        if ($this->store->usableFor($user)->isNotEmpty()) {
            if (! $this->sessions->freshStrong($this->token($request), 10)) {
                return response()->json(['message' => 'Confirm it is really you with one of your passkeys first.', 'reason' => 'proof_needed', 'requires' => 'passkey'], 403);
            }
        } elseif (! $request->filled('current_password') || ! Hash::check((string) $request->input('current_password'), (string) $user->password)) {
            return response()->json(['message' => 'Type your password to make recovery codes.', 'reason' => 'password_needed'], 403);
        }

        $codes = $this->codes->generate($user);
        SecurityLog::record('recovery_codes_made', $user, $request, ['count' => count($codes)], SecurityLog::NOTICE);
        app(SecurityAlerts::class)->recoveryCodesMade($user, $request);

        return response()->json(['message' => 'Keep these somewhere safe, away from your phone. Each works once. They will not be shown again.', 'codes' => $codes, 'total' => RecoveryCodes::COUNT] + $this->codes->status($user), 201);
    }

    /** POST /auth/recovery-codes/use: a lost device. For the next 15 minutes this session may add a new passkey. */
    public function use(Request $request): JsonResponse
    {
        if ($r = $this->notReady()) {
            return $r;
        }
        $request->validate(['code' => 'required|string|max:40']);
        $user = $request->user();
        if (! $this->codes->consume($user, (string) $request->input('code'), $request)) {
            SecurityLog::record('recovery_code_failed', $user, $request, [], SecurityLog::WARNING);

            return response()->json(['message' => 'That code did not work. Check it and try again - each code works once.'], 422);
        }
        $this->sessions->markRecovered($this->token($request));
        $remaining = $this->codes->status($user)['remaining'];
        SecurityLog::record('recovery_code_used', $user, $request, ['remaining' => $remaining], SecurityLog::ALERT);
        app(SecurityAlerts::class)->recoveryCodeUsed($user, $remaining, $request);

        return response()->json(['message' => 'Code accepted. You can add a new passkey now.', 'minutes' => Sessions::RECOVERY_MINUTES] + $this->codes->status($user));
    }
}

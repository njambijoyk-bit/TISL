<?php

namespace App\Services\Security;

use App\Models\Security\AuthSession;
use App\Models\User;
use App\Services\Security\Passkeys\CredentialStore;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * What is done with a sign-in that looks unusual (see RiskSignals): written down in "test" mode, and in "on" mode either the person is told, or - when they have a passkey and it looks quite unusual -
 * the sign-in is held until they confirm with it (a session that can only do that, exactly as the passkey rule holds one back). A passkey sign-in is never held: it is already the strongest proof.
 * Never raises: a problem here must not stop anyone signing in.
 */
final class RiskGate
{
    public function __construct(private RiskSignals $risk, private CredentialStore $store, private SecurityAlerts $alerts)
    {
    }

    /** Judge a sign-in about to be made, by what came before it (call this BEFORE the new session is written). Null when nothing is to be done: the rule is off, or a passkey was used. */
    public function judge(User $user, ?Request $request, string $method): ?array
    {
        try {
            if ($method === 'passkey' || $this->risk->mode() === 'off') {
                return null;
            }

            return $this->risk->assess($user, $request);
        } catch (\Throwable $e) {
            report($e);

            return null;
        }
    }

    /** What to do about it, once the session exists. @param ?array{signals: string[], score: int, action: string} $assessment */
    public function act(?array $assessment, User $user, ?Request $request, string $plainToken, string $method): void
    {
        try {
            if ($assessment === null || $assessment['action'] === 'allow') {
                return;
            }
            $mode = $this->risk->mode();
            $token = PersonalAccessToken::findToken($plainToken);
            $hold = $assessment['action'] === 'stronger' && $this->store->usableFor($user)->isNotEmpty();
            $detail = ['signals' => $assessment['signals'], 'score' => $assessment['score'], 'method' => $method];
            if ($mode === 'log') {
                SecurityLog::record('risk_would_ask', $user, $request, $detail + ['would' => $hold ? 'ask_for_passkey' : 'tell_the_person']);

                return;
            }
            if ($mode !== 'enforce') {
                return;
            }
            if ($hold && $token && Sessions::strongTracked()) {
                AuthSession::where('token_id', $token->getKey())->update(['restricted' => true]);
                SecurityLog::record('risk_stronger', $user, $request, $detail, SecurityLog::NOTICE);
                $this->alerts->unusualSignIn($user, $assessment['signals'], true, $request);

                return;
            }
            SecurityLog::record('risk_notice', $user, $request, $detail);
            if (array_diff($assessment['signals'], ['new_device'])) {   // a new browser alone already has its own email
                $this->alerts->unusualSignIn($user, $assessment['signals'], false, $request);
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }
}

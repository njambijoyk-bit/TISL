<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Security\PasskeyPolicy;
use App\Services\Security\RiskSignals;
use App\Services\Security\SecurityLog;
use App\Services\Security\Sessions;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * The passkey rule, for every signed-in request (so it covers every way of having signed in: password, password reset, Google, a passkey on another device...).
 *
 * A person the rule is for who has not yet done what it asks gets a restricted session: they may see who they are, sign out, manage their sessions and add or use a passkey,
 * and every other door answers 403 with `restricted.reason`, which the website turns into the "one more step" screen. In "log" mode nobody is stopped; the first request of a session that WOULD have been held is written to the security log.
 */
class PolicyGate
{
    /** What a restricted session can still reach: the way out of being restricted. */
    private const OPEN = ['api/auth/me', 'api/auth/logout', 'api/auth/passkeys', 'api/auth/passkeys/*', 'api/auth/sessions', 'api/auth/sessions/*', 'api/auth/recovery-codes', 'api/auth/recovery-codes/*'];

    public function handle(Request $request, Closure $next): Response
    {
        $policy = app(PasskeyPolicy::class);
        if ($policy->mode() === 'off' && app(RiskSignals::class)->mode() !== 'enforce') {
            return $next($request);
        }
        $user = Auth::guard('sanctum')->user();   // the route's own check comes later: this only asks who it is, and says nothing about a missing or ended sign-in
        if (! $user instanceof User) {
            return $next($request);
        }
        $token = $user->currentAccessToken();
        $report = $policy->report($user, $token instanceof PersonalAccessToken ? app(Sessions::class)->recordOf($token) : null);
        $gate = $report['would_gate'];
        if ($gate === null) {
            return $next($request);
        }

        $first = fn () => $token instanceof PersonalAccessToken && Cache::add('passkey-policy:'.$report['mode'].':'.$token->id, 1, now()->addHours(12));   // one line per session, not per request
        if ($report['mode'] === 'log') {
            if ($first()) {
                SecurityLog::record('passkey_policy_would_restrict', $user, $request, ['gate' => $gate]);
            }

            return $next($request);
        }
        if ($request->is(...self::OPEN)) {
            return $next($request);
        }
        if ($first()) {
            SecurityLog::record('passkey_policy_restricted', $user, $request, ['gate' => $gate], SecurityLog::NOTICE);
        }

        return response()->json(['message' => $this->words($gate), 'restricted' => ['reason' => $gate] + ['needs' => $report['needs'], 'passkeys' => $report['passkeys']]], 403);
    }

    private function words(string $gate): string
    {
        return match ($gate) {
            'risk_check' => 'This sign-in looks unusual. Confirm it is really you with your passkey to carry on.',
            'passkey_missing' => 'Add a passkey to your account to carry on. Your role needs one.',
            'second_missing' => 'Add another passkey, on a second device, to carry on. Your role needs two.',
            'device_bound_missing' => 'Your role needs two passkeys that stay on their device (a security key, or this computer\'s own sign-in), not ones copied to a cloud account. Add one to carry on.',
            default => 'Confirm it is you with your passkey to carry on.',
        };
    }
}

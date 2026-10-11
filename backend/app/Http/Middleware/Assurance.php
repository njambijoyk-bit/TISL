<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\Security\StepUp\StepUp;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * `assurance:<rule>` on a route: this action is sensitive (see StepUp\Catalogue). List it AFTER the route's own permission check, so nobody is asked to prove who they are for something they may not do.
 * Off (the default): nothing happens. Test: the question is only written to the log. On: unless the person has just answered for this exact action, the answer is 403 with `step_up` (the question's number and the
 * facts to show), and the action goes through when it is tried again with that number in `X-Step-Up`.
 *
 * When only SOME requests to a door are sensitive (changing the role of a staff account, not of a customer; changing bank details, not the phone number), the controller asks the same question itself,
 * after its own authorization: `if ($held = Assurance::check($request, 'staff_account', fn () => $user->isStaff())) return $held;`
 */
class Assurance
{
    public function handle(Request $request, Closure $next, string $rule): Response
    {
        return self::check($request, $rule) ?? $next($request);
    }

    /**
     * Is this action held back until the person confirms it? Null: carry on. Otherwise the answer to send.
     *
     * @param ?callable $applies asked only when the rule is switched on: false means this particular request is not a sensitive one
     */
    public static function check(Request $request, string $rule, ?callable $applies = null): ?Response
    {
        $stepUp = app(StepUp::class);
        $mode = $stepUp->mode($rule);
        if ($mode === 'off') {
            return null;
        }
        $user = $request->user();
        if (! $user instanceof User) {
            return null;   // the route's own sign-in check has the say
        }
        if ($applies !== null && ! $applies()) {
            return null;
        }
        $token = $user->currentAccessToken();
        $token = $token instanceof PersonalAccessToken && $token->getKey() ? $token : null;   // a real sign-in, with a number to tie the question to

        if ($mode === 'log') {
            $stepUp->noteWouldAsk($request, $user, $token, $rule);

            return null;
        }
        if ($stepUp->covered($request, $user, $token, $rule)) {
            return null;
        }
        if (! $token) {
            return response()->json(['message' => 'Please sign in again to do this.'], 403);   // no sign-in to tie the question to: never let it through
        }

        return response()->json(['message' => 'One more step: confirm it is really you.', 'step_up' => $stepUp->describe($stepUp->ask($request, $user, $token, $rule), $user)], 403);
    }
}

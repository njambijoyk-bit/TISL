<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Security\SealPhrase;
use App\Services\Security\SecurityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/** The seal phrase: asked for by the sign-in page (public, tells nothing to a stranger), and chosen by the person in their profile. */
class SealController extends Controller
{
    public function __construct(private SealPhrase $seal)
    {
    }

    /** POST /auth/seal {email}: the phrase, or null. The answer has the same shape whether or not the email has an account, a phrase, or this browser is theirs. */
    public function show(Request $request): JsonResponse
    {
        $email = $request->input('email');

        return response()->json(['phrase' => $this->seal->showTo($request, is_string($email) ? $email : '')]);
    }

    /** GET /auth/seal: my own phrase. */
    public function mine(Request $request): JsonResponse
    {
        return response()->json(['ready' => SealPhrase::ready(), 'phrase' => $this->seal->get($request->user())]);
    }

    /** PUT /auth/seal: choose a phrase (with the password, so a borrowed session can not change what the person will look for). */
    public function save(Request $request): JsonResponse
    {
        if (! SealPhrase::ready()) {
            return response()->json(['message' => 'The seal phrase is not set up yet: run database script 127 in Workbench.'], 409);
        }
        $data = $request->validate(['phrase' => ['required', 'string', 'min:3', 'max:40', 'regex:/^[\pL\pN][\pL\pN \'’\-.,!?]*$/u'], 'current_password' => 'required|string']);
        $user = $request->user();
        if (! Hash::check($data['current_password'], (string) $user->password)) {
            return response()->json(['message' => 'That password is not right.'], 422);
        }
        $this->seal->set($user, trim(preg_replace('/\s+/u', ' ', $data['phrase'])));
        SecurityLog::record('seal_phrase_changed', $user, $request);

        return response()->json(['message' => 'Saved. Your phrase is shown on the sign-in page, on browsers you have signed in from before.', 'phrase' => $this->seal->get($user)]);
    }

    /** DELETE /auth/seal */
    public function clear(Request $request): JsonResponse
    {
        if (SealPhrase::ready()) {
            $this->seal->clear($request->user());
            SecurityLog::record('seal_phrase_changed', $request->user(), $request, ['cleared' => true]);
        }

        return response()->json(['message' => 'Removed.', 'phrase' => null]);
    }
}

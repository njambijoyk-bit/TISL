<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Notify\ReminderPrefs;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The "stop these reminders" link at the bottom of a cart reminder or price alert: works from the email, no sign-in needed (the token is the key). */
class ReminderPrefsController extends Controller
{
    public function __construct(private ReminderPrefs $prefs)
    {
    }

    /** GET /reminder-prefs/{token} */
    public function show(string $token): JsonResponse
    {
        $r = ReminderPrefs::ready() ? $this->prefs->peek($token) : null;

        return $r ? response()->json($r) : response()->json(['message' => 'This link is not valid.'], 404);
    }

    /** POST /reminder-prefs/{token}/stop {kind: cart|price|all} */
    public function stop(Request $request, string $token): JsonResponse
    {
        $d = $request->validate(['kind' => 'required|in:cart,price,all']);
        $r = ReminderPrefs::ready() ? $this->prefs->stop($token, $d['kind']) : null;

        return $r ? response()->json($r + ['message' => 'Done. You will not get these any more.']) : response()->json(['message' => 'This link is not valid.'], 404);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Notify\NotifyException;
use App\Services\Notify\StaffChannels;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A staff member's own choice of how they hear about things (Account → How I hear about things; build 6.4). Only their own, never anyone else's. */
class StaffChannelsController extends Controller
{
    public function __construct(private StaffChannels $channels) {}

    /** GET /admin/notifications/my-channels */
    public function show(Request $request): JsonResponse
    {
        return response()->json($this->channels->page($request->user()));
    }

    /** PUT /admin/notifications/my-channels {choices: {group: bell|email|whatsapp|default}} */
    public function update(Request $request): JsonResponse
    {
        $in = $request->validate(['choices' => 'required|array', 'choices.*' => 'nullable|string|max:10']);
        try {
            return response()->json(['message' => 'Saved.', 'data' => $this->channels->save($request->user(), $in['choices'])]);
        } catch (NotifyException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}

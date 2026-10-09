<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Notify\NotificationPreferences;
use App\Services\Notify\NotifyException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** A customer's own notification choices (Profile → Notification settings). Only their own record, never anyone else's. */
class CustomerNotificationPreferencesController extends Controller
{
    public function __construct(private NotificationPreferences $prefs) {}

    /** GET /customer/notification-preferences */
    public function show(Request $request): JsonResponse
    {
        $customer = $request->user()?->customer;
        abort_unless($customer, 404, 'There is no customer account for you.');

        return response()->json($this->prefs->show($customer));
    }

    /** PUT /customer/notification-preferences {mode?, essential_only?, whatsapp?, remind_cart?, remind_price?} */
    public function update(Request $request): JsonResponse
    {
        $customer = $request->user()?->customer;
        abort_unless($customer, 404, 'There is no customer account for you.');
        $in = $request->validate(['mode' => 'sometimes|nullable|in:default,email,whatsapp,both', 'essential_only' => 'sometimes|nullable|boolean', 'whatsapp' => 'sometimes|nullable|string|max:40', 'remind_cart' => 'sometimes|boolean', 'remind_price' => 'sometimes|boolean']);
        try {
            return response()->json(['message' => 'Saved.', 'data' => $this->prefs->save($customer, $in)]);
        } catch (NotifyException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}

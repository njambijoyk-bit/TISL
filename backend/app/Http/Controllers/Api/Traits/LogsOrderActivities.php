<?php

namespace App\Http\Controllers\Api\Traits;

use App\Models\OrderActivityLog;
use Illuminate\Support\Facades\Auth;

trait LogsOrderActivities
{
    protected function logOrderActivity(
        int    $orderId,
        string $action,
        string $description,
        string $severity = 'info',
        array  $metadata = []
    ): void {
        $user = Auth::user();

        OrderActivityLog::create([
            'order_id'     => $orderId,
            'user_id'      => $user?->id,
            'performed_by' => $user
                ? ($user->name ?? trim("{$user->first_name} {$user->last_name}") ?: $user->email)
                : 'System',
            'action'       => $action,
            'description'  => $description,
            'severity'     => $severity,
            'metadata'     => !empty($metadata) ? $metadata : null,
        ]);
    }
}
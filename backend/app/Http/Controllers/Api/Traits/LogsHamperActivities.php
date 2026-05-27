<?php

namespace App\Http\Controllers\Api\Traits;

use App\Models\HamperActivityLog;
use Illuminate\Support\Facades\Auth;

trait LogsHamperActivities
{
    protected function logHamperActivity(
        ?int   $hamperId,
        string $action,
        string $description,
        string $severity = 'info',
        array  $metadata = [],
        ?int   $hamperOrderId = null
    ): void {
        $user = Auth::user();

        HamperActivityLog::create([
            'hamper_id'       => $hamperId,
            'hamper_order_id' => $hamperOrderId,
            'user_id'         => $user?->id,
            'performed_by'    => $user
                ? ($user->name ?? trim("{$user->first_name} {$user->last_name}") ?: $user->email)
                : 'System',
            'action'          => $action,
            'description'     => $description,
            'severity'        => $severity,
            'metadata'        => !empty($metadata) ? $metadata : null,
        ]);
    }
}
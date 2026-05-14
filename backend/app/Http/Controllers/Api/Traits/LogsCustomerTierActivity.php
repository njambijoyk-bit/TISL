<?php

namespace App\Http\Controllers\Api\Traits;

use App\Models\CustomerTierActivity;

trait LogsCustomerTierActivity
{
    protected function logTierActivity(
        string  $entityType,
        int     $entityId,
        string  $action,
        array   $metadata = []
    ): CustomerTierActivity {
        return CustomerTierActivity::create([
            'entity_type'   => $entityType,
            'entity_id'     => $entityId,
            'actor_user_id' => auth()->id(),
            'action'        => $action,
            'metadata'      => !empty($metadata) ? $metadata : null,
            'created_at'    => now(),
        ]);
    }
}

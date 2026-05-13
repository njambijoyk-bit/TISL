<?php

namespace App\Http\Controllers\Api\Traits;

use App\Models\ShippingOption;
use App\Models\ShippingActivity;

trait LogsShippingActivity
{
    /**
     * Record an activity entry on a shipping option.
     *
     * @param ShippingOption $option
     * @param string         $action    e.g. 'CREATED', 'UPDATED', 'ACTIVATED', 'DEACTIVATED', 'DELETED'
     * @param array          $metadata  Optional extra context (old/new values)
     */
    protected function logShippingActivity(
        ShippingOption $option,
        string  $action,
        array   $metadata = []
    ): ShippingActivity {
        return ShippingActivity::create([
            'shipping_option_id' => $option->id,
            'actor_user_id'      => auth()->id(),
            'action'             => $action,
            'metadata'           => !empty($metadata) ? $metadata : null,
            'created_at'         => now(),
        ]);
    }
}

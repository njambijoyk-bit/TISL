<?php

namespace App\Http\Controllers\Api\Traits;

use App\Models\DeliveryActivityLog;
use Illuminate\Support\Facades\Auth;

trait LogsDeliveryActivity
{
    /**
     * Log an activity against any delivery entity (manifest, item, shipment, incident, rating).
     *
     * @param  string  $loggableType  Full model class e.g. DeliveryManifest::class
     * @param  int     $loggableId
     * @param  string  $action        e.g. 'manifest_created', 'stop_delivered', 'incident_filed'
     * @param  string  $severity      'info' | 'warning' | 'critical'
     * @param  array   $payload       Any extra context to snapshot
     */
    protected function logDeliveryActivity(
        string $loggableType,
        int    $loggableId,
        string $action,
        string $severity = 'info',
        array  $payload  = []
    ): void {
        $user = Auth::user();

        DeliveryActivityLog::create([
            'loggable_type'  => $loggableType,
            'loggable_id'    => $loggableId,
            'action'         => $action,
            'performed_by'   => $user?->id,
            'performer_name' => $user
                ? ($user->name ?? trim("{$user->first_name} {$user->last_name}") ?: $user->email)
                : 'System',
            'severity'       => $severity,
            'payload'        => ! empty($payload) ? $payload : null,
        ]);
    }

    /**
     * Shorthand for manifest-level activities.
     */
    protected function logManifestActivity(
        int    $manifestId,
        string $action,
        string $severity = 'info',
        array  $payload  = []
    ): void {
        $this->logDeliveryActivity(
            \App\Models\DeliveryManifest::class,
            $manifestId,
            $action,
            $severity,
            $payload
        );
    }

    /**
     * Shorthand for delivery-item-level activities.
     */
    protected function logDeliveryItemActivity(
        int    $itemId,
        string $action,
        string $severity = 'info',
        array  $payload  = []
    ): void {
        $this->logDeliveryActivity(
            \App\Models\DeliveryItem::class,
            $itemId,
            $action,
            $severity,
            $payload
        );
    }

    /**
     * Shorthand for shipment-level activities.
     */
    protected function logShipmentActivity(
        int    $shipmentId,
        string $action,
        string $severity = 'info',
        array  $payload  = []
    ): void {
        $this->logDeliveryActivity(
            \App\Models\OrderShipment::class,
            $shipmentId,
            $action,
            $severity,
            $payload
        );
    }

    /**
     * Shorthand for incident-level activities.
     */
    protected function logIncidentActivity(
        int    $incidentId,
        string $action,
        string $severity = 'warning',
        array  $payload  = []
    ): void {
        $this->logDeliveryActivity(
            \App\Models\DeliveryIncident::class,
            $incidentId,
            $action,
            $severity,
            $payload
        );
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiAnalyticsOutput;
use App\Models\AiAnalyticsSession;
use Illuminate\Http\JsonResponse;

class DeliveryInsightController extends Controller
{
    /**
     * Get all AI insights for a delivery entity.
     * entityType: driver | manifest | incident | fleet
     */
    public function history(string $entityType, ?int $entityId = null): JsonResponse
    {
        $validTypes = ['driver', 'manifest', 'incident', 'fleet'];
        
        if (!in_array($entityType, $validTypes)) {
            return response()->json(['message' => 'Invalid entity type.'], 422);
        }

        $moduleKeys = match($entityType) {
            'driver'    => ['driver_performance', 'driver_assignment_safety'],
            'manifest'  => ['delivery_manifest_generator', 'delivery_route_optimiser'],
            'incident'  => ['delivery_incident_analysis'],
            'fleet'     => ['driver_performance', 'driver_assignment_safety', 'delivery_incident_analysis'],
        };

        $query = AiAnalyticsOutput::whereHas('session', fn($q) =>
            $q->whereIn('module_key', $moduleKeys)->where('status', 'success')
        )->with('session:id,module_key,created_at,admin_id,model_used')
         ->orderByDesc('created_at');

        // Fleet is entity-agnostic (no entity_id filter)
        if ($entityType !== 'fleet' && $entityId) {
            $query->where('entity_type', $entityType)->where('entity_id', $entityId);
        }

        $insights = $query->paginate(20);

        return response()->json([
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'insights'    => $insights,
        ]);
    }

    /**
     * Get the latest insight for a specific entity.
     */
    public function latest(string $entityType, int $entityId): JsonResponse
    {
        $moduleKeys = match($entityType) {
            'driver'   => ['driver_performance', 'driver_assignment_safety'],
            'manifest' => ['delivery_manifest_generator', 'delivery_route_optimiser'],
            'incident' => ['delivery_incident_analysis'],
            default    => [],
        };

        $insight = AiAnalyticsOutput::whereHas('session', fn($q) =>
            $q->whereIn('module_key', $moduleKeys)->where('status', 'success')
        )->where('entity_type', $entityType)
         ->where('entity_id', $entityId)
         ->with('session:id,module_key,created_at,admin_id,model_used')
         ->orderByDesc('created_at')
         ->first();

        return response()->json([
            'insight' => $insight,
        ]);
    }
}
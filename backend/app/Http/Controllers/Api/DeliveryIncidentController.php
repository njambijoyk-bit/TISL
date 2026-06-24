<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsDeliveryActivity;
use App\Models\Order;
use App\Models\OrderShipment;
use App\Models\DeliveryIncident;
use App\Models\DeliveryRating;
use App\Models\DriverRatingAdjustment;
use App\Models\DeliveryManifest;
use App\Models\DeliveryItem;
use App\Models\DriverLocationPing;
use App\Models\User;
use App\Services\AiAnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

// ============================================================
// DeliveryIncidentController
// ============================================================
class DeliveryIncidentController extends Controller
{
    use LogsDeliveryActivity;

    public function __construct(protected AiAnalyticsService $ai) {}

    /**
     * Admin index — full description exposed explicitly here.
     * Ensure this route is gated by admin middleware.
     */
    public function index(Request $request): JsonResponse
    {
        $query = DeliveryIncident::with([
            'reporter:id,name,role',
            'accused:id,name,role',
            'manifest:id,manifest_number',
            'resolver:id,name',
            'accused:id,name',
        ]);

        if ($request->filled('status'))   $query->where('status', $request->status);
        if ($request->filled('severity')) $query->where('severity', $request->severity);
        if ($request->filled('category')) $query->where('category', $request->category);
        if ($request->filled('driver_id')) {
            $query->where(fn($q) =>
                $q->where('reported_by', $request->driver_id)
                ->orWhere('reported_against', $request->driver_id)
            );
        }
        if ($request->filled('search')) {
            $q = $request->search;
            $query->where(function ($w) use ($q) {
                $w->where('description', 'like', "%{$q}%")
                ->orWhere('category', 'like', "%{$q}%")
                ->orWhereHas('reporter', fn($r) => $r->where('name', 'like', "%{$q}%"))
                ->orWhereHas('accused',  fn($r) => $r->where('name', 'like', "%{$q}%"))
                ->orWhereHas('manifest', fn($r) => $r->where('manifest_number', 'like', "%{$q}%"));
            });
        }

        $incidents = $query->orderByDesc('created_at')->paginate(20);

        // Admins always see raw description — bypasses $hidden guard explicitly
        $incidents->getCollection()->transform(fn($i) => array_merge(
            $i->toArray(),
            [
                'description' => $i->getRawOriginal('description'),
                'admin_notes' => $i->getRawOriginal('admin_notes'),
            ]
        ));

        return response()->json($incidents);
    }

    public function store(Request $request): JsonResponse
    {
        $reporter = Auth::user();

        $validator = Validator::make($request->all(), [
            'manifest_id'      => 'nullable|exists:delivery_manifests,id',
            'delivery_item_id' => 'nullable|exists:delivery_items,id',
            'reported_against' => 'required|exists:users,id',
            'category'         => 'required|in:misconduct,rude_customer,security_issue,road_condition,assault,property_damage,other',
            'severity'         => 'required|in:low,medium,high,critical',
            'description'      => 'required|string|min:20|max:5000',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        $reporterRole = match (true) {
            $reporter->role === 'driver'   => 'driver',
            $reporter->role === 'customer' => 'customer',
            default                        => 'admin',
        };

        $incident = DeliveryIncident::create([
            'manifest_id'      => $request->manifest_id,
            'delivery_item_id' => $request->delivery_item_id,
            'reported_by'      => $reporter->id,
            'reported_against' => $request->reported_against,
            'reporter_role'    => $reporterRole,
            'category'         => $request->category,
            'severity'         => $request->severity,
            'description'      => $request->description,
            'status'           => 'open',
            'driver_can_see'   => $reporterRole === 'driver',  
            'customer_can_see' => $reporterRole === 'customer',
        ]);

        // Trigger AI analysis on high/critical incidents — non-blocking
        if (in_array($request->severity, ['high', 'critical'])) {
            try {
                $this->ai->analyse(
                    moduleKey:  'delivery_incident_analysis',
                    adminId:    $reporter->id,
                    entityId:   $incident->id,
                    entityType: 'incident',
                    outputType: 'risk',
                );
            } catch (\Exception $e) {
                Log::warning('Incident AI analysis failed: ' . $e->getMessage());
            }
        }

        $this->logIncidentActivity(
            $incident->id,
            'incident_filed',
            $request->severity === 'critical' ? 'critical' : 'warning',
            [
                'category'      => $request->category,
                'severity'      => $request->severity,
                'reporter_role' => $reporterRole,
                'reporter_id'   => $reporter->id,
            ]
        );

        return response()->json(['message' => 'Incident reported.', 'data' => $incident], 201);
    }

    /** Driver: file an incident from their manifest */
    public function storeDriverIncident(Request $request): JsonResponse
    {
        $reporter = Auth::user();

        $validator = Validator::make($request->all(), [
            'manifest_id'      => 'required|exists:delivery_manifests,id',
            'delivery_item_id' => 'nullable|exists:delivery_items,id',
            'reported_against' => 'nullable|exists:users,id',  // nullable for non-customer incidents
            'category'         => 'required|in:misconduct,rude_customer,security_issue,road_condition,assault,property_damage,other',
            'severity'         => 'required|in:low,medium,high,critical',
            'description'      => 'required|string|min:20|max:5000',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        // If reporting against a customer, verify they're actually in this manifest
        if ($request->filled('reported_against')) {
            $inManifest = DeliveryItem::where('manifest_id', $request->manifest_id)
                ->whereHas('order.customer', fn($q) =>
                    $q->where('user_id', $request->reported_against)
                )->exists();

            if (!$inManifest)
                return response()->json(['message' => 'That customer is not part of this manifest.'], 422);
        }

        $incident = DeliveryIncident::create([
            'manifest_id'      => $request->manifest_id,
            'delivery_item_id' => $request->delivery_item_id,
            'reported_by'      => $reporter->id,
            'reported_against' => $request->reported_against,  // null for road/weather etc
            'reporter_role'    => 'driver',
            'category'         => $request->category,
            'severity'         => $request->severity,
            'description'      => $request->description,
            'status'           => 'open',
            'driver_can_see'   => true,
            'customer_can_see' => false,  // don't expose to customer by default
        ]);

        $this->logIncidentActivity(
            $incident->id,
            'incident_filed',
            $request->severity === 'critical' ? 'critical' : 'warning',
            [
                'category'    => $request->category,
                'severity'    => $request->severity,
                'reporter_id' => $reporter->id,
                'manifest_id' => $request->manifest_id,
            ]
        );

        return response()->json(['message' => 'Incident reported.', 'data' => $incident], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $incident = DeliveryIncident::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'status'               => 'nullable|in:open,under_review,resolved,dismissed',
            'admin_notes'          => 'nullable|string|max:2000',
            'redacted_description' => 'nullable|string|max:2000',
            'is_redacted'          => 'nullable|boolean',
            'driver_can_see'       => 'nullable|boolean',
            'customer_can_see'     => 'nullable|boolean',
            'severity'             => 'nullable|in:low,medium,high,critical',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        $resolving = $request->status === 'resolved';

        // FIX: use explicit null check instead of array_filter() — prevents
        // boolean false values (e.g. driver_can_see=false) from being silently dropped
        $updateData = [];

        foreach (['status', 'admin_notes', 'redacted_description', 'is_redacted',
                  'driver_can_see', 'customer_can_see', 'severity'] as $field) {
            if ($request->has($field)) {
                $updateData[$field] = $request->input($field);
            }
        }

        if ($resolving) {
            $updateData['resolved_by'] = Auth::id();
            $updateData['resolved_at'] = now();
        } elseif (isset($updateData['status']) && $updateData['status'] !== 'resolved') {
            $updateData['resolved_by'] = null;
            $updateData['resolved_at'] = null;
        }

        $incident->update($updateData);

        $this->logIncidentActivity(
            $incident->id,
            'incident_updated',
            'warning',
            ['updated_by' => Auth::user()->name, 'new_status' => $request->status]
        );

        return response()->json(['message' => 'Incident updated.', 'data' => $incident->fresh()]);
    }

    /** Driver: incidents filed against them that they are allowed to see */
    public function myIncidents(Request $request): JsonResponse
    {
        $user = Auth::user();

        $incidents = DeliveryIncident::where(function ($q) use ($user) {
                // Incidents filed against them (by customer/admin) — must be allowed to see
                $q->where('reported_against', $user->id)
                ->where('driver_can_see', true);
            })
            ->orWhere(function ($q) use ($user) {
                // Incidents they filed themselves — always visible to them
                $q->where('reported_by', $user->id)
                ->where('reporter_role', 'driver');
            })
            ->get()
            ->map(fn($i) => [
                'id'                   => $i->id,
                'category'             => $i->category_label,
                'severity'             => $i->severity_label,
                'status'               => $i->status_label,
                'description'          => $i->visibleDescriptionFor($user),
                'is_redacted'          => $i->is_redacted,
                'redacted_description' => $i->is_redacted ? $i->redacted_description : null,
                'admin_notes'          => $i->getRawOriginal('admin_notes'),
                'filed_at'             => $i->created_at,
                'resolved_at'          => $i->resolved_at,
                'filed_by_me'          => $i->reported_by === $user->id, // useful for UI differentiation
                'manifest_number'      => $i->manifest?->manifest_number,
                'accused'              => $i->reported_against ? ['name' => optional($i->accused)->name] : null,
            ]);

        return response()->json(['data' => $incidents]);
    }

    /** Customer: incidents they filed */
    public function myIncidentsCustomer(Request $request): JsonResponse
    {
        $user = Auth::user();

        $incidents = DeliveryIncident::where(function ($q) use ($user) {
                // Incidents they filed
                $q->where('reported_by', $user->id)
                ->where('customer_can_see', true);
            })
            ->orWhere(function ($q) use ($user) {
                // Incidents filed against them
                $q->where('reported_against', $user->id)
                ->where('customer_can_see', true);
            })
            ->with([
                'accused:id,name',
                'manifest:id,manifest_number',
                'deliveryItem:id',
            ])
            ->orderByDesc('created_at')
            ->paginate(20);

        $incidents->getCollection()->transform(function ($incident) use ($user) {
            $incident->visible_description = $incident->visibleDescriptionFor($user);
            $incident->filed_by_me = $incident->reported_by === $user->id;

            // Hide driver identity when the incident was filed against the customer
            if (!$incident->filed_by_me) {
                $incident->makeHidden(['reporter', 'reported_by']);
                // reporter relation isn't loaded but reported_by field would leak the id
            }

            return $incident;
        });

        return response()->json($incidents);
    }

    /** Get all participants (driver + customers) for a manifest */
    public function manifestParticipants(int $manifestId): JsonResponse
    {
        $manifest = DeliveryManifest::with([
            'driver:id,name,role',
            'items.order.customer:id,first_name,last_name,user_id',
        ])->findOrFail($manifestId);

        $participants = collect();

        // Driver
        if ($manifest->driver) {
            $participants->push([
                'user_id' => $manifest->driver->id,
                'name'    => $manifest->driver->name,
                'role'    => 'driver',
            ]);
        }

        // Customers — deduplicated by user_id
        foreach ($manifest->items as $item) {
            $customer = $item->order?->customer;
            if ($customer?->user_id && !$participants->firstWhere('user_id', $customer->user_id)) {
                $participants->push([
                    'user_id' => $customer->user_id,
                    'name'    => trim("{$customer->first_name} {$customer->last_name}"),
                    'role'    => 'customer',
                ]);
            }
        }

        return response()->json([
            'manifest_number' => $manifest->manifest_number,
            'scheduled_date'  => $manifest->scheduled_date,
            'participants'    => $participants->values(),
        ]);
    }

    /** Admin: file an incident with full mobility */
    public function storeAdminIncident(Request $request): JsonResponse
    {
        $admin = Auth::user();

        $validator = Validator::make($request->all(), [
            'manifest_id'          => 'required|exists:delivery_manifests,id',
            'reported_by_user_id'  => 'required|string',
            'reported_against'     => 'nullable|exists:users,id',
            'category'             => 'required|in:misconduct,rude_customer,security_issue,road_condition,assault,property_damage,other',
            'severity'             => 'required|in:low,medium,high,critical',
            'description'          => 'required|string|min:20|max:5000',
            'override_reason'      => 'nullable|string|max:1000',
        ]);

        if ($validator->fails())
            return response()->json(['errors' => $validator->errors()], 422);

        if ($request->reported_by_user_id === 'admin') {
            $reporter = $admin;
            $reporterRole = 'admin';
        } else {
            $reporter = User::findOrFail($request->reported_by_user_id);
            $reporterRole = $reporter->role === 'driver' ? 'driver'
                : ($reporter->role === 'customer' ? 'customer' : 'admin');
        }

        // Validate reporter is in this manifest
        $manifest = DeliveryManifest::with('items.order.customer')->findOrFail($request->manifest_id);
        $participantUserIds = $this->getManifestParticipantIds($manifest);

        if (!in_array($reporter->id, $participantUserIds) && $reporterRole !== 'admin') {
            return response()->json(['message' => 'Reporter is not a participant in this manifest.'], 422);
        }

        // Validate accused is in manifest if provided
        if ($request->filled('reported_against')) {
            if (!in_array($request->reported_against, $participantUserIds)) {
                return response()->json(['message' => 'Accused party is not a participant in this manifest.'], 422);
            }
        }

        // If admin is reporter, reported_against is required + override_reason required
        if ($reporterRole === 'admin') {
            if (!$request->filled('reported_against')) {
                return response()->json([
                    'message' => 'When filing as admin, you must specify who the incident is against.',
                    'errors'  => ['reported_against' => ['Required when reporter is admin.']],
                ], 422);
            }
            if (!$request->filled('override_reason')) {
                return response()->json([
                    'requires_override' => true,
                    'message'           => 'Filing an incident as admin against another party requires an override reason. The accused party will be notified that an admin has filed this report.',
                ], 409);
            }
        }

        $incident = DeliveryIncident::create([
            'manifest_id'      => $request->manifest_id,
            'reported_by'      => $reporter->id,
            'reported_against' => $request->reported_against,
            'reporter_role'    => $reporterRole,
            'category'         => $request->category,
            'severity'         => $request->severity,
            'description'      => $request->description,
            'status'           => 'open',
            'driver_can_see'   => false,
            'customer_can_see' => false,
            'admin_notes'      => $request->filled('override_reason')
                ? "Admin override reason: {$request->override_reason}"
                : null,
        ]);

        // AI analysis for high/critical
        if (in_array($request->severity, ['high', 'critical'])) {
            try {
                $this->ai->analyse(
                    moduleKey:  'delivery_incident_analysis',
                    adminId:    $admin->id,
                    entityId:   $incident->id,
                    entityType: 'incident',
                    outputType: 'risk',
                );
            } catch (\Exception $e) {
                Log::warning('Incident AI analysis failed: ' . $e->getMessage());
            }
        }

        $this->logIncidentActivity(
            $incident->id,
            'incident_filed',
            $request->severity === 'critical' ? 'critical' : 'warning',
            [
                'category'        => $request->category,
                'severity'        => $request->severity,
                'reporter_role'   => $reporterRole,
                'reporter_id'     => $reporter->id,
                'filed_by_admin'  => $admin->id,
                'override_reason' => $request->override_reason,
            ]
        );

        return response()->json(['message' => 'Incident filed.', 'data' => $incident], 201);
    }

    /** Helper: get all participant user IDs for a manifest */
    private function getManifestParticipantIds(DeliveryManifest $manifest): array
    {
        $ids = [];

        if ($manifest->driver_id) $ids[] = $manifest->driver_id;

        foreach ($manifest->items as $item) {
            $userId = $item->order?->customer?->user_id;
            if ($userId) $ids[] = $userId;
        }

        return array_unique($ids);
    }
}
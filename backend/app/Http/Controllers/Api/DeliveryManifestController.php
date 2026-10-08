<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsDeliveryActivity;
use App\Models\DeliveryManifest;
use App\Models\DeliveryItem;
use App\Models\Books\Voucher;
use App\Models\Books\VoucherType;
use App\Services\Delivery\DeliveryStopService;
use App\Models\User;
use App\Models\DeliveryIncident;
use App\Models\DriverLocationPing;
use App\Services\AiAnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class DeliveryManifestController extends Controller
{
    use LogsDeliveryActivity;

    public function __construct(protected AiAnalyticsService $ai, protected DeliveryStopService $stops) {}

    // ========================================
    // INDEX
    // ========================================

    public function index(Request $request): JsonResponse
    {
        $query = DeliveryManifest::with([
            'driver:id,name,phone,profile_picture',
            'assigner:id,name',
            'items.customer',
            'items.notes.voucher',
        ]);

        if ($request->filled('status'))
            $query->where('status', $request->status);

        if ($request->filled('driver_id'))
            $query->where('driver_id', $request->driver_id);

        if ($request->filled('date'))
            $query->whereDate('scheduled_date', $request->date);

        if ($request->filled('search'))
            $query->where('manifest_number', 'like', "%{$request->search}%");

        if ($request->filled('delivery_method'))
            $query->where('delivery_method', $request->delivery_method);

        if ($request->boolean('ai_generated'))
            $query->where('ai_generated', true);

        $sortBy    = $request->input('sort_by', 'scheduled_date');
        $sortOrder = $request->input('sort_order', 'desc');
        if (in_array($sortBy, ['scheduled_date', 'created_at', 'status', 'manifest_number']))
            $query->orderBy($sortBy, $sortOrder);

        $manifests = $query->paginate($request->input('per_page', 20));

         return response()->json([
            'data' => $manifests->items(),
            'meta' => [
                'current_page' => $manifests->currentPage(),
                'last_page'    => $manifests->lastPage(),
                'from'         => $manifests->firstItem(),
                'to'           => $manifests->lastItem(),
                'total'        => $manifests->total(),
                'per_page'     => $manifests->perPage(),
            ],
        ]);
    }

    // ========================================
    // DELIVERY NOTES — the pick list for building a manifest
    // ========================================

    public function deliveryNotes(Request $request): JsonResponse
    {
        $q = Voucher::query()->with(['customer:id,first_name,last_name,phone', 'location:id,name'])->withCount('items')
            ->whereHas('type', fn($t) => $t->where('base_type', VoucherType::DELIVERY_NOTE))
            ->where('status', Voucher::POSTED)
            ->when($request->filled('search'), fn($w) => $w->where(fn($x) => $x
                ->where('voucher_number', 'like', "%{$request->search}%")
                ->orWhere('party_name', 'like', "%{$request->search}%")
                ->orWhere('party_address', 'like', "%{$request->search}%")))
            ->when($request->filled('from'), fn($w) => $w->where('date', '>=', $request->from))
            ->when($request->filled('to'), fn($w) => $w->where('date', '<=', $request->to))
            ->when($request->filled('location_id'), fn($w) => $w->where('location_id', $request->location_id))
            ->orderByDesc('date')->orderByDesc('id');

        $page  = $q->paginate($request->input('per_page', 50));
        $check = collect($this->stops->eligibility($page->pluck('id')->all()))->keyBy('voucher_id');

        $rows = $page->getCollection()->map(function ($v) use ($check) {
            $e = $check->get($v->id, []);
            return [
                'id' => $v->id, 'voucher_number' => $v->voucher_number, 'order_number' => $v->voucher_number, 'date' => $v->date?->toDateString(),
                'customer_name' => $v->party_name ?: ($v->customer ? trim("{$v->customer->first_name} {$v->customer->last_name}") : null),
                'customer_phone' => $v->party_phone ?: $v->customer?->phone, 'address' => $v->party_address,
                'location' => $v->location?->name, 'items_count' => $v->items_count, 'total' => (float) $v->base_total,
                'eligible' => (bool) ($e['eligible'] ?? false), 'reason' => $e['reason'] ?? null,
                'manifest_number' => $e['manifest_number'] ?? null, 'manifest_id' => $e['manifest_id'] ?? null,
            ];
        });

        return response()->json(['data' => $rows, 'meta' => [
            'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage(),
        ]]);
    }

    // ========================================
    // STATISTICS
    // ========================================

    public function statistics(): JsonResponse
    {
        $counts = DeliveryManifest::selectRaw("
            COUNT(*)                                        AS total,
            SUM(status = 'draft')                          AS draft,
            SUM(status = 'dispatched')                     AS dispatched,
            SUM(status = 'in_progress')                    AS in_progress,
            SUM(status = 'completed')                      AS completed,
            SUM(status = 'cancelled')                      AS cancelled,
            SUM(ai_generated = 1)                          AS ai_generated,
            ROUND(AVG(NULLIF(total_distance_km, 0)), 2)    AS avg_distance_km,
            ROUND(AVG(NULLIF(actual_duration_minutes, 0)), 0) AS avg_duration_mins
        ")->first();

        $byDriver = DeliveryManifest::select('driver_id', DB::raw('COUNT(*) as count'))
            ->with('driver:id,name')
            ->groupBy('driver_id')
            ->get();

        $byMethod = DeliveryManifest::select('delivery_method', DB::raw('COUNT(*) as count'))
            ->groupBy('delivery_method')
            ->get();

        return response()->json(array_merge(
            $counts->toArray(),
            [
                'by_driver'  => $byDriver,
                'by_method'  => $byMethod,
            ]
        ));
    }

    // ========================================
    // SHOW
    // ========================================

    public function show(int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with([
            'driver:id,name,phone,profile_picture',
            'assigner:id,name',
            'items.customer',
            'items.notes.voucher.items',
            'items.rating',
            'items.incidents',
            'incidents.reporter:id,name',
            'incidents.accused:id,name',
            'activityLogs.performer:id,name',
        ])->findOrFail($id);

        return response()->json(['data' => $manifest]);
    }

    // ========================================
    // STORE
    // FIX: Added delivery_method, order_numbers support, override_reason,
    //      expanded order status filter, structured error responses
    // ========================================

    public function store(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'driver_id'       => 'nullable|exists:users,id',
            'scheduled_date'  => 'required|date|after_or_equal:today',
            'notes'           => 'nullable|string|max:1000',
            'voucher_ids'     => 'nullable|array',
            'voucher_ids.*'   => 'integer',
            'voucher_numbers' => 'nullable|array',
            'voucher_numbers.*' => 'string',
            'delivery_method' => 'nullable|string|in:internal_driver,courier,customer_pickup,third_party',
            'override_reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        // Delivery Notes to put on the manifest (by id and/or number)
        $orderIds = $this->resolveNoteIds($request);

        // Validate delivery method requirements
        $deliveryMethod = $request->input('delivery_method', 'internal_driver');

        if ($deliveryMethod === 'internal_driver') {
            if (! $request->filled('driver_id')) {
                return response()->json([
                    'message' => 'Driver is required for internal driver delivery.',
                    'errors'  => ['driver_id' => ['Please select a driver for internal delivery.']],
                ], 422);
            }

            $driver = User::findOrFail($request->driver_id);

            if (! $driver->isDriver()) {
                return response()->json([
                    'message' => 'Selected user is not a driver.',
                    'errors'  => ['driver_id' => ['The selected user does not have a driver role.']],
                ], 422);
            }

            // Safety check for driver incidents
            if (! empty($orderIds)) {
                $safetyWarning = $this->checkDriverSafetyForOrders($driver, $orderIds);
                if ($safetyWarning && ! $request->filled('override_reason')) {
                    return response()->json([
                        'requires_override' => true,
                        'warning'           => $safetyWarning,
                        'driver_id'         => $driver->id,
                        'driver_name'       => $driver->name,
                    ], 409);
                }
            }
        } else {
            // Non-internal methods: driver is optional
            $driver = $request->filled('driver_id') ? User::find($request->driver_id) : null;
        }

        DB::beginTransaction();
        try {
            $manifestData = [
                'assigned_by'     => Auth::id(),
                'status'          => 'draft',
                'scheduled_date'  => $request->scheduled_date,
                'notes'           => $request->notes,
                'ai_generated'    => false,
                'delivery_method' => $deliveryMethod,
            ];

            // Only include driver_id when explicitly provided
            if ($request->filled('driver_id')) {
                $manifestData['driver_id'] = $request->driver_id;
            }

            $manifest = DeliveryManifest::create($manifestData);

            $skipped = [];
            if (! empty($orderIds)) {
                ['added' => $added, 'skipped' => $skipped] = $this->stops->attach($manifest, $orderIds);
            }

            $this->logManifestActivity(
                $manifest->id,
                'manifest_created',
                'info',
                [
                    'driver_id'       => $driver?->id,
                    'driver_name'     => $driver?->name,
                    'delivery_method' => $deliveryMethod,
                    'override_reason' => $request->override_reason,
                ]
            );

            DB::commit();

            $response = [
                'message' => 'Manifest created.',
                'data'    => $manifest->load('items.customer', 'items.notes.voucher.items', 'driver:id,name'),
            ];

            if (! empty($skipped)) {
                $response['skipped_orders'] = $skipped; // structured: [{voucher_id, reason, manifest_number, ...}]
                $response['skipped_count']  = count($skipped);
            }

            return response()->json($response, 201);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Manifest create failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to create manifest. Please try again.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // AI: CREATE MANIFEST (God mode / AI Implement)
    // Chains delivery AI modules in sequence, skipping disabled/failed
    // steps gracefully. Creates the manifest atomically at the end.
    // All steps are audit-logged via LogsDeliveryActivity.
    // ========================================

    public function aiCreate(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'mode'               => 'required|in:advisory,creator',
            'delivery_method'    => 'required|string|in:internal_driver,courier,customer_pickup,third_party',
            'driver_id'          => 'nullable|integer|exists:users,id',
            'scheduled_date'     => 'nullable|date|after_or_equal:today',
            'order_period_days'  => 'nullable|integer|min:1|max:90',
            'order_statuses'     => 'nullable|array',
            'order_statuses.*'   => 'string|in:confirmed,processing,ready_for_pickup',
            'custom_prompt'      => 'nullable|string|max:1000',
            'advisory_context'   => 'nullable|string|max:5000', // prior advisory for AI Implement
            'conversation_history' => 'nullable|array|max:20',  // reiterate thread
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $adminId        = Auth::id();
        $mode           = $request->input('mode');
        $deliveryMethod = $request->input('delivery_method');
        $driverId       = $request->input('driver_id');
        $steps          = []; // audit trail returned to frontend

        // ── Step helper — wraps each module call ─────────────────────────
        $runStep = function (string $moduleKey, array $extraData = [], ?int $entityId = null) use ($adminId, &$steps): ?string {
            $module = \App\Models\AiAnalyticsModule::where('key', $moduleKey)->first();

            if (! $module) {
                $steps[] = ['module' => $moduleKey, 'status' => 'skipped', 'reason' => 'module_not_found'];
                return null;
            }

            if (! $module->is_enabled) {
                $steps[] = ['module' => $moduleKey, 'status' => 'skipped', 'reason' => 'disabled', 'label' => $module->label];
                return null;
            }

            try {
                $output = $this->ai->analyse(
                    moduleKey:  $moduleKey,
                    adminId:    $adminId,
                    entityId:   $entityId,           // ← was hardcoded null
                    entityType: 'manifest_ai_session',
                    outputType: 'recommendation',
                    extraData:  $extraData,
                );

                $steps[] = ['module' => $moduleKey, 'status' => 'success', 'label' => $module->label, 'content' => $output->content];
                return $output->content;

            } catch (\Exception $e) {
                $steps[] = ['module' => $moduleKey, 'status' => 'failed', 'label' => $module->label, 'reason' => $e->getMessage()];
                Log::warning("AI step [{$moduleKey}] failed: " . $e->getMessage());
                return null;
            }
        };

        // ── Resolve eligible orders ───────────────────────────────────────
        $periodDays    = $request->input('order_period_days', 14);
        $orderStatuses = $request->input('order_statuses', ['confirmed', 'processing', 'ready_for_pickup']);

        $takenIds = \App\Models\DeliveryItemVoucher::whereHas('stop', fn($q) => $q->whereNotIn('status', DeliveryStopService::RELEASED)
                ->whereHas('manifest', fn($m) => $m->where('status', '!=', 'cancelled')))->pluck('voucher_id');

        $eligibleOrders = Voucher::query()
            ->whereHas('type', fn($q) => $q->where('base_type', VoucherType::DELIVERY_NOTE))
            ->where('status', Voucher::POSTED)
            ->where('date', '>=', now()->subDays($periodDays)->toDateString())
            ->whereNotIn('id', $takenIds)
            ->select('id', 'voucher_number as order_number', 'status', 'party_address as shipping_address', 'date as created_at')
            ->orderBy('date')->orderBy('id')
            ->limit(50)
            ->get();

        if ($eligibleOrders->isEmpty()) {
            return response()->json([
                'message' => 'No Delivery Notes are waiting for a manifest in that period.',
                'steps'   => $steps,
            ], 422);
        }

        $orderIds = $eligibleOrders->pluck('id')->toArray();

        // ── Resolve scheduled date (God mode fallback via priority) ──────
        $scheduledDate = $request->input('scheduled_date');
        if (! $scheduledDate) {
            $scheduledDate = now()->addDay()->toDateString();   // Delivery Notes carry no priority: tomorrow unless told otherwise
        }

        // ── Module chain ─────────────────────────────────────────────────
        // Step 1: Incident analysis — surface risk areas and drivers first
        $incidentInsight = $runStep('delivery_incident_analysis');

        // Step 2: Driver performance — score available drivers
        $driverInsight = $runStep('driver_performance', [
            'driver_id' => $driverId, // null = all drivers overview
        ]);

        // Step 3: Driver-customer safety check
        $safetyInsight = null;
        if ($deliveryMethod === 'internal_driver') {
            $safetyInsight = $runStep('driver_assignment_safety', [
                'order_ids' => $orderIds,
            ], $driverId);                           // ← entityId now flows through
        } else {
            $steps[] = ['module' => 'driver_assignment_safety', 'status' => 'skipped', 'reason' => 'not_internal_driver'];
        }

        // Step 4: Manifest generator — select orders, pick driver, suggest sequence
        // Inject prior module outputs as context so AI builds on them
        $priorContext = implode("\n\n", array_filter([
            $incidentInsight ? "INCIDENT ANALYSIS:\n{$incidentInsight}" : null,
            $driverInsight   ? "DRIVER PERFORMANCE:\n{$driverInsight}"  : null,
            $safetyInsight   ? "SAFETY CHECK:\n{$safetyInsight}"        : null,
            $request->advisory_context ? "PRIOR ADVISORY:\n{$request->advisory_context}" : null,
        ]));

        $manifestSuggestion = $runStep('delivery_manifest_generator', [
            'order_ids'       => $orderIds,
            'driver_id'       => $driverId,
            'delivery_method' => $deliveryMethod,
            'prior_context'   => $priorContext,
            'custom_prompt'   => $request->input('custom_prompt'),
        ]);

        if (! $manifestSuggestion) {
            // Core step failed — cannot proceed to creation
            $this->logManifestActivity(0, 'ai_create_aborted', 'warning', [
                'reason' => 'manifest_generator_step_failed',
                'mode'   => $mode,
                'steps'  => $steps,
            ]);

            return response()->json([
                'success' => false,
                'message' => 'AI manifest generation failed. See steps for details.',
                'steps'   => $steps,
            ], 500);
        }

        // ── Advisory mode: return suggestion without creating ────────────
        if ($mode === 'advisory') {
            $this->logManifestActivity(0, 'ai_advisory_generated', 'info', [
                'mode'            => 'advisory',
                'delivery_method' => $deliveryMethod,
                'order_count'     => count($orderIds),
                'steps_run'       => count($steps),
                'admin_id'        => $adminId,
            ]);

            return response()->json([
                'success'    => true,
                'mode'       => 'advisory',
                'suggestion' => $manifestSuggestion,
                'steps'      => $steps,
                'meta'       => [
                    'order_count'    => count($orderIds),
                    'scheduled_date' => $scheduledDate,
                    'delivery_method'=> $deliveryMethod,
                    'driver_hinted'  => $driverId,
                ],
            ]);
        }

        // ── Creator mode: parse AI output and build the manifest ─────────
        // AI is expected to return JSON-parseable content from the manifest generator.
        // We attempt to extract it; if parsing fails we still create with what we have.
        $aiDecision = $this->parseAiManifestDecision($manifestSuggestion, $orderIds, $driverId);

        $resolvedDriverId  = $aiDecision['driver_id'];
        $resolvedOrderIds  = $aiDecision['order_ids'];
        $resolvedSortOrder = $aiDecision['sort_order']; // [order_id => position]

        DB::beginTransaction();
        try {
            $manifest = DeliveryManifest::create([
                'assigned_by'     => $adminId,
                'status'          => 'draft',
                'scheduled_date'  => $scheduledDate,
                'delivery_method' => $deliveryMethod,
                'ai_generated'    => true,
                'notes'           => 'AI-generated manifest. ' . now()->toDateTimeString(),
                ...($resolvedDriverId ? ['driver_id' => $resolvedDriverId] : []),
            ]);

            // Put the Delivery Notes on (same customer + address = one stop), then order the stops the way the AI suggested
            $this->stops->attach($manifest, $resolvedOrderIds);
            $lastOrder = 0;
            $ranked    = $manifest->items()->with('notes')->get()->map(function ($stop) use ($resolvedSortOrder, &$lastOrder) {
                $pos = $stop->notes->map(fn($n) => $resolvedSortOrder[$n->voucher_id] ?? null)->filter()->min();
                return ['stop' => $stop, 'pos' => $pos ?? (1000 + (++$lastOrder))];
            })->sortBy('pos')->values();
            foreach ($ranked as $i => $r) {
                $r['stop']->update(['sort_order' => $i + 1]);
            }

            // Step 5: Route optimiser — runs after items exist
            $routeInsight = $runStep('delivery_route_optimiser', [
                'manifest_id' => $manifest->id,
            ]);

            $this->logManifestActivity(
                $manifest->id,
                'ai_manifest_created',
                'info',
                [
                    'mode'             => 'creator',
                    'delivery_method'  => $deliveryMethod,
                    'driver_id'        => $resolvedDriverId,
                    'order_count'      => count($resolvedOrderIds),
                    'scheduled_date'   => $scheduledDate,
                    'steps'            => $steps,
                    'ai_parse_source'  => $aiDecision['source'], // 'parsed' or 'fallback'
                    'admin_id'         => $adminId,
                ]
            );

            DB::commit();

            return response()->json([
                'success'    => true,
                'mode'       => 'creator',
                'message'    => 'AI manifest created successfully.',
                'suggestion' => $manifestSuggestion,
                'steps'      => $steps,
                'data'       => $manifest->load('items.customer', 'items.notes.voucher.items', 'driver:id,name'),
                'meta'       => [
                    'scheduled_date'  => $scheduledDate,
                    'delivery_method' => $deliveryMethod,
                    'driver_id'       => $resolvedDriverId,
                    'order_count'     => count($resolvedOrderIds),
                    'parse_source'    => $aiDecision['source'],
                ],
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('AI manifest creation failed: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Failed to create manifest from AI suggestion.',
                'steps'   => $steps,
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ── Parse AI decision from manifest generator output ─────────────────
    // Attempts to extract structured JSON from the AI response.
    // Falls back to using all eligible order IDs in original order
    // if the AI didn't return parseable JSON — creation still proceeds.
    private function parseAiManifestDecision(string $content, array $fallbackOrderIds, ?int $fallbackDriverId): array
    {
        // Try to extract a JSON block from the AI response
        if (preg_match('/```json\s*([\s\S]*?)\s*```/i', $content, $matches) ||
            preg_match('/\{[\s\S]*"order_ids"[\s\S]*\}/i', $content, $matches)) {

            $json = $matches[1] ?? $matches[0];

            try {
                $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);

                return [
                    'driver_id'  => $decoded['driver_id']  ?? $fallbackDriverId,
                    'order_ids'  => $decoded['order_ids']  ?? $fallbackOrderIds,
                    'sort_order' => $decoded['sort_order']  ?? [], // [order_id => position]
                    'source'     => 'parsed',
                ];
            } catch (\JsonException) {
                // Fall through to fallback
            }
        }

        return [
            'driver_id'  => $fallbackDriverId,
            'order_ids'  => $fallbackOrderIds,
            'sort_order' => [],
            'source'     => 'fallback',
        ];
    }

    // ========================================
    // UPDATE
    // ========================================

    public function update(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::findOrFail($id);

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Only draft manifests can be edited.',
                'errors'  => ['status' => ['Manifest is not in draft status.']],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'scheduled_date'  => 'sometimes|date',
            'notes'           => 'nullable|string|max:1000',
            'delivery_method' => 'nullable|string|in:internal_driver,courier,customer_pickup,third_party',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $old = $manifest->only(['scheduled_date', 'notes', 'delivery_method']);
        $manifest->update($request->only(['scheduled_date', 'notes', 'delivery_method']));

        $this->logManifestActivity(
            $manifest->id,
            'manifest_updated',
            'info',
            ['old' => $old, 'new' => $manifest->fresh()->only(['scheduled_date', 'notes', 'delivery_method'])]
        );

        return response()->json(['message' => 'Manifest updated.', 'data' => $manifest->fresh()]);
    }

    // ========================================
    // ADD ITEMS
    // FIX: Added order_numbers support, override_reason, structured errors
    // ========================================

    public function addItems(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with('driver')->findOrFail($id);

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Can only add items to a draft manifest.',
                'errors'  => ['status' => ['Manifest is not in draft status.']],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'voucher_ids'     => 'nullable|array',
            'voucher_ids.*'   => 'integer',
            'voucher_numbers' => 'nullable|array',
            'voucher_numbers.*' => 'string',
            'override_reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $orderIds = $this->resolveNoteIds($request);

        if (empty($orderIds)) {
            return response()->json([
                'message' => 'No Delivery Notes provided.',
                'errors'  => ['voucher_ids' => ['Please provide Delivery Note ids or numbers.']],
            ], 422);
        }

        // Safety check for internal driver manifests
        if ($manifest->delivery_method === 'internal_driver' && $manifest->driver) {
            $safetyWarning = $this->checkDriverSafetyForOrders($manifest->driver, $orderIds);
            if ($safetyWarning && ! $request->filled('override_reason')) {
                return response()->json([
                    'requires_override' => true,
                    'warning'           => $safetyWarning,
                    'driver_id'         => $manifest->driver->id,
                    'driver_name'       => $manifest->driver->name,
                ], 409);
            }
        }

        ['added' => $added, 'skipped' => $skipped] = $this->stops->attach($manifest, $orderIds);

        $this->logManifestActivity(
            $manifest->id,
            'items_added',
            'info',
            ['voucher_ids' => $orderIds, 'added' => $added, 'skipped' => $skipped]
        );

        return response()->json([
            'message'        => "{$added} Delivery Note(s) added to manifest.",
            'skipped_orders' => $skipped, // structured: [{order_id, reason, manifest_number, ...}]
            'skipped_count'  => count($skipped),
            'data'           => $manifest->load('items.customer', 'items.notes.voucher.items'),
        ]);
    }

    // ========================================
    // REMOVE ITEM
    // ========================================

    public function removeItem(int $manifestId, int $itemId): JsonResponse
    {
        $manifest = DeliveryManifest::findOrFail($manifestId);

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Can only remove items from a draft manifest.',
                'errors'  => ['status' => ['Manifest is not in draft status.']],
            ], 422);
        }

        $item    = DeliveryItem::where('manifest_id', $manifestId)->findOrFail($itemId);
        $orderId = $this->stops->voucherIdsOf([$item]);
        $this->stops->removeStop($item);

        $this->logManifestActivity(
            $manifest->id,
            'item_removed',
            'info',
            ['voucher_ids' => $orderId, 'delivery_item_id' => $itemId]
        );

        return response()->json(['message' => 'Item removed from manifest.']);
    }

    // ========================================
    // DISPATCH
    // ========================================

    public function dispatchManifest(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with('items', 'driver')->findOrFail($id);

        if (! $manifest->canBeDispatched()) {
            return response()->json([
                'message' => 'Manifest cannot be dispatched. Ensure it is in draft and has items.',
                'errors'  => ['status' => ['Manifest must be in draft status with at least one item.']],
            ], 422);
        }

        DB::beginTransaction();
        try {
            $manifest->update([
                'status'        => 'dispatched',
                'dispatched_at' => now(),
            ]);

            foreach ($manifest->items as $item) {
                $item->update(['status' => 'out_for_delivery']);
            }

            $this->logManifestActivity(
                $manifest->id,
                'manifest_dispatched',
                'info',
                [
                    'dispatched_by' => Auth::user()->name,
                    'driver'        => $manifest->driver?->name,
                    'item_count'    => $manifest->items->count(),
                    'method'        => $manifest->delivery_method,
                ]
            );

            DB::commit();

            return response()->json([
                'message' => 'Manifest dispatched.',
                'data'    => $manifest->fresh(['items.customer', 'items.notes.voucher.items', 'driver:id,name']),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Manifest dispatch failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to dispatch manifest.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // CANCEL
    // ========================================

    public function cancel(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with('items')->findOrFail($id);

        if (! $manifest->canBeCancelled()) {
            return response()->json([
                'message' => 'Manifest cannot be cancelled at this stage.',
                'errors'  => ['status' => ['Manifest status does not allow cancellation.']],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'reason' => 'required|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        DB::beginTransaction();
        try {
            $wasDispatched = $manifest->status === 'dispatched';

            $manifest->update(['status' => 'cancelled']);

            if ($wasDispatched) {
                foreach ($manifest->items as $item) {
                    $item->update(['status' => 'pending']);
                }
            }

            $this->logManifestActivity(
                $manifest->id,
                'manifest_cancelled',
                'warning',
                [
                    'reason'       => $request->reason,
                    'cancelled_by' => Auth::user()->name,
                    'was_dispatched' => $wasDispatched,
                ]
            );

            DB::commit();

            return response()->json(['message' => 'Manifest cancelled.']);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Manifest cancel failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to cancel manifest.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // REASSIGN DRIVER
    // ========================================

    public function reassignDriver(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with('items')->findOrFail($id);

        if (! in_array($manifest->status, ['draft', 'dispatched'])) {
            return response()->json([
                'message' => 'Cannot reassign driver at this stage.',
                'errors'  => ['status' => ['Driver can only be reassigned for draft or dispatched manifests.']],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'driver_id'       => 'required|exists:users,id',
            'override_reason' => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $newDriver = User::findOrFail($request->driver_id);

        if (! $newDriver->isDriver()) {
            return response()->json([
                'message' => 'Selected user is not a driver.',
                'errors'  => ['driver_id' => ['The selected user does not have a driver role.']],
            ], 422);
        }

        $orderIds      = $this->stops->voucherIdsOf($manifest->items);
        $safetyWarning = $this->checkDriverSafetyForOrders($newDriver, $orderIds);

        if ($safetyWarning && ! $request->filled('override_reason')) {
            return response()->json([
                'requires_override' => true,
                'warning'           => $safetyWarning,
                'driver_id'         => $newDriver->id,
                'driver_name'       => $newDriver->name,
            ], 409);
        }

        $oldDriverId = $manifest->driver_id;
        $manifest->update(['driver_id' => $newDriver->id]);

        $this->logManifestActivity(
            $manifest->id,
            'driver_reassigned',
            $safetyWarning ? 'warning' : 'info',
            [
                'old_driver_id'   => $oldDriverId,
                'new_driver_id'   => $newDriver->id,
                'new_driver_name' => $newDriver->name,
                'override_reason' => $request->override_reason,
                'safety_warning'  => $safetyWarning,
            ]
        );

        return response()->json([
            'message' => 'Driver reassigned.',
            'data'    => $manifest->fresh('driver:id,name'),
        ]);
    }

    // ========================================
    // TRANSFER ITEMS
    // ========================================

    public function transferItems(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'item_ids'                => 'required|array|min:1',
            'item_ids.*'              => 'integer|exists:delivery_items,id',
            'destination_manifest_id' => 'required|integer|exists:delivery_manifests,id',
            'override_reason'         => 'nullable|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $destination = DeliveryManifest::with('items')->findOrFail($request->destination_manifest_id);

        if ($destination->status !== 'draft') {
            return response()->json([
                'message' => 'Destination manifest must be in draft status.',
                'errors'  => ['destination_manifest_id' => ['Destination is not a draft manifest.']],
            ], 422);
        }

        // Fetch items and verify they all come from transferable manifests.
        // Allowed sources:
        //   - draft or cancelled manifests (any item status)
        //   - completed manifests BUT only items that are failed or returned
        $items = DeliveryItem::with('manifest:id,status,manifest_number')
            ->whereIn('id', $request->item_ids)
            ->get();

        $invalidItems = $items->filter(function ($item) {
            $manifestStatus = $item->manifest?->status;
            if (in_array($manifestStatus, ['draft', 'cancelled'])) return false;
            if ($manifestStatus === 'completed' && in_array($item->status, ['failed', 'returned'])) return false;
            return true; // everything else is invalid
        });

        if ($invalidItems->isNotEmpty()) {
            return response()->json([
                'message' => 'One or more items cannot be transferred. Only failed/returned items from completed manifests, or items from draft/cancelled manifests, are eligible.',
                'errors'  => [
                    'item_ids' => $invalidItems->map(fn($i) =>
                        "Item #{$i->id} (status: {$i->status}) is in a {$i->manifest?->status} manifest ({$i->manifest?->manifest_number})."
                    )->values()->toArray(),
                ],
            ], 422);
        }

        // A Delivery Note can only be on one live stop: refuse if one of these notes was put on another manifest since
        $clash = [];
        foreach ($items as $it) {
            foreach ($this->stops->taken($this->stops->voucherIdsOf([$it])) as $vid => $link) {
                if ($link->delivery_item_id !== $it->id) {
                    $clash[] = "Delivery Note #{$vid} is already on manifest {$link->stop->manifest?->manifest_number}.";
                }
            }
        }
        if ($clash) {
            return response()->json(['message' => 'One or more Delivery Notes are already on another manifest.', 'errors' => ['item_ids' => $clash]], 422);
        }

        // Also block transferring into the same manifest as source (all same) — catch the obvious mistake
        $sourceManifestIds = $items->pluck('manifest_id')->unique();
        if ($sourceManifestIds->count() === 1 && $sourceManifestIds->first() === $destination->id) {
            return response()->json([
                'message' => 'Source and destination manifest are the same.',
                'errors'  => ['destination_manifest_id' => ['Cannot transfer items to the same manifest.']],
            ], 422);
        }

        // ── DRIVER SAFETY CHECK ─────────────────────────────────────────────
        // Only run for internal_driver manifests that have a driver assigned
        if (
            $destination->delivery_method === 'internal_driver'
            && $destination->driver_id
            && ! $request->filled('override_reason')
        ) {
            $orderIds = $this->stops->voucherIdsOf($items);

            $safetyWarning = $this->checkDriverSafetyForOrders($destination->driver, $orderIds);

            if ($safetyWarning) {
                return response()->json([
                    'requires_override' => true,
                    'warning'           => $safetyWarning,
                    'driver_id'         => $destination->driver_id,
                    'driver_name'       => $destination->driver->name,
                ], 409);
            }
        }
        // ───────────────────────────────────────────────────────────────────

        DB::beginTransaction();
        try {
            $lastSortOrder = $destination->items()->max('sort_order') ?? 0;

            foreach ($items as $i => $item) {
                $sourceManifestId = $item->manifest_id;

                $item->update([
                    'manifest_id' => $destination->id,
                    'sort_order'  => $lastSortOrder + $i + 1,
                    // Reset delivery-specific fields so it's clean in the new manifest
                    'status'               => 'pending',
                    'estimated_arrival'    => null,
                    'distance_from_prev_km'   => null,
                    'time_from_prev_minutes'  => null,
                ]);

                $this->logManifestActivity(
                    $destination->id,
                    'item_transferred_in',
                    'info',
                    [
                        'delivery_item_id'    => $item->id,
                        'voucher_ids'         => $this->stops->voucherIdsOf([$item]),
                        'source_manifest_id'  => $sourceManifestId,
                        'transferred_by'      => Auth::user()->name,
                    ]
                );
            }

            // Log on each unique source manifest too
            foreach ($sourceManifestIds as $sourceId) {
                $this->logManifestActivity(
                    $sourceId,
                    'items_transferred_out',
                    'info',
                    [
                        'item_count'              => $items->where('manifest_id', $destination->id)->count(),
                        'destination_manifest_id' => $destination->id,
                        'transferred_by'          => Auth::user()->name,
                    ]
                );
            }

            DB::commit();

            // Reload both the destination and all affected source manifests
            $updatedDestination = DeliveryManifest::with('items.customer', 'items.notes.voucher.items')->find($destination->id);

            $updatedSources = DeliveryManifest::with('items.customer', 'items.notes.voucher.items')
                ->whereIn('id', $sourceManifestIds)
                ->get();

            return response()->json([
                'message'     => count($request->item_ids) . ' item(s) transferred successfully.',
                'destination' => $updatedDestination,
                'sources'     => $updatedSources,
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Manifest transfer failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Transfer failed. Please try again.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // DELETE IF EMPTY (NEW)
    // Hard delete a manifest only if it has no items
    // ========================================

    public function deleteIfEmpty(int $id): JsonResponse
    {
        $manifest = DeliveryManifest::withCount('items')->findOrFail($id);

        if ($manifest->items_count > 0) {
            return response()->json([
                'message' => 'Cannot delete manifest with items.',
                'errors'  => ['items' => ['Remove all items before deleting this manifest.']],
            ], 422);
        }

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Only draft manifests can be deleted.',
                'errors'  => ['status' => ['Manifest must be in draft status to delete.']],
            ], 422);
        }

        $this->logManifestActivity($manifest->id, 'manifest_deleted', 'warning');
        $manifest->forceDelete();

        return response()->json(['message' => 'Manifest deleted permanently.']);
    }

    // ========================================
    // AI: GENERATE MANIFEST
    // ========================================

    public function aiGenerate(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'driver_id'       => 'nullable|exists:users,id',
            'scheduled_date'  => 'required|date|after_or_equal:today',
            'order_ids'       => 'required|array|min:1',   // Delivery Note ids
            'order_ids.*'     => 'integer',
            'custom_prompt'   => 'nullable|string|max:500',
            'delivery_method' => 'nullable|string|in:internal_driver,courier,customer_pickup,third_party',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        try {
            $output = $this->ai->analyse(
                moduleKey:    'delivery_manifest_generator',
                adminId:      Auth::id(),
                entityId:     null,
                entityType:   'manifest_request',
                outputType:   'recommendation',
                customPrompt: $request->custom_prompt,
                extraData:    [
                    'order_ids'       => $request->order_ids,
                    'driver_id'       => $request->filled('driver_id') ? $request->driver_id : null,
                    'delivery_method' => $request->input('delivery_method', 'internal_driver'),
                ],
            );

            return response()->json([
                'success' => true,
                'output'  => $output,
                'hint'    => 'Review AI suggestion, then call POST /manifests with ai_generated=true to save.',
            ]);

        } catch (\Exception $e) {
            Log::error('AI manifest generation failed: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // PRINT / EXPORT DATA
    // ========================================

    public function printData(int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with([
            'driver:id,name,phone',
            'assigner:id,name',
            'items' => fn($q) => $q->orderBy('sort_order'),
            'items.customer',
            'items.notes.voucher.items',
        ])->findOrFail($id);

        return response()->json(['data' => $manifest]);
    }

    // ========================================
    // DESTROY (soft delete — draft only)
    // ========================================

    public function destroy(int $id): JsonResponse
    {
        $manifest = DeliveryManifest::findOrFail($id);

        if ($manifest->status !== 'draft') {
            return response()->json([
                'message' => 'Only draft manifests can be deleted.',
                'errors'  => ['status' => ['Manifest must be in draft status.']],
            ], 422);
        }

        $this->logManifestActivity($manifest->id, 'manifest_deleted', 'warning');
        $manifest->delete();

        return response()->json(['message' => 'Manifest deleted.']);
    }

    // ========================================
    // GET ACTIVE DRIVERS WITH SAFETY FLAGS (NEW)
    // ========================================

    public function activeDrivers(Request $request): JsonResponse
    {
        $drivers = User::drivers()
            ->where('status', 'active')
            ->select('id', 'name', 'phone', 'profile_picture', 'employee_id')
            ->withCount([
                'deliveryManifests as completed_manifests' => fn($q) => $q->where('status', 'completed'),
                'deliveryManifests as active_manifests' => fn($q) => $q->whereIn('status', ['draft', 'dispatched', 'in_progress']),
            ])
            ->get()
            ->map(function ($driver) {
                return [
                    'driver_id'            => $driver->id,
                    'name'                 => $driver->name,
                    'phone'                => $driver->phone,
                    'profile_picture_url'  => $driver->profile_picture,
                    'employee_id'          => $driver->employee_id,
                    'completed_manifests'  => $driver->completed_manifests,
                    'active_manifests'     => $driver->active_manifests,
                ];
            });

        return response()->json(['data' => $drivers]);
    }

    public function checkDriverSafety(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'driver_id' => 'required|integer|exists:users,id',
            'order_ids' => 'required|array',
            'order_ids.*' => 'integer',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors' => $validator->errors(),
            ], 422);
        }

        $driver = User::findOrFail($request->driver_id);

        if (! $driver->isDriver()) {
            return response()->json([
                'message' => 'Selected user is not a driver.',
            ], 422);
        }

        $warning = $this->checkDriverSafetyForOrders($driver, $request->order_ids);

        if ($warning) {
            return response()->json([
                'requires_override' => true,
                'warning' => $warning,
                'driver_id' => $driver->id,
                'driver_name' => $driver->name,
            ], 409);
        }

        return response()->json(['safe' => true]);
    }

    // ========================================
    // GET RETURNED ITEMS
    // All delivery items currently in 'returned' status across completed
    // manifests — these are awaiting reassignment to a new manifest.
    // ========================================

    public function getReturnedItems(): JsonResponse
    {
        $items = DeliveryItem::with([
            'customer:id,first_name,last_name,phone',
            'notes.voucher:id,voucher_number',
            'manifest:id,manifest_number,scheduled_date,driver_id',
            'manifest.driver:id,name',
        ])
        ->where('status', 'returned')
        ->whereHas('manifest', fn($q) => $q->where('status', 'completed'))
        ->orderByDesc('returned_at')
        ->get()
        ->map(fn($item) => [
            'id'              => $item->id,
            'order_id'        => $item->notes->first()?->voucher_id,
            'voucher_ids'     => $item->notes->pluck('voucher_id')->values(),
            'order_number'    => $item->notes->map->voucher->filter()->pluck('voucher_number')->join(', '),
            'customer_name'   => $item->contact_name ?: ($item->customer ? trim("{$item->customer->first_name} {$item->customer->last_name}") : null),
            'customer_phone'  => $item->contact_phone ?: $item->customer?->phone,
            'address'         => $item->address,
            'failed_reason'   => $item->failed_reason,
            'returned_at'     => $item->returned_at?->toISOString(),
            'manifest_id'     => $item->manifest_id,
            'manifest_number' => $item->manifest?->manifest_number,
            'manifest_date'   => $item->manifest?->scheduled_date,
            'driver_name'     => $item->manifest?->driver?->name,
        ]);

        return response()->json([
            'data'  => $items,
            'total' => $items->count(),
        ]);
    }

    // ========================================
    // ADMIN: GET FAILED ITEMS
    // All delivery items in 'failed' status across completed manifests
    // ========================================

    public function getFailedItems(): JsonResponse
    {
        $items = DeliveryItem::with([
            'customer:id,first_name,last_name,phone',
            'notes.voucher:id,voucher_number',
            'manifest:id,manifest_number,scheduled_date,driver_id',
            'manifest.driver:id,name',
        ])
        ->where('status', 'failed')
        ->whereHas('manifest', fn($q) => $q->where('status', 'completed'))
        ->orderByDesc('attempted_at')
        ->get()
        ->map(fn($item) => [
            'id'              => $item->id,
            'order_id'        => $item->notes->first()?->voucher_id,
            'voucher_ids'     => $item->notes->pluck('voucher_id')->values(),
            'order_number'    => $item->notes->map->voucher->filter()->pluck('voucher_number')->join(', '),
            'customer_name'   => $item->contact_name ?: ($item->customer ? trim("{$item->customer->first_name} {$item->customer->last_name}") : null),
            'customer_phone'  => $item->contact_phone ?: $item->customer?->phone,
            'address'         => $item->address,
            'failed_reason'   => $item->failed_reason,
            'attempted_at'    => $item->attempted_at?->toISOString(),
            'manifest_id'     => $item->manifest_id,
            'manifest_number' => $item->manifest?->manifest_number,
            'manifest_date'   => $item->manifest?->scheduled_date,
            'driver_name'     => $item->manifest?->driver?->name,
        ]);

        return response()->json([
            'data'  => $items,
            'total' => $items->count(),
        ]);
    }

    // ========================================
    // ADMIN: OVERRIDE ITEM STATUS
    // Force a failed delivery item to 'delivered' or reset it to 'pending'
    // so it can be transferred to another manifest or retried.
    // ========================================

    public function overrideItemStatus(Request $request, int $manifestId, int $itemId): JsonResponse
    {
        $manifest = DeliveryManifest::findOrFail($manifestId);

        $validator = Validator::make($request->all(), [
            'status'         => 'required|in:delivered,pending',
            'override_notes' => 'required|string|max:500',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        $item = DeliveryItem::where('manifest_id', $manifestId)->findOrFail($itemId);

        // Only failed or returned items can be overridden
        if (! in_array($item->status, ['failed', 'returned'])) {
            return response()->json([
                'message' => 'Only failed or returned items can be overridden.',
                'errors'  => ['status' => ['Item must be in failed or returned status.']],
            ], 422);
        }

        DB::beginTransaction();
        try {
            if ($request->status === 'delivered') {
                // Admin force-marks as delivered
                $item->update([
                    'status'         => 'delivered',
                    'delivered_at'   => now(),
                    'delivery_notes' => $request->override_notes,
                    'failed_reason'  => null,
                ]);

            } else {
                // Admin resets to pending: clear failed state so item can be retransferred
                $item->update([
                    'status'                => 'pending',
                    'failed_reason'         => null,
                    'delivery_notes'        => $request->override_notes,
                    'delivered_at'          => null,
                    'arrival_latitude'      => null,
                    'arrival_longitude'     => null,
                    'distance_from_prev_km'   => null,
                    'time_from_prev_minutes'  => null,
                ]);
            }

            $this->logDeliveryItemActivity(
                $item->id,
                'admin_status_override',
                'warning',
                [
                    'overridden_by'  => Auth::user()->name,
                    'new_status'     => $request->status,
                    'override_notes' => $request->override_notes,
                ]
            );

            DB::commit();

            return response()->json([
                'message' => "Item status overridden to '{$request->status}'.",
                'data'    => $item->fresh(['customer', 'notes.voucher.items']),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Item status override failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Override failed. Please try again.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // EXTERNAL DELIVERY — ITEM STATUS OVERRIDE
    // For courier, customer_pickup, third_party manifests.
    // Admin can force any item to: pending, out_for_delivery,
    // delivered, failed, returned
    // ========================================

    public function overrideExternalItemStatus(Request $request, int $manifestId, int $itemId): JsonResponse
    {
        $manifest = DeliveryManifest::findOrFail($manifestId);

        if ($manifest->delivery_method === 'internal_driver') {
            return response()->json([
                'message' => 'Use the driver workflow for internal manifests. This endpoint is for external delivery methods only.',
                'errors'  => ['delivery_method' => ['Not applicable to internal_driver manifests.']],
            ], 422);
        }

        if (! in_array($manifest->status, ['dispatched', 'in_progress', 'completed'])) {
            return response()->json([
                'message' => 'Manifest must be dispatched or in progress to update item statuses.',
                'errors'  => ['status' => ['Manifest is not active.']],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'status'         => 'required|in:pending,out_for_delivery,delivered,failed,returned',
            'override_notes' => 'required|string|max:500',
            'failed_reason'  => 'nullable|string|max:500', // required when status=failed
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validation failed.', 'errors' => $validator->errors()], 422);
        }

        if ($request->status === 'failed' && ! $request->filled('failed_reason')) {
            return response()->json([
                'message' => 'Validation failed.',
                'errors'  => ['failed_reason' => ['A reason is required when marking an item as failed.']],
            ], 422);
        }

        $item = DeliveryItem::where('manifest_id', $manifestId)->findOrFail($itemId);

        DB::beginTransaction();
        try {
            $now = now();

            $updateData = [
                'status'         => $request->status,
                'delivery_notes' => $request->override_notes,
            ];

            match ($request->status) {
                'delivered' => $updateData += [
                    'delivered_at'  => $now,
                    'failed_reason' => null,
                    'returned_at'   => null,
                ],
                'failed' => $updateData += [
                    'failed_reason' => $request->failed_reason,
                    'delivered_at'  => null,
                    'returned_at'   => null,
                ],
                'returned' => $updateData += [
                    'returned_at'   => $now,
                    'failed_reason' => $item->failed_reason, // preserve original reason
                    'delivered_at'  => null,
                ],
                'pending', 'out_for_delivery' => $updateData += [
                    'failed_reason' => null,
                    'delivered_at'  => null,
                    'returned_at'   => null,
                ],
            };

            $item->update($updateData);

            $this->logDeliveryItemActivity(
                $item->id,
                'admin_external_status_override',
                'warning',
                [
                    'overridden_by'  => Auth::user()->name,
                    'new_status'     => $request->status,
                    'override_notes' => $request->override_notes,
                    'delivery_method' => $manifest->delivery_method,
                ]
            );

            DB::commit();

            return response()->json([
                'message' => "Item status updated to '{$request->status}'.",
                'data'    => $item->fresh(['customer', 'notes.voucher.items']),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('External item override failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Override failed. Please try again.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // COMPLETE MANIFEST (admin force-close)
    // For courier / pickup / third_party workflows where
    // no driver app is updating status automatically.
    // Also works on in_progress internal manifests if needed.
    // ========================================

    public function completeManifest(Request $request, int $id): JsonResponse
    {
        $manifest = DeliveryManifest::with('items')->findOrFail($id);

        if (! in_array($manifest->status, ['dispatched', 'in_progress'])) {
            return response()->json([
                'message' => 'Only dispatched or in-progress manifests can be completed.',
                'errors'  => ['status' => ['Manifest is not in a completable state.']],
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'completion_notes'       => 'nullable|string|max:500',
            'auto_fail_pending'      => 'boolean', // if true, mark still-pending items as failed
            'pending_fail_reason'    => 'nullable|string|max:300',
        ]);

        if ($validator->fails()) {
            return response()->json(['message' => 'Validation failed.', 'errors' => $validator->errors()], 422);
        }

        // Warn if there are still-active (pending/out_for_delivery) items
        $activeItems = $manifest->items->whereIn('status', ['pending', 'out_for_delivery']);

        if ($activeItems->isNotEmpty() && ! $request->boolean('auto_fail_pending') && ! $request->boolean('force')) {
            return response()->json([
                'requires_confirmation' => true,
                'active_item_count'     => $activeItems->count(),
                'message'               => "{$activeItems->count()} item(s) are still pending/out-for-delivery. Pass auto_fail_pending=true to mark them failed, or force=true to complete anyway leaving them as-is.",
            ], 409);
        }

        DB::beginTransaction();
        try {
            $now          = now();
            $autoFailed   = 0;
            $failReason   = $request->input('pending_fail_reason', 'Manifest closed by admin without delivery confirmation.');

            if ($request->boolean('auto_fail_pending') && $activeItems->isNotEmpty()) {
                foreach ($activeItems as $item) {
                    $item->update([
                        'status'        => 'failed',
                        'failed_reason' => $failReason,
                    ]);
                    $autoFailed++;
                }
            }

            $manifest->update([
                'status'                   => 'completed',
                'actual_end_time'          => $now,
                'actual_duration_minutes'  => $manifest->actual_start_time
                    ? (int) $manifest->actual_start_time->diffInMinutes($now)
                    : null,
            ]);

            // Stops marked delivered without a time get one
            DeliveryItem::where('manifest_id', $id)->where('status', 'delivered')->whereNull('delivered_at')->update(['delivered_at' => $now]);

            $this->logManifestActivity(
                $manifest->id,
                'manifest_completed',
                'info',
                [
                    'completed_by'     => Auth::user()->name,
                    'delivery_method'  => $manifest->delivery_method,
                    'auto_failed'      => $autoFailed,
                    'completion_notes' => $request->completion_notes,
                    'force'            => $request->boolean('force'),
                ]
            );

            DB::commit();

            return response()->json([
                'message'      => 'Manifest completed.',
                'auto_failed'  => $autoFailed,
                'data'         => $manifest->fresh(['items.customer', 'items.notes.voucher.items', 'driver:id,name']),
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Manifest completion failed: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to complete manifest.',
                'errors'  => ['general' => [$e->getMessage()]],
            ], 500);
        }
    }

    // ========================================
    // PRIVATE HELPERS
    // ========================================

    /** Delivery Note ids from `voucher_ids` and/or `voucher_numbers` (the old `order_ids` / `order_numbers` names still work). */
    private function resolveNoteIds(Request $request): array
    {
        $ids = array_map('intval', array_merge($request->input('voucher_ids', []), $request->input('order_ids', [])));
        $nums = array_merge($request->input('voucher_numbers', []), $request->input('order_numbers', []));
        if ($nums) {
            $ids = array_merge($ids, Voucher::whereIn('voucher_number', $nums)->pluck('id')->all());
        }

        return array_values(array_unique($ids));
    }

    /**
     * Pre-flight check for a set of Delivery Notes: can each go on a manifest, and if not, why
     * (not a Delivery Note, not posted, already on manifest M-…, already delivered).
     */
    public function checkOrderEligibility(Request $request): JsonResponse
    {
        $ids = $this->resolveNoteIds($request);
        if (! $ids) {
            return response()->json(['message' => 'Validation failed.', 'errors' => ['voucher_ids' => ['Provide at least one Delivery Note.']]], 422);
        }

        return response()->json(['data' => $this->stops->eligibility($ids)]);
    }

    /**
     * Check for unresolved high/critical incidents between a driver and customers.
     */
    private function checkDriverSafetyForOrders(User $driver, array $orderIds): ?string
    {
        if (empty($orderIds)) return null;

        $customerUserIds = Voucher::whereIn('vouchers.id', $orderIds)
            ->join('customers', 'vouchers.customer_id', '=', 'customers.id')
            ->pluck('customers.user_id')
            ->filter()
            ->toArray();

        if (empty($customerUserIds)) return null;

        $incidents = DeliveryIncident::whereIn('severity', ['high', 'critical'])
            ->whereIn('status', ['open', 'under_review'])
            ->betweenMany($driver->id, $customerUserIds)
            ->get();

        if ($incidents->isEmpty()) return null;

        $hasAssault  = $incidents->where('category', 'assault')->isNotEmpty();
        $hasCritical = $incidents->where('severity', 'critical')->isNotEmpty();

        $warning = match (true) {
            $hasAssault  => 'WARNING: This driver has an unresolved assault incident with one or more customers in this manifest.',
            $hasCritical => 'WARNING: This driver has unresolved critical incidents with one or more customers in this manifest.',
            default      => 'WARNING: This driver has unresolved high-severity incidents with customers in this manifest.',
        };

        try {
            $this->ai->analyse(
                moduleKey:  'driver_assignment_safety',
                adminId:    Auth::id(),
                entityId:   $driver->id,
                entityType: 'driver',
                outputType: 'risk',
            );
        } catch (\Exception $e) {
            Log::warning('Safety AI check failed: ' . $e->getMessage());
        }

        return $warning;
    }

    /**
     * Get courier label based on delivery method
     */
    private function getCourierLabel(DeliveryManifest $manifest): string
    {
        return match ($manifest->delivery_method) {
            'internal_driver'  => 'Internal Driver — ' . ($manifest->driver?->name ?? 'Unassigned'),
            'courier'          => 'External Courier Service',
            'customer_pickup'  => 'Customer Self-Pickup',
            'third_party'      => 'Third-Party Delivery Partner',
            default            => 'Internal Driver — ' . ($manifest->driver?->name ?? 'Unassigned'),
        };
    }

    /**
     * Get workflow type for shipment record
     */
    private function getWorkflowType(DeliveryManifest $manifest): string
    {
        return match ($manifest->delivery_method) {
            'internal_driver' => 'internal',
            'courier'         => 'courier',
            'customer_pickup' => 'pickup',
            'third_party'     => 'third_party',
            default           => 'internal',
        };
    }

    /**
     * Admin-facing: Get live GPS pings for a specific manifest
     */
    public function getLivePings(int $manifestId): JsonResponse
    {
        $pings = DriverLocationPing::where('manifest_id', $manifestId)
            ->latest('pinged_at')
            ->limit(100)
            ->get()
            ->map(fn($p) => [
                'lat'   => (float) $p->latitude,
                'lng'   => (float) $p->longitude,
                'speed' => $p->speed_kmh,
                'time'  => $p->pinged_at?->toISOString(),
            ]);

        return response()->json(['data' => $pings]);
    }
}
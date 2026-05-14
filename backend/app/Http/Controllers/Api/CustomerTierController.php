<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsCustomerTierActivity;
use App\Models\CustomerTier;
use App\Models\CustomerTypeDiscount;
use App\Models\CustomerTierActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CustomerTierController extends Controller
{
    use LogsCustomerTierActivity;

    // Protected slugs — cannot be deleted or deactivated
    const PROTECTED_TIER_SLUG = 'bronze';
    const PROTECTED_TYPE_SLUG = 'individual';

    // ────────────────────────────────────────────────────────────────────────
    //  TIERS  (customer_tiers table)
    // ────────────────────────────────────────────────────────────────────────

    public function tierIndex(): JsonResponse
    {
        return response()->json(
            CustomerTier::orderBy('sort_order')->get()
        );
    }

    public function tierStore(Request $request): JsonResponse
    {
        $request->validate([
            'slug'                      => 'required|string|max:50|unique:customer_tiers,slug',
            'name'                      => 'required|string|max:100',
            'description'               => 'nullable|string|max:255',
            'color'                     => 'nullable|string|max:20',
            'discount_percentage'       => 'required|numeric|min:0|max:100',
            'free_shipping_threshold'   => 'nullable|numeric|min:0',
            'loyalty_points_multiplier' => 'required|numeric|min:0',
            'priority_support'          => 'boolean',
            'min_orders'                => 'nullable|integer|min:0',
            'min_spent'                 => 'nullable|numeric|min:0',
            'sort_order'                => 'integer|min:0',
            'is_active'                 => 'boolean',
        ]);

        $tier = CustomerTier::create([
            'slug'                      => $request->slug,
            'name'                      => $request->name,
            'description'               => $request->description,
            'color'                     => $request->color ?? '#9ca3af',
            'discount_percentage'       => $request->discount_percentage,
            'free_shipping_threshold'   => $request->free_shipping_threshold,
            'loyalty_points_multiplier' => $request->loyalty_points_multiplier,
            'priority_support'          => $request->priority_support ?? false,
            'min_orders'                => $request->min_orders,
            'min_spent'                 => $request->min_spent,
            'sort_order'                => $request->sort_order ?? 0,
            'is_active'                 => $request->is_active ?? true,
        ]);

        $this->logTierActivity('tier', $tier->id, 'CREATED', [
            'name' => $tier->name, 'slug' => $tier->slug,
        ]);

        return response()->json(['message' => 'Tier created successfully', 'data' => $tier], 201);
    }

    public function tierUpdate(Request $request, $id): JsonResponse
    {
        $tier = CustomerTier::findOrFail($id);

        $request->validate([
            'slug'                      => ['sometimes', 'string', 'max:50', Rule::unique('customer_tiers')->ignore($id)],
            'name'                      => 'sometimes|string|max:100',
            'description'               => 'nullable|string|max:255',
            'color'                     => 'nullable|string|max:20',
            'discount_percentage'       => 'sometimes|numeric|min:0|max:100',
            'free_shipping_threshold'   => 'nullable|numeric|min:0',
            'loyalty_points_multiplier' => 'sometimes|numeric|min:0',
            'priority_support'          => 'boolean',
            'min_orders'                => 'nullable|integer|min:0',
            'min_spent'                 => 'nullable|numeric|min:0',
            'sort_order'                => 'sometimes|integer|min:0',
        ]);

        $changes = [];
        $fields  = [
            'slug', 'name', 'description', 'color', 'discount_percentage',
            'free_shipping_threshold', 'loyalty_points_multiplier', 'priority_support',
            'min_orders', 'min_spent', 'sort_order',
        ];

        foreach ($fields as $field) {
            if ($request->has($field) && $request->$field != $tier->$field) {
                $changes[] = ['field' => $field, 'old' => $tier->$field, 'new' => $request->$field];
            }
        }

        $tier->update($request->only($fields));

        if (!empty($changes)) {
            $this->logTierActivity('tier', $tier->id, 'UPDATED', ['changes' => $changes]);
        }

        return response()->json(['message' => 'Tier updated successfully', 'data' => $tier->fresh()]);
    }

    public function tierToggleStatus(Request $request, $id): JsonResponse
    {
        $tier = CustomerTier::findOrFail($id);

        if ($tier->slug === self::PROTECTED_TIER_SLUG && !$request->is_active) {
            return response()->json([
                'message' => "The '{$tier->name}' tier cannot be deactivated",
            ], 403);
        }

        $request->validate(['is_active' => 'required|boolean']);

        $tier->update(['is_active' => $request->is_active]);
        $action = $request->is_active ? 'ACTIVATED' : 'DEACTIVATED';
        $this->logTierActivity('tier', $tier->id, $action);

        return response()->json(['message' => "Tier {$action} successfully", 'data' => $tier->fresh()]);
    }

    public function tierDestroy($id): JsonResponse
    {
        if (auth()->user()->role !== 'super_admin') {
            return response()->json(['message' => 'Only superadmin can delete tiers'], 403);
        }

        $tier = CustomerTier::findOrFail($id);

        if ($tier->slug === self::PROTECTED_TIER_SLUG) {
            return response()->json(['message' => "The '{$tier->name}' tier cannot be deleted"], 403);
        }

        $this->logTierActivity('tier', $tier->id, 'DELETED', [
            'name' => $tier->name, 'slug' => $tier->slug,
        ]);

        $tier->delete();

        return response()->json(['message' => 'Tier deleted successfully']);
    }

    // ────────────────────────────────────────────────────────────────────────
    //  TYPE DISCOUNTS  (customer_type_discounts table)
    // ────────────────────────────────────────────────────────────────────────

    public function typeIndex(): JsonResponse
    {
        return response()->json(
            CustomerTypeDiscount::orderBy('sort_order')->get()
        );
    }

    public function typeStore(Request $request): JsonResponse
    {
        $request->validate([
            'slug'                => 'required|string|max:50|unique:customer_type_discounts,slug',
            'name'                => 'required|string|max:100',
            'description'         => 'nullable|string|max:255',
            'discount_percentage' => 'required|numeric|min:0|max:100',
            'sort_order'          => 'integer|min:0',
            'is_active'           => 'boolean',
        ]);

        $type = CustomerTypeDiscount::create([
            'slug'                => $request->slug,
            'name'                => $request->name,
            'description'         => $request->description,
            'discount_percentage' => $request->discount_percentage,
            'sort_order'          => $request->sort_order ?? 0,
            'is_active'           => $request->is_active ?? true,
        ]);

        $this->logTierActivity('type_discount', $type->id, 'CREATED', [
            'name' => $type->name, 'slug' => $type->slug,
        ]);

        return response()->json(['message' => 'Customer type created successfully', 'data' => $type], 201);
    }

    public function typeUpdate(Request $request, $id): JsonResponse
    {
        $type = CustomerTypeDiscount::findOrFail($id);

        $request->validate([
            'slug'                => ['sometimes', 'string', 'max:50', Rule::unique('customer_type_discounts')->ignore($id)],
            'name'                => 'sometimes|string|max:100',
            'description'         => 'nullable|string|max:255',
            'discount_percentage' => 'sometimes|numeric|min:0|max:100',
            'sort_order'          => 'sometimes|integer|min:0',
        ]);

        $changes = [];
        $fields  = ['slug', 'name', 'description', 'discount_percentage', 'sort_order'];

        foreach ($fields as $field) {
            if ($request->has($field) && $request->$field != $type->$field) {
                $changes[] = ['field' => $field, 'old' => $type->$field, 'new' => $request->$field];
            }
        }

        $type->update($request->only($fields));

        if (!empty($changes)) {
            $this->logTierActivity('type_discount', $type->id, 'UPDATED', ['changes' => $changes]);
        }

        return response()->json(['message' => 'Customer type updated successfully', 'data' => $type->fresh()]);
    }

    public function typeToggleStatus(Request $request, $id): JsonResponse
    {
        $type = CustomerTypeDiscount::findOrFail($id);

        if ($type->slug === self::PROTECTED_TYPE_SLUG && !$request->is_active) {
            return response()->json([
                'message' => "The '{$type->name}' type cannot be deactivated",
            ], 403);
        }

        $request->validate(['is_active' => 'required|boolean']);

        $type->update(['is_active' => $request->is_active]);
        $action = $request->is_active ? 'ACTIVATED' : 'DEACTIVATED';
        $this->logTierActivity('type_discount', $type->id, $action);

        return response()->json(['message' => "Customer type {$action} successfully", 'data' => $type->fresh()]);
    }

    public function typeDestroy($id): JsonResponse
    {
        if (auth()->user()->role !== 'super_admin') {
            return response()->json(['message' => 'Only superadmin can delete customer types'], 403);
        }

        $type = CustomerTypeDiscount::findOrFail($id);

        if ($type->slug === self::PROTECTED_TYPE_SLUG) {
            return response()->json(['message' => "The '{$type->name}' type cannot be deleted"], 403);
        }

        $this->logTierActivity('type_discount', $type->id, 'DELETED', [
            'name' => $type->name, 'slug' => $type->slug,
        ]);

        $type->delete();

        return response()->json(['message' => 'Customer type deleted successfully']);
    }

    // ────────────────────────────────────────────────────────────────────────
    //  SHARED: ACTIVITY LOG
    // ────────────────────────────────────────────────────────────────────────

    public function activity(Request $request): JsonResponse
    {
        $activity = CustomerTierActivity::with('actor:id,name,email')
            ->when($request->filled('entity_type'), fn($q) => $q->where('entity_type', $request->entity_type))
            ->when($request->filled('action'),      fn($q) => $q->where('action', $request->action))
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 25));

        return response()->json($activity);
    }

    // ────────────────────────────────────────────────────────────────────────
    //  PUBLIC ENDPOINTS (for checkout / customer-facing pages)
    // ────────────────────────────────────────────────────────────────────────

    public function publicTiers(): JsonResponse
    {
        return response()->json(
            CustomerTier::active()->get()
        );
    }

    public function publicTypes(): JsonResponse
    {
        return response()->json(
            CustomerTypeDiscount::active()->get()
        );
    }
}

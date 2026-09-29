<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\Traits\LogsShippingActivity;
use App\Models\ShippingOption;
use App\Models\ShippingActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ShippingOptionController extends Controller
{
    use LogsShippingActivity;
    /** Slug that can never be deleted or deactivated */
    private const PROTECTED_SLUG = 'standard_delivery';

    /**
     * GET /admin/shipping
     * All shipping options (admin).
     */
    public function index(): JsonResponse
    {
        $options = ShippingOption::with(['currency:id,code,symbol', 'taxRate:id,tax_type_id,rate_value,rate_type'])->orderBy('sort_order')->get();

        return response()->json($options);
    }

    /**
     * POST /admin/shipping
     * Create a new shipping option.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'slug'        => 'required|string|max:50|unique:shipping_options,slug',
            'name'        => 'required|string|max:100',
            'description' => 'nullable|string|max:255',
            'cost'        => 'required|numeric|min:0',
            'free_above'  => 'nullable|numeric|min:0',
            'is_active'   => 'boolean',
            'sort_order'  => 'integer|min:0',
            'icon'        => 'nullable|string|max:30',
            'currency_id' => 'nullable|integer|exists:currencies,id',
            'tax_rate_id' => 'nullable|integer|exists:tax_rates,id',
        ]);

        $option = ShippingOption::create([
            'currency_id' => $request->currency_id ?: app(\App\Services\CurrencyConversionService::class)->getBaseCurrency()->id,
            'tax_rate_id' => $request->tax_rate_id,
            'slug'        => $request->slug,
            'name'        => $request->name,
            'description' => $request->description,
            'cost'        => $request->cost,
            'free_above'  => $request->free_above,
            'is_active'   => $request->is_active ?? true,
            'sort_order'  => $request->sort_order ?? 0,
            'icon'        => $request->icon ?? 'Truck',
        ]);

        $this->logShippingActivity($option, 'CREATED', [
            'name' => $option->name,
            'slug' => $option->slug,
            'cost' => $option->cost,
        ]);

        return response()->json([
            'message' => 'Shipping option created successfully',
            'data'    => $option,
        ], 201);
    }

    /**
     * PUT /admin/shipping/{id}
     * Update a shipping option.
     */
    public function update(Request $request, $id): JsonResponse
    {
        $option = ShippingOption::findOrFail($id);

        $request->validate([
            'slug'        => ['sometimes', 'string', 'max:50', Rule::unique('shipping_options')->ignore($id)],
            'name'        => 'sometimes|string|max:100',
            'description' => 'nullable|string|max:255',
            'cost'        => 'sometimes|numeric|min:0',
            'free_above'  => 'nullable|numeric|min:0',
            'sort_order'  => 'sometimes|integer|min:0',
            'icon'        => 'nullable|string|max:30',
            'currency_id' => 'sometimes|integer|exists:currencies,id',
            'tax_rate_id' => 'nullable|integer|exists:tax_rates,id',
        ]);

        $changes = [];
        $fields  = ['slug', 'name', 'description', 'cost', 'free_above', 'sort_order', 'icon', 'currency_id', 'tax_rate_id'];

        foreach ($fields as $field) {
            if ($request->has($field) && $request->$field != $option->$field) {
                $changes[] = [
                    'field' => $field,
                    'old'   => $option->$field,
                    'new'   => $request->$field,
                ];
            }
        }

        $option->update($request->only($fields));

        if (!empty($changes)) {
            $this->logShippingActivity($option, 'UPDATED', ['changes' => $changes]);
        }

        return response()->json([
            'message' => 'Shipping option updated successfully',
            'data'    => $option->fresh(),
        ]);
    }

    /**
     * PATCH /admin/shipping/{id}/status
     * Activate or deactivate a shipping option.
     */
    public function toggleStatus(Request $request, $id): JsonResponse
    {
        $option = ShippingOption::findOrFail($id);

        $request->validate([
            'is_active' => 'required|boolean',
        ]);

        if ($option->slug === self::PROTECTED_SLUG && !$request->is_active) {
            return response()->json(['message' => 'Standard delivery cannot be deactivated'], 403);
        }

        $option->update(['is_active' => $request->is_active]);

        $action = $request->is_active ? 'ACTIVATED' : 'DEACTIVATED';
        $this->logShippingActivity($option, $action);

        return response()->json([
            'message' => "Shipping option {$action} successfully",
            'data'    => $option->fresh(),
        ]);
    }

    /**
     * DELETE /admin/shipping/{id}
     * Delete a shipping option — superadmin only.
     */
    public function destroy($id): JsonResponse
    {
        if (auth()->user()->role !== 'super_admin') {
            return response()->json(['message' => 'Only superadmin can delete shipping options'], 403);
        }

        $option = ShippingOption::findOrFail($id);

        if ($option->slug === self::PROTECTED_SLUG) {
            return response()->json(['message' => 'Standard delivery cannot be deleted'], 403);
        }

        $this->logShippingActivity($option, 'DELETED', [
            'name' => $option->name,
            'slug' => $option->slug,
        ]);

        // its income ledger goes with it — or is switched off when it already has postings
        $ledger = $option->income_ledger_id ? \App\Models\Books\Ledger::find($option->income_ledger_id) : null;
        $option->delete();
        if ($ledger) {
            if ($ledger->entries()->exists() || (float) $ledger->opening_balance != 0.0) {
                $ledger->update(['is_active' => false, 'is_system' => false]);
            } else {
                $ledger->delete();
            }
        }

        return response()->json(['message' => 'Shipping option deleted successfully']);
    }

    /**
     * GET /admin/shipping/activity
     * Paginated activity log across all shipping options.
     */
    public function activity(Request $request): JsonResponse
    {
        $activity = ShippingActivity::with(['actor:id,name,email', 'shippingOption:id,name,slug'])
            ->when($request->filled('action'),             fn($q) => $q->where('action', $request->action))
            ->when($request->filled('shipping_option_id'), fn($q) => $q->where('shipping_option_id', $request->shipping_option_id))
            ->orderBy('created_at', 'desc')
            ->paginate($request->get('per_page', 25));

        return response()->json($activity);
    }

    /**
     * GET /shipping-options  (public / customer)
     * Active options for checkout.
     */
    public function publicIndex(): JsonResponse
    {
        $money = app(\App\Services\CurrencyConversionService::class);
        $options = ShippingOption::active()->with('currency:id,code,symbol')->get()->map(function ($o) use ($money) {
            $row = $o->toArray();
            // show the cost in the shopper's currency (the books convert again, at the order's own rate, when it is placed)
            $row['display_cost'] = $money->convertForDisplay((float) $o->cost, $o->currency_id);
            $row['display_free_above'] = $o->free_above !== null ? $money->convertForDisplay((float) $o->free_above, $o->currency_id) : null;

            return $row;
        });

        return response()->json($options);
    }
}

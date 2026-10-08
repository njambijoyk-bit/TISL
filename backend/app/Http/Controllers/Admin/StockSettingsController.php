<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Models\StockSetting;
use App\Models\StockSettingOverride;
use App\Services\Stock\StockPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Settings → Stock & expiry: the shop-wide rules for expired goods, and exceptions for a category or a product.
 * The rules are read through StockPolicy; this only edits them.
 */
class StockSettingsController extends Controller
{
    public function __construct(private StockPolicy $policy) {}

    public function show(): JsonResponse
    {
        $overrides = StockSettingOverride::orderBy('scope')->orderBy('id')->get();
        $names = [
            'category' => Category::whereIn('id', $overrides->where('scope', 'category')->pluck('scope_id'))->pluck('name', 'id'),
            'product'  => Product::withTrashed()->whereIn('id', $overrides->where('scope', 'product')->pluck('scope_id'))->pluck('name', 'id'),
        ];

        return response()->json([
            'settings'  => $this->policy->global(),
            'defaults'  => StockPolicy::DEFAULTS,
            'overridable' => StockPolicy::OVERRIDABLE,
            'overrides' => $overrides->map(fn ($o) => [
                'id' => $o->id, 'scope' => $o->scope, 'scope_id' => $o->scope_id,
                'name' => $names[$o->scope][$o->scope_id] ?? '(deleted)', 'settings' => $o->settings,
            ])->values(),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $d = $request->validate([
            'expired_on_storefront' => ['required', Rule::in(['hide', 'unavailable'])],
            'show_expiry_badge'     => 'required|boolean',
            'sell_expired'          => ['required', Rule::in(['never', 'override', 'allowed'])],
            'min_days_online'       => 'required|integer|min:0|max:3650',
            'min_days_till'         => 'required|integer|min:0|max:3650',
            'expiry_action'         => ['required', Rule::in(['list', 'write_off'])],
            'write_off_after_days'  => 'required|integer|min:0|max:3650',
            'warning_days'          => 'nullable|array|max:6', 'warning_days.*' => 'integer|min:1|max:3650',
            'pick_order'            => ['required', Rule::in(['fefo', 'fifo'])],
            'costing_method'        => ['required', Rule::in(['lot', 'average'])],
            'returns_to_quarantine' => 'required|boolean',
        ]);
        $d['warning_days'] = collect($d['warning_days'] ?? [])->map(fn ($x) => (int) $x)->unique()->sortDesc()->values()->all();

        StockSetting::current()->fill($d + ['updated_by' => $request->user()->id, 'updated_at' => now()])->save();
        $this->policy->flush();

        return response()->json(['message' => 'Stock & expiry settings saved.', 'settings' => $this->policy->global()]);
    }

    /** Create or change one exception. Body: scope (category|product), scope_id, settings {only the ones to change}. */
    public function saveOverride(Request $request): JsonResponse
    {
        $d = $request->validate([
            'scope'    => ['required', Rule::in(['category', 'product'])],
            'scope_id' => 'required|integer|min:1',
            'settings' => 'required|array',
            'settings.sell_expired'     => ['nullable', Rule::in(['never', 'override', 'allowed'])],
            'settings.min_days_online'  => 'nullable|integer|min:0|max:3650',
            'settings.min_days_till'    => 'nullable|integer|min:0|max:3650',
            'settings.expiry_action'    => ['nullable', Rule::in(['list', 'write_off'])],
            'settings.warning_days'     => 'nullable|array|max:6', 'settings.warning_days.*' => 'integer|min:1|max:3650',
            'settings.show_expiry_badge' => 'nullable|boolean',
        ]);
        $exists = $d['scope'] === 'category' ? Category::whereKey($d['scope_id'])->exists() : Product::withTrashed()->whereKey($d['scope_id'])->exists();
        if (! $exists) {
            return response()->json(['message' => 'That ' . $d['scope'] . ' does not exist.'], 422);
        }
        // keep only settings that may be overridden and were actually given a value
        $vals = array_filter(array_intersect_key($d['settings'], array_flip(StockPolicy::OVERRIDABLE)), fn ($v) => $v !== null && $v !== []);
        if (isset($vals['warning_days'])) {
            $vals['warning_days'] = collect($vals['warning_days'])->map(fn ($x) => (int) $x)->unique()->sortDesc()->values()->all();
        }
        if (! $vals) {
            return response()->json(['message' => 'Change at least one setting, or remove the exception.'], 422);
        }

        $o = StockSettingOverride::updateOrCreate(['scope' => $d['scope'], 'scope_id' => $d['scope_id']], ['settings' => $vals, 'updated_by' => $request->user()->id]);
        $this->policy->flush();

        return response()->json(['message' => 'Exception saved.', 'override' => $o]);
    }

    public function deleteOverride(int $id): JsonResponse
    {
        StockSettingOverride::whereKey($id)->delete();
        $this->policy->flush();

        return response()->json(['message' => 'Exception removed.']);
    }

    /** Category / product search for the "add an exception" picker. */
    public function targets(Request $request): JsonResponse
    {
        $d = $request->validate(['scope' => ['required', Rule::in(['category', 'product'])], 'q' => 'nullable|string|max:100']);
        $like = '%' . ($d['q'] ?? '') . '%';
        $rows = $d['scope'] === 'category'
            ? Category::where('name', 'like', $like)->orderBy('name')->limit(20)->get(['id', 'name'])
            : Product::where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like))->orderBy('name')->limit(20)->get(['id', 'name', 'sku']);

        return response()->json($rows);
    }
}

<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Currency;
use App\Models\Location;
use App\Models\TaxDistrict;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Branches (multi-location, Core). CRUD + staff clearance assignment.
 * The per-sellable "offered-at / priced-at" editing plugs into each module's
 * product/service forms; this controller manages the branches themselves.
 */
class LocationController extends Controller
{

    /** Admin list. */
    public function index()
    {
        $locations = Location::with('currency:id,code,symbol', 'taxDistrict:id,name,level')
            ->withCount('staff')
            ->ordered()
            ->get()
            ->map(fn (Location $l) => $this->present($l));

        return response()->json([
            'locations'    => $locations,
            'multi_branch' => Location::isMultiBranch(),
        ]);
    }

    /** Form options: active currencies + active tax districts + assignable staff. */
    public function formOptions()
    {
        return response()->json([
            'currencies'    => Currency::where('is_active', true)->get(['id', 'code', 'name', 'symbol', 'is_base']),
            'tax_districts' => TaxDistrict::where('is_active', true)->orderBy('name')->get(['id', 'name', 'level', 'locale']),
            'staff'         => User::staffAccounts(['driver'])->orderBy('name')->get(['id', 'name', 'email', 'role']),
            'kinds'         => Location::KINDS,
            'kind_defaults' => Location::KIND_DEFAULTS,
            'capabilities_ready' => Location::hasCapabilities(),
        ]);
    }

    public function show(int $id)
    {
        $location = Location::with(['currency:id,code,symbol', 'taxDistrict:id,name,level', 'staff:id,name,email,role'])
            ->findOrFail($id);

        return response()->json(['location' => $this->present($location, true)]);
    }

    public function store(Request $request)
    {
        $data = $this->withCapabilities($this->validateData($request), $request, true);
        $staff = $request->input('staff_ids', []);

        $location = DB::transaction(function () use ($data, $staff) {
            $location = Location::create($data);
            $this->applyDefault($location, $data['is_default'] ?? false);
            if (is_array($staff)) {
                $location->staff()->sync($this->cleanStaffIds($staff));
            }
            return $location;
        });

        return response()->json(['ok' => true, 'message' => 'Branch created.', 'location' => $this->present($location->fresh(['currency', 'taxDistrict']))], 201);
    }

    public function update(Request $request, int $id)
    {
        $location = Location::findOrFail($id);
        $data = $this->withCapabilities($this->validateData($request, $id), $request, false);
        $staff = $request->input('staff_ids', null);
        if ($refuse = $this->mustKeepASellingLocation($location, $data)) {
            return response()->json(['ok' => false, 'message' => $refuse], 422);
        }

        $sellingBefore = $location->is_active && ($location->sells_to_customers ?? true);
        DB::transaction(function () use ($location, $data, $staff) {
            $location->update($data);
            $this->applyDefault($location, $data['is_default'] ?? false);
            if (is_array($staff)) {
                $location->staff()->sync($this->cleanStaffIds($staff));
            }
        });

        $location->refresh();
        if ($sellingBefore !== ($location->is_active && ($location->sells_to_customers ?? true))) {
            app(\App\Services\Location\VariantStockService::class)->recomputeForLocation($location->id);   // what customers can buy changed
        }

        return response()->json(['ok' => true, 'message' => 'Branch saved.', 'location' => $this->present($location->fresh(['currency', 'taxDistrict']))]);
    }

    public function destroy(int $id)
    {
        $location = Location::findOrFail($id);

        if (Location::count() <= 1) {
            return response()->json(['ok' => false, 'message' => 'You must keep at least one branch.'], 422);
        }
        if ($location->is_default) {
            return response()->json(['ok' => false, 'message' => 'Set another branch as default before deleting this one.'], 422);
        }
        if ($refuse = $this->mustKeepASellingLocation($location, ['is_active' => false])) {
            return response()->json(['ok' => false, 'message' => $refuse], 422);
        }

        // Offerings/prices for this branch are removed by FK cascade; sellables stay.
        $location->delete();

        return response()->json(['ok' => true, 'message' => 'Branch deleted.']);
    }

    /** Make this the default branch. */
    public function setDefault(int $id)
    {
        $location = Location::findOrFail($id);
        DB::transaction(function () use ($location) {
            Location::where('is_default', true)->update(['is_default' => false]);
            $location->update(['is_default' => true, 'is_active' => true]);
        });

        return response()->json(['ok' => true, 'message' => "“{$location->name}” is now the default branch."]);
    }

    /** Public: the branches customers can pick and buy from (a warehouse or factory is not listed). */
    public function publicIndex()
    {
        $locations = Location::with('currency:id,code,symbol')
            ->sellsToCustomers()->ordered()
            ->get()
            ->map(fn (Location $l) => [
                'id'         => $l->id,
                'name'       => $l->name,
                'code'       => $l->code,
                'city'       => $l->city,
                'country'    => $l->country,
                'currency'   => $l->currency?->code,
                'is_default' => $l->is_default,
            ]);

        return response()->json(['locations' => $locations]);
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private function validateData(Request $request, ?int $id = null): array
    {
        return $request->validate([
            'name'                  => 'required|string|max:150',
            'code'                  => ['required', 'string', 'max:40', Rule::unique('locations', 'code')->ignore($id)],
            'currency_id'           => 'nullable|integer|exists:currencies,id',
            'tax_district_id'       => 'nullable|integer|exists:tax_districts,id',
            'phone'                 => 'nullable|string|max:40',
            'email'                 => 'nullable|email|max:150',
            'address_line1'         => 'nullable|string|max:200',
            'address_line2'         => 'nullable|string|max:200',
            'city'                  => 'nullable|string|max:100',
            'state'                 => 'nullable|string|max:100',
            'country'               => 'nullable|string|max:100',
            'postal_code'           => 'nullable|string|max:30',
            'latitude'              => 'nullable|numeric|between:-90,90',
            'longitude'             => 'nullable|numeric|between:-180,180',
            'timezone'              => 'nullable|string|max:64',
            'price_display_default' => ['nullable', Rule::in(['inclusive', 'exclusive'])],
            'accepts_pickup'        => 'boolean',
            'accepts_delivery'      => 'boolean',
            'is_default'            => 'boolean',
            'is_active'             => 'boolean',
            'kind'                  => ['nullable', Rule::in(array_keys(Location::KINDS))],
            'sells_to_customers'    => 'boolean',
            'fulfils_orders'        => 'boolean',
            'receives_purchases'    => 'boolean',
            'produces'              => 'boolean',
            'sort_order'            => 'nullable|integer|min:0|max:9999',
        ]);
    }

    /**
     * The kind and its four capabilities. A new branch with a kind but no capabilities starts with that kind's defaults; what the form
     * sends always wins. Before script 97 is run the columns are not there, so they are left out of the save.
     */
    private function withCapabilities(array $data, Request $request, bool $creating): array
    {
        if (! Location::hasCapabilities()) {
            return array_diff_key($data, array_flip(['kind', ...Location::CAPABILITIES]));
        }
        if ($creating) {
            $kind = $data['kind'] ?? 'shop';
            $data['kind'] = $kind;
            foreach (Location::KIND_DEFAULTS[$kind] as $cap => $on) {
                if (! $request->has($cap)) {
                    $data[$cap] = $on;
                }
            }
        }

        return $data;
    }

    /** Customers must always have at least one branch to buy from. Returns the reason when a save or delete would leave none. */
    private function mustKeepASellingLocation(Location $location, array $changes): ?string
    {
        if (! Location::hasCapabilities() || ! $location->is_active || ! $location->sells_to_customers) {
            return null;   // this one does not sell today, so changing it takes nothing away
        }
        $stillSells = ($changes['is_active'] ?? true) && ($changes['sells_to_customers'] ?? true);
        if ($stillSells) {
            return null;
        }

        return Location::sellsToCustomers()->where('id', '!=', $location->id)->exists()
            ? null
            : 'Customers need at least one branch to buy from. Keep this one active and selling, or make another branch sell first.';
    }

    /** Enforce a single default row. */
    private function applyDefault(Location $location, bool $wantsDefault): void
    {
        if ($wantsDefault) {
            Location::where('id', '!=', $location->id)->where('is_default', true)->update(['is_default' => false]);
            if (!$location->is_default) {
                $location->update(['is_default' => true]);
            }
        }
    }

    private function cleanStaffIds(array $ids): array
    {
        return User::whereIn('id', $ids)->staffAccounts(['driver'])->pluck('id')->all();
    }

    private function present(Location $l, bool $full = false): array
    {
        $base = [
            'id'                    => $l->id,
            'name'                  => $l->name,
            'code'                  => $l->code,
            'currency_id'           => $l->currency_id,
            'currency'              => $l->currency?->code,
            'tax_district_id'       => $l->tax_district_id,
            'tax_district'          => $l->taxDistrict?->name,
            'city'                  => $l->city,
            'country'               => $l->country,
            'timezone'              => $l->timezone,
            'price_display_default' => $l->price_display_default,
            'accepts_pickup'        => $l->accepts_pickup,
            'accepts_delivery'      => $l->accepts_delivery,
            'is_default'            => $l->is_default,
            'is_active'             => $l->is_active,
            'kind'                  => Location::hasCapabilities() ? ($l->kind ?? 'shop') : 'shop',
            'sells_to_customers'    => Location::hasCapabilities() ? (bool) $l->sells_to_customers : true,
            'fulfils_orders'        => Location::hasCapabilities() ? (bool) $l->fulfils_orders : true,
            'receives_purchases'    => Location::hasCapabilities() ? (bool) $l->receives_purchases : true,
            'produces'              => Location::hasCapabilities() ? (bool) $l->produces : false,
            'sort_order'            => $l->sort_order,
            'staff_count'           => $l->staff_count ?? ($full ? $l->staff->count() : null),
        ];

        if ($full) {
            $base += [
                'phone'         => $l->phone,
                'email'         => $l->email,
                'address_line1' => $l->address_line1,
                'address_line2' => $l->address_line2,
                'state'         => $l->state,
                'postal_code'   => $l->postal_code,
                'latitude'      => $l->latitude,
                'longitude'     => $l->longitude,
                'staff_ids'     => $l->staff->pluck('id')->all(),
                'staff'         => $l->staff->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'role' => $u->role])->all(),
            ];
        }

        return $base;
    }
}

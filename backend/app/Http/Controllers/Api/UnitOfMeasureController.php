<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UnitOfMeasure;
use App\Models\UnitLocaleDefault;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use InvalidArgumentException;

class UnitOfMeasureController extends Controller
{
    // ========================================
    // UNITS
    // ========================================

    public function adminIndex(Request $request)
    {
        $query = UnitOfMeasure::query();

        if ($request->filled('dimension')) {
            $query->dimension($request->dimension);
        }

        if ($request->filled('unit_system')) {
            $query->system($request->unit_system);
        }

        if ($request->has('active')) {
            $query->where('is_active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN));
        }

        $units = $query->orderBy('dimension')->orderBy('name')->get();

        return response()->json(['units' => $units], 200);
    }

    public function adminShow($id)
    {
        $unit = UnitOfMeasure::findOrFail($id);
        return response()->json(['unit' => $unit], 200);
    }

    public function adminStore(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'code'           => 'required|string|max:20|unique:units_of_measure,code',
            'name'           => 'required|string|max:100',
            'dimension'      => 'required|string|max:20',
            'unit_system'    => 'nullable|string|max:20',
            'to_base_factor' => 'required|numeric|gt:0',
            'is_active'      => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $unit = UnitOfMeasure::create([
            'code'           => $request->code,
            'name'           => $request->name,
            'dimension'      => $request->dimension,
            'unit_system'    => $request->unit_system,
            'to_base_factor' => $request->to_base_factor,
            'is_active'      => $request->boolean('is_active', true),
        ]);

        return response()->json(['unit' => $unit], 201);
    }

    public function adminUpdate(Request $request, $id)
    {
        $unit = UnitOfMeasure::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'code'           => 'sometimes|required|string|max:20|unique:units_of_measure,code,' . $id,
            'name'           => 'sometimes|required|string|max:100',
            'dimension'      => 'sometimes|required|string|max:20',
            'unit_system'    => 'nullable|string|max:20',
            'to_base_factor' => 'sometimes|required|numeric|gt:0',
            'is_active'      => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Changing dimension or to_base_factor on a unit already in use would silently
        // reprice/reconvert everything that references it (variants, tax rates, stock
        // conversions...). Block once anything depends on it; deactivate + recreate instead.
        if ($request->filled('dimension') && $request->dimension !== $unit->dimension && $this->isInUse($unit)) {
            return response()->json([
                'message' => 'Cannot change dimension — this unit is already referenced elsewhere.',
            ], 422);
        }

        if ($request->filled('to_base_factor')
            && (float) $request->to_base_factor !== (float) $unit->to_base_factor
            && $this->isInUse($unit)) {
            return response()->json([
                'message' => 'Cannot change to_base_factor — this unit is already referenced elsewhere. Deactivate it and create a new unit instead.',
            ], 422);
        }

        $unit->update($request->only(['code', 'name', 'dimension', 'unit_system', 'to_base_factor', 'is_active']));

        return response()->json(['unit' => $unit], 200);
    }

    public function adminDestroy($id)
    {
        $unit = UnitOfMeasure::findOrFail($id);

        if ($this->isInUse($unit)) {
            return response()->json([
                'message' => 'This unit is in use and cannot be deleted. Deactivate it instead.',
            ], 422);
        }

        $unit->delete();

        return response()->json(['message' => 'Unit deleted.'], 200);
    }

    /** Convert a quantity from one unit to another (same dimension only). */
    public function convert(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'from_unit_id' => 'required|exists:units_of_measure,id',
            'to_unit_id'   => 'required|exists:units_of_measure,id',
            'quantity'     => 'required|numeric',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $from = UnitOfMeasure::findOrFail($request->from_unit_id);
        $to   = UnitOfMeasure::findOrFail($request->to_unit_id);

        try {
            $result = $from->convertTo($to, (float) $request->quantity);
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'from' => ['unit' => $from->code, 'quantity' => (float) $request->quantity],
            'to'   => ['unit' => $to->code, 'quantity' => $result],
        ], 200);
    }

    // ========================================
    // LOCALE DEFAULTS
    // ========================================

    public function adminIndexLocaleDefaults(Request $request)
    {
        $query = UnitLocaleDefault::with('unit');

        if ($request->filled('locale')) {
            $query->forLocale($request->locale);
        }

        if ($request->filled('dimension')) {
            $query->forDimension($request->dimension);
        }

        return response()->json(['locale_defaults' => $query->get()], 200);
    }

    /** Upsert — one row per (locale, dimension), enforced by the DB's unique key. */
    public function adminStoreLocaleDefault(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'locale'    => 'required|string|max:2',
            'dimension' => 'required|string|max:20',
            'unit_id'   => 'required|exists:units_of_measure,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $default = UnitLocaleDefault::updateOrCreate(
            ['locale' => $request->locale, 'dimension' => $request->dimension],
            ['unit_id' => $request->unit_id]
        );

        return response()->json(['locale_default' => $default->load('unit')], 200);
    }

    public function adminDestroyLocaleDefault($id)
    {
        $default = UnitLocaleDefault::findOrFail($id);
        $default->delete();

        return response()->json(['message' => 'Locale default removed.'], 200);
    }

    // ========================================
    // HELPERS
    // ========================================

    private function isInUse(UnitOfMeasure $unit): bool
    {
        return $unit->taxRates()->exists()
            || $unit->variants()->exists()
            || $unit->variantUnits()->exists()
            || $unit->localeDefaults()->exists();
    }
}

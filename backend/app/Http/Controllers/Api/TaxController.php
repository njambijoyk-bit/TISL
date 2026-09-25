<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TaxType;
use App\Models\TaxRate;
use App\Models\TaxRule;
use App\Models\TaxDistrict;
use App\Models\TaxApplicability;
use App\Models\TaxApplication;
use App\Models\Product;
use App\Models\Customer;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class TaxController extends Controller
{
    /** Whitelist of taxable_type aliases the client may send — never accept a raw class string. */
    private const TAXABLE_MODELS = [
        'product'  => Product::class,
        'customer' => Customer::class,
    ];

    // ========================================
    // TAX TYPES
    // ========================================

    public function adminIndexTypes(Request $request)
    {
        $query = TaxType::query();

        if ($request->has('active')) {
            $query->where('is_active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN));
        }

        if ($request->filled('application_mode')) {
            $query->where('application_mode', $request->application_mode);
        }

        return response()->json(['tax_types' => $query->get()], 200);
    }

    public function adminStoreType(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name'             => 'required|string|max:100',
            'code'             => 'required|string|max:30|unique:tax_types,code',
            'application_mode' => 'required|in:additive,withheld',
            'is_compound'      => 'boolean',
            'is_active'        => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $type = TaxType::create([
            'name'             => $request->name,
            'code'             => $request->code,
            'application_mode' => $request->application_mode,
            'is_compound'      => $request->boolean('is_compound'),
            'is_active'        => $request->boolean('is_active', true),
        ]);

        return response()->json(['tax_type' => $type], 201);
    }

    public function adminUpdateType(Request $request, $id)
    {
        $type = TaxType::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'name'             => 'sometimes|required|string|max:100',
            'code'             => 'sometimes|required|string|max:30|unique:tax_types,code,' . $id,
            'application_mode' => 'sometimes|required|in:additive,withheld',
            'is_compound'      => 'boolean',
            'is_active'        => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $type->update($request->only(['name', 'code', 'application_mode', 'is_compound', 'is_active']));

        return response()->json(['tax_type' => $type], 200);
    }

    public function adminDestroyType($id)
    {
        $type = TaxType::findOrFail($id);

        // rates/rules cascade-delete at the DB level (ON DELETE CASCADE) — block
        // here rather than let a type deletion silently wipe historical rates and rules.
        if ($type->rates()->exists() || $type->rules()->exists()) {
            return response()->json([
                'message' => 'This tax type has rates or rules attached and cannot be deleted. Deactivate it instead.',
            ], 422);
        }

        $type->delete();

        return response()->json(['message' => 'Tax type deleted.'], 200);
    }

    // ========================================
    // TAX RATES
    // ========================================

    public function adminIndexRates(Request $request)
    {
        $query = TaxRate::with('taxType');

        if ($request->filled('tax_type_id')) {
            $query->where('tax_type_id', $request->tax_type_id);
        }

        if ($request->filled('classification')) {
            $query->forClassification($request->classification);
        }

        if ($request->has('active')) {
            $query->where('is_active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN));
        }

        return response()->json(['tax_rates' => $query->orderByDesc('valid_from')->get()], 200);
    }

    public function adminStoreRate(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'tax_type_id'          => 'required|exists:tax_types,id',
            'classification'       => 'nullable|string|max:50',
            'rate_type'            => 'required|in:percentage,fixed_amount',
            'rate_value'           => 'required|numeric|min:0',
            'unit_of_measure_id'   => 'nullable|exists:units_of_measure,id|required_if:rate_type,fixed_amount',
            'calculation_base'     => 'nullable|in:pre_discount,post_discount,total_payable',
            'calculation_sequence' => 'nullable|integer',
            'requires_certificate' => 'boolean',
            'valid_from'           => 'required|date',
            'valid_until'          => 'nullable|date|after_or_equal:valid_from',
            'is_active'            => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $rate = TaxRate::create($request->only([
            'tax_type_id', 'classification', 'rate_type', 'rate_value', 'unit_of_measure_id',
            'calculation_base', 'calculation_sequence', 'requires_certificate', 'valid_from', 'valid_until',
        ]) + ['is_active' => $request->boolean('is_active', true)]);

        return response()->json(['tax_rate' => $rate], 201);
    }

    public function adminUpdateRate(Request $request, $id)
    {
        $rate = TaxRate::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'classification'       => 'nullable|string|max:50',
            'rate_type'            => 'sometimes|required|in:percentage,fixed_amount',
            'rate_value'           => 'sometimes|required|numeric|min:0',
            'unit_of_measure_id'   => 'nullable|exists:units_of_measure,id',
            'calculation_base'     => 'nullable|in:pre_discount,post_discount,total_payable',
            'calculation_sequence' => 'nullable|integer',
            'requires_certificate' => 'boolean',
            'valid_from'           => 'sometimes|required|date',
            'valid_until'          => 'nullable|date|after_or_equal:valid_from',
            'is_active'            => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // A rate already used on a tax_application is historical fact — editing its
        // money/classification fields retroactively would misrepresent tax already
        // charged. Once used, only administrative fields (dates, is_active) may change.
        if ($rate->applications()->exists()) {
            $locked = array_intersect(
                array_keys($request->all()),
                ['rate_type', 'rate_value', 'classification', 'unit_of_measure_id', 'calculation_base']
            );

            if (!empty($locked)) {
                return response()->json([
                    'message' => 'This rate has already been applied to at least one order and its financial fields are locked. Create a new rate instead.',
                ], 422);
            }
        }

        $rate->update($request->only([
            'classification', 'rate_type', 'rate_value', 'unit_of_measure_id',
            'calculation_base', 'calculation_sequence', 'requires_certificate', 'valid_from', 'valid_until', 'is_active',
        ]));

        return response()->json(['tax_rate' => $rate], 200);
    }

    public function adminDestroyRate($id)
    {
        $rate = TaxRate::findOrFail($id);

        try {
            $rate->delete();
            return response()->json(['message' => 'Tax rate deleted.'], 200);
        } catch (QueryException $e) {
            if ($this->isForeignKeyViolation($e)) {
                return response()->json([
                    'message' => 'This rate has been applied to orders and cannot be deleted. Deactivate it instead.',
                ], 422);
            }
            throw $e;
        }
    }

    // ========================================
    // TAX RULES
    // ========================================

    public function adminIndexRules(Request $request)
    {
        $query = TaxRule::with(['taxType', 'districts']);

        if ($request->filled('tax_type_id')) {
            $query->where('tax_type_id', $request->tax_type_id);
        }

        if ($request->filled('applicable_module')) {
            $query->forModule($request->applicable_module);
        }

        if ($request->has('active')) {
            $query->where('is_active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN));
        }

        return response()->json(['tax_rules' => $query->byPriority()->get()], 200);
    }

    public function adminStoreRule(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'tax_type_id'               => 'required|exists:tax_types,id',
            'classification'            => 'nullable|string|max:50',
            'name'                      => 'required|string|max:150',
            'applicable_module'         => 'nullable|string|max:50',
            'applicable_customer_types' => 'nullable|array',
            'min_order_value'           => 'nullable|numeric|min:0',
            'max_order_value'           => 'nullable|numeric|min:0|gte:min_order_value',
            'priority'                  => 'nullable|integer',
            'is_active'                 => 'boolean',
            'district_ids'              => 'nullable|array',
            'district_ids.*'            => 'integer|exists:tax_districts,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $rule = DB::transaction(function () use ($request) {
            $rule = TaxRule::create($request->only([
                'tax_type_id', 'classification', 'name', 'applicable_module',
                'applicable_customer_types', 'min_order_value', 'max_order_value', 'priority',
            ]) + ['is_active' => $request->boolean('is_active', true)]);

            if ($request->filled('district_ids')) {
                $rule->syncDistricts($request->district_ids);
            }

            return $rule;
        });

        return response()->json(['tax_rule' => $rule->load('districts')], 201);
    }

    public function adminUpdateRule(Request $request, $id)
    {
        $rule = TaxRule::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'classification'            => 'nullable|string|max:50',
            'name'                      => 'sometimes|required|string|max:150',
            'applicable_module'         => 'nullable|string|max:50',
            'applicable_customer_types' => 'nullable|array',
            'min_order_value'           => 'nullable|numeric|min:0',
            'max_order_value'           => 'nullable|numeric|min:0|gte:min_order_value',
            'priority'                  => 'nullable|integer',
            'is_active'                 => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $rule->update($request->only([
            'classification', 'name', 'applicable_module',
            'applicable_customer_types', 'min_order_value', 'max_order_value', 'priority', 'is_active',
        ]));

        return response()->json(['tax_rule' => $rule], 200);
    }

    public function adminSyncRuleDistricts(Request $request, $id)
    {
        $rule = TaxRule::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'district_ids'   => 'present|array',
            'district_ids.*' => 'integer|exists:tax_districts,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $rule->syncDistricts($request->district_ids);

        return response()->json(['tax_rule' => $rule->load('districts')], 200);
    }

    public function adminDestroyRule($id)
    {
        $rule = TaxRule::findOrFail($id);

        // tax_applicability rows cascade-delete on rule removal (ON DELETE CASCADE) —
        // block if any entity currently relies on this rule, rather than silently
        // stripping their applicability.
        if ($rule->applicability()->exists()) {
            return response()->json([
                'message' => 'This rule is currently assigned to one or more products/customers and cannot be deleted. Deactivate it instead.',
            ], 422);
        }

        try {
            $rule->delete();
            return response()->json(['message' => 'Tax rule deleted.'], 200);
        } catch (QueryException $e) {
            if ($this->isForeignKeyViolation($e)) {
                return response()->json([
                    'message' => 'This rule has been applied to orders and cannot be deleted. Deactivate it instead.',
                ], 422);
            }
            throw $e;
        }
    }

    // ========================================
    // TAX DISTRICTS
    // ========================================

    public function adminIndexDistricts(Request $request)
    {
        $query = TaxDistrict::query();

        if ($request->filled('locale')) {
            $query->locale($request->locale);
        }

        if ($request->filled('level')) {
            $query->level($request->level);
        }

        if ($request->filled('parent_id')) {
            $query->where('parent_id', $request->parent_id);
        }

        if ($request->has('active')) {
            $query->where('is_active', filter_var($request->active, FILTER_VALIDATE_BOOLEAN));
        }

        return response()->json(['tax_districts' => $query->orderBy('name')->get()], 200);
    }

    public function adminStoreDistrict(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'locale'    => 'required|string|max:2',
            'level'     => 'required|in:country,state,county,city,zip,special_district',
            'parent_id' => 'nullable|exists:tax_districts,id',
            'name'      => 'required|string|max:150',
            'code'      => 'nullable|string|max:20',
            'is_active' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $district = TaxDistrict::create($request->only(['locale', 'level', 'parent_id', 'name', 'code'])
            + ['is_active' => $request->boolean('is_active', true)]);

        return response()->json(['tax_district' => $district], 201);
    }

    public function adminUpdateDistrict(Request $request, $id)
    {
        $district = TaxDistrict::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'level'     => 'sometimes|required|in:country,state,county,city,zip,special_district',
            'parent_id' => 'nullable|exists:tax_districts,id|not_in:' . $id,
            'name'      => 'sometimes|required|string|max:150',
            'code'      => 'nullable|string|max:20',
            'is_active' => 'boolean',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $district->update($request->only(['level', 'parent_id', 'name', 'code', 'is_active']));

        return response()->json(['tax_district' => $district], 200);
    }

    public function adminDestroyDistrict($id)
    {
        $district = TaxDistrict::findOrFail($id);

        // Children and rule-district links both cascade-delete on removal —
        // block rather than silently orphan or strip a branch of the hierarchy.
        if ($district->children()->exists()) {
            return response()->json(['message' => 'This district has child districts and cannot be deleted.'], 422);
        }

        if ($district->rules()->exists()) {
            return response()->json(['message' => 'This district is assigned to one or more tax rules and cannot be deleted.'], 422);
        }

        $district->delete();

        return response()->json(['message' => 'Tax district deleted.'], 200);
    }

    // ========================================
    // TAX APPLICABILITY (entity-level overrides)
    // ========================================

    public function adminIndexApplicability(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'taxable_type' => 'nullable|in:' . implode(',', array_keys(self::TAXABLE_MODELS)),
            'taxable_id'   => 'nullable|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $query = TaxApplicability::with(['taxRule', 'certificate']);

        if ($request->filled('taxable_type')) {
            $query->where('taxable_type', self::TAXABLE_MODELS[$request->taxable_type]);
        }

        if ($request->filled('taxable_id')) {
            $query->where('taxable_id', $request->taxable_id);
        }

        return response()->json(['applicability' => $query->get()], 200);
    }

    public function adminStoreApplicability(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'taxable_type'                  => 'required|in:' . implode(',', array_keys(self::TAXABLE_MODELS)),
            'taxable_id'                    => 'required|integer',
            'tax_rule_id'                   => 'nullable|exists:tax_rules,id',
            'is_exempt'                     => 'boolean',
            'tax_legitimacy_certificate_id' => 'nullable|exists:tax_legitimacy_certificates,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $modelClass = self::TAXABLE_MODELS[$request->taxable_type];
        $taxable    = $modelClass::findOrFail($request->taxable_id);

        try {
            $applicability = TaxApplicability::create([
                'taxable_type'                   => $taxable->getMorphClass(),
                'taxable_id'                     => $taxable->getKey(),
                'tax_rule_id'                     => $request->tax_rule_id,
                'is_exempt'                       => $request->boolean('is_exempt'),
                'tax_legitimacy_certificate_id'   => $request->tax_legitimacy_certificate_id,
            ]);

            return response()->json(['applicability' => $applicability], 201);
        } catch (QueryException $e) {
            if ($this->isDuplicateKey($e)) {
                return response()->json(['message' => 'This entity already has an applicability override for that rule.'], 422);
            }
            throw $e;
        }
    }

    public function adminUpdateApplicability(Request $request, $id)
    {
        $applicability = TaxApplicability::findOrFail($id);

        $validator = Validator::make($request->all(), [
            'tax_rule_id'                    => 'nullable|exists:tax_rules,id',
            'is_exempt'                      => 'boolean',
            'tax_legitimacy_certificate_id'  => 'nullable|exists:tax_legitimacy_certificates,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $applicability->update($request->only(['tax_rule_id', 'is_exempt', 'tax_legitimacy_certificate_id']));

        return response()->json(['applicability' => $applicability], 200);
    }

    public function adminDestroyApplicability($id)
    {
        $applicability = TaxApplicability::findOrFail($id);
        $applicability->delete();

        return response()->json(['message' => 'Applicability override removed.'], 200);
    }

    // ========================================
    // TAX APPLICATIONS (read-only audit trail)
    // ========================================

    public function adminIndexApplications(Request $request)
    {
        $query = TaxApplication::with(['taxRate', 'taxRule', 'unit']);

        if ($request->filled('order_id')) {
            $query->forOrder($request->order_id);
        }

        if ($request->filled('classification')) {
            $query->forClassification($request->classification);
        }

        $perPage = $request->get('per_page', 20);

        return response()->json($query->orderByDesc('created_at')->paginate($perPage), 200);
    }

    // ========================================
    // HELPERS
    // ========================================

    private function isDuplicateKey(QueryException $e): bool
    {
        return ($e->errorInfo[1] ?? null) === 1062;
    }

    private function isForeignKeyViolation(QueryException $e): bool
    {
        return in_array($e->errorInfo[1] ?? null, [1451, 1452], true);
    }
}